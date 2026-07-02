import { createHash, timingSafeEqual } from "node:crypto";
import type { Player, RoomState } from "./types";

export function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export function cleanId(value: unknown, field: string) {
  if (typeof value !== "string") throw statusError(`${field} required`, 400);
  const id = value.trim();
  if (id.length < 2 || id.length > 100) throw statusError(`${field} invalid`, 400);
  return id;
}

export function cleanPlayerSecret(value: unknown) {
  if (typeof value !== "string") throw statusError("player authorization required", 401);
  const secret = value.trim();
  if (secret.length < 16 || secret.length > 200) {
    throw statusError("player authorization invalid", 401);
  }
  return secret;
}

export function hashPlayerSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function playerSecretHashFromRequest(request: Request, body: { playerSecret?: unknown }) {
  const header = request.headers.get("x-player-secret");
  if (header?.trim()) return hashPlayerSecret(cleanPlayerSecret(header));
  if (typeof body.playerSecret === "string")
    return hashPlayerSecret(cleanPlayerSecret(body.playerSecret));
  return "";
}

function safeHashEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function assertPlayerSecret(player: Player, playerSecretHash: string | undefined) {
  if (!playerSecretHash) throw statusError("player authorization required", 401);
  if (!player.secretHash) return;
  if (!safeHashEqual(player.secretHash, playerSecretHash)) {
    throw statusError("invalid player authorization", 403);
  }
}

export function requireAuthorizedPlayer(
  state: RoomState,
  playerId: unknown,
  playerSecretHash: string | undefined,
) {
  const id = cleanId(playerId, "playerId");
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw statusError("player not found", 404);
  assertPlayerSecret(player, playerSecretHash);
  return player;
}
