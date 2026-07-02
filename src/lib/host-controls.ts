import type { RoomState, SpectrumCourtState, Team } from "./types";

const SOUND_RECORDING_MS = 180_000;
const SOUND_TOPICS_MS = 45_000;
const SOUND_VOTING_MS = 30_000;
const CHALLENGE_RECORDING_MS = 25_000;
const CHALLENGE_BRIEFING_MS = 60_000;
const CHALLENGE_UPLOAD_GRACE_MS = 30_000;
const CHALLENGE_JUDGING_FALLBACK_SCORE = 5;
const PHOTO_HUNT_MS = 60_000;
const TRACK_GUESS_LISTEN_MS = 25_000;
const TRACK_GUESS_GUESS_MS = 20_000;
const TRACK_GUESS_REVEAL_MS = 8_000;
const SPECTRUM_COURT_CLUE_MS = 60_000;
const SPECTRUM_COURT_GUESS_MS = 35_000;
const SPECTRUM_COURT_APPEAL_MS = 18_000;
const SPECTRUM_COURT_REVEAL_MS = 10_000;

export const SOUNDSCAPE_FALLBACK_TOPIC = "Звуки утреннего парка";
export const SPECTRUM_COURT_FALLBACK_CLUE = "Без подсказки — командная интуиция!";
export const CHALLENGE_JUDGING_FALLBACK_FEEDBACK = "Судья взял самоотвод — среднее очко за отвагу.";

function shiftTime(value: number | undefined, deltaMs: number) {
  return typeof value === "number" ? value + deltaMs : value;
}

export function spectrumCourtFallbackClue(sc: Pick<SpectrumCourtState, "prompt" | "clue">): string {
  if (sc.clue?.trim()) return sc.clue;
  return sc.prompt?.trim() || SPECTRUM_COURT_FALLBACK_CLUE;
}

function spectrumCourtCluePlayerId(state: RoomState, sc: SpectrumCourtState) {
  return (
    sc.cluePlayerId ?? state.players.find((player) => player.teamId === sc.clueTeamId)?.id ?? "host"
  );
}

function pickSoundscapeTopic(
  topics: string[] | undefined,
  topicVotes: Record<string, string> | undefined,
) {
  const counts: Record<string, number> = {};
  Object.values(topicVotes ?? {}).forEach((topic) => {
    counts[topic] = (counts[topic] ?? 0) + 1;
  });
  return (
    (topics ?? [])
      .map((candidate) => [candidate, counts[candidate] ?? 0] as const)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ??
    topics?.[0] ??
    SOUNDSCAPE_FALLBACK_TOPIC
  );
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
          topicsEndsAt: shiftTime(state.soundscape.topicsEndsAt, deltaMs),
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
          briefingEndsAt: shiftTime(state.challenge.briefingEndsAt, deltaMs),
          recordingEndsAt: shiftTime(state.challenge.recordingEndsAt, deltaMs),
        }
      : undefined,
    phototunt: state.phototunt
      ? {
          ...state.phototunt,
          huntEndsAt: shiftTime(state.phototunt.huntEndsAt, deltaMs),
        }
      : undefined,
    trackguess: state.trackguess
      ? {
          ...state.trackguess,
          listeningEndsAt: shiftTime(state.trackguess.listeningEndsAt, deltaMs),
          guessEndsAt: shiftTime(state.trackguess.guessEndsAt, deltaMs),
          revealEndsAt: shiftTime(state.trackguess.revealEndsAt, deltaMs),
        }
      : undefined,
    spectrumcourt: state.spectrumcourt
      ? {
          ...state.spectrumcourt,
          clueEndsAt: shiftTime(state.spectrumcourt.clueEndsAt, deltaMs),
          guessEndsAt: shiftTime(state.spectrumcourt.guessEndsAt, deltaMs),
          appealEndsAt: shiftTime(state.spectrumcourt.appealEndsAt, deltaMs),
          revealEndsAt: shiftTime(state.spectrumcourt.revealEndsAt, deltaMs),
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
    trackguess: undefined,
    spectrumcourt: undefined,
  };
}

