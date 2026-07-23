import { eventProfile } from "./event-profile";
import type { DeviceCheckStatus, RoomState, SpectrumCourtAppeal } from "./types";

export type StoredPlayer = { id: string; name: string; teamId: string; secret?: string };

export type PlayerActionRequest = {
  action: string;
  playerId?: string;
  name?: string;
  teamId?: string;
  option?: string;
  topic?: string;
  choice?: "real" | "ai";
  targetPlayerId?: string;
  clue?: string;
  value?: number;
  direction?: SpectrumCourtAppeal["direction"];
  answer?: string;
  answerId?: string;
  cameraStatus?: DeviceCheckStatus;
  microphoneStatus?: DeviceCheckStatus;
  playerSecret?: string;
};

export type PlayerActionResponse = {
  state: RoomState;
  player?: StoredPlayer & { joinedAt: number };
};

export function playerSecretFor(playerId: string | undefined, explicitSecret?: string) {
  if (explicitSecret) return explicitSecret;
  if (!playerId || typeof window === "undefined") return "";
  const playerPrefix = `${eventProfile.storagePrefix}:player:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(playerPrefix)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const player = JSON.parse(raw) as { id?: string; secret?: string };
      if (player.id === playerId && player.secret) return player.secret;
    } catch {
      /* ignore corrupt local player records */
    }
  }
  return "";
}

export async function postPlayerAction(roomId: string, payload: PlayerActionRequest) {
  const playerSecret = playerSecretFor(payload.playerId, payload.playerSecret);
  const response = await fetch("/api/player-action", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(playerSecret ? { "x-player-secret": playerSecret } : {}),
    },
    body: JSON.stringify({ roomId, ...payload }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as PlayerActionResponse;
}
