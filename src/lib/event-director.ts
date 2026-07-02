import type {
  EventDirectorAudienceResponse,
  EventDirectorMode,
  EventDirectorPlayerMoment,
  EventDirectorSegment,
  EventDirectorState,
  EventDirectorSuggestion,
  EventDirectorSuggestionIntent,
  EventDirectorTranscriptEntry,
  GameId,
  RoomState,
} from "./types";

export const DIRECTOR_PLAYLIST: GameId[] = [
  "soundscape",
  "phototunt",
  "trackguess",
  "spectrumcourt",
  "challenge",
];

export const GAME_LABELS: Record<GameId, string> = {
  soundscape: "Soundscape Battle",
  challenge: "Field Challenge",
  phototunt: "Photo Hunt",
  trackguess: "Real or AI?",
  spectrumcourt: "Spectrum Court",
};

const MAX_TRANSCRIPT_ENTRIES = 30;
const MAX_AUDIENCE_RESPONSES = 60;

function id(prefix: string, now: number) {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultSegments(playlist: GameId[]): EventDirectorSegment[] {
  return [
    { id: "opening", kind: "opening", title: "Opening", status: "pending" },
    { id: "warmup", kind: "warmup", title: "Warm-up", status: "pending" },
    ...playlist.map((gameId, index) => ({
      id: `game-${index + 1}-${gameId}`,
      kind: "game" as const,
      title: GAME_LABELS[gameId],
      status: "pending" as const,
      gameId,
    })),
    { id: "scoreboard", kind: "scoreboard", title: "Scoreboard callback", status: "pending" },
    { id: "finale", kind: "finale", title: "Finale", status: "pending" },
  ];
}

export function createEventDirectorState(now = Date.now(), playlist = DIRECTOR_PLAYLIST) {
  return {
    mode: "setup",
    playlist,
    segments: defaultSegments(playlist),
    spokenTranscript: [],
    micCapture: { status: "idle" },
    providerStatus: { provider: "none", configured: false, connected: false },
    updatedAt: now,
    safetyMode: "smart-adult",
  } satisfies EventDirectorState;
}

export function ensureEventDirectorState(state: RoomState, now = Date.now()): EventDirectorState {
  return state.eventDirector ?? createEventDirectorState(now);
}

export function setDirectorMode(
  director: EventDirectorState,
  mode: EventDirectorMode,
  now = Date.now(),
): EventDirectorState {
  return {
    ...director,
    mode,
    startedAt: director.startedAt ?? (mode === "running" ? now : undefined),
    updatedAt: now,
  };
}

export function startDirectorState(state: RoomState, now = Date.now()): RoomState {
  const director = ensureEventDirectorState(state, now);
  const segments =
    director.segments.length > 0 ? activateFirstPendingSegment(director.segments, now) : [];
  return {
    ...state,
    eventDirector: {
      ...director,
      mode: "running",
      segments,
      currentSegmentId: segments.find((segment) => segment.status === "active")?.id,
      pendingSuggestion:
        director.pendingSuggestion ??
        fallbackSuggestion("speak", openingLine(state), now, { safety: "clear" }),
      playerMoment: listenMoment("The host is opening the event. Pretend this was planned.", now),
      startedAt: director.startedAt ?? now,
      updatedAt: now,
    },
  };
}

function activateFirstPendingSegment(segments: EventDirectorSegment[], now: number) {
  const active = segments.find((segment) => segment.status === "active");
  if (active) return segments;
  let activated = false;
  return segments.map((segment) => {
    if (!activated && segment.status === "pending") {
      activated = true;
      return { ...segment, status: "active" as const, startedAt: now };
    }
    return segment;
  });
}

function currentSegment(director: EventDirectorState) {
  return director.segments.find((segment) => segment.id === director.currentSegmentId);
}

function nextPendingSegment(director: EventDirectorState) {
  return director.segments.find((segment) => segment.status === "pending");
}

function completeCurrentSegment(director: EventDirectorState, now: number) {
  const currentId = director.currentSegmentId;
  let activatedNext = false;
  let completedCurrent = false;
  const segments = director.segments.map((segment) => {
    if (segment.id === currentId) {
      completedCurrent = true;
      return { ...segment, status: "complete" as const, completedAt: now };
    }
    if (completedCurrent && !activatedNext && segment.status === "pending") {
      activatedNext = true;
      return { ...segment, status: "active" as const, startedAt: now };
    }
    return segment;
  });
  const next = segments.find((segment) => segment.status === "active");
  return {
    ...director,
    segments,
    currentSegmentId: next?.id,
    mode: next ? director.mode : "finished",
    updatedAt: now,
  } satisfies EventDirectorState;
}

export function fallbackSuggestion(
  intent: EventDirectorSuggestionIntent,
  text: string,
  now = Date.now(),
  opts: { gameId?: GameId; safety?: EventDirectorSuggestion["safety"] } = {},
): EventDirectorSuggestion {
  return {
    id: id("cue", now),
    intent,
    text: text.trim(),
    createdAt: now,
    gameId: opts.gameId,
    fallback: true,
    safety: opts.safety ?? "clear",
  };
}

function transcriptFromSuggestion(
  suggestion: EventDirectorSuggestion,
  now: number,
): EventDirectorTranscriptEntry {
  return {
    id: id("line", now),
    speaker: "host",
    text: suggestion.text,
    at: now,
    source: suggestion.fallback ? "fallback" : "realtime",
  };
}

function appendTranscript(
  director: EventDirectorState,
  entry: EventDirectorTranscriptEntry,
): EventDirectorState {
  return {
    ...director,
    spokenTranscript: [...director.spokenTranscript, entry].slice(-MAX_TRANSCRIPT_ENTRIES),
  };
}

export function approveDirectorSuggestionState(state: RoomState, now = Date.now()): RoomState {
  const director = ensureEventDirectorState(state, now);
  const suggestion = director.pendingSuggestion;
  if (!suggestion) return state;

  let nextDirector = appendTranscript(director, transcriptFromSuggestion(suggestion, now));
  nextDirector = {
    ...nextDirector,
    pendingSuggestion: undefined,
    playerMoment:
      suggestion.intent === "ask-audience"
        ? reactMoment("The host wants a tiny sample from the room.", now)
        : listenMoment("Listen to the host. The next mistake may be yours.", now),
    updatedAt: now,
  };

  return { ...state, eventDirector: nextDirector };
}

export function skipDirectorSuggestionState(state: RoomState, now = Date.now()): RoomState {
  const director = ensureEventDirectorState(state, now);
  return {
    ...state,
    eventDirector: {
      ...director,
      pendingSuggestion: undefined,
      playerMoment: waitMoment("The host is recalibrating the social experiment.", now),
      updatedAt: now,
    },
  };
}

export function rewriteDirectorSuggestionState(
  state: RoomState,
  text: string,
  now = Date.now(),
): RoomState {
  const director = ensureEventDirectorState(state, now);
  const previous = director.pendingSuggestion;
  return {
    ...state,
    eventDirector: {
      ...director,
      pendingSuggestion: fallbackSuggestion(previous?.intent ?? "speak", text, now, {
        gameId: previous?.gameId,
        safety: "clear",
      }),
      updatedAt: now,
    },
  };
}

export function advanceDirectorSegmentState(state: RoomState, now = Date.now()): RoomState {
  const director = ensureEventDirectorState(state, now);
  const advanced = completeCurrentSegment(director, now);
  return {
    ...state,
    eventDirector: {
      ...advanced,
      pendingSuggestion: fallbackForSegment(state, advanced, now),
      playerMoment: waitMoment("A new segment is loading. Very theatrical.", now),
    },
  };
}

export function markDirectorProviderState(
  state: RoomState,
  provider: EventDirectorState["providerStatus"]["provider"],
  configured: boolean,
  connected: boolean,
  now = Date.now(),
  lastError?: string,
): RoomState {
  const director = ensureEventDirectorState(state, now);
  return {
    ...state,
    eventDirector: {
      ...director,
      providerStatus: {
        provider,
        configured,
        connected,
        sessionStartedAt: connected ? (director.providerStatus.sessionStartedAt ?? now) : undefined,
        lastError,
      },
      fallback: lastError ? true : director.fallback,
      updatedAt: now,
    },
  };
}

export function setDirectorMicCaptureState(
  state: RoomState,
  status: EventDirectorState["micCapture"]["status"],
  now = Date.now(),
  transcript?: string,
): RoomState {
  const director = ensureEventDirectorState(state, now);
  const entry =
    transcript && transcript.trim()
      ? ({
          id: id("aud", now),
          speaker: "audience",
          text: transcript.trim(),
          at: now,
          source: "operator",
        } satisfies EventDirectorTranscriptEntry)
      : null;

  return {
    ...state,
    eventDirector: {
      ...(entry ? appendTranscript(director, entry) : director),
      micCapture: {
        status,
        transcript,
        lastCapturedAt: transcript ? now : director.micCapture.lastCapturedAt,
      },
      updatedAt: now,
    },
  };
}

export function addAudienceResponseState(
  state: RoomState,
  response: Omit<EventDirectorAudienceResponse, "id" | "at">,
  now = Date.now(),
): RoomState {
  const director = ensureEventDirectorState(state, now);
  const nextResponse = { ...response, id: id("react", now), at: now };
  return {
    ...state,
    eventDirector: {
      ...director,
      audienceResponses: [...(director.audienceResponses ?? []), nextResponse].slice(
        -MAX_AUDIENCE_RESPONSES,
      ),
      updatedAt: now,
    },
  };
}

export function proposeDirectorFallbackState(
  state: RoomState,
  now = Date.now(),
  audienceText?: string,
): RoomState {
  const director = ensureEventDirectorState(state, now);
  const current = currentSegment(director) ?? nextPendingSegment(director);
  const suggestion = audienceText
    ? fallbackSuggestion("speak", audienceCallbackLine(audienceText), now)
    : fallbackForSegment(state, director, now, current);

  return {
    ...state,
    eventDirector: {
      ...director,
      pendingSuggestion: suggestion,
      playerMoment:
        suggestion.intent === "ask-audience"
          ? reactMoment("The host is sampling the room. Scientific enough.", now)
          : listenMoment("Host cue incoming.", now),
      updatedAt: now,
    },
  };
}

function fallbackForSegment(
  state: RoomState,
  director: EventDirectorState,
  now: number,
  segment = currentSegment(director) ?? nextPendingSegment(director),
) {
  if (!segment) {
    return fallbackSuggestion("finale", finaleLine(state), now);
  }
  if (segment.kind === "opening") return fallbackSuggestion("speak", openingLine(state), now);
  if (segment.kind === "warmup") {
    return fallbackSuggestion("ask-audience", warmupLine(state), now);
  }
  if (segment.kind === "game" && segment.gameId) {
    return fallbackSuggestion("launch-game", gameIntroLine(segment.gameId, state), now, {
      gameId: segment.gameId,
    });
  }
  if (segment.kind === "scoreboard") return fallbackSuggestion("speak", scoreboardLine(state), now);
  if (segment.kind === "finale") return fallbackSuggestion("finale", finaleLine(state), now);
  return fallbackSuggestion("speak", interstitialLine(state), now);
}

function listenMoment(prompt: string, now: number): EventDirectorPlayerMoment {
  return {
    id: id("moment", now),
    mode: "listen",
    prompt,
    createdAt: now,
    expiresAt: now + 45_000,
  };
}

function waitMoment(prompt: string, now: number): EventDirectorPlayerMoment {
  return {
    id: id("moment", now),
    mode: "wait",
    prompt,
    createdAt: now,
    expiresAt: now + 45_000,
  };
}

function reactMoment(prompt: string, now: number): EventDirectorPlayerMoment {
  return {
    id: id("moment", now),
    mode: "react",
    prompt,
    options: ["academically yes", "emotionally no", "ask Denmark", "suspicious"],
    createdAt: now,
    expiresAt: now + 60_000,
  };
}

function openingLine(state: RoomState) {
  return `Good evening. ${state.players.length || "Some"} brave participants have joined a controlled experiment in public foolishness. I will be your virtual host; please keep your phones awake and your dignity negotiable.`;
}

function warmupLine(state: RoomState) {
  const teamCount = state.teams.length;
  return `Before the first round, give me a quick signal from the room. We have ${teamCount} teams, which is either a festival structure or a committee, depending on how Danish this gets.`;
}

function gameIntroLine(gameId: GameId, state: RoomState) {
  const players = state.players.length;
  return `Next: ${GAME_LABELS[gameId]}. ${players} players should now pretend this is a normal thing to do at an event. Operator, approve when the room looks almost ready.`;
}

function scoreboardLine(state: RoomState) {
  const leader = [...state.teams].sort((a, b) => b.score - a.score)[0];
  if (!leader) return "Scores are currently a philosophical concept. Convenient.";
  return `${leader.name} are leading with ${leader.score} points. A statistically fragile achievement, but still more than the rest of you have managed.`;
}

function finaleLine(state: RoomState) {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  if (!winner) return "That is the end. Nobody won, which is refreshingly Nordic.";
  return `Finale. ${winner.name} win with ${winner.score} points. Please applaud them with the measured warmth of people who still respect peer review.`;
}

function interstitialLine(state: RoomState) {
  return `A short transition while ${state.players.length} people collectively remember how buttons work.`;
}

function audienceCallbackLine(text: string) {
  const cleaned = text.trim().slice(0, 180);
  return `I heard: "${cleaned}". A useful contribution, in the same sense that footnotes are useful: technically yes, emotionally debatable.`;
}