export function finishPartyState(state: RoomState): RoomState {
  return {
    ...state,
    status: "finished",
    currentGame: null,
    paused: undefined,
    soundscape: undefined,
    challenge: undefined,
    phototunt: undefined,
    trackguess: undefined,
    spectrumcourt: undefined,
  };
}

export function resumePartyState(state: RoomState): RoomState {
  if (state.status !== "finished") return state;
  return {
    ...state,
    status: "lobby",
    currentGame: null,
    paused: undefined,
    soundscape: undefined,
    challenge: undefined,
    phototunt: undefined,
    trackguess: undefined,
    spectrumcourt: undefined,
  };
}

export function resetScoresState(state: RoomState): RoomState {
  return {
    ...state,
    teams: state.teams.map((team) => ({ ...team, score: 0 })),
  };
}

export type TeamStanding = {
  team: Team;
  place: number;
  playerCount: number;
};

export function computeTeamStandings(state: RoomState): TeamStanding[] {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  let place = 1;
  return sorted.map((team, index) => {
    if (index > 0 && team.score < sorted[index - 1]!.score) {
      place = index + 1;
    }
    return {
      team,
      place,
      playerCount: state.players.filter((player) => player.teamId === team.id).length,
    };
  });
}

export function getWinningStandings(standings: TeamStanding[]): TeamStanding[] {
  if (standings.length === 0) return [];
  const topScore = standings[0]!.team.score;
  return standings.filter((standing) => standing.team.score === topScore);
}

