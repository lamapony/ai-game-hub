import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  SMOKE_SCREEN_GUESS_KIND,
  SMOKE_SCREEN_MISSION_KIND,
  SMOKE_SCREEN_RESULT_KIND,
  SMOKE_SCREEN_REVEAL_KIND,
  smokeScreenGuessRecordSchema,
  smokeScreenMissionRecordSchema,
  smokeScreenResultRecordSchema,
  smokeScreenRevealRecordSchema,
  type SmokeScreenGuessRecord,
  type SmokeScreenMission,
  type SmokeScreenResultRecord,
} from "@/games/smokescreen/model";
import type { PartyRecordRow } from "./party-records";
import {
  buildSmokeScreenFallbackDeck,
  smokeScreenGenerationSpec,
  smokeScreenRecapSpec,
} from "./ai/smokescreen.prompts";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { preparedAiOutput } from "./ai-prewarm.server";
import {
  finalizeSmokeScreenState,
  markSmokeScreenAssignedState,
  markSmokeScreenVotedState,
  transitionSmokeScreenState,
} from "./game-state";
import type { AuthorizedHostRoom } from "./host-auth.server";
import { normalizePartyContext } from "./party-context";
import {
  createPartyRecord,
  findPartyRecordByIdempotency,
  listPartyRecordRows,
  transitionPartyRecords,
} from "./party-records.server";
import { statusError } from "./player-auth.server";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import { awardScoreEvents } from "./score-events.server";
import type { ScoreAwardInput } from "./score-events";
import {
  sameCompletedMissionIds,
  sameSmokeScreenGuesses,
  scoreSmokeScreen,
  smokeScreenDetectivePoints,
  validateSmokeScreenGuesses,
  type SmokeScreenOwnedMission,
} from "./smokescreen-lifecycle";
import { migrateRoomState } from "./room-state-migration";
import type { Player, RoomState } from "./types";

export type SmokeScreenLifecyclePhase = "deal" | "seal" | "reveal" | "finalize";

/**
 * Two-act Smoke & Neon seals at the grill and reveals later. Single-act quick-start packs run the
 * same private lifecycle inside `classic`, without weakening the sealed-record boundary.
 */
export function canRunSmokeScreenLifecyclePhase(
  state: Pick<RoomState, "party" | "venue">,
  phase: SmokeScreenLifecyclePhase,
) {
  const actId = normalizePartyContext(state.party, state.venue).actId;
  if (phase === "deal") return ["classic", "grill", "bar"].includes(actId);
  if (phase === "seal") return ["classic", "grill", "transition", "bar"].includes(actId);
  return ["classic", "bar", "finale"].includes(actId);
}

type SmokeRoomSnapshot = {
  id: string;
  state: RoomState;
  updatedAt: string;
};

function hashKey(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export function smokeMissionIdempotencyKey(runId: string, playerId: string) {
  return hashKey("smoke_mission", `${runId}:${playerId}`);
}

export function smokeRevealIdempotencyKey(runId: string, missionId: string) {
  return hashKey("smoke_reveal", `${runId}:${missionId}`);
}

export function smokeGuessIdempotencyKey(runId: string, playerId: string) {
  return hashKey("smoke_guess", `${runId}:${playerId}`);
}

export function smokeResultIdempotencyKey(runId: string) {
  return hashKey("smoke_result", runId);
}

export function smokeScoreIdempotencyKey(
  runId: string,
  playerId: string,
  role: "mission" | "detective",
) {
  return hashKey("smoke_score", `${runId}:${playerId}:${role}`);
}

function assertSmokeRun(state: RoomState, runId: string) {
  const smoke = state.smokescreen;
  if (!smoke || smoke.runId !== runId) {
    throw statusError("Smoke Screen run is no longer active", 409);
  }
  return smoke;
}

async function loadSmokeRoom(roomId: string): Promise<SmokeRoomSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, state, updated_at")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  return {
    id: data.id,
    state: migrateRoomState(data.state as unknown as RoomState),
    updatedAt: data.updated_at,
  };
}

async function writeSmokeRoom(snapshot: SmokeRoomSnapshot, state: RoomState) {
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

async function updateSmokeState(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSmokeRoom(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("Smoke Screen state changed", 409);
      return { state, value: state.smokescreen };
    },
    writeSnapshot: writeSmokeRoom,
  });
}

function missionRows(rows: PartyRecordRow[]) {
  return rows.filter(
    (row) => row.game_id === "smokescreen" && row.kind === SMOKE_SCREEN_MISSION_KIND,
  );
}

