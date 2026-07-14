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
