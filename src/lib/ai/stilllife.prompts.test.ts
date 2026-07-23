import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import {
  stillLifeHeadlineSpec,
  stillLifeJudgmentSpec,
  STILL_LIFE_FALLBACK_HEADLINES,
} from "./stilllife.prompts";

const context = contextForExperience("smoke-neon-norrebro", "normal");

describe("Still Life Survival prompts", () => {
  test("generates one non-recent localized fallback headline deterministically", () => {
    const input = {
      seed: 0,
      recentHeadlines: [STILL_LIFE_FALLBACK_HEADLINES.ru[0]!],
    };
    const first = stillLifeHeadlineSpec.fallback(input, context);
    const replay = stillLifeHeadlineSpec.fallback(input, context);
    expect(first).toEqual(replay);
    expect(first.headlines).toHaveLength(1);
    expect(first.headlines[0] === input.recentHeadlines[0]).toBe(false);
    expect(stillLifeHeadlineSpec.outputSchema.safeParse(first).success).toBe(true);
  });

  test("keeps the exact vision schema, few-shots and +5 environment rubric", () => {
    const system = stillLifeJudgmentSpec.buildSystem(context);
    const user = stillLifeJudgmentSpec.buildUser(
      {
        teamName: "Forest",
        headline: "Последний огурец покидает лодку",
        imageUrl: "https://example.test/still.jpg",
        seed: 11,
      },
      context,
    );
    expect(system).toContain("composition_score");
    expect(system).toContain("material_score");
    expect(system).toContain("exact +0–5 ENVIRONMENT bonus");
    expect(system).toContain("Огурец. Исход. Фольга");
    expect(Array.isArray(user)).toBe(true);
    expect(JSON.stringify(user)).toContain("image_url");
  });

  test("returns a schema-valid deterministic non-AI judgment", () => {
    const input = {
      teamName: "Lake",
      headline: "Переговоры шампуров зашли в тупик",
      imageUrl: "https://example.test/still.jpg",
      seed: 27,
    };
    const fallback = stillLifeJudgmentSpec.fallback(input, context);
    expect(fallback).toEqual(stillLifeJudgmentSpec.fallback(input, context));
    expect(stillLifeJudgmentSpec.outputSchema.safeParse(fallback).success).toBe(true);
    expect(fallback.points).toBe(
      fallback.composition_score + fallback.drama_score + fallback.material_score,
    );
  });
});
