import { playerSecretFor } from "./player-action-client";

export type PlayerArtifactRequest = {
  action: "soundscape-submission" | "soundscape-vote" | "challenge-submission" | "photo-submission";
  playerId: string;
  roundId: string;
  storagePath?: string;
  transcript?: string;
  durationSeconds?: number;
  targetTeamId?: string;
  category?: string;
};

export async function postPlayerArtifact(roomId: string, payload: PlayerArtifactRequest) {
  const playerSecret = playerSecretFor(payload.playerId);
  const response = await fetch("/api/player-artifact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(playerSecret ? { "x-player-secret": playerSecret } : {}),
    },
    body: JSON.stringify({ roomId, ...payload }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as { ok: true; id?: string; photoUrl?: string; videoUrl?: string };
}
