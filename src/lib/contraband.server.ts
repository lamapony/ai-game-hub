import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CONTRABAND_ACCUSATION_KIND,
  CONTRABAND_ARBITRATION_KIND,
  CONTRABAND_ASSIGNMENT_KIND,
  CONTRABAND_RESOLUTION_KIND,
  CONTRABAND_RESULT_KIND,
  contrabandAccusationRecordSchema,
  contrabandArbitrationRecordSchema,
  contrabandAssignmentRecordSchema,
  contrabandResolutionRecordSchema,
  contrabandResultRecordSchema,
  type ContrabandAccusationRecord,
  type ContrabandAssignmentRecord,
  type ContrabandResolutionRecord,
} from "@/games/contraband/model";
import { contrabandFallbackPhrases } from "@/games/contraband/fallback-catalog";
import { preparedAiOutput } from "./ai-prewarm.server";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { contrabandArbitrationSpec, contrabandGenerationSpec } from "./ai/contraband.prompts";
import { transcribeWithRoomBudget } from "./ai-budget.server";
import {
  aiOutcome,
  outcomePoints,
  CONTRABAND_CATCHER_POINTS,
  CONTRABAND_FALSE_ACCUSATION_POINTS,
  CONTRABAND_SMUGGLER_POINTS,
} from "./contraband-lifecycle";
import {
  disputeContrabandAccusationState,
  finalizeContrabandState,
  markContrabandAssignedState,
  openContrabandAccusationState,
  resolveContrabandAccusationState,
  reviewContrabandAccusationState,
} from "./game-state";
import type { AuthorizedHostRoom } from "./host-auth.server";
import { normalizePartyContext } from "./party-context";
import {
  createPartyRecord,
  findPartyRecordByIdempotency,
  listPartyRecordRows,
} from "./party-records.server";
import type { PartyRecordRow } from "./party-records";
import {
  assertPlayerMayUpload,
  assertPlayerStoragePath,
  assertStorageObjectExists,
  RECORDINGS_BUCKET,
} from "./player-media.server";
import { statusError } from "./player-auth.server";
import { migrateRoomState } from "./room-state-migration";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import { awardScoreEvents } from "./score-events.server";
import type { ScoreAwardInput } from "./score-events";
import type { Player, RoomState } from "./types";

type Snapshot = { id: string; state: RoomState; updatedAt: string };
export const CONTRABAND_AUDIO_MAX_BYTES = 5_000_000;