async function loadMissionRows(roomId: string, runId: string) {
  return missionRows(await listPartyRecordRows(roomId, { runId, kind: SMOKE_SCREEN_MISSION_KIND }));
}

function assertMissionRow(row: PartyRecordRow, runId: string) {
  if (
    row.run_id !== runId ||
    row.game_id !== "smokescreen" ||
    row.kind !== SMOKE_SCREEN_MISSION_KIND ||
    !row.owner_player_id
  ) {
    throw statusError("invalid Smoke Screen mission record", 409);
  }
  return smokeScreenMissionRecordSchema.parse(row.payload);
}

function exactGeneratedMissions(params: {
  generated: SmokeScreenMission[];
  count: number;
  existingTexts: string[];
  context: ReturnType<typeof normalizePartyContext>;
}) {
  const existing = new Set(params.existingTexts.map((text) => text.trim().toLocaleLowerCase()));
  const accepted: SmokeScreenMission[] = [];
  for (const mission of params.generated) {
    const key = mission.text.trim().toLocaleLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    accepted.push(mission);
    if (accepted.length === params.count) return accepted;
  }
  const fallback = buildSmokeScreenFallbackDeck(
    { count: 30, existingMissionTexts: [...existing] },
    params.context,
  );
  for (const mission of fallback.missions) {
    const key = mission.text.trim().toLocaleLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    accepted.push(mission);
    if (accepted.length === params.count) return accepted;
  }
  throw new Error("could not produce enough distinct Smoke Screen missions");
}

export async function assignSmokeScreenMissions(params: {
  room: AuthorizedHostRoom;
  runId: string;
  now?: number;
}) {
  const smoke = assertSmokeRun(params.room.state, params.runId);
  if (!canRunSmokeScreenLifecyclePhase(params.room.state, "deal")) {
    throw statusError("Smoke Screen missions cannot be dealt in this act", 409);
  }
  if (!["assigning", "active"].includes(smoke.status)) {
    throw statusError("Smoke Screen assignments are already closed", 409);
  }

  const existingRows = await loadMissionRows(params.room.id, params.runId);
  const existingByPlayer = new Map(
    existingRows.flatMap((row) =>
      row.owner_player_id ? [[row.owner_player_id, row] as const] : [],
    ),
  );
  const missingPlayers = smoke.participantIds.flatMap((playerId) => {
    if (existingByPlayer.has(playerId)) return [];
    const player = params.room.state.players.find((candidate) => candidate.id === playerId);
    return player ? [player] : [];
  });
  let usedFallback = false;
  if (missingPlayers.length > 0) {
    const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
    const existingTexts = existingRows.map(
      (row) => assertMissionRow(row, params.runId).mission.text,
    );
    const prepared = await preparedAiOutput({
      roomId: params.room.id,
      state: params.room.state,
      gameId: "smokescreen",
      targetActId: context.actId,
    });
    const preparedOutput = smokeScreenGenerationSpec.outputSchema.safeParse(prepared?.output);
    const generated = preparedOutput.success
      ? { output: preparedOutput.data, usedFallback: prepared?.usedFallback ?? false }
      : await runPromptSpec({
          spec: smokeScreenGenerationSpec,
          input: { count: missingPlayers.length, existingMissionTexts: existingTexts },
          context,
          temperature: 0.9,
          budget: {
            roomId: params.room.id,
            operationId: `smokescreen:${params.runId}:missions:${missingPlayers
              .map((player) => player.id)
              .join(",")}`,
          },
        });
    usedFallback = generated.usedFallback;
    const missions = exactGeneratedMissions({
      generated: generated.output.missions,
      count: missingPlayers.length,
      existingTexts,
      context,
    });
    for (let index = 0; index < missingPlayers.length; index++) {
      const player = missingPlayers[index]!;
      const mission = missions[index]!;
      const created = await createPartyRecord({
        roomId: params.room.id,
        state: params.room.state,
        input: {
          idempotencyKey: smokeMissionIdempotencyKey(params.runId, player.id),
          runId: params.runId,
          gameId: "smokescreen",
          ownerPlayerId: player.id,
          kind: SMOKE_SCREEN_MISSION_KIND,
          visibility: "player",
          payload: {
            version: 1,
            mission,
            assignedAt: params.now ?? Date.now(),
          },
        },
      });
      assertMissionRow(created.row, params.runId);
    }
  }

  const rows = await loadMissionRows(params.room.id, params.runId);
  const assignedPlayerIds = smoke.participantIds.filter((playerId) =>
    rows.some((row) => row.owner_player_id === playerId),
  );
  const updated = await updateSmokeState(params.room.id, (state) =>
    markSmokeScreenAssignedState(state, params.runId, assignedPlayerIds),
  );
  return {
    assignedCount: assignedPlayerIds.length,
    aiFallback: usedFallback,
    smoke: updated.state.smokescreen!,
  };
}

