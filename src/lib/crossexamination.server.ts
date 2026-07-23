import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CROSS_EVIDENCE_SELECTION_KIND,
  CROSS_PREDICTION_KIND,
  CROSS_QUESTION_CATEGORIES,
  CROSS_QUESTIONS_KIND,
  CROSS_TESTIMONY_KIND,
  CROSS_VERDICT_KIND,
  crossEvidenceSelectionRecordSchema,
  crossPredictionRecordSchema,
  crossQuestionsRecordSchema,
  crossTestimonyRecordSchema,
  crossVerdictRecordSchema,
  type CrossComparisonOutput,
  type CrossEvidenceCandidate,
  type CrossEvidenceSelectionRecord,
  type CrossManualFinding,
  type CrossPredictionRecord,
  type CrossQuestionsRecord,
  type CrossTestimonyRecord,
  type CrossVerdictRecord,
} from "@/games/crossexamination/model";
import {
  CROSS_AUDIENCE_PREDICTION_POINTS,
  CROSS_MANUAL_SEVERITY,
  correctCrossPredictionCategories,
  crossAlibiStrength,
  crossEnvironmentBonus,
  crossPairPoints,
  fixedCrossSeverity,
  splitCrossPairPoints,
} from "@/games/crossexamination/scoring";
import { crossComparisonSpec, crossQuestionsSpec } from "./ai/crossexamination.prompts";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { transcribeWithRoomBudget } from "./ai-budget.server";
import {
  dismissCrossExaminationState,
  markCrossExaminationPredictionState,
  markCrossExaminationSubmittedState,
  nextCrossExaminationPairState,
  openCrossExaminationCaptureState,
  revealCrossExaminationState,
  reviewCrossExaminationState,
  setCrossExaminationQuestionsState,
} from "./game-state";
import type { AuthorizedHostRoom } from "./host-auth.server";
import { normalizePartyContext } from "./party-context";
import type { PartyRecordRow } from "./party-records";
import {
  createPartyRecord,
  currentPartyRecordFilters,
  findPartyRecordByIdempotency,
  listPartyRecordRows,
} from "./party-records.server";
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
  CROSS_MAX_RECORDING_SECONDS,
  CROSS_MIN_RECORDING_SECONDS,
} from "./crossexamination-lifecycle";
import type {
  CrossExaminationFinding,
  CrossExaminationPair,
  CrossExaminationPairResult,
  CrossExaminationQuestion,
  Player,
  RoomState,
} from "./types";

type Snapshot = { id: string; state: RoomState; updatedAt: string };
export const CROSS_AUDIO_MAX_BYTES = 10_000_000;

function opaqueKey(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex")}`;
}

export const crossSelectionKey = (runId: string) => opaqueKey("cross_selection", runId);
export const crossQuestionsKey = (runId: string, pairId: string) =>
  opaqueKey("cross_questions", `${runId}:${pairId}`);
export const crossTestimonyKey = (runId: string, pairId: string, playerId: string) =>
  opaqueKey("cross_testimony", `${runId}:${pairId}:${playerId}`);
export const crossPredictionKey = (runId: string, pairId: string, playerId: string) =>
  opaqueKey("cross_prediction", `${runId}:${pairId}:${playerId}`);
export const crossVerdictKey = (runId: string, pairId: string) =>
  opaqueKey("cross_verdict", `${runId}:${pairId}`);
export const crossScoreKey = (runId: string, pairId: string, playerId: string, role: string) =>
  opaqueKey("cross_score", `${runId}:${pairId}:${playerId}:${role}`);

function assertRun(state: RoomState, runId: string) {
  const run = state.crossexamination;
  if (!run || run.runId !== runId) throw statusError("Cross Examination is no longer active", 409);
  return run;
}

function currentPair(state: RoomState, runId: string) {
  const run = assertRun(state, runId);
  const pair = run.pairOrder[run.pairNumber - 1];
  if (!pair || pair.pairId !== run.currentPairId) throw statusError("Cross pair changed", 409);
  return { run, pair };
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

async function updateCross(roomId: string, apply: (state: RoomState) => RoomState | null) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSnapshot(roomId),
    applyUpdate: async (snapshot) => {
      const state = apply(snapshot.state);
      if (!state) throw statusError("Cross Examination state changed", 409);
      return { state, value: state.crossexamination };
    },
    writeSnapshot,
  });
}

function rowObject(row: PartyRecordRow) {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? (row.payload as Record<string, unknown>)
    : {};
}

function objectAt(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next = (value as Record<string, unknown>)[key];
  return next && typeof next === "object" && !Array.isArray(next)
    ? (next as Record<string, unknown>)
    : {};
}

