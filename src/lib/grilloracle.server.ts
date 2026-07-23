import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ORACLE_PROMPT_VERSION,
  ORACLE_RECORD_KIND,
  oracleRecordPayloadSchema,
  type OracleDonenessLevel,
  type OracleItemCategory,
  type OracleRecordPayload,
} from "@/games/grilloracle/model";
import type { AuthorizedHostRoom } from "./host-auth.server";
import { markGrillOracleSubmittedState } from "./game-state";
import { normalizePartyContext } from "./party-context";
import { createPartyRecord, findPartyRecordByIdempotency } from "./party-records.server";
import { statusError } from "./player-auth.server";
import {
  assertPlayerMayUpload,
  assertPlayerStoragePath,
  assertStorageObjectExists,
  mediaKindForAction,
  RECORDINGS_BUCKET,
} from "./player-media.server";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import { migrateRoomState } from "./room-state-migration";
import type { Player, RoomState } from "./types";
import { buildOracleFallbackReading, grillOracleReadingSpec } from "./ai/grilloracle.prompts";
import { runPromptSpec } from "./ai/prompt-runtime.server";

type OracleRoomSnapshot = {
  id: string;
  code?: string;
  state: RoomState;
  updatedAt: string;
};

export function oracleReadingResponseBody(
  action: "analyze" | "host-fallback",
  result: { payload: OracleRecordPayload; replayed: boolean },
) {
  return action === "analyze"
    ? { payload: result.payload, replayed: result.replayed }
    : { replayed: result.replayed };
}

export function oracleRecordIdempotencyKey(roundId: string, playerId: string) {
  const digest = createHash("sha256").update(`${roundId}:${playerId}`).digest("hex");
  return `oracle_${digest}`;
}

export function assertOracleRoundOwner(
  state: RoomState,
  roundId: string,
  playerId: string,
): Player {
  const oracle = state.grilloracle;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw statusError("player not found", 404);
  if (
    state.currentGame !== "grilloracle" ||
    !oracle ||
    oracle.roundId !== roundId ||
    !oracle.participantIds.includes(playerId)
  ) {
    throw statusError("oracle round is not available for this player", 409);
  }
  return player;
}

function assertExistingOracleRecord(
  row: NonNullable<Awaited<ReturnType<typeof findPartyRecordByIdempotency>>>,
  roundId: string,
  playerId: string,
) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "grilloracle" ||
    row.owner_player_id !== playerId ||
    row.kind !== ORACLE_RECORD_KIND
  ) {
    throw statusError("oracle idempotency key belongs to another record", 409);
  }
  return oracleRecordPayloadSchema.parse(row.payload);
}

export async function loadOracleRoom(roomId: string): Promise<OracleRoomSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, code, state, updated_at")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  return {
    id: data.id,
    code: data.code,
    state: migrateRoomState(data.state as unknown as RoomState),
    updatedAt: data.updated_at,
  };
}

export async function writeOracleRoom(snapshot: OracleRoomSnapshot, state: RoomState) {
  if (snapshot.state === state) return true;
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .update({ state: state as never })
    .eq("id", snapshot.id)
    .eq("updated_at", snapshot.updatedAt)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function markOraclePlayerSubmitted(roomId: string, roundId: string, playerId: string) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadOracleRoom(roomId),
    applyUpdate: async (snapshot) => {
      const state = markGrillOracleSubmittedState(snapshot.state, roundId, playerId);
      if (!state) throw statusError("oracle capture is closed", 409);
      return { state, value: { playerId } };
    },
    writeSnapshot: writeOracleRoom,
  });
}

async function signedOracleImageUrl(storagePath: string) {
  const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
  assertStorageObjectExists(exists);
  const signed = await supabaseAdmin.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, 600);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}

