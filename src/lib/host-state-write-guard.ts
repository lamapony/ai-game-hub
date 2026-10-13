import type { RoomState } from "./types";

const HOST_STATE_GAMES = [
  "challenge",
  "phototunt",
  "soundscape",
  "impostor",
  "whoamong",
  "trackguess",
  "spectrumcourt",
] as const;
type HostStateGameId = (typeof HOST_STATE_GAMES)[number];

export type HostStateWriteGuard = {
  gameId: HostStateGameId;
  roundId: string;
  roundNumber?: number;
  phase?: string;
};

function supportedGame(value: unknown): value is HostStateGameId {
  return HOST_STATE_GAMES.some((game) => game === value);
}

export function hostStateWriteGuardFromState(state: RoomState): HostStateWriteGuard | undefined {
  if (!supportedGame(state.currentGame)) return undefined;
  const round = state[state.currentGame];
  if (!round) return undefined;
  return {
    gameId: state.currentGame,
    roundId: round.roundId,
    phase: round.phase,
    ...("roundNumber" in round ? { roundNumber: round.roundNumber } : {}),
  };
}

export function parseHostStateWriteGuard(value: unknown): HostStateWriteGuard | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as {
    gameId?: unknown;
    roundId?: unknown;
    roundNumber?: unknown;
    phase?: unknown;
  };
  if (
    !supportedGame(candidate.gameId) ||
    typeof candidate.roundId !== "string" ||
    candidate.roundId.length === 0 ||
    (candidate.phase !== undefined && typeof candidate.phase !== "string") ||
    (candidate.roundNumber !== undefined &&
      (typeof candidate.roundNumber !== "number" ||
        !Number.isInteger(candidate.roundNumber) ||
        candidate.roundNumber < 1))
  ) {
    return undefined;
  }
  return {
    gameId: candidate.gameId,
    roundId: candidate.roundId,
    ...(typeof candidate.phase === "string" ? { phase: candidate.phase } : {}),
    ...(typeof candidate.roundNumber === "number" ? { roundNumber: candidate.roundNumber } : {}),
  };
}

export function hostStateWriteGuardMatches(state: RoomState, guard: HostStateWriteGuard) {
  if (state.currentGame !== guard.gameId) return false;
  const round = state[guard.gameId];
  if (!round || round.roundId !== guard.roundId) return false;
  if (
    guard.roundNumber !== undefined &&
    (!("roundNumber" in round) || round.roundNumber !== guard.roundNumber)
  )
    return false;
  // An async judge can legitimately move through "judging" after its source snapshot.
  // Once an outcome is committed, only a host that has seen it may advance the round.
  if ((round.phase === "reveal" || round.phase === "results") && guard.phase !== round.phase)
    return false;
  return true;
}

export function hostStateWriteShouldSkip(
  current: RoomState,
  submitted: RoomState,
  guard: HostStateWriteGuard,
) {
  const round = current[guard.gameId];
  const next = submitted[guard.gameId];
  if (
    !round ||
    !next ||
    current.currentGame !== submitted.currentGame ||
    round.roundId !== next.roundId ||
    ("roundNumber" in round && (!("roundNumber" in next) || round.roundNumber !== next.roundNumber))
  )
    return false;
  // Claim judging once, before either browser can call the AI or annotate uploads.
  if (round.phase === "judging") return next.phase === "judging";
  if (round.phase !== "reveal" && round.phase !== "results") return false;
  return round.phase === "results" || next.phase !== "results";
}
