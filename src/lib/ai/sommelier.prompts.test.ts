import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { sommelierProfileSchema } from "@/games/sommelier/model";
import {
  buildSommelierFallbackProfile,
  sommelierVisionJsonSchema,
  sommelierVisionSpec,
} from "./sommelier.prompts";

const bar = {
  ...contextForExperience("smoke-neon-norrebro", "normal"),
  actId: "bar" as const,
  venue: "bar" as const,
};

describe("Sommelier Charlatan prompt", () => {
  test("keeps the exact strict vision schema from the specification", () => {
    expect(sommelierVisionJsonSchema.name).toBe("sommelier_charlatan_profile");
    expect(sommelierVisionJsonSchema.schema.additionalProperties).toBe(false);
    expect(
      sommelierProfileSchema.safeParse({
        drink_guess: "Lager",
        tasting_notes: "Monday",
        owner_profile:
          "This portrait is deliberately long enough to be the main content of the live game.",
        pretentiousness: 0,
        pairing_advice: "Fries",
      }).success,
    ).toBe(false);
  });

  test("includes two few-shots, strict JSON and the real bar environment rubric", () => {
    const system = sommelierVisionSpec.buildSystem(bar);
    const user = sommelierVisionSpec.buildUser(
      {
        imageUrl: "https://example.test/drink.jpg",
        seed: 7,
      },
      bar,
    );

    expect(system).toContain("STRICT JSON SCHEMA");
    expect(system).toContain("+0–5 ENVIRONMENT");
    expect(system).toContain("actual glass");
    expect(system).toContain("лагер в бутылке");
    expect(system).toContain("коктейль с розмарином и дымом");
    expect(Array.isArray(user)).toBe(true);
  });

  test("has a safe deterministic schema-valid fallback", () => {
    const first = buildSommelierFallbackProfile(
      { imageUrl: "https://example.test/drink.jpg", seed: 11 },
      bar,
    );
    const second = buildSommelierFallbackProfile(
      { imageUrl: "https://example.test/drink.jpg", seed: 11 },
      bar,
    );

    expect(first).toEqual(second);
    expect(sommelierProfileSchema.safeParse(first).success).toBe(true);
  });
});
