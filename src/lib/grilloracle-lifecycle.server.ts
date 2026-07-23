import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PartyRecordRow } from "./party-records";
import {
  ORACLE_RECORD_KIND,
  ORACLE_VERDICT_RECORD_KIND,
  ORACLE_VERIFICATION_PROMPT_VERSION,
  oracleRecordPayloadSchema,
  oracleVerdictRecordPayloadSchema,
  type OraclePredictionResults,
  type OracleVerdictRecordPayload,
} from "@/games/grilloracle/model";
import { grillOracleVerificationSpec } from "./ai/grilloracle-verification.prompts";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { markGrillOracleVerifiedState, transitionGrillOracleMemoryState } from "./game-state";
import { loadOracleRoom, writeOracleRoom } from "./grilloracle.server";
import {
  deterministicOracleDecision,
  oracleScoreForResults,
  oracleScoreTargets,
  sameOracleResults,
} from "./oracle-lifecycle";
import { normalizePartyContext } from "./party-context";
import {
  findPartyRecordByIdempotency,
  listPartyRecordRows,
  transitionPartyRecords,
} from "./party-records.server";
import { statusError } from "./player-auth.server";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import { awardScoreEvents } from "./score-events.server";
import type { ScoreAwardInput } from "./score-events";
import type { AuthorizedHostRoom } from "./host-auth.server";
import type { RoomState } from "./types";

function hashedKey(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export function oracleVerdictIdempotencyKey(runId: string, playerId: string) {
  return hashedKey("oracle_verdict", `${runId}:${playerId}`);
}

export function oracleScoreIdempotencyKey(
  runId: string,
  playerId: string,
  role: "oracle" | "skeptic",
  teamId: string,
) {
  return hashedKey("oracle_score", `${runId}:${playerId}:${role}:${teamId}`);
}

function assertOracleMemory(state: RoomState, runId: string) {
  const memory = state.oracleMemory;
  if (!memory || memory.runId !== runId) {
    throw statusError("oracle run is not the active party memory", 409);
  }
  return memory;
}

function oracleProphecyRows(rows: PartyRecordRow[]) {
  return rows.filter((row) => row.game_id === "grilloracle" && row.kind === ORACLE_RECORD_KIND);
}

async function loadOracleProphecies(roomId: string, runId: string) {
  return oracleProphecyRows(await listPartyRecordRows(roomId, { runId, kind: ORACLE_RECORD_KIND }));
}

async function updateOracleMemory(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadOracleRoom(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("oracle party memory changed", 409);
      return { state, value: state.oracleMemory };
    },
    writeSnapshot: writeOracleRoom,
  });
}

export async function sealOracleRun(params: {
  room: AuthorizedHostRoom;
  runId: string;
  allowIncomplete: boolean;
}) {
  const memory = assertOracleMemory(params.room.state, params.runId);
  const actId = params.room.state.party?.actId;
  if (!actId || !["grill", "transition", "bar"].includes(actId)) {
    throw statusError("oracle evidence can only be sealed before or during the venue change", 409);
  }
  const rows = await loadOracleProphecies(params.room.id, params.runId);
  if (rows.length === 0) throw statusError("no oracle prophecies exist for this run", 409);
  const submittedPlayerIds = [
    ...new Set(rows.flatMap((row) => (row.owner_player_id ? [row.owner_player_id] : []))),
  ];
  const missingCount = memory.participantIds.filter(
    (playerId) => !submittedPlayerIds.includes(playerId),
  ).length;
  if (missingCount > 0 && !params.allowIncomplete) {
    throw statusError(`${missingCount} oracle prophecies are still missing`, 409);
  }

  const transition = await transitionPartyRecords({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    kind: ORACLE_RECORD_KIND,
    transition: "seal",
  });
  const updated = await updateOracleMemory(params.room.id, (state) =>
    transitionGrillOracleMemoryState(state, {
      runId: params.runId,
      status: "sealed",
      submittedPlayerIds,
    }),
  );
  return {
    updated: transition.updated,
    missingCount,
    memory: updated.state.oracleMemory!,
  };
}

