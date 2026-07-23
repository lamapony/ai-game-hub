import {
  launchGrillOracleState,
  launchSmokeScreenState,
  launchContrabandState,
  launchTongsOfTruthState,
  launchCrossExaminationState,
  launchChallengeState,
  launchImpostorState,
  launchPhotoHuntState,
  launchSoundscapeState,
  launchSpectrumCourtState,
  launchToastSyndicateState,
  launchStillLifeState,
  launchSommelierState,
  launchTrackGuessState,
  launchWhoAmongState,
} from "@/lib/game-state";
import type { PartyActId, PartyContext, PartyLocale } from "@/lib/party-context";
import type { GameId, RoomState } from "@/lib/types";
import { GAME_IDS, LEGACY_GAME_IDS, type LegacyGameId } from "./ids";

export { GAME_IDS, LEGACY_GAME_IDS } from "./ids";

export type GameStateKey = GameId;

export type LaunchGameOptions = {
  roundId: string;
  random?: number;
  now?: number;
};

export type GameCapability = "camera" | "microphone" | "vision" | "stt" | "speakers";
export type GameAvailabilityStatus = "recommended" | "available" | "blocked";
export type GameAvailability = {
  status: GameAvailabilityStatus;
  reason?: string;
};
export type LegacyRoomSummary = {
  playerCount: number;
  activeTeamCount: number;
  connectedExtraSpeakers: number;
};

export type GameDefinition = {
  id: GameId;
  title: string;
  localizedTitle: Record<PartyLocale, string>;
  description: Record<PartyLocale, string>;
  emoji: string;
  format: "foreground" | "background";
  durationMinutes: number;
  durationLabel: Record<PartyLocale, string>;
  supportedActs: readonly PartyActId[];
  minPlayers: number;
  maxPlayers?: number;
  minActiveTeams?: number;
  capabilities: readonly GameCapability[];
  recommendationPriority: Partial<Record<PartyActId, number>>;
  availability: (context: PartyContext, room: LegacyRoomSummary) => GameAvailability;
  roundIdPrefix: string;
  stateKey: GameStateKey;
  launch: (state: RoomState, options: LaunchGameOptions) => RoomState | null;
  isReady: (state: RoomState) => boolean;
  phase: (state: RoomState) => string | null;
};

export type LegacyGameDefinition = GameDefinition;

function defineGame(definition: GameDefinition): GameDefinition {
  return definition;
}

function localizedNeed(locale: PartyLocale, amount: number, noun: "players" | "teams"): string {
  if (locale === "ru") {
    return noun === "players" ? `нужно игроков: ${amount}` : `нужно активных команд: ${amount}`;
  }
  return noun === "players" ? `needs ${amount} players` : `needs ${amount} active teams`;
}

function availabilityPolicy(options: {
  supportedActs: readonly PartyActId[];
  minPlayers: number;
  maxPlayers?: number;
  minActiveTeams?: number;
}) {
  return (context: PartyContext, room: LegacyRoomSummary): GameAvailability => {
    if (room.playerCount < options.minPlayers) {
      return {
        status: "blocked",
        reason: localizedNeed(context.uiLocale, options.minPlayers, "players"),
      };
    }
    if (options.maxPlayers && room.playerCount > options.maxPlayers) {
      return {
        status: "blocked",
        reason:
          context.uiLocale === "ru"
            ? `максимум игроков: ${options.maxPlayers}`
            : `maximum ${options.maxPlayers} players`,
      };
    }
    if (options.minActiveTeams && room.activeTeamCount < options.minActiveTeams) {
      return {
        status: "blocked",
        reason: localizedNeed(context.uiLocale, options.minActiveTeams, "teams"),
      };
    }
    return {
      status: options.supportedActs.includes(context.actId) ? "recommended" : "available",
    };
  };
}

const foreground = "foreground" as const;
const background = "background" as const;