export async function sealSmokeScreenRun(params: {
  room: AuthorizedHostRoom;
  runId: string;
  allowIncomplete: boolean;
}) {
  const smoke = assertSmokeRun(params.room.state, params.runId);
  if (!canRunSmokeScreenLifecyclePhase(params.room.state, "seal")) {
    throw statusError("Smoke Screen fieldwork cannot be sealed in this act", 409);
  }
  if (smoke.status === "sealed") return { updated: 0, missingCount: 0, smoke };
  if (!["assigning", "active"].includes(smoke.status)) {
    throw statusError("Smoke Screen fieldwork is already closed", 409);
  }
  const rows = await loadMissionRows(params.room.id, params.runId);
  if (rows.length === 0) throw statusError("no Smoke Screen missions exist", 409);
  const assignedPlayerIds = [
    ...new Set(rows.flatMap((row) => (row.owner_player_id ? [row.owner_player_id] : []))),
  ];
  const missingCount = smoke.participantIds.filter(
    (playerId) => !assignedPlayerIds.includes(playerId),
  ).length;
  if (missingCount > 0 && !params.allowIncomplete) {
    throw statusError(`${missingCount} Smoke Screen missions are still missing`, 409);
  }
  const transition = await transitionPartyRecords({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    kind: SMOKE_SCREEN_MISSION_KIND,
    transition: "seal",
  });
  const updated = await updateSmokeState(params.room.id, (state) => {
    const synced = markSmokeScreenAssignedState(state, params.runId, assignedPlayerIds);
    return synced
      ? transitionSmokeScreenState(synced, { runId: params.runId, status: "sealed" })
      : null;
  });
  return {
    updated: transition.updated,
    missingCount,
    smoke: updated.state.smokescreen!,
  };
}

function assertRevealRow(row: PartyRecordRow, runId: string, missionId: string) {
  if (
    row.run_id !== runId ||
    row.game_id !== "smokescreen" ||
    row.kind !== SMOKE_SCREEN_REVEAL_KIND ||
    row.owner_player_id !== null ||
    row.visibility !== "revealed"
  ) {
    throw statusError("invalid Smoke Screen reveal record", 409);
  }
  const payload = smokeScreenRevealRecordSchema.parse(row.payload);
  if (payload.missionId !== missionId) {
    throw statusError("Smoke Screen reveal idempotency conflict", 409);
  }
  return payload;
}

