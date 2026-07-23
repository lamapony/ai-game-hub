import { playerSecretFor } from "./player-action-client";
import type { PartyRecordView } from "./party-records";
import { hostSecretCandidates } from "./room";
import type { ToastSyndicateState } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError = new Error("Toast Syndicate request failed");
  for (const secret of secrets) {
    const response = await fetch("/api/toastsyndicate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return responseJson<T>(response);
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError;
}

async function postAsPlayer<T>(roomId: string, playerId: string, body: Record<string, unknown>) {
  const secret = playerSecretFor(playerId);
  return responseJson<T>(
    await fetch("/api/toastsyndicate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-player-secret": secret } : {}),
      },
      body: JSON.stringify({ roomId, playerId, ...body }),
    }),
  );
}

export const assignToastRoundClient = (roomId: string, roundId: string) =>
  postAsHost<{ toast: ToastSyndicateState }>(roomId, { action: "assign", roundId });
export const startToastRecordingClient = (roomId: string, roundId: string) =>
  postAsHost<{ toast: ToastSyndicateState }>(roomId, { action: "start-recording", roundId });
export const finalizeToastRoundClient = (roomId: string, roundId: string) =>
  postAsHost<{ toast: ToastSyndicateState }>(roomId, { action: "finalize", roundId });
export const nextToastRoundClient = (roomId: string, roundId: string) =>
  postAsHost<{ toast: ToastSyndicateState }>(roomId, { action: "next", roundId });

export const submitToastRecordingClient = (params: {
  roomId: string;
  roundId: string;
  playerId: string;
  storagePath: string;
  durationSeconds: number;
}) =>
  postAsPlayer<{ toast: ToastSyndicateState }>(params.roomId, params.playerId, {
    action: "submit-recording",
    roundId: params.roundId,
    storagePath: params.storagePath,
    durationSeconds: params.durationSeconds,
  });

export const submitToastCatchClient = (params: {
  roomId: string;
  roundId: string;
  playerId: string;
  guesses: string[];
}) =>
  postAsPlayer<{ toast: ToastSyndicateState }>(params.roomId, params.playerId, {
    action: "catch",
    roundId: params.roundId,
    guesses: params.guesses,
  });

export async function listToastRecordsForPlayer(params: {
  roomId: string;
  roundId: string;
  playerId: string;
}) {
  const secret = playerSecretFor(params.playerId);
  return responseJson<{ records: PartyRecordView[] }>(
    await fetch("/api/player-party-records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-player-secret": secret } : {}),
      },
      body: JSON.stringify({
        roomId: params.roomId,
        playerId: params.playerId,
        action: "list",
        runId: params.roundId,
      }),
    }),
  );
}