export const LEGACY_GAME_REGISTRY = {
  soundscape: defineGame({
    id: "soundscape",
    title: "Soundscape Battle",
    localizedTitle: { en: "Soundscape Battle", ru: "Звуковой баттл" },
    description: {
      en: "Capture sounds from the room or street; AI turns them into a spatial one-minute mix.",
      ru: "Запишите звуки вокруг; AI соберёт из них минутный пространственный микс.",
    },
    emoji: "🎚️",
    format: foreground,
    durationMinutes: 7,
    durationLabel: { en: "~7 minutes", ru: "~7 минут" },
    supportedActs: ["classic", "grill"],
    minPlayers: 1,
    capabilities: ["microphone", "speakers"],
    recommendationPriority: { classic: 10, grill: 30 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "grill"],
      minPlayers: 1,
    }),
    roundIdPrefix: "snd",
    stateKey: "soundscape",
    launch: (state, { roundId }) => launchSoundscapeState(state, roundId),
    isReady: (state) => Boolean(state.soundscape),
    phase: (state) => state.soundscape?.phase ?? null,
  }),
  challenge: defineGame({
    id: "challenge",
    title: "Challenge",
    localizedTitle: { en: "Scene Challenge", ru: "Сценический челлендж" },
    description: {
      en: "One player films while the group acts out a sharp, physical scene for the AI judge.",
      ru: "Один игрок снимает, остальные разыгрывают сцену для AI-судьи.",
    },
    emoji: "🎬",
    format: foreground,
    durationMinutes: 4,
    durationLabel: { en: "~4 minutes", ru: "~4 минуты" },
    supportedActs: ["classic", "grill"],
    minPlayers: 2,
    capabilities: ["camera", "vision"],
    recommendationPriority: { classic: 20, grill: 20 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "grill"],
      minPlayers: 2,
    }),
    roundIdPrefix: "ch",
    stateKey: "challenge",
    launch: (state, { roundId, random }) => launchChallengeState(state, roundId, random),
    isReady: (state) => Boolean(state.challenge),
    phase: (state) => state.challenge?.phase ?? null,
  }),
  phototunt: defineGame({
    id: "phototunt",
    title: "Photo Hunt",
    localizedTitle: { en: "Photo Hunt", ru: "Фотоохота" },
    description: {
      en: "Everyone gets one absurd photo assignment; AI ranks the evidence.",
      ru: "Все получают абсурдное фотозадание, а AI ранжирует улики.",
    },
    emoji: "📸",
    format: foreground,
    durationMinutes: 6,
    durationLabel: { en: "~6 minutes", ru: "~6 минут" },
    supportedActs: ["classic", "grill", "bar"],
    minPlayers: 1,
    capabilities: ["camera", "vision"],
    recommendationPriority: { classic: 30, grill: 10, bar: 50 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "grill", "bar"],
      minPlayers: 1,
    }),
    roundIdPrefix: "ph",
    stateKey: "phototunt",
    launch: (state, { roundId }) => launchPhotoHuntState(state, roundId),
    isReady: (state) => Boolean(state.phototunt),
    phase: (state) => state.phototunt?.phase ?? null,
  }),
  trackguess: defineGame({
    id: "trackguess",
    title: "Real or AI?",
    localizedTitle: { en: "Real or AI?", ru: "Настоящее или AI?" },
    description: {
      en: "Play a track, make everyone argue, then reveal whether a human or a machine made it.",
      ru: "Включите трек, устройте спор и раскройте, человек это или машина.",
    },
    emoji: "🎧",
    format: foreground,
    durationMinutes: 12,
    durationLabel: { en: "~5 rounds", ru: "~5 раундов" },
    supportedActs: ["classic", "bar"],
    minPlayers: 1,
    capabilities: ["speakers"],
    recommendationPriority: { classic: 40, bar: 30 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "bar"],
      minPlayers: 1,
    }),
    roundIdPrefix: "tg",
    stateKey: "trackguess",
    launch: (state, { roundId }) => launchTrackGuessState(state, roundId),
    isReady: (state) => Boolean(state.trackguess),
    phase: (state) => state.trackguess?.phase ?? null,
  }),
  spectrumcourt: defineGame({
    id: "spectrumcourt",
    title: "Spectrum Court",
    localizedTitle: { en: "Spectrum Court", ru: "Суд Спектра" },
    description: {
      en: "One clue, a hidden scale and several teams loudly defending suspiciously precise guesses.",
      ru: "Одна подсказка, скрытая шкала и команды, защищающие подозрительно точные догадки.",
    },
    emoji: "⚖️",
    format: foreground,
    durationMinutes: 15,
    durationLabel: { en: "~4 rounds", ru: "~4 раунда" },
    supportedActs: ["classic", "bar"],
    minPlayers: 2,
    minActiveTeams: 2,
    capabilities: [],
    recommendationPriority: { classic: 50, bar: 20 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "bar"],
      minPlayers: 2,
      minActiveTeams: 2,
    }),
    roundIdPrefix: "sc",
    stateKey: "spectrumcourt",
    launch: (state, { roundId }) => launchSpectrumCourtState(state, roundId),
    isReady: (state) => Boolean(state.spectrumcourt),
    phase: (state) => state.spectrumcourt?.phase ?? null,
  }),
  whoamong: defineGame({
    id: "whoamong",
    title: "Who Among Us",
    localizedTitle: { en: "Who Among Us", ru: "Кто из нас" },
    description: {
      en: "Secretly vote on pointed questions and find out what the room has noticed about you.",
      ru: "Тайно голосуйте по острым вопросам и узнайте, что зал успел о вас заметить.",
    },
    emoji: "🕵️",
    format: foreground,
    durationMinutes: 12,
    durationLabel: { en: "~5 rounds", ru: "~5 раундов" },
    supportedActs: ["classic", "bar", "finale"],
    minPlayers: 3,
    capabilities: [],
    recommendationPriority: { classic: 60, bar: 10, finale: 10 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "bar", "finale"],
      minPlayers: 3,
    }),
    roundIdPrefix: "wa",
    stateKey: "whoamong",
    launch: (state, { roundId }) => launchWhoAmongState(state, roundId),
    isReady: (state) => Boolean(state.whoamong),
    phase: (state) => state.whoamong?.phase ?? null,
  }),
  impostor: defineGame({
    id: "impostor",
    title: "Who's the Bot?",
    localizedTitle: { en: "Who's the Bot?", ru: "Кто здесь бот?" },
    description: {
      en: "Everyone writes a witty answer, AI slips one in, and the table hunts the machine.",
      ru: "Все пишут остроумные ответы, AI подмешивает свой, а стол ищет машину.",
    },
    emoji: "🤖",
    format: foreground,
    durationMinutes: 15,
    durationLabel: { en: "~4 rounds", ru: "~4 раунда" },
    supportedActs: ["classic", "bar"],
    minPlayers: 3,
    capabilities: [],
    recommendationPriority: { classic: 70, bar: 40 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "bar"],
      minPlayers: 3,
    }),
    roundIdPrefix: "imp",
    stateKey: "impostor",
    launch: (state, { roundId }) => launchImpostorState(state, roundId),
    isReady: (state) => Boolean(state.impostor),
    phase: (state) => state.impostor?.phase ?? null,
  }),
} satisfies Record<LegacyGameId, GameDefinition>;

