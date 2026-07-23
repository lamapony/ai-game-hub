import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { contrabandArbitrationSpec, contrabandGenerationSpec } from "./contraband.prompts";

const context = {
  ...contextForExperience("smoke-neon-norrebro", "normal"),
  actId: "bar" as const,
  venue: "bar" as const,
};

describe("Contraband prompt contracts", () => {
  test("uses strict JSON and the bar environment rubric", () => {
    const system = contrabandArbitrationSpec.buildSystem(context);
    expect(system).toContain("organic_score");
    expect(system).toContain("+5 environment");
    expect(contrabandArbitrationSpec.jsonSchema.schema.additionalProperties).toBe(false);
  });

  test("has an exact-size offline phrase fallback", () => {
    const result = contrabandGenerationSpec.fallback(
      { count: 30, seed: 4, recentPhrases: [] },
      context,
    );
    expect(result.phrases).toHaveLength(30);
    expect(new Set(result.phrases).size).toBe(30);
  });
});
