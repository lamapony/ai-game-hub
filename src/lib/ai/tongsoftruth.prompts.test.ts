import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { tongsJudgmentSpec, tongsQuestionSpec } from "./tongsoftruth.prompts";

const context = contextForExperience("smoke-neon-norrebro", "normal");

describe("Tongs of Truth prompt contracts", () => {
  test("uses strict JSON, few-shots, a real +5 environment flag and no deception claim", () => {
    const system = tongsJudgmentSpec.buildSystem(context);
    expect(system).toContain("+5 environment");
    expect(system).toContain("cannot detect deception");
    expect(system).toContain("environment_used");
    expect(system).toContain("FEW-SHOT EXAMPLES");
    expect(tongsJudgmentSpec.jsonSchema.schema.additionalProperties).toBe(false);
  });

  test("provides safe exact offline questions for every heat level", () => {
    for (const level of [1, 2, 3] as const) {
      const output = tongsQuestionSpec.fallback(
        { playerName: "Ada", level, seed: level, recentQuestions: [] },
        context,
      );
      expect(output.question.length > 10).toBe(true);
      expect(/[?？]$/.test(output.question)).toBe(true);
    }
  });
});