export const PARTY_GAME_REGISTRY = {
  grilloracle: defineGame({
    id: "grilloracle",
    title: "Grill Oracle",
    localizedTitle: { en: "Grill Oracle", ru: "Гриль-Оракул" },
    description: {
      en: "Photograph something from the fire or bar; AI reads the evidence and writes three private predictions for later.",
      ru: "Сфотографируйте улику с гриля или из бара; AI прочитает её и оставит три личных предсказания на потом.",
    },
    emoji: "🔮",
    format: foreground,
    durationMinutes: 15,
    durationLabel: { en: "~15 minutes", ru: "~15 минут" },
    supportedActs: ["grill", "bar"],
    minPlayers: 1,
    capabilities: ["camera", "vision"],
    recommendationPriority: { grill: 1, bar: 1 },
    availability: availabilityPolicy({
      supportedActs: ["grill", "bar"],
      minPlayers: 1,
    }),
    roundIdPrefix: "oracle",
    stateKey: "grilloracle",
    launch: (state, { roundId, now }) => launchGrillOracleState(state, roundId, now),
    isReady: (state) => Boolean(state.grilloracle),
    phase: (state) => state.grilloracle?.phase ?? null,
  }),
  smokescreen: defineGame({
    id: "smokescreen",
    title: "Smoke Screen",
    localizedTitle: { en: "Smoke Screen", ru: "Дымовая Завеса" },
    description: {
      en: "Deal private venue-aware missions in the background, then expose the anonymous evidence and hunt the culprits.",
      ru: "Раздайте тайные миссии из реальной обстановки фоном, а позже вскройте анонимные улики и вычислите исполнителей.",
    },
    emoji: "🕵️",
    format: background,
    durationMinutes: 15,
    durationLabel: { en: "2 min deal + 15 min reveal", ru: "2 мин раздача + 15 мин reveal" },
    supportedActs: ["classic", "grill", "bar"],
    minPlayers: 3,
    capabilities: [],
    recommendationPriority: { grill: 0, bar: 0 },
    availability: availabilityPolicy({
      supportedActs: ["classic", "grill", "bar"],
      minPlayers: 3,
    }),
    roundIdPrefix: "smoke",
    stateKey: "smokescreen",
    launch: (state, { roundId, now }) => launchSmokeScreenState(state, roundId, now),
    isReady: (state) => Boolean(state.smokescreen),
    phase: (state) => state.smokescreen?.status ?? null,
  }),
  contraband: defineGame({
    id: "contraband",
    title: "Contraband",
    localizedTitle: { en: "Contraband", ru: "Контрабанда" },
    description: {
      en: "Hide one suspicious phrase in real bar conversation while everyone listens for a verbal border crossing.",
      ru: "Вплетите одну подозрительную фразу в живой разговор, пока весь бар слушает словесную границу.",
    },
    emoji: "🛃",
    format: background,
    durationMinutes: 30,
    durationLabel: { en: "30 minutes in the background", ru: "30 минут в фоне" },
    supportedActs: ["bar"],
    minPlayers: 3,
    maxPlayers: 30,
    capabilities: ["microphone", "stt"],
    recommendationPriority: { bar: 1 },
    availability: availabilityPolicy({ supportedActs: ["bar"], minPlayers: 3, maxPlayers: 30 }),
    roundIdPrefix: "contraband",
    stateKey: "contraband",
    launch: (state, { roundId, now }) => launchContrabandState(state, roundId, now),
    isReady: (state) => Boolean(state.contraband),
    phase: (state) => state.contraband?.status ?? null,
  }),
  tongsoftruth: defineGame({
    id: "tongsoftruth",
    title: "Tongs of Truth",
    localizedTitle: { en: "Tongs of Truth", ru: "Щипцы Правды" },
    description: {
      en: "Pass the real grill tongs, answer one pointed question, and let AI score specificity, evasiveness and stagecraft — never factual truth.",
      ru: "Передавайте настоящие щипцы, отвечайте на один острый вопрос, а AI оценит конкретику, уклончивость и артистизм — но не фактическую правду.",
    },
    emoji: "🍢",
    format: background,
    durationMinutes: 2,
    durationLabel: { en: "~2 minutes per turn", ru: "~2 минуты на ход" },
    supportedActs: ["grill"],
    minPlayers: 3,
    maxPlayers: 30,
    capabilities: ["microphone", "stt"],
    recommendationPriority: { grill: 1 },
    availability: availabilityPolicy({ supportedActs: ["grill"], minPlayers: 3, maxPlayers: 30 }),
    roundIdPrefix: "tongs",
    stateKey: "tongsoftruth",
    launch: (state, { roundId, random }) => launchTongsOfTruthState(state, roundId, random),
    isReady: (state) => Boolean(state.tongsoftruth),
    phase: (state) => state.tongsoftruth?.status ?? null,
  }),
  crossexamination: defineGame({
    id: "crossexamination",
    title: "Cross Examination",
    localizedTitle: { en: "Cross Examination", ru: "Перекрёстный Допрос" },
    description: {
      en: "Two accomplices answer separately about the real evening; the room predicts where their shared alibi will split.",
      ru: "Два подельника порознь вспоминают реальный вечер, а зал предсказывает, где треснет общее алиби.",
    },
    emoji: "🚨",
    format: foreground,
    durationMinutes: 20,
    durationLabel: { en: "3–4 pairs · ~20 minutes", ru: "3–4 пары · ~20 минут" },
    supportedActs: ["bar", "finale"],
    minPlayers: 6,
    maxPlayers: 30,
    capabilities: ["microphone", "stt"],
    recommendationPriority: { bar: 5, finale: 0 },
    availability: availabilityPolicy({
      supportedActs: ["bar", "finale"],
      minPlayers: 6,
      maxPlayers: 30,
    }),
    roundIdPrefix: "cross",
    stateKey: "crossexamination",
    launch: (state, { roundId, random }) => launchCrossExaminationState(state, roundId, random),
    isReady: (state) => Boolean(state.crossexamination),
    phase: (state) => state.crossexamination?.status ?? null,
  }),
  toastsyndicate: defineGame({
    id: "toastsyndicate",
    title: "Toast Syndicate",
    localizedTitle: { en: "Toast Syndicate", ru: "Синдикат Тостов" },
    description: {
      en: "Smuggle three absurd words through a live toast while the room tries to catch the contraband.",
      ru: "Провезите три абсурдных слова через живой тост, пока зал пытается поймать контрабанду.",
    },
    emoji: "🥂",
    format: foreground,
    durationMinutes: 25,
    durationLabel: { en: "6 toasts · ~25 minutes", ru: "6 тостов · ~25 минут" },
    supportedActs: ["bar"],
    minPlayers: 3,
    capabilities: ["microphone", "stt"],
    recommendationPriority: { bar: 2 },
    availability: availabilityPolicy({ supportedActs: ["bar"], minPlayers: 3 }),
    roundIdPrefix: "toast",
    stateKey: "toastsyndicate",
    launch: (state, { roundId, random }) => launchToastSyndicateState(state, roundId, random),
    isReady: (state) => Boolean(state.toastsyndicate),
    phase: (state) => state.toastsyndicate?.phase ?? null,
  }),
  stilllife: defineGame({
    id: "stilllife",
    title: "Still Life Survival",
    localizedTitle: { en: "Still Life Survival", ru: "Натюрморт: Выживание" },
    description: {
      en: "Build a dramatic installation from real food and utensils; an AI auction critic judges the evidence.",
      ru: "Соберите драматическую инсталляцию из настоящей еды и утвари; AI-критик оценит лот.",
    },
    emoji: "🥒",
    format: foreground,
    durationMinutes: 20,
    durationLabel: { en: "2 lots · ~20 minutes", ru: "2 лота · ~20 минут" },
    supportedActs: ["grill", "bar"],
    minPlayers: 2,
    minActiveTeams: 2,
    capabilities: ["camera", "vision"],
    recommendationPriority: { grill: 3, bar: 60 },
    availability: availabilityPolicy({
      supportedActs: ["grill", "bar"],
      minPlayers: 2,
      minActiveTeams: 2,
    }),
    roundIdPrefix: "still",
    stateKey: "stilllife",
    launch: (state, { roundId }) => launchStillLifeState(state, roundId),
    isReady: (state) => Boolean(state.stilllife),
    phase: (state) => state.stilllife?.phase ?? null,
  }),
  sommelier: defineGame({
    id: "sommelier",
    title: "Sommelier Charlatan",
    localizedTitle: { en: "Sommelier Charlatan", ru: "Сомелье-Шарлатан" },
    description: {
      en: "Photograph real drinks anonymously; AI profiles their owners and the room identifies the glass.",
      ru: "Тайно сфотографируйте реальные напитки; AI составит портреты владельцев, а зал вычислит бокал.",
    },
    emoji: "🍷",
    format: foreground,
    durationMinutes: 20,
    durationLabel: { en: "up to 10 drinks · ~20 minutes", ru: "до 10 напитков · ~20 минут" },
    supportedActs: ["bar"],
    minPlayers: 3,
    capabilities: ["camera", "vision"],
    recommendationPriority: { bar: 1 },
    availability: availabilityPolicy({ supportedActs: ["bar"], minPlayers: 3 }),
    roundIdPrefix: "somm",
    stateKey: "sommelier",
    launch: (state, { roundId, random, now }) => launchSommelierState(state, roundId, random, now),
    isReady: (state) => Boolean(state.sommelier),
    phase: (state) => state.sommelier?.phase ?? null,
  }),
} satisfies Record<Exclude<GameId, LegacyGameId>, GameDefinition>;

