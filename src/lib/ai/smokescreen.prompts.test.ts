import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { smokeScreenGenerationSpec, smokeScreenRecapSpec } from "./smokescreen.prompts";

describe("Smoke Screen prompt contracts", () => {
  test("generation is strict, calibrated and makes the current environment a mechanic", () => {
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    const system = smokeScreenGenerationSpec.buildSystem(grill);
    const user = smokeScreenGenerationSpec.buildUser(
      { count: 4, existingMissionTexts: ["old mission"] },
      grill,
    );

    expect(system).toContain("STRICT JSON SCHEMA");
    expect(system).toContain("+5 for using the current environment");
    expect(system).toContain("smoke, fire, tongs");
    expect(system).toContain("кетчуп");
    expect(user).toContain("exactly 4 missions");
    expect(user).toContain("old mission");
  });

  test("fallbacks are schema-valid, exact-count and localized", () => {
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    const deck = smokeScreenGenerationSpec.fallback({ count: 12, existingMissionTexts: [] }, grill);
    const recap = smokeScreenRecapSpec.fallback(
      {
        results: [{ player: "Ада", mission: "Миссия", wasCaught: false, topSuspect: "никто" }],
        bestDetective: "Лена",
      },
      { ...grill, actId: "bar", venue: "bar" },
    );
    const barDeck = smokeScreenGenerationSpec.fallback(
      { count: 6, existingMissionTexts: [] },
      { ...grill, actId: "bar", venue: "bar" },
    );

    expect(deck.missions).toHaveLength(12);
    expect(new Set(deck.missions.map((mission) => mission.text)).size).toBe(12);
    expect(smokeScreenGenerationSpec.outputSchema.safeParse(deck).success).toBe(true);
    expect(smokeScreenRecapSpec.outputSchema.safeParse(recap).success).toBe(true);
    expect(recap.recap).toContain("Лена");
    expect(barDeck.missions.some((mission) => mission.text.includes("бокал"))).toBe(true);
    expect(barDeck.missions.some((mission) => mission.text.includes("щипц"))).toBe(false);
  });

  test("single-act venues get their own physical mission vocabulary", () => {
    const venues = [
      { experienceId: "park-story" as const, systemNeedle: "benches", missionNeedle: "bench" },
      { experienceId: "house-party" as const, systemNeedle: "fridge", missionNeedle: "fridge" },
      {
        experienceId: "festival-field" as const,
        systemNeedle: "wristbands",
        missionNeedle: "wristband",
      },
    ];

    for (const { experienceId, systemNeedle, missionNeedle } of venues) {
      const context = contextForExperience(experienceId, "compact");
      const system = smokeScreenGenerationSpec.buildSystem(context);
      const deck = smokeScreenGenerationSpec.fallback(
        { count: 8, existingMissionTexts: [] },
        context,
      );
      const recap = smokeScreenRecapSpec.fallback(
        {
          results: [{ player: "Ada", mission: "Mission", wasCaught: false, topSuspect: "none" }],
        },
        context,
      );

      expect(system.toLowerCase()).toContain(systemNeedle);
      expect(deck.missions).toHaveLength(8);
      expect(new Set(deck.missions.map((mission) => mission.text)).size).toBe(8);
      expect(
        deck.missions.some((mission) => mission.text.toLowerCase().includes(missionNeedle)),
      ).toBe(true);
      expect(smokeScreenGenerationSpec.outputSchema.safeParse(deck).success).toBe(true);
      expect(recap.recap.includes("grill")).toBe(false);
    }
  });
});
