import {
  advanceDirectorSegmentState,
  approveDirectorSuggestionState,
  fallbackSuggestion,
  markDirectorProviderState,
  proposeDirectorFallbackState,
  rewriteDirectorSuggestionState,
  setDirectorMicCaptureState,
  skipDirectorSuggestionState,
  startDirectorState,
} from "./event-director";
import {
  launchChallengeState,
  launchPhotoHuntState,
  launchSoundscapeState,
  launchSpectrumCourtState,
  launchTrackGuessState,
} from "./game-state";
import type { EventDirectorSuggestionIntent, GameId, RoomState } from "./types";

export type DirectorAction =
  | "start"
  | "suggest"
  | "approve"
  | "skip"
  | "rewrite"
  | "launch-game"
  | "advance"
  | "stop"
  | "provider-status"
  | "mic-capture";

export type DirectorActionPayload = {
  action: DirectorAction;
  text?: string;
  audienceText?: string;
  gameId?: GameId;
  provider?: "openai" | "xai" | "none";
  configured?: boolean;
  connected?: boolean;
  lastError?: string;
  micStatus?: "idle" | "listening" | "transcribing";
};

type GeneratedDirectorLine = {
  intent?: EventDirectorSuggestionIntent;
  text?: string;
  gameId?: GameId;
};

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function launchGameState(state: RoomState, gameId: GameId): RoomState {
  const roundId = id(
    gameId === "soundscape"
      ? "snd"
      : gameId === "challenge"
        ? "ch"
        : gameId === "phototunt"
          ? "ph"
          : gameId === "trackguess"
            ? "tg"
            : "sc",
  );
  const next =
    gameId === "soundscape"
      ? launchSoundscapeState(state, roundId)
      : gameId === "challenge"
        ? launchChallengeState(state, roundId)
        : gameId === "phototunt"
          ? launchPhotoHuntState(state, roundId)
          : gameId === "trackguess"
            ? launchTrackGuessState(state, roundId)
            : launchSpectrumCourtState(state, roundId);
  if (!next) throw statusError(`Cannot launch ${gameId} with current players/teams`, 409);
  return next;
}

function safeText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const text = value.trim().replace(/\s+/g, " ").slice(0, 520);
  return text || fallback;
}

function safeIntent(value: unknown, fallback: EventDirectorSuggestionIntent) {
  return value === "speak" ||
    value === "ask-audience" ||
    value === "launch-game" ||
    value === "advance" ||
    value === "finale"
    ? value
    : fallback;
}

function safeGameId(value: unknown): GameId | undefined {
  return value === "soundscape" ||
    value === "challenge" ||
    value === "phototunt" ||
    value === "trackguess" ||
    value === "spectrumcourt"
    ? value
    : undefined;
}

function summarizeRoomForDirector(state: RoomState, audienceText?: string) {
  const director = state.eventDirector;
  return {
    eventLanguage: "English",
    tone: "adult, dry, sharply observant, intellectual, suitable for Danish humanities and science guests; witty about situations, not cruel to people",
    playerCount: state.players.length,
    teams: state.teams.map((team) => ({ name: team.name, score: team.score })),
    currentGame: state.currentGame,
    activePhase:
      state.currentGame === "soundscape"
        ? state.soundscape?.phase
        : state.currentGame === "challenge"
          ? state.challenge?.phase
          : state.currentGame === "phototunt"
            ? state.phototunt?.phase
            : state.currentGame === "trackguess"
              ? state.trackguess?.phase
              : state.currentGame === "spectrumcourt"
                ? state.spectrumcourt?.phase
                : null,
    directorMode: director?.mode ?? "setup",
    currentSegment: director?.segments.find((segment) => segment.id === director.currentSegmentId),
    recentHostLines: director?.spokenTranscript.slice(-5).map((entry) => entry.text) ?? [],
    audienceText,
  };
}

export async function buildDirectorSuggestion(
  state: RoomState,
  now = Date.now(),
  audienceText?: string,
) {
  const fallbackState = proposeDirectorFallbackState(state, now, audienceText);
  const fallback = fallbackState.eventDirector?.pendingSuggestion;
  if (!fallback || !process.env.OPENAI_API_KEY) return fallbackState;

  try {
    const { chatJSON } = await import("./ai-gateway.server");
    const generated = await chatJSON<GeneratedDirectorLine>({
      temperature: 0.8,
      system:
        "You are the virtual host and event director for a live party game festival. Return JSON only. Keep lines under 55 words. Be dry, smart, and slightly acidic, but never humiliating, sexual, political, or mean about identity. The audience is Danish and academically inclined. The event language is English.",
      user: JSON.stringify(summarizeRoomForDirector(state, audienceText)),
    });
    const text = safeText(generated.text, fallback.text);
    const intent = safeIntent(generated.intent, fallback.intent);
    const gameId = safeGameId(generated.gameId) ?? fallback.gameId;
    return {
      ...fallbackState,
      eventDirector: {
        ...fallbackState.eventDirector!,
        pendingSuggestion: {
          ...fallbackSuggestion(intent, text, now, { gameId, safety: "clear" }),
          fallback: false,
        },
        fallback: false,
      },
    } satisfies RoomState;
  } catch {
    return fallbackState;
  }
}

export async function applyDirectorAction(
  state: RoomState,
  payload: DirectorActionPayload,
  now = Date.now(),
): Promise<RoomState> {
  if (payload.action === "start") return startDirectorState(state, now);
  if (payload.action === "suggest")
    return buildDirectorSuggestion(state, now, payload.audienceText);
  if (payload.action === "skip") return skipDirectorSuggestionState(state, now);
  if (payload.action === "rewrite") {
    if (!payload.text?.trim()) throw statusError("text required", 400);
    return rewriteDirectorSuggestionState(state, payload.text, now);
  }
  if (payload.action === "advance") return advanceDirectorSegmentState(state, now);
  if (payload.action === "stop") {
    return {
      ...state,
      eventDirector: state.eventDirector
        ? { ...state.eventDirector, mode: "off", pendingSuggestion: undefined, updatedAt: now }
        : undefined,
    };
  }
  if (payload.action === "provider-status") {
    return markDirectorProviderState(
      state,
      payload.provider ?? "none",
      payload.configured ?? false,
      payload.connected ?? false,
      now,
      payload.lastError,
    );
  }
  if (payload.action === "mic-capture") {
    return setDirectorMicCaptureState(
      state,
      payload.micStatus ?? "idle",
      now,
      payload.audienceText,
    );
  }
  if (payload.action === "launch-game") {
    const gameId = payload.gameId ?? state.eventDirector?.pendingSuggestion?.gameId;
    if (!gameId) throw statusError("gameId required", 400);
    return launchGameState(approveDirectorSuggestionState(state, now), gameId);
  }
  if (payload.action === "approve") {
    const suggestion = state.eventDirector?.pendingSuggestion;
    if (suggestion?.intent === "launch-game" && suggestion.gameId) {
      return launchGameState(approveDirectorSuggestionState(state, now), suggestion.gameId);
    }
    return approveDirectorSuggestionState(state, now);
  }
  return state;
}
