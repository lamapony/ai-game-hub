import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CONTRABAND_WORD_CATALOG,
  pickToastFallback,
  TOAST_GENRE_CATALOG,
} from "@/games/toastsyndicate/fallback-catalog";
import {
  TOAST_ASSIGNMENT_KIND,
  TOAST_CATCH_KIND,
  TOAST_RECORDING_KIND,
  TOAST_RESULT_KIND,
  toastAssignmentRecordSchema,
  toastCatchRecordSchema,
  toastRecordingRecordSchema,
  toastResultRecordSchema,
  type ToastAssignment,
  type ToastJudgment,
} from "@/games/toastsyndicate/model";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { preparedAiOutput } from "./ai-prewarm.server";
import { toastAssignmentSpec, toastJudgmentSpec } from "./ai/toastsyndicate.prompts";
import { transcribeWithRoomBudget } from "./ai-budget.server";
import {
  assignToastSyndicateState,
  beginToastJudgingState,
  finalizeToastSyndicateState,
  markToastListenerSubmittedState,
  markToastRecordingSubmittedState,
  nextToastSyndicateRoundState,
  startToastRecordingState,
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
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import { awardScoreEvents } from "./score-events.server";
import type { ScoreAwardInput } from "./score-events";
import {
  caughtToastWords,
  normalizeToastWord,
  sameToastGuesses,
  scoreToastRound,
} from "./toastsyndicate-lifecycle";
import { migrateRoomState } from "./room-state-migration";
import type { Player, RoomState } from "./types";

type ToastRoomSnapshot = { id: string; state: RoomState; updatedAt: string };

export const TOAST_AUDIO_MAX_BYTES = 20_000_000;

function hashedKey(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export const toastAssignmentIdempotencyKey = (roundId: string) =>
  hashedKey("toast_assignment", roundId);
export const toastRecordingIdempotencyKey = (roundId: string) =>
  hashedKey("toast_recording", roundId);
export const toastCatchIdempotencyKey = (roundId: string, playerId: string) =>
  hashedKey("toast_catch", `${roundId}:${playerId}`);
export const toastResultIdempotencyKey = (roundId: string) => hashedKey("toast_result", roundId);
export const toastScoreIdempotencyKey = (roundId: string, playerId: string, role: string) =>
  hashedKey("toast_score", `${roundId}:${playerId}:${role}`);

function assertToastRound(state: RoomState, roundId: string) {
  const toast = state.toastsyndicate;
  if (state.currentGame !== "toastsyndicate" || !toast || toast.roundId !== roundId) {
    throw statusError("Toast Syndicate round is no longer active", 409);
  }
  return toast;
}

async function loadToastRoom(roomId: string): Promise<ToastRoomSnapshot> {
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

async function writeToastRoom(snapshot: ToastRoomSnapshot, state: RoomState) {
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

async function updateToastState(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadToastRoom(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("Toast Syndicate state changed", 409);
      return { state, value: state.toastsyndicate };
    },
    writeSnapshot: writeToastRoom,
  });
}

function assertAssignmentRow(row: PartyRecordRow, roundId: string, speakerPlayerId: string) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "toastsyndicate" ||
    row.kind !== TOAST_ASSIGNMENT_KIND ||
    row.owner_player_id !== speakerPlayerId
  ) {
    throw statusError("invalid Toast Syndicate assignment", 409);
  }
  return toastAssignmentRecordSchema.parse(row.payload);
}

function canonicalAssignment(
  generated: ToastAssignment,
  locale: "en" | "ru",
  recentGenreIds: string[],
  recentWordIds: string[],
) {
  const genre = TOAST_GENRE_CATALOG.find((entry) => entry.id === generated.genreId);
  const wordIds = generated.words.map((word) => word.id);
  const words = wordIds.map((id) => CONTRABAND_WORD_CATALOG.find((entry) => entry.id === id));
  if (
    !genre ||
    recentGenreIds.includes(genre.id) ||
    new Set(wordIds).size !== 3 ||
    words.some((word) => !word) ||
    wordIds.some((id) => recentWordIds.includes(id))
  ) {
    return null;
  }
  return {
    genreId: genre.id,
    genre: genre.label[locale],
    instructions: genre.instructions[locale],
    words: words.map((word) => ({ id: word!.id, text: word!.label[locale] })),
  } satisfies ToastAssignment;
}