function key(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export const contrabandAssignmentKey = (runId: string, playerId: string) =>
  key("contraband_assignment", `${runId}:${playerId}`);
export const contrabandAccusationKey = (runId: string, accusationId: string) =>
  key("contraband_accusation", `${runId}:${accusationId}`);
export const contrabandArbitrationKey = (runId: string, accusationId: string) =>
  key("contraband_arbitration", `${runId}:${accusationId}`);
export const contrabandResolutionKey = (runId: string, accusationId: string) =>
  key("contraband_resolution", `${runId}:${accusationId}`);
export const contrabandResultKey = (runId: string) => key("contraband_result", runId);
export const contrabandScoreKey = (runId: string, identity: string) =>
  key("contraband_score", `${runId}:${identity}`);

function assertRun(state: RoomState, runId: string) {
  const run = state.contraband;
  if (!run || run.runId !== runId) throw statusError("Contraband run is no longer active", 409);
  return run;
}

async function loadSnapshot(roomId: string): Promise<Snapshot> {
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

async function writeSnapshot(snapshot: Snapshot, state: RoomState) {
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

async function updateContraband(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSnapshot(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("Contraband state changed", 409);
      return { state, value: state.contraband };
    },
    writeSnapshot,
  });
}

async function runRows(roomId: string, runId: string) {
  const rows = await listPartyRecordRows(roomId, { runId });
  return rows.filter((row) => row.game_id === "contraband" && row.run_id === runId);
}

function assignmentFromRow(row: PartyRecordRow, runId: string) {
  if (
    row.game_id !== "contraband" ||
    row.run_id !== runId ||
    row.kind !== CONTRABAND_ASSIGNMENT_KIND ||
    !row.owner_player_id
  ) {
    throw statusError("invalid Contraband assignment", 409);
  }
  const record = contrabandAssignmentRecordSchema.parse(row.payload);
  if (record.ownerPlayerId !== row.owner_player_id) {
    throw statusError("Contraband assignment owner changed", 409);
  }
  return record;
}

function accusationFromRow(row: PartyRecordRow, runId: string) {
  if (
    row.game_id !== "contraband" ||
    row.run_id !== runId ||
    row.kind !== CONTRABAND_ACCUSATION_KIND
  ) {
    throw statusError("invalid Contraband accusation", 409);
  }
  return contrabandAccusationRecordSchema.parse(row.payload);
}

function resolutionFromRow(row: PartyRecordRow, runId: string) {
  if (
    row.game_id !== "contraband" ||
    row.run_id !== runId ||
    row.kind !== CONTRABAND_RESOLUTION_KIND
  ) {
    throw statusError("invalid Contraband resolution", 409);
  }
  return contrabandResolutionRecordSchema.parse(row.payload);
}

function distinctPhrases(generated: string[], locale: "en" | "ru", count: number, seed: number) {
  const unsafe =
    /(drink|chug|shot|touch|kiss|steal|drug|undress|password|secret|address|phone number|выпей|шот|потрогай|поцелуй|укради|наркот|раздень|пароль|адрес|номер телефона)/iu;
  const safe = [...generated, ...contrabandFallbackPhrases(locale, 36, seed)]
    .map((phrase) => phrase.trim().replace(/\s+/g, " "))
    .filter(
      (phrase) =>
        phrase.length >= 3 &&
        phrase.length <= 180 &&
        !unsafe.test(phrase) &&
        !/[!?]{3,}/.test(phrase),
    );
  return [
    ...new Map(safe.map((phrase) => [phrase.toLocaleLowerCase(locale), phrase])).values(),
  ].slice(0, count);
}

export async function assignContrabandPhrases(params: {
  room: AuthorizedHostRoom;
  runId: string;
  now?: number;
}) {
  const run = assertRun(params.room.state, params.runId);
  if (!["assigning", "active"].includes(run.status)) return { run };
  const existingRows = await runRows(params.room.id, params.runId);
  const existing = new Map<string, ContrabandAssignmentRecord>();
  existingRows.forEach((row) => {
    if (row.kind !== CONTRABAND_ASSIGNMENT_KIND) return;
    const assignment = assignmentFromRow(row, params.runId);
    existing.set(assignment.ownerPlayerId, assignment);
  });
  const missingIds = run.participantIds.filter((id) => !existing.has(id));
  if (missingIds.length > 0) {
    const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
    const seed = Number.parseInt(
      createHash("sha256").update(params.runId).digest("hex").slice(0, 8),
      16,
    );
    const prepared = await preparedAiOutput({
      roomId: params.room.id,
      state: params.room.state,
      gameId: "contraband",
      targetActId: context.actId,
    });
    const preparedOutput = contrabandGenerationSpec.outputSchema.safeParse(prepared?.output);
    const generated = preparedOutput.success
      ? { output: preparedOutput.data, usedFallback: prepared?.usedFallback ?? false }
      : await runPromptSpec({
          spec: contrabandGenerationSpec,
          input: {
            count: missingIds.length,
            seed,
            recentPhrases: [...existing.values()].map((a) => a.phrase),
          },
          context,
          temperature: 0.85,
          budget: {
            roomId: params.room.id,
            operationId: `contraband:${params.runId}:phrases:${missingIds.join(",")}`,
          },
        });
    const phrases = distinctPhrases(
      generated.output.phrases,
      context.contentLocale,
      missingIds.length,
      seed,
    );
    if (phrases.length !== missingIds.length) throw statusError("could not build phrase deck", 503);
    for (const [index, playerId] of missingIds.entries()) {
      const phrase = phrases[index]!;
      await createPartyRecord({
        roomId: params.room.id,
        state: params.room.state,
        input: {
          idempotencyKey: contrabandAssignmentKey(params.runId, playerId),
          runId: params.runId,
          gameId: "contraband",
          ownerPlayerId: playerId,
          kind: CONTRABAND_ASSIGNMENT_KIND,
          visibility: "player",
          payload: {
            version: 1,
            phraseId: key("phrase", `${params.runId}:${playerId}`).slice(0, 100),
            phrase,
            ownerPlayerId: playerId,
            assignedAt: params.now ?? Date.now(),
            aiFallback: generated.usedFallback,
          },
        },
      });
    }
  }
  const assignedIds = [...new Set([...existing.keys(), ...missingIds])];
  const updated = await updateContraband(params.room.id, (state) =>
    markContrabandAssignedState(state, params.runId, assignedIds, params.now),
  );
  return { run: updated.state.contraband! };
}

export async function contrabandPlayerAssignment(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
}) {
  const run = assertRun(params.state, params.runId);
  if (!run.participantIds.includes(params.player.id))
    throw statusError("not in this Contraband run", 403);
  const row = await findPartyRecordByIdempotency(
    params.roomId,
    contrabandAssignmentKey(params.runId, params.player.id),
  );
  return {
    run,
    assignment: row ? assignmentFromRow(row, params.runId) : null,
  };
}