function textAt(value: Record<string, unknown>, key: string, max = 600) {
  const text = typeof value[key] === "string" ? value[key].trim().replace(/\s+/g, " ") : "";
  return text.slice(0, max);
}

function stringArrayAt(value: Record<string, unknown>, key: string) {
  return Array.isArray(value[key])
    ? value[key].filter((entry): entry is string => typeof entry === "string").slice(0, 4)
    : [];
}

export function crossEvidenceCandidateFromRow(row: PartyRecordRow): CrossEvidenceCandidate | null {
  if (row.visibility === "player" || row.visibility === "sealed") return null;
  const payload = rowObject(row);
  let title = "";
  let excerpt = "";
  if (row.kind === "tongs-testimony") {
    title = `Tongs testimony · ${textAt(payload, "speakerName", 80) || "guest"}`;
    excerpt = [textAt(payload, "question", 300), textAt(payload, "transcript", 600)]
      .filter(Boolean)
      .join(" — ");
  } else if (row.kind === "smokescreen-result") {
    title = "Smoke Screen reveal";
    excerpt = textAt(payload, "recap", 700);
  } else if (row.kind === "oracle-prophecy") {
    const reading = objectAt(payload, "reading");
    title = `Grill Oracle · ${textAt(reading, "item_guess", 120) || "prophecy"}`;
    excerpt = [
      textAt(reading, "doneness_verdict", 220),
      textAt(reading, "prophecy", 350),
      stringArrayAt(reading, "predictions").join("; "),
    ]
      .filter(Boolean)
      .join(" — ");
  } else if (row.kind === "oracle-verdict") {
    const decision = objectAt(payload, "decision");
    title = "Oracle verification";
    excerpt = textAt(decision, "verdict", 700);
  } else if (row.kind === "stilllife-headline") {
    title = "Still Life brief";
    excerpt = textAt(payload, "headline", 300);
  } else if (row.kind === "stilllife-judgment") {
    const judgment = objectAt(payload, "judgment");
    title = `Still Life · ${textAt(judgment, "catalog_title", 160) || "auction lot"}`;
    excerpt = textAt(judgment, "critique", 700);
  } else if (row.kind === "contraband-resolution") {
    title = "Contraband ruling";
    excerpt = textAt(payload, "verdict", 500);
  } else if (row.kind === "toastsyndicate-result") {
    const result = objectAt(payload, "result");
    title = `Toast Syndicate · ${textAt(result, "genre", 120) || "toast"}`;
    excerpt = [textAt(result, "comment", 350), textAt(result, "transcript", 500)]
      .filter(Boolean)
      .join(" — ");
  } else if (row.kind === "sommelier-result") {
    const result = objectAt(payload, "result");
    const profile = objectAt(result, "profile");
    title = `Sommelier reveal · ${textAt(result, "ownerPlayerName", 80) || "guest"}`;
    excerpt = [textAt(profile, "drink_guess", 180), textAt(profile, "owner_profile", 500)]
      .filter(Boolean)
      .join(" — ");
  }
  if (!title || !excerpt) return null;
  return {
    recordId: row.id,
    kind: row.kind,
    actId: row.act_id,
    title,
    excerpt,
    ...(row.owner_player_id ? { ownerPlayerId: row.owner_player_id } : {}),
  };
}

async function evidenceCandidates(roomId: string, state: RoomState) {
  const rows = await listPartyRecordRows(roomId, currentPartyRecordFilters(state));
  const barOnly = state.party?.contingency === "bar-only";
  return rows
    .filter((row) => row.game_id !== "crossexamination")
    .filter((row) =>
      barOnly ? row.act_id === "bar" : ["grill", "transition", "bar"].includes(row.act_id),
    )
    .flatMap((row) => {
      const candidate = crossEvidenceCandidateFromRow(row);
      return candidate ? [candidate] : [];
    })
    .slice(0, 50);
}

function selectionFromRow(row: PartyRecordRow) {
  if (row.game_id !== "crossexamination" || row.kind !== CROSS_EVIDENCE_SELECTION_KIND) {
    throw statusError("invalid Cross evidence selection", 409);
  }
  return crossEvidenceSelectionRecordSchema.parse(row.payload);
}

function questionsFromRow(row: PartyRecordRow) {
  if (row.game_id !== "crossexamination" || row.kind !== CROSS_QUESTIONS_KIND) {
    throw statusError("invalid Cross questions", 409);
  }
  return crossQuestionsRecordSchema.parse(row.payload);
}