async function toastHistory(roomId: string, sessionId: string) {
  const rows = await listPartyRecordRows(roomId, { kind: TOAST_ASSIGNMENT_KIND });
  return rows.flatMap((row) => {
    if (!row.run_id.startsWith(`${sessionId}_r`) || row.game_id !== "toastsyndicate") return [];
    const parsed = toastAssignmentRecordSchema.safeParse(row.payload);
    return parsed.success ? [parsed.data.assignment] : [];
  });
}

export async function assignToastSyndicateRound(params: {
  room: AuthorizedHostRoom;
  roundId: string;
  now?: number;
}) {
  const toast = assertToastRound(params.room.state, params.roundId);
  if (params.room.state.party?.actId !== "bar") {
    throw statusError("Toast Syndicate can only be assigned in the bar act", 409);
  }
  if (toast.phase !== "briefing") throw statusError("toast assignment is closed", 409);
  const key = toastAssignmentIdempotencyKey(params.roundId);
  const existing = await findPartyRecordByIdempotency(params.room.id, key);
  let record;
  if (existing) {
    record = assertAssignmentRow(existing, params.roundId, toast.speakerPlayerId);
  } else {
    const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
    const history = await toastHistory(params.room.id, toast.sessionId);
    const recentGenreIds = history.slice(-5).map((assignment) => assignment.genreId);
    const recentWordIds = history
      .slice(-4)
      .flatMap((assignment) => assignment.words.map((word) => word.id));
    const seed = toast.roundNumber * 104_729 + toast.sessionId.length * 97;
    const prepared = await preparedAiOutput({
      roomId: params.room.id,
      state: params.room.state,
      gameId: "toastsyndicate",
      targetActId: context.actId,
    });
    const preparedOutput = toastAssignmentSpec.outputSchema.safeParse(prepared?.output);
    const generated = preparedOutput.success
      ? { output: preparedOutput.data, usedFallback: prepared?.usedFallback ?? false }
      : await runPromptSpec({
          spec: toastAssignmentSpec,
          input: { seed, recentGenreIds, recentWordIds },
          context,
          temperature: 0.8,
          budget: {
            roomId: params.room.id,
            operationId: `toast:${params.roundId}:assignment`,
          },
        });
    const canonical = canonicalAssignment(
      generated.output,
      context.contentLocale,
      recentGenreIds,
      recentWordIds,
    );
    const assignment =
      canonical ?? pickToastFallback(context.contentLocale, seed, recentGenreIds, recentWordIds);
    const created = await createPartyRecord({
      roomId: params.room.id,
      state: params.room.state,
      input: {
        idempotencyKey: key,
        runId: params.roundId,
        gameId: "toastsyndicate",
        ownerPlayerId: toast.speakerPlayerId,
        kind: TOAST_ASSIGNMENT_KIND,
        visibility: "player",
        payload: {
          version: 1,
          assignment,
          speakerPlayerId: toast.speakerPlayerId,
          assignedAt: params.now ?? Date.now(),
          aiFallback: generated.usedFallback || !canonical,
        },
      },
    });
    record = assertAssignmentRow(created.row, params.roundId, toast.speakerPlayerId);
  }
  const updated = await updateToastState(params.room.id, (state) =>
    assignToastSyndicateState(state, {
      roundId: params.roundId,
      genre: record.assignment.genre,
      genreInstructions: record.assignment.instructions,
      aiFallback: record.aiFallback,
      now: params.now,
    }),
  );
  return { toast: updated.state.toastsyndicate!, aiFallback: record.aiFallback };
}

export async function startToastSyndicateRecording(params: {
  room: AuthorizedHostRoom;
  roundId: string;
  now?: number;
}) {
  const toast = assertToastRound(params.room.state, params.roundId);
  if (["recording", "catching", "judging", "results"].includes(toast.phase)) {
    return { toast };
  }
  const updated = await updateToastState(params.room.id, (state) =>
    startToastRecordingState(state, params.roundId, params.now),
  );
  return { toast: updated.state.toastsyndicate! };
}