export async function accuseContraband(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  accusedPlayerId: string;
  suspectedQuote: string;
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  if (run.status !== "active") throw statusError("another accusation is already live", 409);
  const rows = await runRows(params.roomId, params.runId);
  const accusations = rows
    .filter((row) => row.kind === CONTRABAND_ACCUSATION_KIND)
    .map((row) => accusationFromRow(row, params.runId));
  if (accusations.filter((entry) => entry.accuserPlayerId === params.player.id).length >= 3) {
    throw statusError("accusation limit reached", 409);
  }
  if (
    accusations.some(
      (entry) =>
        entry.accuserPlayerId === params.player.id &&
        entry.accusedPlayerId === params.accusedPlayerId,
    )
  ) {
    throw statusError("you already searched this route", 409);
  }
  const accusationId = `case_${randomUUID()}`;
  await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: contrabandAccusationKey(params.runId, accusationId),
      runId: params.runId,
      gameId: "contraband",
      kind: CONTRABAND_ACCUSATION_KIND,
      visibility: "host",
      payload: {
        version: 1,
        accusationId,
        accuserPlayerId: params.player.id,
        accusedPlayerId: params.accusedPlayerId,
        suspectedQuote: params.suspectedQuote,
        createdAt: params.now ?? Date.now(),
      },
    },
  });
  const updated = await updateContraband(params.roomId, (state) =>
    openContrabandAccusationState(state, {
      runId: params.runId,
      accusationId,
      accuserPlayerId: params.player.id,
      accusedPlayerId: params.accusedPlayerId,
      now: params.now,
    }),
  );
  return { run: updated.state.contraband! };
}

function scoreEventsForResolution(
  state: RoomState,
  runId: string,
  resolution: ContrabandResolutionRecord,
): ScoreAwardInput[] {
  const events: ScoreAwardInput[] = [];
  const smuggler = state.players.find((player) => player.id === resolution.accusedPlayerId);
  const catcher = state.players.find((player) => player.id === resolution.accuserPlayerId);
  if (resolution.smugglerPoints && smuggler) {
    events.push({
      idempotencyKey: contrabandScoreKey(runId, `${resolution.accusationId}:smuggler`),
      runId,
      gameId: "contraband",
      teamId: smuggler.teamId,
      playerId: smuggler.id,
      points: resolution.smugglerPoints,
      reason: "Contraband phrase cleared arbitration",
      source: "deterministic",
      rubric: { outcome: resolution.outcome, organicScore: resolution.organicScore ?? null },
    });
  }
  if (resolution.catcherPoints && catcher) {
    events.push({
      idempotencyKey: contrabandScoreKey(runId, `${resolution.accusationId}:catcher`),
      runId,
      gameId: "contraband",
      teamId: catcher.teamId,
      playerId: catcher.id,
      points: resolution.catcherPoints,
      reason: "Caught a Contraband phrase",
      source: "deterministic",
      rubric: { outcome: resolution.outcome },
    });
  }
  if (resolution.falseAccusationPenalty && catcher) {
    events.push({
      idempotencyKey: contrabandScoreKey(runId, `${resolution.accusationId}:false`),
      runId,
      gameId: "contraband",
      teamId: catcher.teamId,
      playerId: catcher.id,
      points: resolution.falseAccusationPenalty,
      reason: "False Contraband accusation",
      source: "deterministic",
      rubric: { outcome: resolution.outcome },
    });
  }
  return events;
}

