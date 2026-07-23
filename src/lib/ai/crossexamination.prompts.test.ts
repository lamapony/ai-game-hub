import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import {
  crossComparisonJsonSchema,
  crossComparisonSpec,
  crossQuestionsJsonSchema,
  crossQuestionsSpec,
} from "./crossexamination.prompts";

const context = contextForExperience("smoke-neon-norrebro", "normal");

describe("Cross Examination prompt contracts", () => {
  test("generates exactly four questions from host-approved real evidence", () => {
    const system = crossQuestionsSpec.buildSystem(context);
    expect(system).toContain("host-approved EVIDENCE");
    expect(system).toContain("this exact order");
    expect(system).toContain("+5");
    expect(system).toContain("FEW-SHOT EXAMPLES");
    expect(system).toContain("STRICT JSON");
    expect(crossQuestionsJsonSchema.schema.additionalProperties).toBe(false);

    const fallback = crossQuestionsSpec.fallback(
      {
        pairAName: "Ada",
        pairBName: "Bo",
        evidence: [{ tag: "foil", fact: "Wind carried the foil into a glass." }],
        previousQuestions: [],
      },
      context,
    );
    expect(fallback.questions).toHaveLength(4);
    expect(crossQuestionsSpec.outputSchema.safeParse(fallback).success).toBe(true);
  });

  test("limits AI comparison to short versions and leaves all numbers to the server", () => {
    const system = crossComparisonSpec.buildSystem(context);
    expect(system).toContain("never publish a full transcript");
    expect(system).toContain("server ignores and deterministically recomputes");
    expect(system).toContain("consistent 0");
    expect(system).toContain("+5");
    expect(system).toContain("FEW-SHOT EXAMPLES");
    expect(crossComparisonJsonSchema.schema.additionalProperties).toBe(false);
    const schema = crossComparisonJsonSchema.schema as {
      properties: { contradictions: { items: { additionalProperties: boolean } } };
    };
    expect(schema.properties.contradictions.items.additionalProperties).toBe(false);

    const fallback = crossComparisonSpec.fallback(
      {
        pairAName: "Ada",
        pairBName: "Bo",
        questions: [],
        transcriptA: "",
        transcriptB: "",
      },
      context,
    );
    expect(crossComparisonSpec.outputSchema.safeParse(fallback).success).toBe(true);
    expect(/host will compare|ведущий сверит/i.test(fallback.verdict)).toBe(true);
  });
});