function assertRecordingRow(row: PartyRecordRow, roundId: string, speakerPlayerId: string) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "toastsyndicate" ||
    row.kind !== TOAST_RECORDING_KIND
  ) {
    throw statusError("invalid Toast Syndicate recording", 409);
  }
  const payload = toastRecordingRecordSchema.parse(row.payload);
  if (payload.speakerPlayerId !== speakerPlayerId) {
    throw statusError("Toast Syndicate recording owner changed", 409);
  }
  return payload;
}

export async function submitToastSyndicateRecording(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  roundId: string;
  storagePath: unknown;
  durationSeconds: number;
  now?: number;
}) {
  const toast = assertToastRound(params.state, params.roundId);
  const key = toastRecordingIdempotencyKey(params.roundId);
  const existing = await findPartyRecordByIdempotency(params.roomId, key);
  let record;
  if (existing) {
    record = assertRecordingRow(existing, params.roundId, toast.speakerPlayerId);
    if (params.player.id !== toast.speakerPlayerId) {
      throw statusError("only the speaker can submit", 403);
    }
    if (toast.recordingSubmitted) return { toast, sttFallback: record.sttFallback };
  } else {
    assertPlayerMayUpload(params.state, "toast-audio", params.player, params.roundId);
    if (params.durationSeconds < 25 || params.durationSeconds > 75) {
      throw statusError("record a 30–60 second toast", 400);
    }
    const storagePath = assertPlayerStoragePath({
      storagePath: params.storagePath,
      roomId: params.roomId,
      kind: "toastsyndicate",
      roundId: params.roundId,
      playerId: params.player.id,
    });
    const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
    assertStorageObjectExists(exists);
    const downloaded = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).download(storagePath);
    if (downloaded.error) throw downloaded.error;
    if (downloaded.data.size > TOAST_AUDIO_MAX_BYTES) {
      throw statusError("toast recording is too large", 413);
    }
    let transcript = "";
    let sttFallback = false;
    try {
      transcript = await transcribeWithRoomBudget({
        roomId: params.roomId,
        operationId: `toast:${params.roundId}:transcription`,
        file: downloaded.data,
        filename: storagePath.split("/").at(-1),
      });
    } catch {
      sttFallback = true;
    }
    const created = await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        idempotencyKey: key,
        runId: params.roundId,
        gameId: "toastsyndicate",
        kind: TOAST_RECORDING_KIND,
        visibility: "host",
        payload: {
          version: 1,
          speakerPlayerId: params.player.id,
          storagePath,
          durationSeconds: params.durationSeconds,
          transcript,
          transcribedAt: params.now ?? Date.now(),
          sttFallback,
        },
      },
    });
    record = assertRecordingRow(created.row, params.roundId, toast.speakerPlayerId);
  }
  const updated = await updateToastState(params.roomId, (state) =>
    markToastRecordingSubmittedState(state, params.roundId, params.now),
  );
  return { toast: updated.state.toastsyndicate!, sttFallback: record.sttFallback };
}

function assertCatchRow(row: PartyRecordRow, roundId: string, playerId: string) {
  if (
    row.run_id !== roundId ||
    row.game_id !== "toastsyndicate" ||
    row.kind !== TOAST_CATCH_KIND ||
    row.owner_player_id !== playerId
  ) {
    throw statusError("invalid Toast Syndicate catch ballot", 409);
  }
  return toastCatchRecordSchema.parse(row.payload);
}

