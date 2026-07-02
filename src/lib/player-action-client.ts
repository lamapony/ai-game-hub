import type { RoomState } from "./types";

export type StoredPlayer = { id: string; name: string; teamId: string };

export type PlayerActionResponse = {
  state: RoomState;
  player?: StoredPlayer & { joinedAt: number };
};

export type PlayerActionRequest = {
  action: string;
  playerId?: string;
  name?: string;
  teamId?: string;
  option?: string;
  topic?: string;
  choice?: "real" | "ai";
  clue?: string;
  value?: number;
  direction?: "lower" | "higher";
};

export async function postPlayerAction(code: string, payload: PlayerActionRequest) {
  const response = await fetch("/api/player-action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, ...payload }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as PlayerActionResponse;
}