export const GAME_REGISTRY = {
  ...LEGACY_GAME_REGISTRY,
  ...PARTY_GAME_REGISTRY,
} satisfies Record<GameId, GameDefinition>;

export function isLegacyGameId(gameId: GameId): gameId is LegacyGameId {
  return (LEGACY_GAME_IDS as readonly string[]).includes(gameId);
}

export function getGame(gameId: GameId): GameDefinition {
  return GAME_REGISTRY[gameId];
}

export function launchGame(
  state: RoomState,
  gameId: GameId,
  options: LaunchGameOptions,
): RoomState | null {
  return getGame(gameId).launch(state, options);
}

export function activeGame(state: RoomState): GameDefinition | null {
  return state.currentGame ? getGame(state.currentGame) : null;
}

export function activeGamePhase(state: RoomState): string | null {
  return activeGame(state)?.phase(state) ?? null;
}

export function hasReadyGameState(state: RoomState): boolean {
  return activeGame(state)?.isReady(state) ?? false;
}

export function getLegacyGame(gameId: LegacyGameId): LegacyGameDefinition {
  return LEGACY_GAME_REGISTRY[gameId];
}

export function launchLegacyGame(
  state: RoomState,
  gameId: LegacyGameId,
  options: LaunchGameOptions,
): RoomState | null {
  return getLegacyGame(gameId).launch(state, options);
}

