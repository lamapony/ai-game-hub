import type { RoomState } from "./types";

export type SoundscapeTopicsResult = {
  topics: string[];
  fallback?: true;
  topicsEndsAt: number;
};

export function soundscapeTopicsForRound(
  state: RoomState,
  roundId: string,
): SoundscapeTopicsResult | null {
  const soundscape = state.soundscape;
  if (
    !soundscape ||
    soundscape.roundId !== roundId ||
    !soundscape.topics?.length ||
    !soundscape.topicsEndsAt
  ) {
    return null;
  }
  return {
    topics: soundscape.topics,
    fallback: soundscape.aiFallback ? true : undefined,
    topicsEndsAt: soundscape.topicsEndsAt,
  };
}

export function persistSoundscapeTopicsState(
  state: RoomState,
  params: {
    roundId: string;
    topics: string[];
    fallback?: true;
    topicsEndsAt: number;
  },
): { state: RoomState; result: SoundscapeTopicsResult } | null {
  const soundscape = state.soundscape;
  if (!soundscape || soundscape.roundId !== params.roundId || soundscape.phase !== "topics") {
    return null;
  }

  const existing = soundscapeTopicsForRound(state, params.roundId);
  if (existing) return { state, result: existing };

  const result: SoundscapeTopicsResult = {
    topics: [...params.topics],
    fallback: params.fallback,
    topicsEndsAt: params.topicsEndsAt,
  };
  return {
    state: {
      ...state,
      soundscape: {
        ...soundscape,
        topics: result.topics,
        topicVotes: {},
        aiFallback: result.fallback,
        topicsEndsAt: result.topicsEndsAt,
      },
    },
    result,
  };
}
