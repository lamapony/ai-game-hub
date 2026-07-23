import { playerSecretFor } from "./player-action-client";
import { hostSecretCandidates } from "./room";
import type { StillLifeManualScore } from "./stilllife-lifecycle";
import type { StillLifeState } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError = new Error("Still Life request failed");
  for (const secret of secrets) {
    const response = await fetch("/api/stilllife", {
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
    await fetch("/api/stilllife", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-player-secret": secret } : {}),
      },
      body: JSON.stringify({ roomId, playerId, ...body }),
    }),
  );
}

export const prepareStillLifeClient = (roomId: string, roundId: string) =>
  postAsHost<{ still: StillLifeState }>(roomId, { action: "prepare", roundId });

export const listStillLifeGalleryClient = (roomId: string, roundId: string) =>
  postAsHost<{
    still: StillLifeState;
    photos: Array<{ teamId: string; teamName: string; imageUrl: string }>;
  }>(roomId, { action: "gallery", roundId });

export const judgeStillLifeClient = (
  roomId: string,
  roundId: string,
  manualScores?: StillLifeManualScore[],
) =>
  postAsHost<{ still: StillLifeState }>(roomId, {
    action: "judge",
    roundId,
    ...(manualScores ? { manualScores } : {}),
  });

export const finalizeStillLifeClient = (roomId: string, roundId: string, allowNoVotes = false) =>
  postAsHost<{ still: StillLifeState }>(roomId, {
    action: "finalize",
    roundId,
    ...(allowNoVotes ? { allowNoVotes: true } : {}),
  });

export const nextStillLifeClient = (roomId: string, roundId: string) =>
  postAsHost<{ still: StillLifeState }>(roomId, { action: "next", roundId });

export const submitStillLifePhotoClient = (params: {
  roomId: string;
  roundId: string;
  playerId: string;
  storagePath: string;
}) =>
  postAsPlayer<{ still: StillLifeState }>(params.roomId, params.playerId, {
    action: "submit-photo",
    roundId: params.roundId,
    storagePath: params.storagePath,
  });

export const submitStillLifeVoteClient = (params: {
  roomId: string;
  roundId: string;
  playerId: string;
  teamId: string;
}) =>
  postAsPlayer<{ still: StillLifeState }>(params.roomId, params.playerId, {
    action: "vote",
    roundId: params.roundId,
    teamId: params.teamId,
  });
