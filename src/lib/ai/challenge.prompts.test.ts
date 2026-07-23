import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { legacyPartyContext } from "../party-context";
import {
  classicChallengeTaskSpec,
  fallbackChallengeTask,
  finalizePartyChallengeJudgement,
  partyChallengeJudgementSchema,
  partyChallengeJudgementSpec,
  partyChallengeTaskSpec,
  preparedFirstChallengeTask,
} from "./challenge.prompts";

describe("Challenge prompt contracts", () => {
  test("classic task prompt preserves legacy park/bar context without party act text", () => {
    const input = { operatorName: "Dana", pastTasks: [] };
    const park = classicChallengeTaskSpec.buildUser(input, legacyPartyContext("park"));
    const bar = classicChallengeTaskSpec.buildUser(input, legacyPartyContext("bar"));

    if (typeof park !== "string" || typeof bar !== "string") {
      throw new Error("classic task prompts must remain text-only");
    }

    expect(park).toContain("LOCATION: city park, daytime");
    expect(park.includes("Grønningen Nordvest")).toBe(false);
    expect(bar).toContain("LOCATION: a cozy bar (bodega)");
    expect(bar.includes("Viggos Bar")).toBe(false);
    expect(classicChallengeTaskSpec.buildSystem(legacyPartyContext("park"))).toBe(
      "You are the park spirit, host of the DIMAS fest party. Voice: witty, energetic, a little sarcastic, like a friend who is also a master of ceremonies.\nAlways reply in English. Always reply with strict valid JSON, with no markdown wrappers.",
    );
  });

  test("party task follows the selected act instead of a client venue", () => {
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    const bar = { ...grill, actId: "bar" as const, venue: "bar" as const };
    expect(partyChallengeTaskSpec.buildSystem(grill)).toContain("огонь, дым, щипцы");
    expect(partyChallengeTaskSpec.buildSystem(bar)).toContain("Viggos Bar");
  });

  test("party task fallbacks stay local to all five venues and the content language", () => {
    const venues = [
      {
        context: contextForExperience("smoke-neon-norrebro", "normal"),
        enNeedle: "tongs",
        ruNeedle: "щипц",
      },
      {
        context: contextForExperience("bar-night", "normal"),
        enNeedle: "glasses",
        ruNeedle: "бокал",
      },
      {
        context: contextForExperience("house-party", "normal"),
        enNeedle: "fridge",
        ruNeedle: "холодильник",
      },
      {
        context: contextForExperience("festival-field", "normal"),
        enNeedle: "wristband",
        ruNeedle: "браслет",
      },
      {
        context: contextForExperience("park-story", "normal"),
        enNeedle: "bench",
        ruNeedle: "скамейк",
      },
    ];

    for (const { context, enNeedle, ruNeedle } of venues) {
      const en = fallbackChallengeTask(
        { operatorName: "Camera", pastTasks: [] },
        { ...context, contentLocale: "en" },
      );
      const ru = fallbackChallengeTask(
        { operatorName: "Камера", pastTasks: [] },
        { ...context, contentLocale: "ru" },
      );
      expect(en.task.toLowerCase()).toContain(enNeedle);
      expect(ru.task.toLowerCase()).toContain(ruNeedle);
      expect(partyChallengeTaskSpec.outputSchema.safeParse(en).success).toBe(true);
      expect(partyChallengeTaskSpec.outputSchema.safeParse(ru).success).toBe(true);
    }
  });

  test("accepts one strict prepared first task and rejects later-round or extra-field payloads", () => {
    const context = contextForExperience("house-party", "normal");
    const output = {
      task: "Put the sofa on trial for hiding the remote again.",
      intro: "The cushions have lawyered up.",
    };

    expect(preparedFirstChallengeTask(output, context, [])).toEqual(output);
    expect(preparedFirstChallengeTask(output, context, ["Already played"])).toBeNull();
    expect(preparedFirstChallengeTask({ ...output, points: 99 }, context, [])).toBeNull();
  });

  test("party judgement rejects AI totals and computes the awarded score on the server", () => {
    expect(
      partyChallengeJudgementSchema.safeParse({
        performanceScore: 4,
        creativityScore: 3,
        energyScore: 3,
        environmentBonus: 5,
        score: 99,
        feedback: "Specific detail.",
        verdict: "Done.",
      }).success,
    ).toBe(false);

    const result = finalizePartyChallengeJudgement({
      performanceScore: 4,
      creativityScore: 2,
      energyScore: 1,
      environmentBonus: 5,
      feedback: "Дым сыграл свидетеля.",
      verdict: "Вердикт.",
    });
    expect(result.score).toBe(10);
    expect(result.breakdown.environment).toBe(5);
  });

  test("party judgement rubric names the exact environment bonus", () => {
    const context = contextForExperience("smoke-neon-norrebro", "normal");
    const system = partyChallengeJudgementSpec.buildSystem(context);
    expect(system).toContain("environmentBonus 0–5");
    expect(system).toContain("do not invent a total score or points");
  });
});
