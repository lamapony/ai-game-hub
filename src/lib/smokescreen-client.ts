import type {
  SmokeScreenGuess,
  SmokeScreenMissionRecord,
  SmokeScreenResultRecord,
  SmokeScreenRevealRecord,
} from "@/games/smokescreen/model";
import { playerSecretFor } from "./player-action-client";
import type { PartyRecordView } from "./party-records";
import { hostSecretCandidates } from "./room";
import type { SmokeScreenState } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/smokescreen", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return (await response.json()) as T;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("Smoke Screen host action failed");
}

export function assignSmokeScreenClient(params: { roomId: string; runId: string }) {
  return postAsHost<{ assignedCount: number; aiFallback: boolean; smoke: SmokeScreenState }>(
    params.roomId,
    { action: "assign", runId: params.runId },
  );
}

export function sealSmokeScreenClient(params: {
  roomId: string;
  runId: string;
  allowIncomplete: boolean;
}) {
  return postAsHost<{ updated: number; missingCount: number; smoke: SmokeScreenState }>(
    params.roomId,
    { action: "seal", runId: params.runId, allowIncomplete: params.allowIncomplete },
  );
}

export function revealSmokeScreenClient(params: { roomId: string; runId: string }) {
  return postAsHost<{ revealedCount: number; smoke: SmokeScreenState }>(params.roomId, {
    action: "reveal",
    runId: params.runId,
  });
}

export function finalizeSmokeScreenClient(params: {
  roomId: string;
  runId: string;
  completedMissionIds: string[];
}) {
  return postAsHost<{
    result: SmokeScreenResultRecord;
    replayed: boolean;
    smoke: SmokeScreenState;
  }>(params.roomId, {
    action: "finalize",
    runId: params.runId,
    completedMissionIds: params.completedMissionIds,
  });
}

export async function submitSmokeScreenVoteClient(params: {
  roomId: string;
  runId: string;
  playerId: string;
  guesses: SmokeScreenGuess[];
}) {
  const secret = playerSecretFor(params.playerId);
  const response = await fetch("/api/smokescreen", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-player-secret": secret } : {}),
    },
    body: JSON.stringify({ action: "vote", ...params }),
  });
  return responseJson<{ ballot: unknown; replayed: boolean; smoke: SmokeScreenState }>(response);
}

export async function listSmokeScreenRecordsForPlayer(params: {
  roomId: string;
  runId: string;
  playerId: string;
}) {
  const secret = playerSecretFor(params.playerId);
  const response = await fetch("/api/player-party-records", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-player-secret": secret } : {}),
    },
    body: JSON.stringify({
      action: "list",
      roomId: params.roomId,
      playerId: params.playerId,
      runId: params.runId,
    }),
  });
  return responseJson<{ records: PartyRecordView[] }>(response);
}

export async function listSmokeScreenRecordsForHost(params: { roomId: string; runId: string }) {
  const secrets = hostSecretCandidates(params.roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/host-party-records", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ action: "list", roomId: params.roomId, runId: params.runId }),
    });
    if (response.ok) return (await response.json()) as { records: PartyRecordView[] };
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("Smoke Screen records failed");
}

export type SmokeScreenPlayerRecords = {
  mission?: SmokeScreenMissionRecord;
  reveals: SmokeScreenRevealRecord[];
  result?: SmokeScreenResultRecord;
};