export async function submitToastSyndicateCatch(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  roundId: string;
  guesses: string[];
  now?: number;
}) {
  const toast = assertToastRound(params.state, params.roundId);
  if (toast.speakerPlayerId === params.player.id)
    throw statusError("speaker cannot inspect their own cargo", 403);
  const guesses = [...new Set(params.guesses.map((guess) => guess.trim()).filter(Boolean))];
  if (guesses.length > 3) throw statusError("submit at most three suspected words", 400);
  const key = toastCatchIdempotencyKey(params.roundId, params.player.id);
  const existing = await findPartyRecordByIdempotency(params.roomId, key);
  if (existing) {
    const record = assertCatchRow(existing, params.roundId, params.player.id);
    if (!sameToastGuesses(record.guesses, guesses)) {
      throw statusError("catch ballot is already sealed", 409);
    }
    if (toast.submittedListenerIds.includes(params.player.id)) return { toast };
  } else {
    if (toast.phase !== "catching") throw statusError("customs desk is closed", 409);
    await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        idempotencyKey: key,
        runId: params.roundId,
        gameId: "toastsyndicate",
        ownerPlayerId: params.player.id,
        kind: TOAST_CATCH_KIND,
        visibility: "player",
        payload: { version: 1, guesses, submittedAt: params.now ?? Date.now() },
      },
    });
  }
  const updated = await updateToastState(params.roomId, (state) =>
    markToastListenerSubmittedState(state, params.roundId, params.player.id),
  );
  return { toast: updated.state.toastsyndicate! };
}

async function roundRecord(roomId: string, roundId: string, kind: string) {
  const rows = await listPartyRecordRows(roomId, { runId: roundId, kind });
  return rows.find((row) => row.game_id === "toastsyndicate");
}

function canonicalJudgment(judgment: ToastJudgment, assignment: ToastAssignment) {
  const byWord = new Map(judgment.smuggled.map((entry) => [normalizeToastWord(entry.word), entry]));
  if (
    byWord.size !== 3 ||
    assignment.words.some((word) => !byWord.has(normalizeToastWord(word.text)))
  ) {
    return null;
  }
  return {
    ...judgment,
    smuggled: assignment.words.map((word) => ({
      ...byWord.get(normalizeToastWord(word.text))!,
      word: word.text,
    })),
  };
}

function toastScoreEvents(state: RoomState, result: ReturnType<typeof scoreToastRound>) {
  const speaker = state.players.find((player) => player.id === result.speakerPlayerId);
  if (!speaker) throw statusError("toast speaker left the room", 409);
  const events: ScoreAwardInput[] = [];
  if (result.speakerPoints > 0) {
    events.push({
      idempotencyKey: toastScoreIdempotencyKey(result.roundId, speaker.id, "speaker"),
      runId: result.roundId,
      gameId: "toastsyndicate",
      teamId: speaker.teamId,
      playerId: speaker.id,
      points: result.speakerPoints,
      reason: "Toast genre and undetected contraband",
      source: "deterministic",
      rubric: {
        genreScore: result.genreScore,
        uncaughtUsedWords: result.words
          .filter((word) => word.used && word.caughtByPlayerIds.length === 0)
          .map((word) => word.id),
      },
    });
  }
  Object.entries(result.listenerPoints).forEach(([playerId, points]) => {
    const listener = state.players.find((player) => player.id === playerId);
    if (!listener || points <= 0) return;
    events.push({
      idempotencyKey: toastScoreIdempotencyKey(result.roundId, listener.id, "listener"),
      runId: result.roundId,
      gameId: "toastsyndicate",
      teamId: listener.teamId,
      playerId: listener.id,
      points,
      reason: "Caught Toast Syndicate contraband",
      source: "deterministic",
      rubric: {
        caughtWordIds: result.words
          .filter((word) => word.caughtByPlayerIds.includes(listener.id))
          .map((word) => word.id),
      },
    });
  });
  return events;
}

