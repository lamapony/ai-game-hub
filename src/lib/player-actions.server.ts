import { addAudienceResponseState } from "./event-director";
import type { RoomState, SpectrumCourtAppeal } from "./types";

export type PlayerAction =
  | "join"
  | "ensure-player"
  | "switch-team"
  | "audience-response"
  | "soundscape-topic-vote"
  | "challenge-start-recording"
  | "trackguess-guess"
  | "spectrumcourt-clue"
  | "spectrumcourt-guess"
  | "spectrumcourt-appeal";

export type PlayerActionPayload = {
  action: PlayerAction;
  playerId?: string;
  name?: string;
  teamId?: string;
  option?: string;
  topic?: string;
  choice?: "real" | "ai";
  clue?: string;
  value?: number;
  direction?: SpectrumCourtAppeal["direction"];
};

const CHALLENGE_RECORDING_MS = 25_000;

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function cleanId(value: unknown, field: string) {
  if (typeof value !== "string") throw statusError(`${field} required`, 400);
  const id = value.trim();
  if (id.length < 2 || id.length > 80) throw statusError(`${field} invalid`, 400);
  return id;
}

function cleanName(value: unknown, fallback: string) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (name || fallback).slice(0, 32);
}

function cleanOption(value: unknown) {
  if (typeof value !== "string") throw statusError("option required", 400);
  const option = value.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!option) throw statusError("option required", 400);
  return option;
}

function cleanText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw statusError(`${field} required`, 400);
  const text = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  if (!text) throw statusError(`${field} required`, 400);
  return text;
}

function cleanNumber(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw statusError(`${field} required`, 400);
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function assertTeam(state: RoomState, teamId: string) {
  const team = state.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw statusError("team not found", 409);
  return team;
}

function upsertPlayer(
  state: RoomState,
  payload: PlayerActionPayload,
  now: number,
  opts: { requireExisting?: boolean } = {},
): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  const teamId = cleanId(payload.teamId, "teamId");
  assertTeam(state, teamId);
  const current = state.players.find((player) => player.id === playerId);
  if (opts.requireExisting && !current) throw statusError("player not found", 404);
  const player = {
    id: playerId,
    name: cleanName(payload.name, current?.name ?? "Player"),
    teamId,
    joinedAt: current?.joinedAt ?? now,
  };
  return {
    ...state,
    players: current
      ? state.players.map((candidate) => (candidate.id === playerId ? player : candidate))
      : [...state.players, player],
  };
}

function ensurePlayerState(state: RoomState, payload: PlayerActionPayload, now: number): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  if (state.players.some((player) => player.id === playerId)) return state;
  const teamId =
    typeof payload.teamId === "string" && state.teams.some((team) => team.id === payload.teamId)
      ? payload.teamId
      : state.teams[0]?.id;
  if (!teamId) throw statusError("team not found", 409);
  return upsertPlayer(state, { ...payload, teamId }, now);
}

function addAudienceResponse(
  state: RoomState,
  payload: PlayerActionPayload,
  now: number,
): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw statusError("player not found", 404);
  const moment = state.eventDirector?.playerMoment;
  if (!moment || moment.mode !== "react") throw statusError("reaction window closed", 409);
  if (moment.expiresAt && moment.expiresAt < now) {
    throw statusError("reaction window closed", 409);
  }
  const option = cleanOption(payload.option);
  if (moment.options?.length && !moment.options.includes(option)) {
    throw statusError("option not available", 409);
  }
  if (
    state.eventDirector?.audienceResponses?.some(
      (response) => response.playerId === playerId && response.momentId === moment.id,
    )
  ) {
    return state;
  }
  return addAudienceResponseState(
    state,
    {
      momentId: moment.id,
      playerId,
      playerName: player.name,
      option,
    },
    now,
  );
}

function requirePlayer(state: RoomState, playerId: string) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw statusError("player not found", 404);
  return player;
}

function soundscapeTopicVoteState(state: RoomState, payload: PlayerActionPayload): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  requirePlayer(state, playerId);
  const soundscape = state.soundscape;
  if (state.currentGame !== "soundscape" || !soundscape || soundscape.phase !== "topics") {
    throw statusError("topic voting is closed", 409);
  }
  const topic = cleanText(payload.topic, "topic", 80);
  if (!soundscape.topics?.includes(topic)) throw statusError("topic not available", 409);
  return {
    ...state,
    soundscape: {
      ...soundscape,
      topicVotes: { ...(soundscape.topicVotes ?? {}), [playerId]: topic },
    },
  };
}

function challengeStartRecordingState(
  state: RoomState,
  payload: PlayerActionPayload,
  now: number,
): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  requirePlayer(state, playerId);
  const challenge = state.challenge;
  if (
    state.currentGame !== "challenge" ||
    !challenge ||
    challenge.phase !== "briefing" ||
    !challenge.task
  ) {
    throw statusError("challenge recording cannot start now", 409);
  }
  if (challenge.operatorId !== playerId) throw statusError("only the operator can start", 403);
  return {
    ...state,
    challenge: {
      ...challenge,
      phase: "recording",
      recordingEndsAt: now + CHALLENGE_RECORDING_MS,
    },
  };
}