function testimonyFromRow(row: PartyRecordRow) {
  if (row.game_id !== "crossexamination" || row.kind !== CROSS_TESTIMONY_KIND) {
    throw statusError("invalid Cross testimony", 409);
  }
  return crossTestimonyRecordSchema.parse(row.payload);
}

function predictionFromRow(row: PartyRecordRow) {
  if (row.game_id !== "crossexamination" || row.kind !== CROSS_PREDICTION_KIND) {
    throw statusError("invalid Cross prediction", 409);
  }
  return crossPredictionRecordSchema.parse(row.payload);
}

function verdictFromRow(row: PartyRecordRow) {
  if (row.game_id !== "crossexamination" || row.kind !== CROSS_VERDICT_KIND) {
    throw statusError("invalid Cross verdict", 409);
  }
  return crossVerdictRecordSchema.parse(row.payload);
}

function sameSelection(a: CrossEvidenceSelectionRecord, b: CrossEvidenceSelectionRecord) {
  return (
    JSON.stringify(a.selectedRecordIds) === JSON.stringify(b.selectedRecordIds) &&
    JSON.stringify(a.excludedRecordIds) === JSON.stringify(b.excludedRecordIds) &&
    JSON.stringify(a.manualFacts) === JSON.stringify(b.manualFacts)
  );
}

async function createSelection(params: {
  roomId: string;
  state: RoomState;
  runId: string;
  excludedRecordIds: string[];
  manualFacts: string[];
}) {
  const candidates = await evidenceCandidates(params.roomId, params.state);
  const excluded = new Set(params.excludedRecordIds);
  const selected = candidates.filter((candidate) => !excluded.has(candidate.recordId));
  const manualFacts = params.manualFacts.map((fact) => fact.trim()).filter(Boolean);
  if (selected.length + manualFacts.length < 2) {
    throw statusError("approve at least two real records or host observations", 400);
  }
  const expected: CrossEvidenceSelectionRecord = {
    version: 1,
    selectedRecordIds: selected.map((candidate) => candidate.recordId),
    excludedRecordIds: candidates
      .filter((candidate) => excluded.has(candidate.recordId))
      .map((candidate) => candidate.recordId),
    manualFacts,
    selectedAt: Date.now(),
  };
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: crossSelectionKey(params.runId),
      runId: params.runId,
      gameId: "crossexamination",
      kind: CROSS_EVIDENCE_SELECTION_KIND,
      visibility: "host",
      payload: expected,
    },
  });
  const selection = selectionFromRow(created.row);
  const comparableExpected = { ...expected, selectedAt: selection.selectedAt };
  if (!sameSelection(selection, comparableExpected)) {
    throw statusError("Cross evidence selection is already locked", 409);
  }
  return { selection, candidates };
}

async function loadSelection(roomId: string, runId: string) {
  const row = await findPartyRecordByIdempotency(roomId, crossSelectionKey(runId));
  if (!row) throw statusError("Cross evidence has not been approved", 409);
  return selectionFromRow(row);
}

function questionRecordToPublic(record: CrossQuestionsRecord) {
  return record.questions as CrossExaminationQuestion[];
}

async function questionsForPair(params: {
  roomId: string;
  state: RoomState;
  runId: string;
  pair: CrossExaminationPair;
  selection: CrossEvidenceSelectionRecord;
  candidates: CrossEvidenceCandidate[];
  previousQuestions: string[];
}) {
  const existing = await findPartyRecordByIdempotency(
    params.roomId,
    crossQuestionsKey(params.runId, params.pair.pairId),
  );
  if (existing) return questionsFromRow(existing);
  const candidateById = new Map(
    params.candidates.map((candidate) => [candidate.recordId, candidate]),
  );
  const selected = params.selection.selectedRecordIds.flatMap((recordId) => {
    const candidate = candidateById.get(recordId);
    return candidate ? [candidate] : [];
  });
  const evidence = [
    ...selected.map((candidate, index) => ({
      tag: `${candidate.kind}-${index + 1}`,
      fact: candidate.excerpt,
    })),
    ...params.selection.manualFacts.map((fact, index) => ({
      tag: `host-recap-${index + 1}`,
      fact,
    })),
  ].slice(0, 16);
  const generated = await runPromptSpec({
    spec: crossQuestionsSpec,
    input: {
      pairAName: params.pair.playerAName,
      pairBName: params.pair.playerBName,
      evidence,
      previousQuestions: params.previousQuestions,
    },
    context: normalizePartyContext(params.state.party, params.state.venue),
    temperature: 0.45,
    budget: {
      roomId: params.roomId,
      operationId: `cross:${params.runId}:${params.pair.pairId}:questions`,
    },
  });
  const questions = generated.output.questions.map((text, index) => ({
    questionId: `${params.pair.pairId}_q${index + 1}`,
    category: CROSS_QUESTION_CATEGORIES[index]!,
    text,
  }));
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: crossQuestionsKey(params.runId, params.pair.pairId),
      runId: params.runId,
      gameId: "crossexamination",
      kind: CROSS_QUESTIONS_KIND,
      visibility: "host",
      payload: {
        version: 1,
        pairId: params.pair.pairId,
        questions,
        evidenceRecordIds: selected.map((candidate) => candidate.recordId),
        manualFactCount: params.selection.manualFacts.length,
        aiFallback: generated.usedFallback,
        generatedAt: Date.now(),
      },
    },
  });
  return questionsFromRow(created.row);
}

