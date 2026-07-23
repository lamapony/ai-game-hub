import type {
  CrossEvidenceCandidate,
  CrossTestimonyRecord,
  CrossVerdictRecord,
} from "@/games/crossexamination/model";
import type { CrossManualFinding } from "@/games/crossexamination/model";
import { playerSecretFor } from "./player-action-client";
import { hostSecretCandidates } from "./room";
import type { CrossExaminationState, CrossQuestionCategory } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (!secrets.length) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/crossexamination", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return (await response.json()) as T;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("Cross Examination host action failed");
}

async function postAsPlayer<T>(roomId: string, playerId: string, body: Record<string, unknown>) {
  const secret = playerSecretFor(playerId);
  const response = await fetch("/api/crossexamination", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-player-secret": secret } : {}),
    },
    body: JSON.stringify({ roomId, playerId, ...body }),
  });
  return responseJson<T>(response);
}

export const getCrossExaminationCaseClient = (roomId: string, runId: string) =>
  postAsHost<{
    run: CrossExaminationState;
    candidates: CrossEvidenceCandidate[];
    testimonyA: CrossTestimonyRecord | null;
    testimonyB: CrossTestimonyRecord | null;
  }>(roomId, { action: "case", runId });

export const prepareCrossExaminationClient = (params: {
  roomId: string;
  runId: string;
  excludedRecordIds: string[];
  manualFacts: string[];
}) =>
  postAsHost<{ run: CrossExaminationState }>(params.roomId, {
    action: "prepare",
    runId: params.runId,
    excludedRecordIds: params.excludedRecordIds,
    manualFacts: params.manualFacts,
  });

export const openCrossExaminationClient = (roomId: string, runId: string, pairId: string) =>
  postAsHost<{ run: CrossExaminationState }>(roomId, { action: "open", runId, pairId });

export const manualCrossExaminationVerdictClient = (params: {
  roomId: string;
  runId: string;
  pairId: string;
  findings: Array<{
    questionId: string;
    finding: CrossManualFinding;
    versionA: string;
    versionB: string;
  }>;
  verdict: string;
}) =>
  postAsHost<{ run: CrossExaminationState; verdict: CrossVerdictRecord }>(params.roomId, {
    action: "manual-verdict",
    runId: params.runId,
    pairId: params.pairId,
    findings: params.findings,
    verdict: params.verdict,
  });

export const skipCrossExaminationClient = (roomId: string, runId: string, pairId: string) =>
  postAsHost<{ run: CrossExaminationState }>(roomId, { action: "skip", runId, pairId });

export const nextCrossExaminationClient = (roomId: string, runId: string, pairId: string) =>
  postAsHost<{ run: CrossExaminationState }>(roomId, { action: "next", runId, pairId });

export const voteCrossExaminationClient = (params: {
  roomId: string;
  runId: string;
  pairId: string;
  playerId: string;
  category: CrossQuestionCategory;
}) =>
  postAsPlayer<{ run: CrossExaminationState }>(params.roomId, params.playerId, {
    action: "vote",
    runId: params.runId,
    pairId: params.pairId,
    category: params.category,
  });

export const submitCrossExaminationAudioClient = (params: {
  roomId: string;
  runId: string;
  pairId: string;
  playerId: string;
  storagePath: string;
  durationSeconds: number;
}) =>
  postAsPlayer<{ run: CrossExaminationState; needsManualReview?: boolean }>(
    params.roomId,
    params.playerId,
    {
      action: "submit-audio",
      runId: params.runId,
      pairId: params.pairId,
      storagePath: params.storagePath,
      durationSeconds: params.durationSeconds,
    },
  );
