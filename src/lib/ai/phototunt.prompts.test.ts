import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import {
  fallbackPhotoTask,
  finalizePartyPhotoJudgement,
  partyPhotoJudgementSchema,
  preparedFirstPhotoTask,
} from "./phototunt.prompts";

describe("Photo Hunt prompt contracts", () => {
  test("party schema rejects model-provided rank and points", () => {
    const parsed = partyPhotoJudgementSchema.safeParse({
      entries: [
        {
          playerId: "p1",
          taskFitScore: 9,
          creativityBonus: 4,
          humorBonus: 2,
          environmentBonus: 5,
          rank: 1,
          points: 100,
          comment: "Specific smoke.",
        },
      ],
      verdict: "Closing line.",
    });
    expect(parsed.success).toBe(false);
  });

  test("server ranks by bounded criteria and resolves ties by submission order", () => {
    const context = contextForExperience("smoke-neon-norrebro", "normal");
    const photos = [
      { playerId: "p1", playerName: "One", url: "one" },
      { playerId: "p2", playerName: "Two", url: "two" },
      { playerId: "p3", playerName: "Three", url: "three" },
    ];
    const result = finalizePartyPhotoJudgement(
      {
        entries: [
          {
            playerId: "p2",
            taskFitScore: 7,
            creativityBonus: 3,
            humorBonus: 2,
            environmentBonus: 5,
            comment: "Two used smoke.",
          },
          {
            playerId: "p1",
            taskFitScore: 7,
            creativityBonus: 3,
            humorBonus: 2,
            environmentBonus: 5,
            comment: "One used smoke.",
          },
          {
            playerId: "not-in-room",
            taskFitScore: 10,
            creativityBonus: 5,
            humorBonus: 5,
            environmentBonus: 5,
            comment: "Ignore me.",
          },
        ],
        verdict: "Критик закончил протокол.",
      },
      photos,
      context,
    );

    expect(result.ranking.map((entry) => entry.playerId)).toEqual(["p1", "p2", "p3"]);
    expect(result.ranking.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(result.verdict.startsWith("Побеждает One.")).toBe(true);
  });

  test("server replaces a model verdict that announces the wrong winner", () => {
    const context = contextForExperience("smoke-neon-norrebro", "normal");
    const result = finalizePartyPhotoJudgement(
      {
        entries: [
          {
            playerId: "p1",
            taskFitScore: 10,
            creativityBonus: 5,
            humorBonus: 5,
            environmentBonus: 5,
            comment: "Winner.",
          },
          {
            playerId: "p2",
            taskFitScore: 1,
            creativityBonus: 0,
            humorBonus: 0,
            environmentBonus: 0,
            comment: "Runner-up.",
          },
        ],
        verdict: "Побеждает Two, потому что модель так решила.",
      },
      [
        { playerId: "p1", playerName: "One", url: "one" },
        { playerId: "p2", playerName: "Two", url: "two" },
      ],
      context,
    );
    expect(result.verdict.startsWith("Побеждает One.")).toBe(true);
    expect(result.verdict.includes("Побеждает Two")).toBe(false);
  });

  test("keeps offline photo tasks local to all five venues and the content language", () => {
    const contexts = [
      [contextForExperience("house-party", "normal"), "household"],
      [contextForExperience("festival-field", "normal"), "wristband"],
      [contextForExperience("park-story", "normal"), "bench"],
      [contextForExperience("bar-night", "normal"), "glass"],
      [contextForExperience("smoke-neon-norrebro", "normal"), "дым"],
    ] as const;

    for (const [context, expectedWord] of contexts) {
      expect(fallbackPhotoTask({ pastTasks: [] }, context).task).toContain(expectedWord);
    }
  });

  test("accepts one strict prepared first task and rejects later-round or extra-field payloads", () => {
    const home = contextForExperience("house-party", "normal");
    const prepared = {
      task: "Turn the hallway lamp into evidence from a domestic noir film.",
      intro: "The corridor would like a lawyer.",
    };

    expect(preparedFirstPhotoTask(prepared, home, [])).toEqual(prepared);
    expect(preparedFirstPhotoTask({ ...prepared, points: 99 }, home, [])).toBeNull();
    expect(preparedFirstPhotoTask(prepared, home, ["Earlier task"])).toBeNull();
  });
});