export async function prepareCrossExamination(params: {
  room: AuthorizedHostRoom;
  runId: string;
  excludedRecordIds: string[];
  manualFacts: string[];
}) {
  const { run, pair } = currentPair(params.room.state, params.runId);
  if (run.status === "briefing" && run.questions?.length === 4) return { run };
  if (run.status !== "curation") throw statusError("Cross evidence curation is closed", 409);
  const { selection, candidates } = await createSelection({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    excludedRecordIds: params.excludedRecordIds,
    manualFacts: params.manualFacts,
  });
  const record = await questionsForPair({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    pair,
    selection,
    candidates,
    previousQuestions: [],
  });
  const updated = await updateCross(params.room.id, (state) =>
    setCrossExaminationQuestionsState(state, {
      runId: params.runId,
      pairId: pair.pairId,
      questions: questionRecordToPublic(record),
      selectedSourceCount: record.evidenceRecordIds.length + record.manualFactCount,
      aiFallback: record.aiFallback,
    }),
  );
  return { run: updated.state.crossexamination! };
}

export async function openCrossExamination(params: {
  room: AuthorizedHostRoom;
  runId: string;
  pairId: string;
  now?: number;
}) {
  const updated = await updateCross(params.room.id, (state) =>
    openCrossExaminationCaptureState(state, params.runId, params.pairId, params.now),
  );
  return { run: updated.state.crossexamination! };
}

async function currentTestimonies(roomId: string, runId: string, pair: CrossExaminationPair) {
  const [rowA, rowB] = await Promise.all([
    findPartyRecordByIdempotency(roomId, crossTestimonyKey(runId, pair.pairId, pair.playerAId)),
    findPartyRecordByIdempotency(roomId, crossTestimonyKey(runId, pair.pairId, pair.playerBId)),
  ]);
  return {
    testimonyA: rowA ? testimonyFromRow(rowA) : null,
    testimonyB: rowB ? testimonyFromRow(rowB) : null,
  };
}

export async function crossExaminationHostCase(params: {
  room: AuthorizedHostRoom;
  runId: string;
}) {
  const { run, pair } = currentPair(params.room.state, params.runId);
  const candidates =
    run.status === "curation" ? await evidenceCandidates(params.room.id, params.room.state) : [];
  const testimonies =
    run.status === "curation"
      ? { testimonyA: null, testimonyB: null }
      : await currentTestimonies(params.room.id, params.runId, pair);
  return { run, candidates, ...testimonies };
}

export async function submitCrossPrediction(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  pairId: string;
  category: (typeof CROSS_QUESTION_CATEGORIES)[number];
  now?: number;
}) {
  const { run, pair } = currentPair(params.state, params.runId);
  if (run.currentPairId !== params.pairId) throw statusError("Cross pair changed", 409);
  if ([pair.playerAId, pair.playerBId].includes(params.player.id)) {
    throw statusError("the accomplices cannot predict their own contradiction", 403);
  }
  if (!run.participantIds.includes(params.player.id))
    throw statusError("player is not in this case", 403);
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: crossPredictionKey(params.runId, params.pairId, params.player.id),
      runId: params.runId,
      gameId: "crossexamination",
      ownerPlayerId: params.player.id,
      kind: CROSS_PREDICTION_KIND,
      visibility: "host",
      payload: {
        version: 1,
        pairId: params.pairId,
        voterPlayerId: params.player.id,
        category: params.category,
        submittedAt: params.now ?? Date.now(),
      },
    },
  });
  const prediction = predictionFromRow(created.row);
  if (prediction.category !== params.category)
    throw statusError("prediction is already locked", 409);
  if (created.replayed && ["reveal", "results"].includes(run.status)) {
    return { run };
  }
  const updated = await updateCross(params.roomId, (state) =>
    markCrossExaminationPredictionState(state, params.runId, params.pairId, params.player.id),
  );
  return { run: updated.state.crossexamination! };
}

