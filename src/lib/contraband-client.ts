import type {
  ContrabandAccusationRecord,
  ContrabandArbitrationRecord,
  ContrabandAssignmentRecord,
  ContrabandResolutionRecord,
} from "@/games/contraband/model";
import { playerSecretFor } from "./player-action-client";
import { hostSecretCandidates } from "./room";
import type { ContrabandState } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (!secrets.length) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/contraband", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return (await response.json()) as T;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("Contraband host action failed");
}

async function postAsPlayer<T>(roomId: string, playerId: string, body: Record<string, unknown>) {
  const secret = playerSecretFor(playerId);
  const response = await fetch("/api/contraband", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-player-secret": secret } : {}),
    },
    body: JSON.stringify({ roomId, playerId, ...body }),
  });
  return responseJson<T>(response);
}

export const assignContrabandClient = (roomId: string, runId: string) =>
  postAsHost<{ run: ContrabandState }>(roomId, { action: "assign", runId });

export const getContrabandCaseClient = (roomId: string, runId: string) =>
  postAsHost<{
    run: ContrabandState;
    case: {
      accusation: ContrabandAccusationRecord;
      assignment: ContrabandAssignmentRecord;
      arbitration: ContrabandArbitrationRecord | null;
    } | null;
  }>(roomId, { action: "case", runId });

export const resolveContrabandClient = (params: {
  roomId: string;
  runId: string;
  accusationId: string;
  outcome: "caught" | "clean" | "false-accusation";
}) =>
  postAsHost<{ run: ContrabandState; resolution: ContrabandResolutionRecord }>(params.roomId, {
    action: "resolve",
    runId: params.runId,
    accusationId: params.accusationId,
    outcome: params.outcome,
  });

export const finalizeContrabandClient = (roomId: string, runId: string) =>
  postAsHost<{ run: ContrabandState }>(roomId, { action: "finalize", runId });

export const getContrabandAssignmentClient = (params: {
  roomId: string;
  runId: string;
  playerId: string;
}) =>
  postAsPlayer<{ run: ContrabandState; assignment: ContrabandAssignmentRecord | null }>(
    params.roomId,
    params.playerId,
    { action: "assignment", runId: params.runId },
  );

export const accuseContrabandClient = (params: {
  roomId: string;
  runId: string;
  playerId: string;
  accusedPlayerId: string;
  suspectedQuote: string;
}) =>
  postAsPlayer<{ run: ContrabandState }>(params.roomId, params.playerId, {
    action: "accuse",
    runId: params.runId,
    accusedPlayerId: params.accusedPlayerId,
    suspectedQuote: params.suspectedQuote,
  });

export const respondContrabandClient = (params: {
  roomId: string;
  runId: string;
  playerId: string;
  accusationId: string;
  response: "confess" | "dispute";
}) =>
  postAsPlayer<{ run: ContrabandState }>(params.roomId, params.playerId, {
    action: "respond",
    runId: params.runId,
    accusationId: params.accusationId,
    response: params.response,
  });

export const submitContrabandAudioClient = (params: {
  roomId: string;
  runId: string;
  playerId: string;
  accusationId: string;
  storagePath: string;
  durationSeconds: number;
}) =>
  postAsPlayer<{ run: ContrabandState; needsManualReview?: boolean }>(
    params.roomId,
    params.playerId,
    {
      action: "submit-audio",
      runId: params.runId,
      accusationId: params.accusationId,
      storagePath: params.storagePath,
      durationSeconds: params.durationSeconds,
    },
  );
