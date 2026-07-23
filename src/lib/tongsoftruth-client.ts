import type { TongsTestimonyRecord, TongsVerdictRecord } from "@/games/tongsoftruth/model";
import { playerSecretFor } from "./player-action-client";
import { hostSecretCandidates } from "./room";
import type { TongsOfTruthState } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (!secrets.length) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/tongsoftruth", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return (await response.json()) as T;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("Tongs host action failed");
}

async function postAsPlayer<T>(roomId: string, playerId: string, body: Record<string, unknown>) {
  const secret = playerSecretFor(playerId);
  const response = await fetch("/api/tongsoftruth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-player-secret": secret } : {}),
    },
    body: JSON.stringify({ roomId, playerId, ...body }),
  });
  return responseJson<T>(response);
}

export const prepareTongsQuestionClient = (roomId: string, runId: string) =>
  postAsHost<{ run: TongsOfTruthState }>(roomId, { action: "prepare", runId });

export const getTongsCaseClient = (roomId: string, runId: string) =>
  postAsHost<{ run: TongsOfTruthState; testimony: TongsTestimonyRecord | null }>(roomId, {
    action: "case",
    runId,
  });

export const manualTongsVerdictClient = (params: {
  roomId: string;
  runId: string;
  roundId: string;
  honestyScore: number;
  dodgeDetected: boolean;
  artistryScore: number;
  environmentUsed: boolean;
  comment: string;
}) =>
  postAsHost<{ run: TongsOfTruthState; verdict: TongsVerdictRecord }>(params.roomId, {
    action: "manual-verdict",
    runId: params.runId,
    roundId: params.roundId,
    honestyScore: params.honestyScore,
    dodgeDetected: params.dodgeDetected,
    artistryScore: params.artistryScore,
    environmentUsed: params.environmentUsed,
    comment: params.comment,
  });

export const skipTongsRoundClient = (roomId: string, runId: string, roundId: string) =>
  postAsHost<{ run: TongsOfTruthState; verdict: TongsVerdictRecord }>(roomId, {
    action: "skip",
    runId,
    roundId,
  });

export const nextTongsRoundClient = (roomId: string, runId: string, roundId: string) =>
  postAsHost<{ run: TongsOfTruthState }>(roomId, { action: "next", runId, roundId });

export const startTongsRecordingClient = (roomId: string, runId: string, playerId: string) =>
  postAsPlayer<{ run: TongsOfTruthState }>(roomId, playerId, { action: "start", runId });

export const submitTongsAudioClient = (params: {
  roomId: string;
  runId: string;
  roundId: string;
  playerId: string;
  storagePath: string;
  durationSeconds: number;
}) =>
  postAsPlayer<{ run: TongsOfTruthState; needsManualReview?: boolean }>(
    params.roomId,
    params.playerId,
    {
      action: "submit-audio",
      runId: params.runId,
      roundId: params.roundId,
      storagePath: params.storagePath,
      durationSeconds: params.durationSeconds,
    },
  );