async function existingOraclePayload(roomId: string, roundId: string, playerId: string) {
  const key = oracleRecordIdempotencyKey(roundId, playerId);
  const existing = await findPartyRecordByIdempotency(roomId, key);
  if (!existing) return null;
  return { payload: assertExistingOracleRecord(existing, roundId, playerId), key };
}

async function persistOraclePayload(params: {
  roomId: string;
  state: RoomState;
  roundId: string;
  playerId: string;
  payload: OracleRecordPayload;
}) {
  const key = oracleRecordIdempotencyKey(params.roundId, params.playerId);
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: key,
      runId: params.roundId,
      gameId: "grilloracle",
      ownerPlayerId: params.playerId,
      kind: ORACLE_RECORD_KIND,
      visibility: "player",
      payload: params.payload,
    },
  });
  const payload = assertExistingOracleRecord(created.row, params.roundId, params.playerId);
  await markOraclePlayerSubmitted(params.roomId, params.roundId, params.playerId);
  return { payload, replayed: created.replayed };
}

export async function createOracleVisionRecord(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  roundId: string;
  storagePath: unknown;
  now?: number;
}) {
  assertOracleRoundOwner(params.state, params.roundId, params.player.id);
  const existing = await existingOraclePayload(params.roomId, params.roundId, params.player.id);
  if (existing) {
    await markOraclePlayerSubmitted(params.roomId, params.roundId, params.player.id);
    return { payload: existing.payload, replayed: true };
  }

  assertPlayerMayUpload(params.state, "oracle-photo", params.player, params.roundId, params.now);
  const storagePath = assertPlayerStoragePath({
    storagePath: params.storagePath,
    roomId: params.roomId,
    kind: mediaKindForAction("oracle-photo"),
    roundId: params.roundId,
    playerId: params.player.id,
  });
  const imageUrl = await signedOracleImageUrl(storagePath);
  const context = normalizePartyContext(params.state.party, params.state.venue);
  const generated = await runPromptSpec({
    spec: grillOracleReadingSpec,
    input: { playerName: params.player.name, imageUrl },
    context,
    temperature: 0.85,
    budget: {
      roomId: params.roomId,
      operationId: `oracle:${params.roundId}:${params.player.id}:reading`,
    },
  });
  if (generated.usedFallback) {
    throw statusError("oracle vision unavailable; ask the host for a manual reading", 503);
  }
  const payload = oracleRecordPayloadSchema.parse({
    version: ORACLE_PROMPT_VERSION,
    reading: generated.output,
    capture: {
      mode: "vision",
      storagePath,
      capturedAt: params.now ?? Date.now(),
    },
  });
  return persistOraclePayload({
    roomId: params.roomId,
    state: params.state,
    roundId: params.roundId,
    playerId: params.player.id,
    payload,
  });
}

export async function createOracleHostFallbackRecord(params: {
  room: AuthorizedHostRoom;
  roundId: string;
  playerId: string;
  itemCategory: OracleItemCategory;
  doneness: OracleDonenessLevel;
  now?: number;
}) {
  const player = assertOracleRoundOwner(params.room.state, params.roundId, params.playerId);
  const existing = await existingOraclePayload(params.room.id, params.roundId, params.playerId);
  if (existing) {
    await markOraclePlayerSubmitted(params.room.id, params.roundId, params.playerId);
    return { payload: existing.payload, replayed: true };
  }
  if (params.room.state.grilloracle?.phase !== "capturing") {
    throw statusError("oracle capture is closed", 409);
  }
  const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
  const payload = oracleRecordPayloadSchema.parse({
    version: ORACLE_PROMPT_VERSION,
    reading: buildOracleFallbackReading({
      playerName: player.name,
      itemCategory: params.itemCategory,
      doneness: params.doneness,
      context,
    }),
    capture: {
      mode: "host-fallback",
      capturedAt: params.now ?? Date.now(),
    },
  });
  return persistOraclePayload({
    roomId: params.room.id,
    state: params.room.state,
    roundId: params.roundId,
    playerId: params.playerId,
    payload,
  });
}
