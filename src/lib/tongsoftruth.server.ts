import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  TONGS_TESTIMONY_KIND,
  TONGS_VERDICT_KIND,
  tongsTestimonyRecordSchema,
  tongsVerdictRecordSchema,
  type TongsJudgment,
  type TongsTestimonyRecord,
  type TongsVerdictRecord,
} from "@/games/tongsoftruth/model";
import { tongsJudgmentSpec, tongsQuestionSpec } from "./ai/tongsoftruth.prompts";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { transcribeWithRoomBudget } from "./ai-budget.server";
import {
  markTongsJudgingState,
  nextTongsRoundState,
  revealTongsRoundState,
  reviewTongsRoundState,
  setTongsQuestionState,
  startTongsRecordingState,
} from "./game-state";
import type { AuthorizedHostRoom } from "./host-auth.server";
import { normalizePartyContext } from "./party-context";
import { createPartyRecord, findPartyRecordByIdempotency } from "./party-records.server";
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
import {
  tongsPoints,
  TONGS_MAX_RECORDING_SECONDS,
  TONGS_MIN_RECORDING_SECONDS,
} from "./tongsoftruth-lifecycle";
import type { Player, RoomState, TongsOfTruthRoundResult } from "./types";

type Snapshot = { id: string; state: RoomState; updatedAt: string };
export const TONGS_AUDIO_MAX_BYTES = 5_000_000;

function key(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export const tongsTestimonyKey = (runId: string, roundId: string) =>
  key("tongs_testimony", `${runId}:${roundId}`);
export const tongsVerdictKey = (runId: string, roundId: string) =>
  key("tongs_verdict", `${runId}:${roundId}`);
export const tongsScoreKey = (runId: string, roundId: string) =>
  key("tongs_score", `${runId}:${roundId}`);

function assertRun(state: RoomState, runId: string) {
  const run = state.tongsoftruth;
  if (!run || run.runId !== runId) throw statusError("Tongs of Truth run is no longer active", 409);
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

async function updateTongs(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSnapshot(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("Tongs of Truth state changed", 409);
      return { state, value: state.tongsoftruth };
    },
    writeSnapshot,
  });
}

function testimonyFromRow(
  row: NonNullable<Awaited<ReturnType<typeof findPartyRecordByIdempotency>>>,
) {
  if (row.game_id !== "tongsoftruth" || row.kind !== TONGS_TESTIMONY_KIND) {
    throw statusError("invalid Tongs testimony", 409);
  }
  return tongsTestimonyRecordSchema.parse(row.payload);
}

function verdictFromRow(
  row: NonNullable<Awaited<ReturnType<typeof findPartyRecordByIdempotency>>>,
) {
  if (row.game_id !== "tongsoftruth" || row.kind !== TONGS_VERDICT_KIND) {
    throw statusError("invalid Tongs verdict", 409);
  }
  return tongsVerdictRecordSchema.parse(row.payload);
}

export async function prepareTongsQuestion(params: { room: AuthorizedHostRoom; runId: string }) {
  const run = assertRun(params.room.state, params.runId);
  if (run.status !== "question" || run.question) return { run };
  const seed = Number.parseInt(
    createHash("sha256").update(run.currentRoundId).digest("hex").slice(0, 8),
    16,
  );
  const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
  const generated = await runPromptSpec({
    spec: tongsQuestionSpec,
    input: {
      playerName: run.speakerName,
      level: run.level,
      seed,
      recentQuestions: run.roundResults.map((entry) => entry.question),
    },
    context,
    temperature: 0.8,
    budget: {
      roomId: params.room.id,
      operationId: `tongs:${params.runId}:${run.currentRoundId}:question`,
    },
  });
  const updated = await updateTongs(params.room.id, (state) =>
    setTongsQuestionState(state, {
      runId: params.runId,
      roundId: run.currentRoundId,
      question: generated.output.question,
      aiFallback: generated.usedFallback,
    }),
  );
  return { run: updated.state.tongsoftruth! };
}

export async function startTongsRecording(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  if (run.speakerPlayerId !== params.player.id) {
    throw statusError("only the player holding the tongs can open the microphone", 403);
  }
  if (run.status === "recording") return { run };
  const updated = await updateTongs(params.roomId, (state) =>
    startTongsRecordingState(state, {
      runId: params.runId,
      playerId: params.player.id,
      now: params.now,
    }),
  );
  return { run: updated.state.tongsoftruth! };
}

function resultFromVerdict(
  run: NonNullable<RoomState["tongsoftruth"]>,
  verdict: TongsVerdictRecord,
): TongsOfTruthRoundResult {
  if (!run.question) throw statusError("Tongs question is missing", 409);
  return {
    roundId: run.currentRoundId,
    speakerPlayerId: run.speakerPlayerId,
    speakerName: run.speakerName,
    level: run.level,
    question: run.question,
    honestyScore: verdict.honestyScore,
    dodgeDetected: verdict.dodgeDetected,
    artistryScore: verdict.artistryScore,
    environmentUsed: verdict.environmentUsed,
    points: verdict.points,
    comment: verdict.comment,
    source: verdict.source,
  };
}