export async function finalizeToastSyndicateRound(params: {
  room: AuthorizedHostRoom;
  roundId: string;
  now?: number;
}) {
  const toast = assertToastRound(params.room.state, params.roundId);
  if (!["catching", "judging", "results"].includes(toast.phase)) {
    throw statusError("toast is not ready for judgment", 409);
  }
  const resultKey = toastResultIdempotencyKey(params.roundId);
  const existing = await findPartyRecordByIdempotency(params.room.id, resultKey);
  let resultRecord;
  if (existing) {
    resultRecord = toastResultRecordSchema.parse(existing.payload);
  } else {
    if (toast.submittedListenerIds.length === 0) {
      throw statusError("wait for at least one listener ballot", 409);
    }
    await updateToastState(params.room.id, (state) =>
      beginToastJudgingState(state, params.roundId),
    );
    const assignmentRow = await roundRecord(params.room.id, params.roundId, TOAST_ASSIGNMENT_KIND);
    const recordingRow = await roundRecord(params.room.id, params.roundId, TOAST_RECORDING_KIND);
    if (!assignmentRow || !recordingRow) throw statusError("toast evidence is incomplete", 409);
    const assignmentRecord = assertAssignmentRow(
      assignmentRow,
      params.roundId,
      toast.speakerPlayerId,
    );
    const recordingRecord = assertRecordingRow(recordingRow, params.roundId, toast.speakerPlayerId);
    const catchRows = await listPartyRecordRows(params.room.id, {
      runId: params.roundId,
      kind: TOAST_CATCH_KIND,
    });
    const catches = catchRows.flatMap((row) => {
      if (!row.owner_player_id || row.game_id !== "toastsyndicate") return [];
      return [
        {
          playerId: row.owner_player_id,
          record: assertCatchRow(row, params.roundId, row.owner_player_id),
        },
      ];
    });
    const caughtByWordId = caughtToastWords({ assignment: assignmentRecord.assignment, catches });
    const caughtWords = assignmentRecord.assignment.words
      .filter((word) => (caughtByWordId[word.id]?.length ?? 0) > 0)
      .map((word) => word.text);
    const context = normalizePartyContext(params.room.state.party, params.room.state.venue);
    const input = {
      playerName: toast.speakerName,
      assignment: assignmentRecord.assignment,
      transcript: recordingRecord.transcript,
      caughtWords,
    };
    const judged = await runPromptSpec({
      spec: toastJudgmentSpec,
      input,
      context,
      temperature: 0.4,
      budget: { roomId: params.room.id, operationId: `toast:${params.roundId}:judgment` },
    });
    const judgment =
      canonicalJudgment(judged.output, assignmentRecord.assignment) ??
      toastJudgmentSpec.fallback(input, context);
    const result = scoreToastRound({
      roundId: params.roundId,
      speakerPlayerId: toast.speakerPlayerId,
      assignment: assignmentRecord.assignment,
      transcript: recordingRecord.transcript,
      judgment,
      caughtByWordId,
    });
    const created = await createPartyRecord({
      roomId: params.room.id,
      state: params.room.state,
      input: {
        idempotencyKey: resultKey,
        runId: params.roundId,
        gameId: "toastsyndicate",
        kind: TOAST_RESULT_KIND,
        visibility: "host",
        payload: {
          version: 1,
          result,
          aiFallback:
            judged.usedFallback || !canonicalJudgment(judged.output, assignmentRecord.assignment),
          completedAt: params.now ?? Date.now(),
        },
      },
    });
    resultRecord = toastResultRecordSchema.parse(created.row.payload);
  }
  const events = toastScoreEvents(params.room.state, resultRecord.result);
  if (events.length > 0)
    await awardScoreEvents({ roomId: params.room.id, state: params.room.state, events });
  const updated = await updateToastState(params.room.id, (state) =>
    finalizeToastSyndicateState(state, params.roundId, resultRecord.result),
  );
  return { toast: updated.state.toastsyndicate!, result: resultRecord.result };
}

export async function nextToastSyndicateRound(params: {
  room: AuthorizedHostRoom;
  roundId: string;
}) {
  const current = params.room.state.toastsyndicate;
  if (
    params.room.state.currentGame === "toastsyndicate" &&
    current &&
    current.roundId !== params.roundId &&
    current.roundResults.some((result) => result.roundId === params.roundId)
  ) {
    return { toast: current };
  }
  const toast = assertToastRound(params.room.state, params.roundId);
  const seed = (toast.roundNumber * 0.38196601125) % 1;
  const updated = await updateToastState(params.room.id, (state) =>
    nextToastSyndicateRoundState(state, params.roundId, seed),
  );
  return { toast: updated.state.toastsyndicate! };
}