async function resolveAccusation(params: {
  roomId: string;
  state: RoomState;
  runId: string;
  accusationId: string;
  outcome: "caught" | "clean" | "false-accusation";
  source: "ai" | "manual" | "confession";
  verdict: string;
  organicScore?: number;
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  const active = run.activeAccusation;
  if (!active || active.accusationId !== params.accusationId) {
    const existing = await findPartyRecordByIdempotency(
      params.roomId,
      contrabandResolutionKey(params.runId, params.accusationId),
    );
    if (!existing) throw statusError("accusation is no longer active", 409);
    return { run, resolution: resolutionFromRow(existing, params.runId) };
  }
  const points = outcomePoints(params.outcome);
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: contrabandResolutionKey(params.runId, params.accusationId),
      runId: params.runId,
      gameId: "contraband",
      kind: CONTRABAND_RESOLUTION_KIND,
      visibility: "host",
      payload: {
        version: 1,
        accusationId: params.accusationId,
        accuserPlayerId: active.accuserPlayerId,
        accusedPlayerId: active.accusedPlayerId,
        outcome: params.outcome,
        source: params.source,
        organicScore: params.organicScore,
        verdict: params.verdict,
        ...points,
        completedAt: params.now ?? Date.now(),
      },
    },
  });
  const resolution = resolutionFromRow(created.row, params.runId);
  if (resolution.outcome !== params.outcome) {
    throw statusError("accusation already has a different verdict", 409);
  }
  const events = scoreEventsForResolution(params.state, params.runId, resolution);
  if (events.length) await awardScoreEvents({ roomId: params.roomId, state: params.state, events });
  const updated = await updateContraband(params.roomId, (state) =>
    resolveContrabandAccusationState(state, {
      runId: params.runId,
      accusationId: params.accusationId,
      outcome: params.outcome,
      now: params.now,
    }),
  );
  return { run: updated.state.contraband!, resolution };
}

export async function respondToContrabandAccusation(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  accusationId: string;
  response: "confess" | "dispute";
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  if (run.activeAccusation?.accusationId !== params.accusationId) {
    throw statusError("accusation changed", 409);
  }
  if (run.activeAccusation.accusedPlayerId !== params.player.id) {
    throw statusError("only the accused player can respond", 403);
  }
  if (params.response === "confess") {
    return resolveAccusation({
      ...params,
      outcome: "caught",
      source: "confession",
      verdict: "The smuggler confessed before the recorder reached the table.",
    });
  }
  const updated = await updateContraband(params.roomId, (state) =>
    disputeContrabandAccusationState(state, params.runId, params.accusationId, params.now),
  );
  return { run: updated.state.contraband! };
}

async function assignmentForPlayer(roomId: string, runId: string, playerId: string) {
  const row = await findPartyRecordByIdempotency(roomId, contrabandAssignmentKey(runId, playerId));
  if (!row) throw statusError("Contraband assignment not found", 404);
  return assignmentFromRow(row, runId);
}

