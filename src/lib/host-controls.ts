import type { RoomState } from "./types";

const SOUND_RECORDING_MS = 180_000;
const SOUND_VOTING_MS = 30_000;
const CHALLENGE_RECORDING_MS = 25_000;
const CHALLENGE_UPLOAD_GRACE_MS = 30_000;
const PHOTO_HUNT_MS = 60_000;

function shiftTime(value: number | undefined, deltaMs: number) {
  return typeof value === "number" ? value + deltaMs : value;
}

export function pauseRoomState(state: RoomState, now = Date.now()): RoomState {
  if (!state.currentGame || state.paused) return state;
  return { ...state, paused: { startedAt: now } };
}

export function resumeRoomState(state: RoomState, now = Date.now()): RoomState {
  if (!state.paused) return state;
  const deltaMs = Math.max(0, now - state.paused.startedAt);
  return {
    ...state,
    paused: undefined,
    soundscape: state.soundscape
      ? {
          ...state.soundscape,
          recordingEndsAt: shiftTime(state.soundscape.recordingEndsAt, deltaMs),
          voteOpenAt: shiftTime(state.soundscape.voteOpenAt, deltaMs),
          playback: state.soundscape.playback
            ? {
                ...state.soundscape.playback,
                startAt: shiftTime(state.soundscape.playback.startAt, deltaMs)!,
              }
            : undefined,
        }
      : undefined,
    challenge: state.challenge
      ? {
          ...state.challenge,
          recordingEndsAt: shiftTime(state.challenge.recordingEndsAt, deltaMs),
        }
      : undefined,
    phototunt: state.phototunt
      ? {
          ...state.phototunt,
          huntEndsAt: shiftTime(state.phototunt.huntEndsAt, deltaMs),
        }
      : undefined,
  };
}

export function forceBackToHubState(state: RoomState): RoomState {
  return {
    ...state,
    status: "lobby",
    currentGame: null,
    paused: undefined,
    soundscape: undefined,
    challenge: undefined,
    phototunt: undefined,
  };
}

export function canSkipCurrentPhase(state: RoomState): boolean {
  if (state.paused) return false;
  if (state.currentGame === "soundscape" && state.soundscape) {
    return ["topics", "recording", "playback", "voting"].includes(state.soundscape.phase);
  }
  if (state.currentGame === "challenge" && state.challenge) {
    return (
      (state.challenge.phase === "briefing" && !!state.challenge.task) ||
      state.challenge.phase === "recording"
    );
  }
  if (state.currentGame === "phototunt" && state.phototunt) {
    return (
      (state.phototunt.phase === "briefing" && !!state.phototunt.task) ||
      state.phototunt.phase === "hunting"
    );
  }
  return false;
}

export function skipCurrentPhaseState(state: RoomState, now = Date.now()): RoomState {
  if (!canSkipCurrentPhase(state)) return state;

  if (state.currentGame === "soundscape" && state.soundscape) {
    const snd = state.soundscape;
    if (snd.phase === "topics") {
      const counts: Record<string, number> = {};
      Object.values(snd.topicVotes ?? {}).forEach((topic) => {
        counts[topic] = (counts[topic] ?? 0) + 1;
      });
      const topic =
        (snd.topics ?? [])
          .map((candidate) => [candidate, counts[candidate] ?? 0] as const)
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? snd.topics?.[0];
      if (!topic) return state;
      return {
        ...state,
        soundscape: {
          ...snd,
          phase: "recording",
          topic,
          recordingEndsAt: now + SOUND_RECORDING_MS,
        },
      };
    }
    if (snd.phase === "recording") {
      return {
        ...state,
        soundscape: { ...snd, recordingEndsAt: now },
      };
    }
    if (snd.phase === "playback") {
      return {
        ...state,
        soundscape: { ...snd, phase: "voting", playback: undefined, voteOpenAt: now },
      };
    }
    if (snd.phase === "voting") {
      return {
        ...state,
        soundscape: { ...snd, voteOpenAt: now - SOUND_VOTING_MS },
      };
    }
  }

  if (state.currentGame === "challenge" && state.challenge) {
    const ch = state.challenge;
    if (ch.phase === "briefing" && ch.task) {
      return {
        ...state,
        challenge: { ...ch, phase: "recording", recordingEndsAt: now + CHALLENGE_RECORDING_MS },
      };
    }
    if (ch.phase === "recording") {
      return {
        ...state,
        challenge: { ...ch, recordingEndsAt: now - CHALLENGE_UPLOAD_GRACE_MS },
      };
    }
  }

  if (state.currentGame === "phototunt" && state.phototunt) {
    const ph = state.phototunt;
    if (ph.phase === "briefing" && ph.task) {
      return {
        ...state,
        phototunt: { ...ph, phase: "hunting", huntEndsAt: now + PHOTO_HUNT_MS },
      };
    }
    if (ph.phase === "hunting") {
      return {
        ...state,
        phototunt: { ...ph, huntEndsAt: now },
      };
    }
  }

  return state;
}