export function formatRussianPlace(place: number): string {
  const mod10 = place % 10;
  const mod100 = place % 100;
  if (mod10 === 1 && mod100 !== 11) return `${place} место`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${place} места`;
  return `${place} мест`;
}

export function formatRussianPoints(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} очко`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} очка`;
  return `${count} очков`;
}

export function buildWinnerAnnouncement(standings: TeamStanding[]): string {
  const winners = getWinningStandings(standings);
  if (winners.length === 0) return "Вечеринка окончена!";
  const scoreText = formatRussianPoints(winners[0]!.team.score);
  if (winners.length === 1) {
    return `Победители вечеринки — команда ${winners[0]!.team.name}! ${scoreText}!`;
  }
  const names = winners.map((standing) => standing.team.name).join(" и ");
  return `Ничья между ${names}! По ${scoreText} у каждой!`;
}

export function canSkipCurrentPhase(state: RoomState): boolean {
  if (state.paused) return false;
  if (state.currentGame === "soundscape" && state.soundscape) {
    return ["topics", "recording", "mixing", "playback", "voting"].includes(state.soundscape.phase);
  }
  if (state.currentGame === "challenge" && state.challenge) {
    return (
      (state.challenge.phase === "briefing" && !!state.challenge.task) ||
      state.challenge.phase === "recording" ||
      state.challenge.phase === "judging"
    );
  }
  if (state.currentGame === "phototunt" && state.phototunt) {
    return (
      (state.phototunt.phase === "briefing" && !!state.phototunt.task) ||
      state.phototunt.phase === "hunting"
    );
  }
  if (state.currentGame === "trackguess" && state.trackguess) {
    return ["listening", "guessing", "reveal"].includes(state.trackguess.phase);
  }
  if (state.currentGame === "spectrumcourt" && state.spectrumcourt) {
    return (
      state.spectrumcourt.phase === "clue" ||
      ["guessing", "appeal", "reveal"].includes(state.spectrumcourt.phase)
    );
  }
  return false;
}

export function skipCurrentPhaseState(state: RoomState, now = Date.now()): RoomState {
  if (!canSkipCurrentPhase(state)) return state;

  if (state.currentGame === "soundscape" && state.soundscape) {
    const snd = state.soundscape;
    if (snd.phase === "topics") {
      const topic = pickSoundscapeTopic(snd.topics, snd.topicVotes);
      return {
        ...state,
        soundscape: {
          ...snd,
          phase: "recording",
          topic,
          topicsEndsAt: undefined,
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
    if (snd.phase === "mixing") {
      return {
        ...state,
        soundscape: {
          ...snd,
          phase: "recording",
          recordingEndsAt: now + SOUND_RECORDING_MS,
        },
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
        challenge: {
          ...ch,
          phase: "recording",
          briefingEndsAt: undefined,
          recordingEndsAt: now + CHALLENGE_RECORDING_MS,
        },
      };
    }
    if (ch.phase === "recording") {
      return {
        ...state,
        challenge: { ...ch, recordingEndsAt: now - CHALLENGE_UPLOAD_GRACE_MS },
      };
    }
    if (ch.phase === "judging") {
      const operator = state.players.find((player) => player.id === ch.operatorId);
      const teams = state.teams.map((team) =>
        operator && team.id === operator.teamId
          ? { ...team, score: team.score + CHALLENGE_JUDGING_FALLBACK_SCORE }
          : team,
      );
      return {
        ...state,
        teams,
        challenge: {
          ...ch,
          phase: "results",
          result: {
            score: CHALLENGE_JUDGING_FALLBACK_SCORE,
            feedback: CHALLENGE_JUDGING_FALLBACK_FEEDBACK,
            videoUrl: "",
          },
        },
      };
    }
  }

  if (state.currentGame === "phototunt" && state.phototunt) {
    const ph = state.phototunt;
    if (ph.phase === "briefing" && ph.task) {
      return {
        ...state,
        phototunt: {
          ...ph,
          phase: "hunting",
          huntEndsAt: now + PHOTO_HUNT_MS,
          hunterIds: state.players.map((player) => player.id),
        },
      };
    }
    if (ph.phase === "hunting") {
      return {
        ...state,
        phototunt: { ...ph, huntEndsAt: now },
      };
    }
  }

  if (state.currentGame === "trackguess" && state.trackguess) {
    const tg = state.trackguess;
    if (tg.phase === "listening") {
      return {
        ...state,
        trackguess: { ...tg, listeningEndsAt: now },
      };
    }
    if (tg.phase === "guessing") {
      return {
        ...state,
        trackguess: { ...tg, guessEndsAt: now },
      };
    }
    if (tg.phase === "reveal") {
      return {
        ...state,
        trackguess: { ...tg, revealEndsAt: now },
      };
    }
  }

  if (state.currentGame === "spectrumcourt" && state.spectrumcourt) {
    const sc = state.spectrumcourt;
    if (sc.phase === "clue") {
      return {
        ...state,
        spectrumcourt: {
          ...sc,
          clue: spectrumCourtFallbackClue(sc),
          cluePlayerId: spectrumCourtCluePlayerId(state, sc),
          phase: "guessing",
          clueEndsAt: undefined,
          guessEndsAt: now + SPECTRUM_COURT_GUESS_MS,
        },
      };
    }
    if (sc.phase === "guessing") {
      return {
        ...state,
        spectrumcourt: { ...sc, guessEndsAt: now },
      };
    }
    if (sc.phase === "appeal") {
      return {
        ...state,
        spectrumcourt: { ...sc, appealEndsAt: now },
      };
    }
    if (sc.phase === "reveal") {
      return {
        ...state,
        spectrumcourt: { ...sc, revealEndsAt: now },
      };
    }
  }

  return state;
}

export {
  SOUND_RECORDING_MS,
  SOUND_TOPICS_MS,
  CHALLENGE_BRIEFING_MS,
  TRACK_GUESS_LISTEN_MS,
  TRACK_GUESS_GUESS_MS,
  TRACK_GUESS_REVEAL_MS,
  SPECTRUM_COURT_CLUE_MS,
  SPECTRUM_COURT_GUESS_MS,
  SPECTRUM_COURT_APPEAL_MS,
  SPECTRUM_COURT_REVEAL_MS,
};