async function createCrossTestimony(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  pairId: string;
  storagePath: string;
  durationSeconds: number;
  now?: number;
}) {
  const { run, pair } = currentPair(params.state, params.runId);
  if (run.status !== "capturing" || run.currentPairId !== params.pairId) {
    throw statusError("Cross microphone is closed", 409);
  }
  if (![pair.playerAId, pair.playerBId].includes(params.player.id)) {
    throw statusError("only the current accomplices can testify", 403);
  }
  if (
    params.durationSeconds < CROSS_MIN_RECORDING_SECONDS ||
    params.durationSeconds > CROSS_MAX_RECORDING_SECONDS
  ) {
    throw statusError("record a 20–60 second statement", 400);
  }
  assertPlayerMayUpload(params.state, "cross-audio", params.player, params.pairId, params.now);
  const storagePath = assertPlayerStoragePath({
    storagePath: params.storagePath,
    roomId: params.roomId,
    kind: "crossexamination",
    roundId: params.pairId,
    playerId: params.player.id,
  });
  const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
  assertStorageObjectExists(exists);
  const downloaded = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).download(storagePath);
  if (downloaded.error) throw downloaded.error;
  if (downloaded.data.size > CROSS_AUDIO_MAX_BYTES)
    throw statusError("Cross recording is too large", 413);
  let transcript = "";
  let sttFallback = false;
  try {
    transcript = (
      await transcribeWithRoomBudget({
        roomId: params.roomId,
        operationId: `cross:${params.runId}:${params.pairId}:${params.player.id}:transcription`,
        file: downloaded.data,
        filename: storagePath.split("/").at(-1),
      })
    ).trim();
    if (!transcript) sttFallback = true;
  } catch {
    sttFallback = true;
  }
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: crossTestimonyKey(params.runId, params.pairId, params.player.id),
      runId: params.runId,
      gameId: "crossexamination",
      ownerPlayerId: params.player.id,
      kind: CROSS_TESTIMONY_KIND,
      visibility: "host",
      payload: {
        version: 1,
        pairId: params.pairId,
        playerId: params.player.id,
        playerName: params.player.name,
        storagePath,
        durationSeconds: params.durationSeconds,
        transcript,
        sttFallback,
        recordedAt: params.now ?? Date.now(),
      },
    },
  });
  return testimonyFromRow(created.row);
}

function questionSimilarity(a: string, b: string) {
  const normalize = (value: string) =>
    new Set(
      value
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    );
  const left = normalize(a);
  const right = normalize(b);
  const union = new Set([...left, ...right]);
  const shared = [...left].filter((token) => right.has(token)).length;
  return union.size > 0 ? shared / union.size : 0;
}

export function crossFindingsFromComparison(
  questions: CrossExaminationQuestion[],
  comparison: CrossComparisonOutput,
  locale: "en" | "ru",
): CrossExaminationFinding[] {
  const used = new Set<number>();
  return questions.map((question) => {
    let bestIndex = -1;
    let bestScore = 0;
    comparison.contradictions.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = questionSimilarity(question.text, candidate.question);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    const contradiction =
      bestIndex >= 0 && bestScore >= 0.2 ? comparison.contradictions[bestIndex] : undefined;
    if (bestIndex >= 0 && contradiction) used.add(bestIndex);
    if (!contradiction) {
      const same = locale === "ru" ? "Существенных расхождений нет" : "No material difference";
      return { ...question, question: question.text, versionA: same, versionB: same, severity: 0 };
    }
    return {
      ...question,
      question: question.text,
      versionA: contradiction.versionA,
      versionB: contradiction.versionB,
      severity: fixedCrossSeverity(contradiction.versionA, contradiction.versionB),
    };
  });
}

async function predictionsForPair(roomId: string, runId: string, pairId: string) {
  const rows = await listPartyRecordRows(roomId, { runId, kind: CROSS_PREDICTION_KIND });
  return rows.flatMap((row) => {
    const prediction = predictionFromRow(row);
    return prediction.pairId === pairId ? [prediction] : [];
  });
}