export async function submitContrabandAudio(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  accusationId: string;
  storagePath: string;
  durationSeconds: number;
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  if (
    run.status !== "awaiting-audio" ||
    run.activeAccusation?.accusationId !== params.accusationId ||
    run.activeAccusation.accusedPlayerId !== params.player.id
  ) {
    throw statusError("Contraband recording is closed", 409);
  }
  if (params.durationSeconds < 8 || params.durationSeconds > 25) {
    throw statusError("record 8–25 seconds of surrounding context", 400);
  }
  assertPlayerMayUpload(params.state, "contraband-audio", params.player, params.runId, params.now);
  const storagePath = assertPlayerStoragePath({
    storagePath: params.storagePath,
    roomId: params.roomId,
    kind: "contraband",
    roundId: params.runId,
    playerId: params.player.id,
  });
  const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
  assertStorageObjectExists(exists);
  const downloaded = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).download(storagePath);
  if (downloaded.error) throw downloaded.error;
  if (downloaded.data.size > CONTRABAND_AUDIO_MAX_BYTES) {
    throw statusError("Contraband recording is too large", 413);
  }
  let transcript = "";
  let sttFallback = false;
  try {
    transcript = (
      await transcribeWithRoomBudget({
        roomId: params.roomId,
        operationId: `contraband:${params.runId}:${params.accusationId}:transcription`,
        file: downloaded.data,
        filename: storagePath.split("/").at(-1),
      })
    ).trim();
    if (!transcript) sttFallback = true;
  } catch {
    sttFallback = true;
  }
  const assignment = await assignmentForPlayer(params.roomId, params.runId, params.player.id);
  let aiVerdict: ReturnType<typeof contrabandArbitrationSpec.fallback> | undefined;
  let aiFallback = true;
  if (!sttFallback) {
    const context = normalizePartyContext(params.state.party, params.state.venue);
    const judged = await runPromptSpec({
      spec: contrabandArbitrationSpec,
      input: { playerName: params.player.name, phrase: assignment.phrase, transcript },
      context,
      temperature: 0.2,
      budget: {
        roomId: params.roomId,
        operationId: `contraband:${params.runId}:${params.accusationId}:arbitration`,
      },
    });
    aiVerdict = judged.output;
    aiFallback = judged.usedFallback;
  }
  await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: contrabandArbitrationKey(params.runId, params.accusationId),
      runId: params.runId,
      gameId: "contraband",
      kind: CONTRABAND_ARBITRATION_KIND,
      visibility: "host",
      payload: {
        version: 1,
        accusationId: params.accusationId,
        storagePath,
        durationSeconds: params.durationSeconds,
        transcript,
        aiVerdict,
        sttFallback,
        aiFallback,
        completedAt: params.now ?? Date.now(),
      },
    },
  });
  if (!sttFallback && !aiFallback && aiVerdict) {
    const outcome = aiOutcome(aiVerdict.organic_score);
    return resolveAccusation({
      roomId: params.roomId,
      state: params.state,
      runId: params.runId,
      accusationId: params.accusationId,
      outcome,
      source: "ai",
      organicScore: aiVerdict.organic_score,
      verdict: aiVerdict.verdict,
      now: params.now,
    });
  }
  const updated = await updateContraband(params.roomId, (state) =>
    reviewContrabandAccusationState(state, params.runId, params.accusationId),
  );
  return { run: updated.state.contraband!, needsManualReview: true };
}

export async function contrabandHostCase(params: { room: AuthorizedHostRoom; runId: string }) {
  const run = assertRun(params.room.state, params.runId);
  const active = run.activeAccusation;
  if (!active) return { run, case: null };
  const accusationRow = await findPartyRecordByIdempotency(
    params.room.id,
    contrabandAccusationKey(params.runId, active.accusationId),
  );
  if (!accusationRow) throw statusError("Contraband case file missing", 409);
  const accusation = accusationFromRow(accusationRow, params.runId);
  const assignment = await assignmentForPlayer(
    params.room.id,
    params.runId,
    active.accusedPlayerId,
  );
  const arbitrationRow = await findPartyRecordByIdempotency(
    params.room.id,
    contrabandArbitrationKey(params.runId, active.accusationId),
  );
  return {
    run,
    case: {
      accusation,
      assignment,
      arbitration: arbitrationRow
        ? contrabandArbitrationRecordSchema.parse(arbitrationRow.payload)
        : null,
    },
  };
}

export async function manuallyResolveContraband(params: {
  room: AuthorizedHostRoom;
  runId: string;
  accusationId: string;
  outcome: "caught" | "clean" | "false-accusation";
  now?: number;
}) {
  return resolveAccusation({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    accusationId: params.accusationId,
    outcome: params.outcome,
    source: "manual",
    verdict:
      params.outcome === "caught"
        ? "The host confiscated the phrase. The delivery did not clear customs."
        : params.outcome === "clean"
          ? "The host ruled the phrase organic enough to cross cleanly."
          : "The host found no assigned cargo in the alleged quote. False alarm.",
    now: params.now,
  });
}

