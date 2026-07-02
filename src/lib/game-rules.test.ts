import { describe, expect, test } from "bun:test";
import { GAME_IDS, GAME_RULES } from "./game-rules";
import type { GameId } from "./types";

const ALL_GAME_IDS: GameId[] = [
  "soundscape",
  "challenge",
  "phototunt",
  "trackguess",
  "spectrumcourt",
  "whoamong",
];

describe("game rules", () => {
  test("every GameId has rules with non-empty fields and 3-5 steps", () => {
    for (const id of ALL_GAME_IDS) {
      expect(GAME_IDS).toContain(id);
      const rules = GAME_RULES[id];
      expect(Boolean(rules.title.trim())).toBe(true);
      expect(Boolean(rules.emoji.trim())).toBe(true);
      expect(Boolean(rules.tagline.trim())).toBe(true);
      expect(Boolean(rules.scoring.trim())).toBe(true);
      expect(Boolean(rules.minPlayers.trim())).toBe(true);
      expect(rules.steps.length === 3 || rules.steps.length === 4 || rules.steps.length === 5).toBe(
        true,
      );
      for (const step of rules.steps) {
        expect(Boolean(step.trim())).toBe(true);
      }
    }
  });
});