function predictionSummary(
  predictions: CrossPredictionRecord[],
  findings: CrossExaminationFinding[],
) {
  const predictionCounts: Partial<Record<(typeof CROSS_QUESTION_CATEGORIES)[number], number>> = {};
  predictions.forEach((prediction) => {
    predictionCounts[prediction.category] = (predictionCounts[prediction.category] ?? 0) + 1;
  });
  const correctPredictionCategories = correctCrossPredictionCategories(findings);
  const correctVoterIds = predictions
    .filter((prediction) => correctPredictionCategories.includes(prediction.category))
    .map((prediction) => prediction.voterPlayerId);
  return { predictionCounts, correctPredictionCategories, correctVoterIds };
}

function resultFromVerdict(verdict: CrossVerdictRecord): CrossExaminationPairResult {
  return {
    pairId: verdict.pairId,
    playerAId: verdict.playerAId,
    playerAName: verdict.playerAName,
    playerBId: verdict.playerBId,
    playerBName: verdict.playerBName,
    findings: verdict.findings,
    alibiStrength: verdict.alibiStrength,
    environmentBonus: verdict.environmentBonus,
    pairPoints: verdict.pairPoints,
    verdict: verdict.verdict,
    predictionCounts: verdict.predictionCounts,
    correctPredictionCategories: verdict.correctPredictionCategories,
    correctVoterIds: verdict.correctVoterIds,
    source: verdict.source,
  };
}

async function resolveCrossVerdict(params: {
  roomId: string;
  state: RoomState;
  runId: string;
  pair: CrossExaminationPair;
  questions: CrossExaminationQuestion[];
  testimonyA: CrossTestimonyRecord;
  testimonyB: CrossTestimonyRecord;
  findings: CrossExaminationFinding[];
  verdict: string;
  source: "ai" | "manual";
  now?: number;
}) {
  const alibiStrength = crossAlibiStrength(params.findings);
  const environmentBonus = crossEnvironmentBonus(
    params.testimonyA.transcript,
    params.testimonyB.transcript,
    params.questions,
  );
  const pairPoints = crossPairPoints(alibiStrength, environmentBonus);
  const predictions = await predictionsForPair(params.roomId, params.runId, params.pair.pairId);
  const prediction = predictionSummary(predictions, params.findings);
  const created = await createPartyRecord({
    roomId: params.roomId,
    state: params.state,
    input: {
      idempotencyKey: crossVerdictKey(params.runId, params.pair.pairId),
      runId: params.runId,
      gameId: "crossexamination",
      kind: CROSS_VERDICT_KIND,
      visibility: "host",
      payload: {
        version: 1,
        pairId: params.pair.pairId,
        playerAId: params.pair.playerAId,
        playerAName: params.pair.playerAName,
        playerBId: params.pair.playerBId,
        playerBName: params.pair.playerBName,
        findings: params.findings,
        alibiStrength,
        environmentBonus,
        pairPoints,
        verdict: params.verdict,
        ...prediction,
        source: params.source,
        completedAt: params.now ?? Date.now(),
      },
    },
  });
  const locked = verdictFromRow(created.row);
  if (locked.source !== params.source) throw statusError("Cross verdict is already locked", 409);
  const [pointsA, pointsB] = splitCrossPairPoints(locked.pairPoints);
  const playerPoints = [
    [params.pair.playerAId, pointsA] as const,
    [params.pair.playerBId, pointsB] as const,
  ];
  const events = [
    ...playerPoints.flatMap(([playerId, points]) => {
      const player = params.state.players.find((candidate) => candidate.id === playerId);
      return player && points !== 0
        ? [
            {
              idempotencyKey: crossScoreKey(params.runId, params.pair.pairId, playerId, "alibi"),
              runId: params.runId,
              gameId: "crossexamination",
              teamId: player.teamId,
              playerId,
              points,
              reason: "Cross Examination shared alibi",
              source:
                params.source === "ai" ? ("deterministic" as const) : ("host-adjustment" as const),
              rubric: {
                alibiStrength: locked.alibiStrength,
                environmentBonus: locked.environmentBonus,
              },
            },
          ]
        : [];
    }),
    ...locked.correctVoterIds.flatMap((playerId) => {
      const player = params.state.players.find((candidate) => candidate.id === playerId);
      return player
        ? [
            {
              idempotencyKey: crossScoreKey(
                params.runId,
                params.pair.pairId,
                playerId,
                "prediction",
              ),
              runId: params.runId,
              gameId: "crossexamination",
              teamId: player.teamId,
              playerId,
              points: CROSS_AUDIENCE_PREDICTION_POINTS,
              reason: "Cross Examination contradiction prediction",
              source: "vote" as const,
              rubric: { correctCategories: locked.correctPredictionCategories },
            },
          ]
        : [];
    }),
  ];
  if (events.length > 0) {
    await awardScoreEvents({ roomId: params.roomId, state: params.state, events });
  }
  const updated = await updateCross(params.roomId, (state) =>
    revealCrossExaminationState(state, params.runId, resultFromVerdict(locked)),
  );
  return { run: updated.state.crossexamination!, verdict: locked };
}