export async function finalizeContraband(params: {
  room: AuthorizedHostRoom;
  runId: string;
  now?: number;
}) {
  const run = assertRun(params.room.state, params.runId);
  if (run.status === "results") return { run };
  if (run.activeAccusation) throw statusError("resolve the live accusation first", 409);
  const rows = await runRows(params.room.id, params.runId);
  const assignments = rows
    .filter((row) => row.kind === CONTRABAND_ASSIGNMENT_KIND)
    .map((row) => assignmentFromRow(row, params.runId));
  const resolutions = rows
    .filter((row) => row.kind === CONTRABAND_RESOLUTION_KIND)
    .map((row) => resolutionFromRow(row, params.runId));
  if (assignments.length !== run.participantIds.length) {
    throw statusError("not every player received a phrase", 409);
  }
  const decisiveByPlayer = new Map<string, ContrabandResolutionRecord>();
  resolutions.forEach((resolution) => {
    if (
      resolution.outcome !== "false-accusation" &&
      !decisiveByPlayer.has(resolution.accusedPlayerId)
    ) {
      decisiveByPlayer.set(resolution.accusedPlayerId, resolution);
    }
  });
  const results = assignments.map((assignment) => {
    const player = params.room.state.players.find(
      (candidate) => candidate.id === assignment.ownerPlayerId,
    );
    if (!player) throw statusError("Contraband player left the room", 409);
    const decisive = decisiveByPlayer.get(player.id);
    return {
      playerId: player.id,
      playerName: player.name,
      phrase: assignment.phrase,
      outcome: decisive ? (decisive.outcome === "caught" ? "caught" : "clean") : "survived",
      points: decisive?.outcome === "caught" ? 0 : CONTRABAND_SMUGGLER_POINTS,
    } as const;
  });
  const expiryEvents: ScoreAwardInput[] = results.flatMap((entry) => {
    if (entry.outcome !== "survived") return [];
    const player = params.room.state.players.find((candidate) => candidate.id === entry.playerId);
    return player
      ? [
          {
            idempotencyKey: contrabandScoreKey(params.runId, `${entry.playerId}:survived`),
            runId: params.runId,
            gameId: "contraband",
            teamId: player.teamId,
            playerId: player.id,
            points: CONTRABAND_SMUGGLER_POINTS,
            reason: "Contraband phrase survived the timer",
            source: "deterministic" as const,
            rubric: { timerExpired: true },
          },
        ]
      : [];
  });
  const publicAccusations = resolutions.map((resolution) => ({
    accusationId: resolution.accusationId,
    accuserPlayerId: resolution.accuserPlayerId,
    accusedPlayerId: resolution.accusedPlayerId,
    outcome: resolution.outcome,
    verdict: resolution.verdict,
  }));
  const created = await createPartyRecord({
    roomId: params.room.id,
    state: params.room.state,
    input: {
      idempotencyKey: contrabandResultKey(params.runId),
      runId: params.runId,
      gameId: "contraband",
      kind: CONTRABAND_RESULT_KIND,
      visibility: "host",
      payload: {
        version: 1,
        entries: results,
        accusations: publicAccusations,
        completedAt: params.now ?? Date.now(),
      },
    },
  });
  const resultRecord = contrabandResultRecordSchema.parse(created.row.payload);
  if (expiryEvents.length) {
    await awardScoreEvents({
      roomId: params.room.id,
      state: params.room.state,
      events: expiryEvents,
    });
  }
  const updated = await updateContraband(params.room.id, (state) =>
    finalizeContrabandState(state, {
      runId: params.runId,
      results: resultRecord.entries,
      now: resultRecord.completedAt,
    }),
  );
  return { run: updated.state.contraband!, accusations: resultRecord.accusations };
}

export const CONTRABAND_SERVER_SCORING = {
  smuggler: CONTRABAND_SMUGGLER_POINTS,
  catcher: CONTRABAND_CATCHER_POINTS,
  falseAccusation: CONTRABAND_FALSE_ACCUSATION_POINTS,
};
