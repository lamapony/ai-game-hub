import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { legacyPartyContext } from "../party-context";
import {
  classicImpostorQuestionSpec,
  partyImpostorAnswerSpec,
  partyImpostorQuestionSpec,
  partyImpostorRevealSpec,
  preparedFirstImpostorQuestion,
} from "./impostor.prompts";

describe("Who's the Bot prompt contracts", () => {
  test("classic keeps the legacy location copy", () => {
    const prompt = classicImpostorQuestionSpec.buildUser(
      { pastQuestions: [] },
      legacyPartyContext("bar"),
    );
    if (typeof prompt !== "string")
      throw new Error("classic question prompt must remain text-only");
    expect(prompt).toContain("LOCATION: a cozy bar (bodega)");
    expect(prompt.includes("CURRENT SERVER ACT")).toBe(false);
  });

  test("party question, answer and reveal all inherit the current bar act", () => {
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    const bar = { ...grill, actId: "bar" as const, venue: "bar" as const };
    for (const spec of [
      partyImpostorQuestionSpec,
      partyImpostorAnswerSpec,
      partyImpostorRevealSpec,
    ]) {
      const system = spec.buildSystem(bar);
      expect(system).toContain("Viggos Bar");
      expect(system).toContain("Write every player-facing string in Russian");
      expect(system).toContain("FEW-SHOT EXAMPLES");
    }
  });

  test("keeps offline opening questions local to the actual venue and content language", () => {
    const home = contextForExperience("house-party", "normal");
    const festival = contextForExperience("festival-field", "normal");
    const park = contextForExperience("park-story", "normal");
    const bar = contextForExperience("bar-night", "normal");
    const grill = contextForExperience("smoke-neon-norrebro", "normal");

    expect(partyImpostorQuestionSpec.fallback({ pastQuestions: [] }, home).question).toContain(
      "home",
    );
    expect(partyImpostorQuestionSpec.fallback({ pastQuestions: [] }, festival).question).toContain(
      "wristband",
    );
    expect(partyImpostorQuestionSpec.fallback({ pastQuestions: [] }, park).question).toContain(
      "bench",
    );
    expect(partyImpostorQuestionSpec.fallback({ pastQuestions: [] }, bar).question).toContain(
      "glass",
    );
    expect(partyImpostorQuestionSpec.fallback({ pastQuestions: [] }, grill).question).toContain(
      "дым",
    );
  });

  test("accepts one schema-valid prepared first question and never reuses it in later rounds", () => {
    const home = contextForExperience("house-party", "normal");
    const prepared = {
      question: "Which lamp has the strongest opinion about tonight's guests?",
      intro: "The furniture has begun giving evidence.",
    };

    expect(preparedFirstImpostorQuestion(prepared, home, [])).toEqual(prepared);
    expect(preparedFirstImpostorQuestion({ ...prepared, extra: true }, home, [])).toBeNull();
    expect(preparedFirstImpostorQuestion(prepared, home, ["An earlier question"])).toBeNull();
  });
});
