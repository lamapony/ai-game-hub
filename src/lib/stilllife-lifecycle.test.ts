import { describe, expect, test } from "bun:test";
import type { StillLifeJudgment } from "@/games/stilllife/model";
import {
  scoreStillLifeRound,
  stillLifeJudgmentPoints,
  stillLifeRequestSchema,
} from "./stilllife-lifecycle";

function judgment(overrides: Partial<StillLifeJudgment> = {}): StillLifeJudgment {
  return {
    composition_score: 8,
    drama_score: 9,
    material_score: 5,
    catalog_title: "Огурец. Исход. Фольга",
    auction_price_dkk: 1_240_750,
    critique: "Снобизм одобряет этот наклон.",
    points: 0,
    ...overrides,
  };
}

describe("Still Life Survival lifecycle contract", () => {
  test("ignores the model points field and sums only bounded criteria", () => {
    expect(stillLifeJudgmentPoints(judgment({ points: 0 }))).toBe(22);
    expect(stillLifeJudgmentPoints(judgment({ points: 25 }))).toBe(22);
  });

  test("uses audience votes only to break a jury-score tie", () => {
    const result = scoreStillLifeRound({
      roundId: "still_r1",
      headline: "Последний огурец покидает лодку",
      judgments: [
        {
          teamId: "forest",
          teamName: "Forest",
          judgment: judgment(),
          aiFallback: false,
          manualOverride: false,
        },
        {
          teamId: "lake",
          teamName: "Lake",
          judgment: judgment({ catalog_title: "Лодка больше не отвечает" }),
          aiFallback: false,
          manualOverride: false,
        },
      ],
      votes: [
        { playerId: "p1", teamId: "lake" },
        { playerId: "p2", teamId: "lake" },
        { playerId: "p2", teamId: "forest" },
      ],
    });
    expect(result.winningTeamIds).toEqual(["lake"]);
    expect(result.entries.find((entry) => entry.teamId === "lake")?.audienceVotes).toBe(2);
  });

  test("a lower jury score cannot be overturned by audience popularity", () => {
    const result = scoreStillLifeRound({
      roundId: "still_r1",
      headline: "Переговоры шампуров",
      judgments: [
        {
          teamId: "forest",
          teamName: "Forest",
          judgment: judgment(),
          aiFallback: false,
          manualOverride: false,
        },
        {
          teamId: "lake",
          teamName: "Lake",
          judgment: judgment({ composition_score: 7 }),
          aiFallback: false,
          manualOverride: false,
        },
      ],
      votes: Array.from({ length: 10 }, (_, index) => ({
        playerId: `p${index}`,
        teamId: "lake",
      })),
    });
    expect(result.winningTeamIds).toEqual(["forest"]);
  });

  test("validates bounded manual jury scores and strict player ballots", () => {
    expect(
      stillLifeRequestSchema.safeParse({
        roomId: "room",
        roundId: "round",
        action: "judge",
        manualScores: [
          { teamId: "forest", compositionScore: 10, dramaScore: 8, materialScore: 5 },
          { teamId: "lake", compositionScore: 7, dramaScore: 9, materialScore: 4 },
        ],
      }).success,
    ).toBe(true);
    expect(
      stillLifeRequestSchema.safeParse({
        roomId: "room",
        roundId: "round",
        action: "judge",
        manualScores: [
          { teamId: "forest", compositionScore: 11, dramaScore: 8, materialScore: 5 },
          { teamId: "lake", compositionScore: 7, dramaScore: 9, materialScore: 4 },
        ],
      }).success,
    ).toBe(false);
    expect(
      stillLifeRequestSchema.safeParse({
        roomId: "room",
        roundId: "round",
        action: "vote",
        playerId: "p1",
        teamId: "lake",
        extra: true,
      }).success,
    ).toBe(false);
  });
});