async function createRevealRecord(params: {
  room: AuthorizedHostRoom;
  runId: string;
  source: PartyRecordRow;
  now: number;
}) {
  const sourcePayload = assertMissionRow(params.source, params.runId);
  const idempotencyKey = smokeRevealIdempotencyKey(params.runId, params.source.id);
  const existing = await findPartyRecordByIdempotency(params.room.id, idempotencyKey);
  if (existing)
    return { row: existing, payload: assertRevealRow(existing, params.runId, params.source.id) };
  const payload = smokeScreenRevealRecordSchema.parse({
    version: 1,
    missionId: params.source.id,
    mission: sourcePayload.mission,
    revealedAt: params.now,
  });
  const inserted = await supabaseAdmin
    .from("party_records")
    .upsert(
      {
        room_id: params.room.id,
        run_id: params.runId,
        game_id: "smokescreen",
        act_id: params.room.state.party?.actId ?? "bar",
        owner_player_id: null,
        owner_team_id: null,
        kind: SMOKE_SCREEN_REVEAL_KIND,
        visibility: "revealed",
        payload: payload as Json,
        idempotency_key: idempotencyKey,
        revealed_at: new Date(params.now).toISOString(),
      } as never,
      { onConflict: "room_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (inserted.error) throw inserted.error;
  const row =
    (inserted.data as PartyRecordRow | null) ??
    (await findPartyRecordByIdempotency(params.room.id, idempotencyKey));
  if (!row) throw new Error("Smoke Screen reveal write returned no row");
  return { row, payload: assertRevealRow(row, params.runId, params.source.id) };
}

export async function revealSmokeScreenRun(params: {
  room: AuthorizedHostRoom;
  runId: string;
  now?: number;
}) {
  const smoke = assertSmokeRun(params.room.state, params.runId);
  if (!canRunSmokeScreenLifecyclePhase(params.room.state, "reveal")) {
    throw statusError("Smoke Screen cannot be revealed in this act", 409);
  }
  if (smoke.status !== "sealed" && smoke.status !== "revealed") {
    throw statusError("seal Smoke Screen fieldwork before reveal", 409);
  }
  const rows = await loadMissionRows(params.room.id, params.runId);
  if (rows.length === 0) throw statusError("no Smoke Screen missions exist", 409);
  if (rows.some((row) => row.visibility !== "sealed")) {
    throw statusError("Smoke Screen source missions are not sealed", 409);
  }
  const now = params.now ?? Date.now();
  const revealRows = [];
  for (const source of rows) revealRows.push(await createRevealRecord({ ...params, source, now }));
  const updated = await updateSmokeState(params.room.id, (state) =>
    transitionSmokeScreenState(state, { runId: params.runId, status: "revealed", now }),
  );
  return { revealedCount: revealRows.length, smoke: updated.state.smokescreen! };
}

async function loadRevealRows(roomId: string, runId: string) {
  return (await listPartyRecordRows(roomId, { runId, kind: SMOKE_SCREEN_REVEAL_KIND })).filter(
    (row) => row.game_id === "smokescreen" && row.visibility === "revealed",
  );
}

function assertExistingGuess(
  row: PartyRecordRow,
  runId: string,
  playerId: string,
  guesses: SmokeScreenGuessRecord["guesses"],
) {
  if (
    row.run_id !== runId ||
    row.game_id !== "smokescreen" ||
    row.kind !== SMOKE_SCREEN_GUESS_KIND ||
    row.owner_player_id !== playerId
  ) {
    throw statusError("Smoke Screen guess idempotency conflict", 409);
  }
  const payload = smokeScreenGuessRecordSchema.parse(row.payload);
  if (!sameSmokeScreenGuesses(payload.guesses, guesses)) {
    throw statusError("Smoke Screen ballot was already submitted with different guesses", 409);
  }
  return payload;
}

export async function submitSmokeScreenVote(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  guesses: SmokeScreenGuessRecord["guesses"];
  now?: number;
}) {
  const smoke = assertSmokeRun(params.state, params.runId);
  if (smoke.status !== "revealed") throw statusError("Smoke Screen voting is not open", 409);
  if (!smoke.participantIds.includes(params.player.id)) {
    throw statusError("player is outside this Smoke Screen run", 409);
  }
  const reveals = await loadRevealRows(params.roomId, params.runId);
  const missionIds = reveals.map(
    (row) => smokeScreenRevealRecordSchema.parse(row.payload).missionId,
  );
  validateSmokeScreenGuesses({
    missionIds,
    participantIds: smoke.participantIds,
    guesses: params.guesses,
  });
  const idempotencyKey = smokeGuessIdempotencyKey(params.runId, params.player.id);
  const existing = await findPartyRecordByIdempotency(params.roomId, idempotencyKey);
  let replayed = Boolean(existing);
  let payload: SmokeScreenGuessRecord;
  if (existing) {
    payload = assertExistingGuess(existing, params.runId, params.player.id, params.guesses);
  } else {
    const created = await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        idempotencyKey,
        runId: params.runId,
        gameId: "smokescreen",
        ownerPlayerId: params.player.id,
        kind: SMOKE_SCREEN_GUESS_KIND,
        visibility: "player",
        payload: {
          version: 1,
          guesses: params.guesses,
          submittedAt: params.now ?? Date.now(),
        },
      },
    });
    replayed = created.replayed;
    payload = assertExistingGuess(created.row, params.runId, params.player.id, params.guesses);
  }
  const updated = await updateSmokeState(params.roomId, (state) =>
    markSmokeScreenVotedState(state, params.runId, params.player.id),
  );
  return { ballot: payload, replayed, smoke: updated.state.smokescreen! };
}

async function ownedMissions(room: AuthorizedHostRoom, runId: string) {
  const rows = await loadMissionRows(room.id, runId);
  return rows.map((row): SmokeScreenOwnedMission => {
    const owner = room.state.players.find((player) => player.id === row.owner_player_id);
    if (!owner) throw statusError("Smoke Screen mission owner left the room", 409);
    return { missionId: row.id, owner, record: assertMissionRow(row, runId) };
  });
}

