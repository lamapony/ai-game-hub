import type { RoomState } from "./types";

function basePlayingState(state: RoomState): RoomState {
  return {
    ...state,
    status: "playing",
    paused: undefined,
    soundscape: undefined,
    challenge: undefined,
    phototunt: undefined,
    trackguess: undefined,
  };
}

export function launchSoundscapeState(state: RoomState, roundId: string): RoomState {
  return {
    ...basePlayingState(state),
    currentGame: "soundscape",
    soundscape: { phase: "topics", roundId },
  };
}

export function launchChallengeState(
  state: RoomState,
  roundId: string,
  random = Math.random(),
): RoomState | null {
  if (state.players.length < 2) return null;
  const operatorIndex = Math.max(
    0,
    Math.min(state.players.length - 1, Math.floor(random * state.players.length)),
  );
  const operator = state.players[operatorIndex];

  return {
    ...basePlayingState(state),
    currentGame: "challenge",
    challenge: {
      phase: "briefing",
      roundId,
      operatorId: operator.id,
      operatorName: operator.name,
      pastOperatorIds: [],
    },
  };
}

export function launchPhotoHuntState(state: RoomState, roundId: string): RoomState | null {
  if (state.players.length < 1) return null;
  return {
    ...basePlayingState(state),
    currentGame: "phototunt",
    phototunt: {
      phase: "briefing",
      roundId,
      pastTasks: [],
    },
  };
}

export const TRACK_GUESS_TOTAL_ROUNDS = 5;

export function launchTrackGuessState(state: RoomState, roundId: string): RoomState | null {
  if (state.players.length < 1) return null;
  return {
    ...basePlayingState(state),
    currentGame: "trackguess",
    trackguess: {
      phase: "briefing",
      roundId,
      roundNumber: 1,
      totalRounds: TRACK_GUESS_TOTAL_ROUNDS,
      usedTrackIds: [],
      roundResults: [],
    },
  };
}