async function resolveTongsVerdict(params: {
  roomId: string;
  state: RoomState;
  runId: string;
  roundId: string;
  source: "ai" | "manual" | "skipped";
  honestyScore: number;
  dodgeDetected: boolean;
  artistryScore: number;
  environmentUsed: boolean;
  comment: string;
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  if (run.currentRoundId !== params.roundId) throw statusError("Tongs round changed", 409);
  const points =
    params.source === "skipped"
      ? 0
      : tongsPoints({
          honestyScore: params.honestyScore,
          dodgeDetected: params.dodgeDetected,
          artistryScore: params.artistryScore,
          environmentUsed: params.environmentUsed,
        });
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: tongsVerdictKey(params.runId, params.roundId),
      runId: params.runId,
      gameId: "tongsoftruth",
      ownerPlayerId: run.speakerPlayerId,
      kind: TONGS_VERDICT_KIND,
      visibility: "host",
      payload: {
        version: 1,
        roundId: params.roundId,
        speakerPlayerId: run.speakerPlayerId,
        source: params.source,
        honestyScore: Math.max(0, Math.min(10, Math.trunc(params.honestyScore))),
        dodgeDetected: params.dodgeDetected,
        artistryScore: Math.max(0, Math.min(5, Math.trunc(params.artistryScore))),
        environmentUsed: params.environmentUsed,
        points,
        comment: params.comment,
        completedAt: params.now ?? Date.now(),
      },
    },
  });
  const verdict = verdictFromRow(created.row);
  if (verdict.source !== params.source) throw statusError("Tongs verdict already locked", 409);
  const player = params.state.players.find((candidate) => candidate.id === run.speakerPlayerId);
  if (verdict.points > 0 && player) {
    await awardScoreEvents({
      roomId: params.roomId,
      state: params.state,
      events: [
        {
          idempotencyKey: tongsScoreKey(params.runId, params.roundId),
          runId: params.runId,
          gameId: "tongsoftruth",
          teamId: player.teamId,
          playerId: player.id,
          points: verdict.points,
          reason: "Tongs of Truth testimony",
          source: params.source === "ai" ? "ai-bonus" : "host-adjustment",
          rubric: {
            honestyScore: verdict.honestyScore,
            dodgeDetected: verdict.dodgeDetected,
            artistryScore: verdict.artistryScore,
            environmentUsed: verdict.environmentUsed,
          },
        },
      ],
    });
  }
  const updated = await updateTongs(params.roomId, (state) =>
    revealTongsRoundState(
      state,
      params.runId,
      resultFromVerdict(assertRun(state, params.runId), verdict),
    ),
  );
  return { run: updated.state.tongsoftruth!, verdict };
}

async function createTestimony(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  roundId: string;
  storagePath: string;
  durationSeconds: number;
  now?: number;
}): Promise<TongsTestimonyRecord> {
  const run = assertRun(params.state, params.runId);
  if (run.status !== "recording" || run.currentRoundId !== params.roundId) {
    throw statusError("Tongs microphone is closed", 409);
  }
  if (
    params.durationSeconds < TONGS_MIN_RECORDING_SECONDS ||
    params.durationSeconds > TONGS_MAX_RECORDING_SECONDS
  ) {
    throw statusError("record a 10–20 second answer", 400);
  }
  assertPlayerMayUpload(params.state, "tongs-audio", params.player, params.roundId, params.now);
  const storagePath = assertPlayerStoragePath({
    storagePath: params.storagePath,
    roomId: params.roomId,
    kind: "tongsoftruth",
    roundId: params.roundId,
    playerId: params.player.id,
  });
  const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
  assertStorageObjectExists(exists);
  const downloaded = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).download(storagePath);
  if (downloaded.error) throw downloaded.error;
  if (downloaded.data.size > TONGS_AUDIO_MAX_BYTES) {
    throw statusError("Tongs recording is too large", 413);
  }
  let transcript = "";
  let sttFallback = false;
  try {
    transcript = (
      await transcribeWithRoomBudget({
        roomId: params.roomId,
        operationId: `tongs:${params.runId}:${params.roundId}:${params.player.id}:transcription`,
        file: downloaded.data,
        filename: storagePath.split("/").at(-1),
      })
    ).trim();
    if (!transcript) sttFallback = true;
  } catch {
    sttFallback = true;
  }
  let judgment: TongsJudgment | undefined;
  let aiFallback = true;
  if (!sttFallback) {
    const judged = await runPromptSpec({
      spec: tongsJudgmentSpec,
      input: {
        playerName: run.speakerName,
        level: run.level,
        question: run.question!,
        transcript,
      },
      context: normalizePartyContext(params.state.party, params.state.venue),
      temperature: 0.2,
      budget: {
        roomId: params.roomId,
        operationId: `tongs:${params.runId}:${params.roundId}:judgment`,
      },
    });
    judgment = judged.output;
    aiFallback = judged.usedFallback;
  }
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: tongsTestimonyKey(params.runId, params.roundId),
      runId: params.runId,
      gameId: "tongsoftruth",
      ownerPlayerId: params.player.id,
      kind: TONGS_TESTIMONY_KIND,
      visibility: "host",
      payload: {
        version: 1,
        roundId: params.roundId,
        speakerPlayerId: params.player.id,
        speakerName: params.player.name,
        level: run.level,
        question: run.question!,
        storagePath,
        durationSeconds: params.durationSeconds,
        transcript,
        ...(judgment ? { judgment } : {}),
        sttFallback,
        aiFallback,
        recordedAt: params.now ?? Date.now(),
      },
    },
  });
  return testimonyFromRow(created.row);
}