async function compareCurrentPair(params: {
  roomId: string;
  state: RoomState;
  runId: string;
  pair: CrossExaminationPair;
  testimonyA: CrossTestimonyRecord;
  testimonyB: CrossTestimonyRecord;
  now?: number;
}) {
  const run = assertRun(params.state, params.runId);
  const questions = run.questions;
  if (!questions || questions.length !== 4) throw statusError("Cross questions are missing", 409);
  const compared = await runPromptSpec({
    spec: crossComparisonSpec,
    input: {
      pairAName: params.pair.playerAName,
      pairBName: params.pair.playerBName,
      questions,
      transcriptA: params.testimonyA.transcript,
      transcriptB: params.testimonyB.transcript,
    },
    context: normalizePartyContext(params.state.party, params.state.venue),
    temperature: 0.2,
    budget: {
      roomId: params.roomId,
      operationId: `cross:${params.runId}:${params.pair.pairId}:comparison`,
    },
  });
  if (compared.usedFallback) {
    const updated = await updateCross(params.roomId, (state) =>
      reviewCrossExaminationState(state, params.runId, params.pair.pairId),
    );
    return { run: updated.state.crossexamination!, needsManualReview: true };
  }
  return resolveCrossVerdict({
    ...params,
    questions,
    findings: crossFindingsFromComparison(
      questions,
      compared.output,
      params.state.party?.contentLocale ?? "en",
    ),
    verdict: compared.output.verdict,
    source: "ai",
  });
}

export async function submitCrossAudio(params: {
  roomId: string;
  state: RoomState;
  player: Player;
  runId: string;
  pairId: string;
  storagePath: string;
  durationSeconds: number;
  now?: number;
}) {
  const { run, pair } = currentPair(params.state, params.runId);
  if (
    pair.pairId !== params.pairId ||
    ![pair.playerAId, pair.playerBId].includes(params.player.id)
  ) {
    throw statusError("only the current accomplices can submit", 403);
  }
  const existing = await findPartyRecordByIdempotency(
    params.roomId,
    crossTestimonyKey(params.runId, params.pairId, params.player.id),
  );
  const testimony = existing ? testimonyFromRow(existing) : await createCrossTestimony(params);
  if (testimony.playerId !== params.player.id) throw statusError("testimony owner changed", 409);
  if (existing && ["review", "reveal", "results"].includes(run.status)) {
    return { run, needsManualReview: run.status === "review" };
  }
  const updated = await updateCross(params.roomId, (state) =>
    markCrossExaminationSubmittedState(state, params.runId, params.pairId, params.player.id),
  );
  const latest = updated.state;
  const latestRun = assertRun(latest, params.runId);
  if (testimony.sttFallback) {
    const reviewed = await updateCross(params.roomId, (state) =>
      reviewCrossExaminationState(state, params.runId, params.pairId),
    );
    return { run: reviewed.state.crossexamination!, needsManualReview: true };
  }
  if (latestRun.status !== "comparing") return { run: latestRun };
  const both = await currentTestimonies(params.roomId, params.runId, pair);
  if (!both.testimonyA || !both.testimonyB) return { run: latestRun };
  if (both.testimonyA.sttFallback || both.testimonyB.sttFallback) {
    const reviewed = await updateCross(params.roomId, (state) =>
      reviewCrossExaminationState(state, params.runId, params.pairId),
    );
    return { run: reviewed.state.crossexamination!, needsManualReview: true };
  }
  return compareCurrentPair({
    roomId: params.roomId,
    state: latest,
    runId: params.runId,
    pair,
    testimonyA: both.testimonyA,
    testimonyB: both.testimonyB,
    now: params.now,
  });
}