export function activeLegacyGame(state: RoomState): LegacyGameDefinition | null {
  return state.currentGame && isLegacyGameId(state.currentGame)
    ? getLegacyGame(state.currentGame)
    : null;
}

export function activeLegacyGamePhase(state: RoomState): string | null {
  return activeLegacyGame(state)?.phase(state) ?? null;
}

export function hasReadyLegacyGameState(state: RoomState): boolean {
  return activeLegacyGame(state)?.isReady(state) ?? false;
}

export function legacyRoomSummary(state: RoomState): LegacyRoomSummary {
  const activeTeamIds = new Set(state.players.map((player) => player.teamId));
  const connectedExtraSpeakers = [2, 3, 4, 5].filter(
    (slot) => state.speakerSlots?.[slot]?.connected,
  ).length;
  return {
    playerCount: state.players.length,
    activeTeamCount: activeTeamIds.size,
    connectedExtraSpeakers,
  };
}

export function getLegacyGameAvailability(
  definition: LegacyGameDefinition,
  context: PartyContext,
  state: RoomState,
): GameAvailability {
  return definition.availability(context, legacyRoomSummary(state));
}

export function getGameAvailability(
  definition: GameDefinition,
  context: PartyContext,
  state: RoomState,
): GameAvailability {
  return definition.availability(context, legacyRoomSummary(state));
}