export async function submitTongsAudio(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  roundId: string;
  storagePath: string;
  durationSeconds: number;
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  if (run.currentRoundId !== params.roundId || run.speakerPlayerId !== params.player.id) {
    throw statusError("only the current speaker can submit this testimony", 403);
  }
  const existing = await findPartyRecordByIdempotency(
    params.roomId,
    tongsTestimonyKey(params.runId, params.roundId),
  );
  const testimony = existing ? testimonyFromRow(existing) : await createTestimony(params);
  if (testimony.speakerPlayerId !== params.player.id) {
    throw statusError("Tongs testimony owner changed", 409);
  }
  if (run.status === "recording") {
    await updateTongs(params.roomId, (state) =>
      markTongsJudgingState(state, params.runId, params.roundId),
    );
  }
  if (testimony.sttFallback || testimony.aiFallback || !testimony.judgment) {
    const updated = await updateTongs(params.roomId, (state) =>
      reviewTongsRoundState(state, params.runId, params.roundId),
    );
    return { run: updated.state.tongsoftruth!, needsManualReview: true };
  }
  return resolveTongsVerdict({
    roomId: params.roomId,
    state: params.state,
    runId: params.runId,
    roundId: params.roundId,
    source: "ai",
    honestyScore: testimony.judgment.honesty_score,
    dodgeDetected: testimony.judgment.dodge_detected,
    artistryScore: testimony.judgment.artistry_score,
    environmentUsed: testimony.judgment.environment_used,
    comment: testimony.judgment.comment,
    now: params.now,
  });
}

export async function tongsHostCase(params: { room: AuthorizedHostRoom; runId: string }) {
  const run = assertRun(params.room.state, params.runId);
  const row = await findPartyRecordByIdempotency(
    params.room.id,
    tongsTestimonyKey(params.runId, run.currentRoundId),
  );
  return { run, testimony: row ? testimonyFromRow(row) : null };
}

export async function manuallyResolveTongs(params: {
  room: AuthorizedHostRoom;
  runId: string;
  roundId: string;
  honestyScore: number;
  dodgeDetected: boolean;
  artistryScore: number;
  environmentUsed: boolean;
  comment: string;
  now?: number;
}) {
  const run = assertRun(params.room.state, params.runId);
  if (!["review", "reveal"].includes(run.status)) {
    throw statusError("manual review is not open", 409);
  }
  return resolveTongsVerdict({
    roomId: params.room.id,
    state: params.room.state,
    ...params,
    source: "manual",
  });
}

export async function skipTongsRound(params: {
  room: AuthorizedHostRoom;
  runId: string;
  roundId: string;
  now?: number;
}) {
  const run = assertRun(params.room.state, params.runId);
  if (
    run.currentRoundId !== params.roundId ||
    !["question", "recording", "judging", "review", "reveal"].includes(run.status)
  ) {
    throw statusError("Tongs round cannot be skipped now", 409);
  }
  const locale = params.room.state.party?.contentLocale ?? "en";
  return resolveTongsVerdict({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    roundId: params.roundId,
    source: "skipped",
    honestyScore: 0,
    dodgeDetected: false,
    artistryScore: 0,
    environmentUsed: false,
    comment:
      locale === "ru"
        ? "Щипцы переданы без показаний. Даже гриль уважает право на пас."
        : "The tongs moved on without testimony. Even a grill respects a pass.",
    now: params.now,
  });
}

export async function nextTongsRound(params: {
  room: AuthorizedHostRoom;
  runId: string;
  roundId: string;
  now?: number;
}) {
  const run = assertRun(params.room.state, params.runId);
  if (run.status === "results") return { run };
  if (run.currentRoundId !== params.roundId) {
    if (run.roundResults.some((result) => result.roundId === params.roundId)) return { run };
    throw statusError("Tongs round changed", 409);
  }
  const updated = await updateTongs(params.room.id, (state) =>
    nextTongsRoundState(state, params.runId, params.now),
  );
  return { run: updated.state.tongsoftruth! };
}
