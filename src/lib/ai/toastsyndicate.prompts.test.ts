import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { toastAssignmentSpec, toastJudgmentSpec } from "./toastsyndicate.prompts";

describe("Toast Syndicate prompts", () => {
  const context = {
    ...contextForExperience("smoke-neon-norrebro", "normal"),
    actId: "bar" as const,
    venue: "bar" as const,
  };

  test("builds strict assignment and judgment fallbacks", () => {
    const assignment = toastAssignmentSpec.fallback(
      { seed: 42, recentGenreIds: [], recentWordIds: [] },
      context,
    );
    expect(toastAssignmentSpec.outputSchema.safeParse(assignment).success).toBe(true);
    expect(new Set(assignment.words.map((word) => word.id)).size).toBe(3);
    const judgment = toastJudgmentSpec.fallback(
      {
        playerName: "Ada",
        assignment,
        transcript: `Tonight is a ${assignment.words[0]!.text}.`,
        caughtWords: [],
      },
      context,
    );
    expect(toastJudgmentSpec.outputSchema.safeParse(judgment).success).toBe(true);
  });

  test("keeps strict JSON, few-shots and the environment bonus in both prompts", () => {
    for (const spec of [toastAssignmentSpec, toastJudgmentSpec]) {
      const system = spec.buildSystem(context);
      expect(system).toContain("STRICT JSON SCHEMA");
      expect(system).toContain("FEW-SHOT EXAMPLES");
      expect(system).toContain("+5");
    }
  });
});