function trackGuessGuessState(
  state: RoomState,
  payload: PlayerActionPayload,
  now: number,
): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  requirePlayer(state, playerId);
  const trackguess = state.trackguess;
  if (state.currentGame !== "trackguess" || !trackguess || trackguess.phase !== "guessing") {
    throw statusError("track guess voting is closed", 409);
  }
  if (trackguess.guessEndsAt && trackguess.guessEndsAt < now) {
    throw statusError("track guess voting is closed", 409);
  }
  if (payload.choice !== "real" && payload.choice !== "ai") {
    throw statusError("choice required", 400);
  }
  return {
    ...state,
    trackguess: {
      ...trackguess,
      guesses: { ...(trackguess.guesses ?? {}), [playerId]: payload.choice },
    },
  };
}

function spectrumCourtClueState(state: RoomState, payload: PlayerActionPayload): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  const player = requirePlayer(state, playerId);
  const spectrumcourt = state.spectrumcourt;
  if (state.currentGame !== "spectrumcourt" || !spectrumcourt || spectrumcourt.phase !== "clue") {
    throw statusError("spectrum clue is closed", 409);
  }
  if (player.teamId !== spectrumcourt.clueTeamId) {
    throw statusError("only the clue team can submit", 403);
  }
  if (spectrumcourt.clue) return state;
  return {
    ...state,
    spectrumcourt: {
      ...spectrumcourt,
      clue: cleanText(payload.clue, "clue", 80),
      cluePlayerId: playerId,
    },
  };
}

function spectrumCourtGuessState(
  state: RoomState,
  payload: PlayerActionPayload,
  now: number,
): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  const player = requirePlayer(state, playerId);
  const spectrumcourt = state.spectrumcourt;
  if (
    state.currentGame !== "spectrumcourt" ||
    !spectrumcourt ||
    spectrumcourt.phase !== "guessing"
  ) {
    throw statusError("spectrum guessing is closed", 409);
  }
  if (spectrumcourt.guessEndsAt && spectrumcourt.guessEndsAt < now) {
    throw statusError("spectrum guessing is closed", 409);
  }
  if (player.teamId === spectrumcourt.clueTeamId) {
    throw statusError("clue team cannot guess", 403);
  }
  return {
    ...state,
    spectrumcourt: {
      ...spectrumcourt,
      guesses: {
        ...(spectrumcourt.guesses ?? {}),
        [playerId]: cleanNumber(payload.value, "value", 0, 100),
      },
    },
  };
}

function spectrumCourtAppealState(
  state: RoomState,
  payload: PlayerActionPayload,
  now: number,
): RoomState {
  const playerId = cleanId(payload.playerId, "playerId");
  const player = requirePlayer(state, playerId);
  const spectrumcourt = state.spectrumcourt;
  if (state.currentGame !== "spectrumcourt" || !spectrumcourt || spectrumcourt.phase !== "appeal") {
    throw statusError("spectrum appeal is closed", 409);
  }
  if (spectrumcourt.appealEndsAt && spectrumcourt.appealEndsAt < now) {
    throw statusError("spectrum appeal is closed", 409);
  }
  if (player.teamId === spectrumcourt.clueTeamId) {
    throw statusError("clue team cannot appeal", 403);
  }
  if (payload.direction !== "lower" && payload.direction !== "higher") {
    throw statusError("direction required", 400);
  }
  return {
    ...state,
    spectrumcourt: {
      ...spectrumcourt,
      appeals: { ...(spectrumcourt.appeals ?? {}), [playerId]: { direction: payload.direction } },
    },
  };
}

export async function applyPlayerAction(
  state: RoomState,
  payload: PlayerActionPayload,
  now = Date.now(),
): Promise<RoomState> {
  if (payload.action === "join") return upsertPlayer(state, payload, now);
  if (payload.action === "ensure-player") return ensurePlayerState(state, payload, now);
  if (payload.action === "switch-team")
    return upsertPlayer(state, payload, now, { requireExisting: true });
  if (payload.action === "audience-response") return addAudienceResponse(state, payload, now);
  if (payload.action === "soundscape-topic-vote") return soundscapeTopicVoteState(state, payload);
  if (payload.action === "challenge-start-recording")
    return challengeStartRecordingState(state, payload, now);
  if (payload.action === "trackguess-guess") return trackGuessGuessState(state, payload, now);
  if (payload.action === "spectrumcourt-clue") return spectrumCourtClueState(state, payload);
  if (payload.action === "spectrumcourt-guess") return spectrumCourtGuessState(state, payload, now);
  if (payload.action === "spectrumcourt-appeal")
    return spectrumCourtAppealState(state, payload, now);
  throw statusError("unknown player action", 400);
}