export async function manuallyResolveCrossExamination(params: {
  room: AuthorizedHostRoom;
  runId: string;
  pairId: string;
  findings: Array<{
    questionId: string;
    finding: CrossManualFinding;
    versionA: string;
    versionB: string;
  }>;
  verdict: string;
  now?: number;
}) {
  const { run, pair } = currentPair(params.room.state, params.runId);
  if (run.status !== "review" || run.currentPairId !== params.pairId || !run.questions) {
    throw statusError("manual Cross review is not open", 409);
  }
  const ids = new Set(params.findings.map((finding) => finding.questionId));
  if (ids.size !== 4 || !run.questions.every((question) => ids.has(question.questionId))) {
    throw statusError("manual findings must cover the four current questions", 400);
  }
  const testimonies = await currentTestimonies(params.room.id, params.runId, pair);
  if (!testimonies.testimonyA || !testimonies.testimonyB) {
    throw statusError("both testimonies are required for manual review", 409);
  }
  const findingById = new Map(params.findings.map((finding) => [finding.questionId, finding]));
  const findings: CrossExaminationFinding[] = run.questions.map((question) => {
    const manual = findingById.get(question.questionId)!;
    return {
      ...question,
      question: question.text,
      versionA: manual.versionA,
      versionB: manual.versionB,
      severity: CROSS_MANUAL_SEVERITY[manual.finding],
    };
  });
  return resolveCrossVerdict({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    pair,
    questions: run.questions,
    testimonyA: testimonies.testimonyA,
    testimonyB: testimonies.testimonyB,
    findings,
    verdict: params.verdict,
    source: "manual",
    now: params.now,
  });
}

function skippedResult(
  pair: CrossExaminationPair,
  questions: CrossExaminationQuestion[],
  locale: "en" | "ru",
): CrossExaminationPairResult {
  const same = locale === "ru" ? "Дело снято ведущим" : "Case dismissed by the host";
  return {
    pairId: pair.pairId,
    playerAId: pair.playerAId,
    playerAName: pair.playerAName,
    playerBId: pair.playerBId,
    playerBName: pair.playerBName,
    findings: questions.map((question) => ({
      ...question,
      question: question.text,
      versionA: same,
      versionB: same,
      severity: 0,
    })),
    alibiStrength: 0,
    environmentBonus: 0,
    pairPoints: 0,
    verdict:
      locale === "ru"
        ? "Следствие закрыло этот эпизод без очков. Иногда лучший свидетель — тот, которого вовремя отпустили к бару."
        : "The investigation closed this episode without points. Sometimes the best witness is the one released back to the bar in time.",
    predictionCounts: {},
    correctPredictionCategories: [],
    correctVoterIds: [],
    source: "skipped",
  };
}

export async function skipCrossExaminationPair(params: {
  room: AuthorizedHostRoom;
  runId: string;
  pairId: string;
  now?: number;
}) {
  const { run, pair } = currentPair(params.room.state, params.runId);
  if (run.currentPairId !== params.pairId) throw statusError("Cross pair changed", 409);
  if (run.status === "results") return { run };
  if (run.status === "curation") {
    const updated = await updateCross(params.room.id, (state) =>
      dismissCrossExaminationState(state, params.runId, params.now),
    );
    return { run: updated.state.crossexamination! };
  }
  if (!run.questions) throw statusError("Cross questions are missing", 409);
  const updated = await updateCross(params.room.id, (state) =>
    revealCrossExaminationState(
      state,
      params.runId,
      skippedResult(pair, run.questions!, state.party?.contentLocale ?? "en"),
    ),
  );
  return { run: updated.state.crossexamination! };
}

export async function nextCrossExaminationPair(params: {
  room: AuthorizedHostRoom;
  runId: string;
  pairId: string;
  now?: number;
}) {
  const { run } = currentPair(params.room.state, params.runId);
  if (run.status === "results") return { run };
  if (run.status !== "reveal" || run.currentPairId !== params.pairId) {
    throw statusError("Cross reveal is not ready to advance", 409);
  }
  if (run.pairNumber >= run.totalPairs) {
    const updated = await updateCross(params.room.id, (state) =>
      nextCrossExaminationPairState(state, {
        runId: params.runId,
        pairId: params.pairId,
        now: params.now,
      }),
    );
    return { run: updated.state.crossexamination! };
  }
  const selection = await loadSelection(params.room.id, params.runId);
  const candidates = await evidenceCandidates(params.room.id, params.room.state);
  const nextPair = run.pairOrder[run.pairNumber]!;
  const record = await questionsForPair({
    roomId: params.room.id,
    state: params.room.state,
    runId: params.runId,
    pair: nextPair,
    selection,
    candidates,
    previousQuestions: run.pairResults.flatMap((result) =>
      result.findings.map((finding) => finding.question),
    ),
  });
  const updated = await updateCross(params.room.id, (state) =>
    nextCrossExaminationPairState(state, {
      runId: params.runId,
      pairId: params.pairId,
      questions: questionRecordToPublic(record),
      selectedSourceCount: record.evidenceRecordIds.length + record.manualFactCount,
      aiFallback: record.aiFallback,
      now: params.now,
    }),
  );
  return { run: updated.state.crossexamination! };
}
