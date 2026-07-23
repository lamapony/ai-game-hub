export const LEGACY_GAME_IDS = [
  "soundscape",
  "challenge",
  "phototunt",
  "trackguess",
  "spectrumcourt",
  "whoamong",
  "impostor",
] as const;

export type LegacyGameId = (typeof LEGACY_GAME_IDS)[number];

export const PARTY_GAME_IDS = [
  "grilloracle",
  "smokescreen",
  "toastsyndicate",
  "stilllife",
  "sommelier",
  "contraband",
  "tongsoftruth",
  "crossexamination",
] as const;

export type PartyGameId = (typeof PARTY_GAME_IDS)[number];

export const GAME_IDS = [...LEGACY_GAME_IDS, ...PARTY_GAME_IDS] as const;

export type GameId = (typeof GAME_IDS)[number];
