import { playerSecretFor } from "./player-action-client";
import { hostSecretCandidates } from "./room";
import type { SommelierState } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError = new Error("Sommelier request failed");
  for (const secret of secrets) {
    const response = await fetch("/api/sommelier", {
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
    await fetch("/api/sommelier", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-player-secret": secret } : {}),
      },
      body: JSON.stringify({ roomId, playerId, ...body }),
    }),
  );
}

export const prepareSommelierClient = (roomId: string, sessionId: string) =>
  postAsHost<{ sommelier: SommelierState }>(roomId, { action: "prepare", sessionId });

export const currentSommelierCardClient = (roomId: string, sessionId: string) =>
  postAsHost<{
    sommelier: SommelierState;
    card: null | {
      entryId: string;
      imageUrl: string;
      ownerPlayerId?: string;
      ownerPlayerName?: string;
    };
  }>(roomId, { action: "current", sessionId });

export const revealSommelierClient = (
  roomId: string,
  sessionId: string,
  entryId: string,
  allowNoVotes = false,
) =>
  postAsHost<{ sommelier: SommelierState }>(roomId, {
    action: "reveal",
    sessionId,
    entryId,
    ...(allowNoVotes ? { allowNoVotes: true } : {}),
  });

export const nextSommelierClient = (roomId: string, sessionId: string, entryId: string) =>
  postAsHost<{ sommelier: SommelierState }>(roomId, {
    action: "next",
    sessionId,
    entryId,
  });

export const chooseSommelierCrowdFavoriteClient = (
  roomId: string,
  sessionId: string,
  entryId: string,
) =>
  postAsHost<{ sommelier: SommelierState }>(roomId, {
    action: "crowd-favorite",
    sessionId,
    entryId,
  });

export const submitSommelierPhotoClient = (params: {
  roomId: string;
  sessionId: string;
  playerId: string;
  storagePath: string;
}) =>
  postAsPlayer<{ sommelier: SommelierState }>(params.roomId, params.playerId, {
    action: "submit-photo",
    sessionId: params.sessionId,
    storagePath: params.storagePath,
  });

export const sommelierPlayerStatusClient = (roomId: string, sessionId: string, playerId: string) =>
  postAsPlayer<{ isOwner: boolean; hasSubmittedBallot: boolean }>(roomId, playerId, {
    action: "status",
    sessionId,
  });

export const submitSommelierGuessClient = (params: {
  roomId: string;
  sessionId: string;
  entryId: string;
  playerId: string;
  guessedOwnerPlayerId: string;
}) =>
  postAsPlayer<{ sommelier: SommelierState }>(params.roomId, params.playerId, {
    action: "guess",
    sessionId: params.sessionId,
    entryId: params.entryId,
    guessedOwnerPlayerId: params.guessedOwnerPlayerId,
  });