async function guessRecords(roomId: string, runId: string) {
  return (await listPartyRecordRows(roomId, { runId, kind: SMOKE_SCREEN_GUESS_KIND })).flatMap(
    (row) => {
      if (!row.owner_player_id || row.game_id !== "smokescreen") return [];
      return [
        {
          voterPlayerId: row.owner_player_id,
          record: smokeScreenGuessRecordSchema.parse(row.payload),
        },
      ];
    },
  );
}

function buildRecapInput(params: {
  room: AuthorizedHostRoom;
  missions: SmokeScreenOwnedMission[];
  guesses: Awaited<ReturnType<typeof guessRecords>>;
  results: ReturnType<typeof scoreSmokeScreen>;
}) {
  const detectiveCounts = new Map<string, number>();
  params.results.forEach((result) =>
    result.correctDetectiveIds.forEach((playerId) =>
      detectiveCounts.set(playerId, (detectiveCounts.get(playerId) ?? 0) + 1),
    ),
  );
  const bestDetectiveId = [...detectiveCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const playerName = (playerId: string) =>
    params.room.state.players.find((player) => player.id === playerId)?.name ?? "Unknown";
  return {
    results: params.missions.map((mission) => {
      const result = params.results.find((candidate) => candidate.missionId === mission.missionId)!;
      const suspectCounts = new Map<string, number>();
      params.guesses.forEach(({ record }) => {
        const guess = record.guesses.find((candidate) => candidate.missionId === mission.missionId);
        if (guess) {
          suspectCounts.set(guess.ownerPlayerId, (suspectCounts.get(guess.ownerPlayerId) ?? 0) + 1);
        }
      });
      const topSuspectId = [...suspectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        player: mission.owner.name,
        mission: mission.record.mission.text,
        wasCaught: result.caught,
        topSuspect: topSuspectId ? playerName(topSuspectId) : "nobody",
      };
    }),
    bestDetective: bestDetectiveId ? playerName(bestDetectiveId) : undefined,
  };
}

function assertResultRow(row: PartyRecordRow, runId: string, completedMissionIds: string[]) {
  if (
    row.run_id !== runId ||
    row.game_id !== "smokescreen" ||
    row.kind !== SMOKE_SCREEN_RESULT_KIND ||
    row.visibility !== "revealed"
  ) {
    throw statusError("Smoke Screen result idempotency conflict", 409);
  }
  const payload = smokeScreenResultRecordSchema.parse(row.payload);
  if (!sameCompletedMissionIds(payload.completedMissionIds, completedMissionIds)) {
    throw statusError("Smoke Screen was already finalized with different completion evidence", 409);
  }
  return payload;
}

async function createResultRecord(params: {
  room: AuthorizedHostRoom;
  runId: string;
  payload: SmokeScreenResultRecord;
}) {
  const idempotencyKey = smokeResultIdempotencyKey(params.runId);
  const existing = await findPartyRecordByIdempotency(params.room.id, idempotencyKey);
  if (existing) {
    return {
      payload: assertResultRow(existing, params.runId, params.payload.completedMissionIds),
      replayed: true,
    };
  }
  const inserted = await supabaseAdmin
    .from("party_records")
    .upsert(
      {
        room_id: params.room.id,
        run_id: params.runId,
        game_id: "smokescreen",
        act_id: params.room.state.party?.actId ?? "bar",
        owner_player_id: null,
        owner_team_id: null,
        kind: SMOKE_SCREEN_RESULT_KIND,
        visibility: "revealed",
        payload: params.payload as Json,
        idempotency_key: idempotencyKey,
        revealed_at: new Date(params.payload.completedAt).toISOString(),
      } as never,
      { onConflict: "room_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (inserted.error) throw inserted.error;
  const row =
    (inserted.data as PartyRecordRow | null) ??
    (await findPartyRecordByIdempotency(params.room.id, idempotencyKey));
  if (!row) throw new Error("Smoke Screen result write returned no row");
  return {
    payload: assertResultRow(row, params.runId, params.payload.completedMissionIds),
    replayed: !inserted.data,
  };
}

export function buildSmokeScreenScoreEvents(params: {
  state: RoomState;
  runId: string;
  payload: SmokeScreenResultRecord;
}): ScoreAwardInput[] {
  const events: ScoreAwardInput[] = [];
  params.payload.results.forEach((result) => {
    if (result.ownerPoints <= 0) return;
    const owner = params.state.players.find((player) => player.id === result.ownerPlayerId);
    if (!owner) return;
    events.push({
      idempotencyKey: smokeScoreIdempotencyKey(params.runId, owner.id, "mission"),
      runId: params.runId,
      gameId: "smokescreen",
      teamId: owner.teamId,
      playerId: owner.id,
      points: result.ownerPoints,
      reason: `Smoke Screen tier ${result.tier} mission completed without being identified`,
      source: "deterministic",
      rubric: {
        scoringVersion: 1,
        role: "mission",
        missionId: result.missionId,
        completed: result.completed,
        caught: result.caught,
      },
    });
  });
  smokeScreenDetectivePoints(
    params.payload.results,
    params.state.smokescreen?.participantIds ?? [],
  ).forEach(({ playerId, points }) => {
    if (points <= 0) return;
    const player = params.state.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    events.push({
      idempotencyKey: smokeScoreIdempotencyKey(params.runId, player.id, "detective"),
      runId: params.runId,
      gameId: "smokescreen",
      teamId: player.teamId,
      playerId: player.id,
      points,
      reason: `${points / 2} correct Smoke Screen identifications`,
      source: "deterministic",
      rubric: { scoringVersion: 1, role: "detective", pointsPerCorrectGuess: 2 },
    });
  });
  return events;
}

export async function finalizeSmokeScreenRun(params: {
  room: AuthorizedHostRoom;
  runId: string;
  completedMissionIds: string[];
  now?: number;
}) {
  const smoke = assertSmokeRun(params.room.state, params.runId);
  if (!canRunSmokeScreenLifecyclePhase(params.room.state, "finalize")) {
    throw statusError("Smoke Screen cannot be finalized in this act", 409);
  }
  if (smoke.status !== "revealed" && smoke.status !== "results") {
    throw statusError("reveal Smoke Screen before finalizing", 409);
  }
  if (smoke.status === "revealed" && smoke.submittedVoterIds.length === 0) {
    throw statusError("at least one Smoke Screen ballot is required", 409);
  }
  const missions = await ownedMissions(params.room, params.runId);
  const missionIds = new Set(missions.map((mission) => mission.missionId));
  if (params.completedMissionIds.some((missionId) => !missionIds.has(missionId))) {
    throw statusError("completion evidence references an unknown mission", 400);
  }
  const resultKey = smokeResultIdempotencyKey(params.runId);
  const existing = await findPartyRecordByIdempotency(params.room.id, resultKey);
  let resultRecord: { payload: SmokeScreenResultRecord; replayed: boolean };
  if (existing) {
    resultRecord = {
      payload: assertResultRow(existing, params.runId, params.completedMissionIds),
      replayed: true,
    };
  } else {
    const guesses = await guessRecords(params.room.id, params.runId);
    const results = scoreSmokeScreen({
      missions,
      guesses,
      completedMissionIds: [...new Set(params.completedMissionIds)],
    });
    const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
    const recap = await runPromptSpec({
      spec: smokeScreenRecapSpec,
      input: buildRecapInput({ room: params.room, missions, guesses, results }),
      context,
      temperature: 0.8,
      budget: { roomId: params.room.id, operationId: `smokescreen:${params.runId}:recap` },
    });
    resultRecord = await createResultRecord({
      room: params.room,
      runId: params.runId,
      payload: smokeScreenResultRecordSchema.parse({
        version: 1,
        completedMissionIds: [...new Set(params.completedMissionIds)],
        results,
        recap: recap.output.recap,
        aiFallback: recap.usedFallback,
        completedAt: params.now ?? Date.now(),
      }),
    });
  }

  const events = buildSmokeScreenScoreEvents({
    state: params.room.state,
    runId: params.runId,
    payload: resultRecord.payload,
  });
  const score =
    events.length > 0
      ? await awardScoreEvents({ roomId: params.room.id, state: params.room.state, events })
      : null;
  await transitionPartyRecords({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    kind: SMOKE_SCREEN_GUESS_KIND,
    transition: "seal",
  });
  const updated = await updateSmokeState(params.room.id, (state) =>
    finalizeSmokeScreenState(state, {
      runId: params.runId,
      results: resultRecord.payload.results,
      recap: resultRecord.payload.recap,
      aiFallback: resultRecord.payload.aiFallback,
      now: resultRecord.payload.completedAt,
    }),
  );
  return {
    result: resultRecord.payload,
    replayed: resultRecord.replayed,
    score,
    smoke: updated.state.smokescreen!,
  };
}