export async function revealOracleRun(params: { room: AuthorizedHostRoom; runId: string }) {
  assertOracleMemory(params.room.state, params.runId);
  const actId = params.room.state.party?.actId;
  if (actId !== "bar" && actId !== "finale") {
    throw statusError("oracle prophecies can only be revealed in the bar act", 409);
  }
  const rows = await loadOracleProphecies(params.room.id, params.runId);
  if (rows.length === 0) throw statusError("no oracle prophecies exist for this run", 409);
  if (rows.some((row) => row.visibility === "player")) {
    throw statusError("oracle prophecies must be sealed before reveal", 409);
  }

  const transition = await transitionPartyRecords({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    kind: ORACLE_RECORD_KIND,
    transition: "reveal",
  });
  const updated = await updateOracleMemory(params.room.id, (state) =>
    transitionGrillOracleMemoryState(state, {
      runId: params.runId,
      status: "revealed",
    }),
  );
  return { updated: transition.updated, memory: updated.state.oracleMemory! };
}

function assertOracleProphecy(row: PartyRecordRow | undefined, runId: string, playerId: string) {
  if (
    !row ||
    row.run_id !== runId ||
    row.game_id !== "grilloracle" ||
    row.kind !== ORACLE_RECORD_KIND ||
    row.owner_player_id !== playerId
  ) {
    throw statusError("oracle prophecy not found for this player", 404);
  }
  if (row.visibility !== "revealed") {
    throw statusError("oracle prophecy is still sealed", 409);
  }
  return oracleRecordPayloadSchema.parse(row.payload);
}

function assertExistingVerdict(
  row: PartyRecordRow,
  runId: string,
  playerId: string,
  results: OraclePredictionResults,
) {
  if (
    row.run_id !== runId ||
    row.game_id !== "grilloracle" ||
    row.kind !== ORACLE_VERDICT_RECORD_KIND ||
    row.owner_player_id !== playerId ||
    row.visibility !== "revealed"
  ) {
    throw statusError("oracle verdict idempotency key belongs to another record", 409);
  }
  const payload = oracleVerdictRecordPayloadSchema.parse(row.payload);
  if (!sameOracleResults(payload.results, results)) {
    throw statusError("oracle verdict was already recorded with different results", 409);
  }
  return payload;
}

async function createOracleVerdict(params: {
  room: AuthorizedHostRoom;
  runId: string;
  playerId: string;
  payload: OracleVerdictRecordPayload;
}) {
  const idempotencyKey = oracleVerdictIdempotencyKey(params.runId, params.playerId);
  const existing = await findPartyRecordByIdempotency(params.room.id, idempotencyKey);
  if (existing) {
    return {
      row: existing,
      payload: assertExistingVerdict(
        existing,
        params.runId,
        params.playerId,
        params.payload.results,
      ),
      replayed: true,
    };
  }

  const insert = {
    room_id: params.room.id,
    run_id: params.runId,
    game_id: "grilloracle",
    act_id: params.room.state.party?.actId ?? "bar",
    owner_player_id: params.playerId,
    owner_team_id: null,
    kind: ORACLE_VERDICT_RECORD_KIND,
    visibility: "revealed",
    payload: params.payload,
    idempotency_key: idempotencyKey,
    revealed_at: new Date(params.payload.verifiedAt).toISOString(),
  };
  const inserted = await supabaseAdmin
    .from("party_records")
    .upsert(insert as never, {
      onConflict: "room_id,idempotency_key",
      ignoreDuplicates: true,
    })
    .select("*")
    .maybeSingle();
  if (inserted.error) throw inserted.error;
  const row =
    (inserted.data as PartyRecordRow | null) ??
    (await findPartyRecordByIdempotency(params.room.id, idempotencyKey));
  if (!row) throw new Error("oracle verdict write did not return a row");
  return {
    row,
    payload: assertExistingVerdict(row, params.runId, params.playerId, params.payload.results),
    replayed: !inserted.data,
  };
}

