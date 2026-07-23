import type { RoomState } from "./types";

export type HostStateWriteGuard =
  { gameId: "challenge"; roundId: string } | { gameId: "phototunt"; roundId: string };

export function parseHostStateWriteGuard(value: unknown): HostStateWriteGuard | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { gameId?: unknown; roundId?: unknown };
  if (
    (candidate.gameId !== "challenge" && candidate.gameId !== "phototunt") ||
    typeof candidate.roundId !== "string" ||
    candidate.roundId.length === 0
  ) {
    return undefined;
  }
  return { gameId: candidate.gameId, roundId: candidate.roundId };
}

export function hostStateWriteGuardMatches(state: RoomState, guard: HostStateWriteGuard) {
  if (state.currentGame !== guard.gameId) return false;
  return guard.gameId === "challenge"
    ? state.challenge?.roundId === guard.roundId
    : state.phototunt?.roundId === guard.roundId;
}