export function getRecommendedGames(
  state: RoomState,
  context: PartyContext,
): Array<{ game: GameDefinition; availability: GameAvailability }> {
  const statusRank: Record<GameAvailabilityStatus, number> = {
    recommended: 0,
    available: 1,
    blocked: 2,
  };
  return GAME_IDS.map((id) => {
    const game = getGame(id);
    return { game, availability: getGameAvailability(game, context, state) };
  }).sort(
    (a, b) =>
      statusRank[a.availability.status] - statusRank[b.availability.status] ||
      (a.game.recommendationPriority[context.actId] ?? 100) -
        (b.game.recommendationPriority[context.actId] ?? 100) ||
      a.game.title.localeCompare(b.game.title),
  );
}

export function getRecommendedLegacyGames(
  state: RoomState,
  context: PartyContext,
): Array<{ game: LegacyGameDefinition; availability: GameAvailability }> {
  const statusRank: Record<GameAvailabilityStatus, number> = {
    recommended: 0,
    available: 1,
    blocked: 2,
  };
  return LEGACY_GAME_IDS.map((id) => {
    const game = getLegacyGame(id);
    return { game, availability: getLegacyGameAvailability(game, context, state) };
  }).sort(
    (a, b) =>
      statusRank[a.availability.status] - statusRank[b.availability.status] ||
      (a.game.recommendationPriority[context.actId] ?? 100) -
        (b.game.recommendationPriority[context.actId] ?? 100) ||
      a.game.title.localeCompare(b.game.title),
  );
}