export function buildOracleScoreEvents(params: {
  state: RoomState;
  runId: string;
  playerId: string;
  results: OraclePredictionResults;
}): ScoreAwardInput[] {
  const score = oracleScoreForResults(params.results);
  const { owner, skepticTeamIds } = oracleScoreTargets(params.state, params.playerId);
  const rubric = {
    scoringVersion: 1,
    results: params.results,
    fulfilledCount: score.fulfilledCount,
    unfulfilledCount: score.unfulfilledCount,
  };
  const events: ScoreAwardInput[] = [];
  if (score.oraclePoints > 0) {
    events.push({
      idempotencyKey: oracleScoreIdempotencyKey(
        params.runId,
        params.playerId,
        "oracle",
        owner.teamId,
      ),
      runId: params.runId,
      gameId: "grilloracle",
      teamId: owner.teamId,
      playerId: owner.id,
      points: score.oraclePoints,
      reason: `${score.fulfilledCount}/3 Grill Oracle predictions fulfilled`,
      source: "deterministic",
      rubric: { ...rubric, role: "oracle" },
    });
  }
  if (score.skepticPoints > 0) {
    skepticTeamIds.forEach((teamId) =>
      events.push({
        idempotencyKey: oracleScoreIdempotencyKey(params.runId, params.playerId, "skeptic", teamId),
        runId: params.runId,
        gameId: "grilloracle",
        teamId,
        points: score.skepticPoints,
        reason: `${score.unfulfilledCount}/3 Grill Oracle predictions disproved`,
        source: "deterministic",
        rubric: { ...rubric, role: "skeptic" },
      }),
    );
  }
  return events;
}

export async function verifyOraclePredictions(params: {
  room: AuthorizedHostRoom;
  runId: string;
  playerId: string;
  results: OraclePredictionResults;
  now?: number;
}) {
  const memory = assertOracleMemory(params.room.state, params.runId);
  const actId = params.room.state.party?.actId;
  if (actId !== "bar" && actId !== "finale") {
    throw statusError("oracle predictions can only be verified in the bar act", 409);
  }
  if (!memory.submittedPlayerIds.includes(params.playerId)) {
    throw statusError("player has no submitted oracle prophecy", 409);
  }
  const rows = await loadOracleProphecies(params.room.id, params.runId);
  const prophecyRow = rows.find((row) => row.owner_player_id === params.playerId);
  const prophecy = assertOracleProphecy(prophecyRow, params.runId, params.playerId);
  const player = params.room.state.players.find((candidate) => candidate.id === params.playerId);
  if (!player) throw statusError("oracle owner not found", 404);

  const verdictKey = oracleVerdictIdempotencyKey(params.runId, params.playerId);
  const existingVerdict = await findPartyRecordByIdempotency(params.room.id, verdictKey);
  let verdict: Awaited<ReturnType<typeof createOracleVerdict>>;
  if (existingVerdict) {
    const payload = assertExistingVerdict(
      existingVerdict,
      params.runId,
      params.playerId,
      params.results,
    );
    verdict = { row: existingVerdict, payload, replayed: true };
  } else {
    const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
    const generated = await runPromptSpec({
      spec: grillOracleVerificationSpec,
      input: {
        playerName: player.name,
        predictions: prophecy.reading.predictions,
        results: params.results,
      },
      context,
      temperature: 0.75,
      budget: {
        roomId: params.room.id,
        operationId: `oracle:${params.runId}:${params.playerId}:verification`,
      },
    });
    verdict = await createOracleVerdict({
      room: params.room,
      runId: params.runId,
      playerId: params.playerId,
      payload: oracleVerdictRecordPayloadSchema.parse({
        version: ORACLE_VERIFICATION_PROMPT_VERSION,
        results: params.results,
        decision: deterministicOracleDecision(generated.output, params.results),
        aiFallback: generated.usedFallback,
        verifiedAt: params.now ?? Date.now(),
      }),
    });
  }

  const events = buildOracleScoreEvents({
    state: params.room.state,
    runId: params.runId,
    playerId: params.playerId,
    results: verdict.payload.results,
  });
  const scoreResult =
    events.length > 0
      ? await awardScoreEvents({ roomId: params.room.id, state: params.room.state, events })
      : null;
  const updated = await updateOracleMemory(params.room.id, (state) =>
    markGrillOracleVerifiedState(state, params.runId, params.playerId),
  );
  return {
    player: { id: player.id, name: player.name, teamId: player.teamId },
    prophecy,
    verdict: verdict.payload,
    replayed: verdict.replayed,
    score: scoreResult,
    memory: updated.state.oracleMemory!,
  };
}
