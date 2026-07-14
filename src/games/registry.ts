import {
  launchChallengeState,
  launchImpostorState,
  launchPhotoHuntState,
  launchSoundscapeState,
  launchSpectrumCourtState,
  launchTrackGuessState,
  launchWhoAmongState,
} from "@/lib/game-state";
import type { GameId, RoomState } from "@/lib/types";
import { LEGACY_GAME_IDS } from "./ids";

export { LEGACY_GAME_IDS } from "./ids";

export type LegacyGameStateKey = GameId;

export type LaunchGameOptions = {
  roundId: string;
  random?: number;
};

export type LegacyGameDefinition = {
  id: GameId;
  title: string;
  roundIdPrefix: string;
  stateKey: LegacyGameStateKey;
  launch: (state: RoomState, options: LaunchGameOptions) => RoomState | null;
  isReady: (state: RoomState) => boolean;
  phase: (state: RoomState) => string | null;
};

function defineGame(definition: LegacyGameDefinition): LegacyGameDefinition {
  return definition;
}

export const LEGACY_GAME_REGISTRY = {
  soundscape: defineGame({
    id: "soundscape",
    title: "Soundscape Battle",
    roundIdPrefix: "snd",
    stateKey: "soundscape",
    launch: (state, { roundId }) => launchSoundscapeState(state, roundId),
    isReady: (state) => Boolean(state.soundscape),
    phase: (state) => state.soundscape?.phase ?? null,
  }),
  challenge: defineGame({
    id: "challenge",
    title: "Challenge",
    roundIdPrefix: "ch",
    stateKey: "challenge",
    launch: (state, { roundId, random }) => launchChallengeState(state, roundId, random),
    isReady: (state) => Boolean(state.challenge),
    phase: (state) => state.challenge?.phase ?? null,
  }),
  phototunt: defineGame({
    id: "phototunt",
    title: "Photo Hunt",
    roundIdPrefix: "ph",
    stateKey: "phototunt",
    launch: (state, { roundId }) => launchPhotoHuntState(state, roundId),
    isReady: (state) => Boolean(state.phototunt),
    phase: (state) => state.phototunt?.phase ?? null,
  }),
  trackguess: defineGame({
    id: "trackguess",
    title: "Real or AI?",
    roundIdPrefix: "tg",
    stateKey: "trackguess",
    launch: (state, { roundId }) => launchTrackGuessState(state, roundId),
    isReady: (state) => Boolean(state.trackguess),
    phase: (state) => state.trackguess?.phase ?? null,
  }),
  spectrumcourt: defineGame({
    id: "spectrumcourt",
    title: "Spectrum Court",
    roundIdPrefix: "sc",
    stateKey: "spectrumcourt",
    launch: (state, { roundId }) => launchSpectrumCourtState(state, roundId),
    isReady: (state) => Boolean(state.spectrumcourt),
    phase: (state) => state.spectrumcourt?.phase ?? null,
  }),
  whoamong: defineGame({
    id: "whoamong",
    title: "Who Among Us",
    roundIdPrefix: "wa",
    stateKey: "whoamong",
    launch: (state, { roundId }) => launchWhoAmongState(state, roundId),
    isReady: (state) => Boolean(state.whoamong),
    phase: (state) => state.whoamong?.phase ?? null,
  }),
  impostor: defineGame({
    id: "impostor",
    title: "Who's the Bot?",
    roundIdPrefix: "imp",
    stateKey: "impostor",
    launch: (state, { roundId }) => launchImpostorState(state, roundId),
    isReady: (state) => Boolean(state.impostor),
    phase: (state) => state.impostor?.phase ?? null,
  }),
} satisfies Record<GameId, LegacyGameDefinition>;

export function getLegacyGame(gameId: GameId): LegacyGameDefinition {
  return LEGACY_GAME_REGISTRY[gameId];
}

export function launchLegacyGame(
  state: RoomState,
  gameId: GameId,
  options: LaunchGameOptions,
): RoomState | null {
  return getLegacyGame(gameId).launch(state, options);
}

export function activeLegacyGame(state: RoomState): LegacyGameDefinition | null {
  return state.currentGame ? getLegacyGame(state.currentGame) : null;
}

export function activeLegacyGamePhase(state: RoomState): string | null {
  return activeLegacyGame(state)?.phase(state) ?? null;
}

export function hasReadyLegacyGameState(state: RoomState): boolean {
  return activeLegacyGame(state)?.isReady(state) ?? false;
}
