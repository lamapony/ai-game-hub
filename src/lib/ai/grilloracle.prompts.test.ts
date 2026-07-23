import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { oracleReadingSchema } from "@/games/grilloracle/model";
import {
  buildOracleFallbackReading,
  grillOracleReadingSpec,
  oracleReadingJsonSchema,
} from "./grilloracle.prompts";

const validReading = {
  item_guess: "A zucchini with a police file",
  doneness_verdict: "Charred past plausible deniability.",
  prophecy: "The ash points at the bar. Your schedule will object and lose.",
  predictions: ["You will make a toast", "You will fetch a drink", "You will ask for a charger"],
  char_reading_style: "by the ash",
  points: 12,
};

describe("Grill Oracle prompt contract", () => {
  test("requires the exact source schema and exactly three predictions", () => {
    expect(oracleReadingSchema.safeParse(validReading).success).toBe(true);
    expect(
      oracleReadingSchema.safeParse({
        ...validReading,
        predictions: validReading.predictions.slice(0, 2),
      }).success,
    ).toBe(false);
    expect(
      oracleReadingSchema.safeParse({
        ...validReading,
        predictions: [...validReading.predictions, "Fourth"],
      }).success,
    ).toBe(false);
    expect(oracleReadingSchema.safeParse({ ...validReading, rank: 1 }).success).toBe(false);
    expect(oracleReadingJsonSchema.schema.type).toBe("object");
    expect(oracleReadingJsonSchema.schema.additionalProperties).toBe(false);
  });

  test("builds a vision request with server-derived environment, rubric and few-shots", () => {
    const context = contextForExperience("smoke-neon-norrebro", "normal");
    const system = grillOracleReadingSpec.buildSystem(context);
    const user = grillOracleReadingSpec.buildUser(
      { playerName: "Ada", imageUrl: "https://example.test/private.jpg" },
      context,
    );

    expect(system).toContain("Grønningen Nordvest");
    expect(system).toContain("+5 only when the current environment");
    expect(system).toContain("почерневший кабачок");
    expect(system).toContain('"minItems":3');
    expect(Array.isArray(user)).toBe(true);
    expect(Array.isArray(user) && user.some((part) => part.type === "image_url")).toBe(true);
  });

  test("manual fallback remains local, private-ready and schema-valid", () => {
    const context = {
      ...contextForExperience("smoke-neon-norrebro", "normal"),
      contentLocale: "ru" as const,
    };
    const fallback = buildOracleFallbackReading({
      playerName: "Ада",
      itemCategory: "vegetable",
      doneness: "incinerated",
      context,
    });

    expect(oracleReadingSchema.safeParse(fallback).success).toBe(true);
    expect(fallback.predictions).toHaveLength(3);
    expect(fallback.points).toBe(15);
    expect(fallback.prophecy).toContain("Ада");
  });
});
