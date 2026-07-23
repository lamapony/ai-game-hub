import { getExperienceRoute } from "@/experiences/catalog";
import {
  normalizePartyStorySeed,
  PARTY_STORY_SEED_MAX_LENGTH,
  type ContingencyPlan,
  type ExperienceId,
} from "./party-context";
import { selectExperienceState } from "./party-controls";
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS } from "./room-capacity";
import { emptyRoomState, type RoomState } from "./types";

export const QUICK_START_VENUES = ["park", "bar", "home", "festival"] as const;
export const QUICK_START_DURATIONS = [120, 180, 240] as const;
export const QUICK_START_MIN_PLAYERS = MIN_ROOM_PLAYERS;
export const QUICK_START_MAX_PLAYERS = MAX_ROOM_PLAYERS;
export const TWO_MINUTE_TARGET_MS = 120_000;

export type QuickStartVenue = (typeof QUICK_START_VENUES)[number];
export type QuickStartDuration = (typeof QUICK_START_DURATIONS)[number];

export type QuickStartSetup = {
  venue: QuickStartVenue;
  targetDurationMinutes: QuickStartDuration;
  expectedPlayers: number;
  /** Public detail that makes this party specific; never use for secrets or sensitive notes. */
  storySeed?: string;
  configuredAt: number;
  /** Server time of the first scripted cue. Persists after the active cue is completed. */
  startedAt?: number;
  /** Server time of the latest completed finale for this run. */
  finishedAt?: number;
};

export type QuickStartInput = Omit<QuickStartSetup, "configuredAt" | "startedAt" | "finishedAt">;

export type QuickStartProfile = {
  venue: QuickStartVenue;
  emoji: string;
  title: string;
  promise: string;
  stage: string;
  experienceId: ExperienceId;
};

export const QUICK_START_PROFILES: Record<QuickStartVenue, QuickStartProfile> = {
  park: {
    venue: "park",
    emoji: "🌳",
    title: "Park expedition",
    promise: "Active, observant and built from sounds, objects and accidents in the park.",
    stage: "trees, paths, benches and weather",
    experienceId: "park-story",
  },
  bar: {
    venue: "bar",
    emoji: "🍸",
    title: "Bar investigation",
    promise: "Table-safe adult games where toasts, orders and loose alibis become evidence.",
    stage: "glasses, menus, light and table talk",
    experienceId: "bar-night",
  },
  home: {
    venue: "home",
    emoji: "🏠",
    title: "Household evidence",
    promise: "A whole-home story built from rooms, snacks, objects and tonight's incidents.",
    stage: "sofa, kitchen, hallway and fridge",
    experienceId: "house-party",
  },
  festival: {
    venue: "festival",
    emoji: "🎪",
    title: "Festival field signal",
    promise: "Noise-proof missions and shared sightings for a group moving through a festival.",
    stage: "stages, queues, wristbands and crowds",
    experienceId: "festival-field",
  },
};

const CONTINGENCY_BY_DURATION: Record<QuickStartDuration, ContingencyPlan> = {
  120: "compact",
  180: "normal",
  240: "extended",
};

function includes<const T extends readonly (string | number)[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return values.includes(value as never);
}

export function validateQuickStartInput(value: QuickStartInput): QuickStartInput {
  if (!includes(QUICK_START_VENUES, value.venue)) {
    throw new Error("Choose a supported party setting");
  }
  if (!includes(QUICK_START_DURATIONS, value.targetDurationMinutes)) {
    throw new Error("Choose a 2, 3 or 4 hour program");
  }
  if (
    !Number.isInteger(value.expectedPlayers) ||
    value.expectedPlayers < QUICK_START_MIN_PLAYERS ||
    value.expectedPlayers > QUICK_START_MAX_PLAYERS
  ) {
    throw new Error(
      `Expected players must be between ${QUICK_START_MIN_PLAYERS} and ${QUICK_START_MAX_PLAYERS}`,
    );
  }
  if (value.storySeed !== undefined && typeof value.storySeed !== "string") {
    throw new Error("Party story must be text");
  }
  const storySeed = normalizePartyStorySeed(value.storySeed);
  if (storySeed && storySeed.length > PARTY_STORY_SEED_MAX_LENGTH) {
    throw new Error(`Party story must be ${PARTY_STORY_SEED_MAX_LENGTH} characters or fewer`);
  }
  const { storySeed: _storySeed, ...base } = value;
  return storySeed ? { ...base, storySeed } : base;
}

export function quickStartContingency(duration: QuickStartDuration): ContingencyPlan {
  return CONTINGENCY_BY_DURATION[duration];
}

export function buildQuickStartRoomState(
  hostName: string,
  input: QuickStartInput,
  now = Date.now(),
): RoomState {
  const setup = validateQuickStartInput(input);
  const profile = QUICK_START_PROFILES[setup.venue];
  const selected = selectExperienceState(
    emptyRoomState(hostName.trim() || "Host"),
    profile.experienceId,
    quickStartContingency(setup.targetDurationMinutes),
    now,
  );
  return {
    ...selected,
    party:
      selected.party && setup.storySeed
        ? { ...selected.party, storySeed: setup.storySeed }
        : selected.party,
    quickStart: { ...setup, configuredAt: now },
  };
}

export type QuickStartReadiness = {
  ready: boolean;
  readyWithinTwoMinutes: boolean;
  elapsedMs: number;
  joinedPlayers: number;
  expectedPlayers: number;
  minimumPlayers: number;
  maximumPlayers: number;
  withinPlayerCapacity: boolean;
  routeDurationMinutes: number;
  routeMatchesPromise: boolean;
};

export function getQuickStartReadiness(
  state: RoomState,
  now = Date.now(),
): QuickStartReadiness | null {
  const setup = state.quickStart;
  const party = state.party;
  if (!setup || !party) return null;

  const routeDurationMinutes = getExperienceRoute(
    party.experienceId,
    party.contingency,
  ).steps.reduce((total, step) => total + step.durationMinutes, 0);
  const joinedPlayers = state.players.length;
  const withinPlayerCapacity = joinedPlayers <= QUICK_START_MAX_PLAYERS;
  const elapsedMs = Math.max(0, (setup.startedAt ?? now) - setup.configuredAt);
  const routeMatchesPromise = routeDurationMinutes === setup.targetDurationMinutes;
  const ready =
    routeMatchesPromise && joinedPlayers >= QUICK_START_MIN_PLAYERS && withinPlayerCapacity;

  return {
    ready,
    readyWithinTwoMinutes: ready && elapsedMs <= TWO_MINUTE_TARGET_MS,
    elapsedMs,
    joinedPlayers,
    expectedPlayers: setup.expectedPlayers,
    minimumPlayers: QUICK_START_MIN_PLAYERS,
    maximumPlayers: QUICK_START_MAX_PLAYERS,
    withinPlayerCapacity,
    routeDurationMinutes,
    routeMatchesPromise,
  };
}
