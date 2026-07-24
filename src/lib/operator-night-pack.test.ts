import { describe, expect, test } from "bun:test";
import { getExperiencePack, getExperienceRoute } from "@/experiences/catalog";
import {
  QUICK_START_DURATIONS,
  QUICK_START_PROFILES,
  QUICK_START_VENUES,
  quickStartContingency,
  type QuickStartInput,
} from "./quick-start";
import { buildQuickStartBrief } from "./quick-start-brief";
import { buildOperatorNightPack } from "./operator-night-pack";

function thrownMessage(run: () => unknown): string {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

describe("operator night pack", () => {
  test("builds a pack for every quick-start venue and duration", () => {
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const pack = buildOperatorNightPack({
          venue,
          targetDurationMinutes,
          expectedPlayers: 12,
        });

        expect(pack.schemaVersion).toBe(1);
        expect(pack.input.venue).toBe(venue);
        expect(pack.input.targetDurationMinutes).toBe(targetDurationMinutes);
        expect(pack.input.expectedPlayers).toBe(12);
        expect(pack.input.storySeedConfigured).toBe(false);
        expect(pack.program.experienceId).toBe(QUICK_START_PROFILES[venue].experienceId);
        expect(pack.program.contingency).toBe(quickStartContingency(targetDurationMinutes));
        expect(pack.cueSheet.length > 0).toBe(true);
        expect(pack.essentials.length > 0).toBe(true);
        expect(pack.recoveryCard.length > 0).toBe(true);
        expect(pack.contingencyPreviews.length > 0).toBe(true);
      }
    }
  });

  test("keeps cue-sheet order and duration identical to the authoritative route", () => {
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const input: QuickStartInput = {
          venue,
          targetDurationMinutes,
          expectedPlayers: 16,
        };
        const pack = buildOperatorNightPack(input);
        const route = getExperienceRoute(
          QUICK_START_PROFILES[venue].experienceId,
          quickStartContingency(targetDurationMinutes),
        );

        expect(pack.cueSheet.map((step) => step.stepId)).toEqual(
          route.steps.map((step) => step.id),
        );
        expect(pack.cueSheet.map((step) => step.durationMinutes)).toEqual(
          route.steps.map((step) => step.durationMinutes),
        );
        expect(pack.cueSheet.reduce((total, step) => total + step.durationMinutes, 0)).toBe(
          route.steps.reduce((total, step) => total + step.durationMinutes, 0),
        );
        expect(pack.program.routeDurationMinutes).toBe(targetDurationMinutes);
      }
    }
  });

  test("matches program counts from the brief and authoritative route", () => {
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const input: QuickStartInput = {
          venue,
          targetDurationMinutes,
          expectedPlayers: 14,
        };
        const pack = buildOperatorNightPack(input);
        const brief = buildQuickStartBrief(input);
        const route = getExperienceRoute(
          QUICK_START_PROFILES[venue].experienceId,
          quickStartContingency(targetDurationMinutes),
        );

        expect(pack.program.gameMoments).toBe(brief.gameMoments);
        expect(pack.program.distinctGames).toBe(brief.distinctGames);
        expect(pack.program.guidedBreaks).toBe(brief.guidedBreaks);
        expect(pack.program.hasFinale).toBe(brief.hasFinale);
        expect(pack.program.routeDurationMinutes).toBe(brief.routeDurationMinutes);
        expect(pack.essentials).toEqual([...brief.essentials]);
        expect(pack.equipment).toEqual(brief.equipment);
        expect(pack.cueSheet.filter((step) => step.kind === "interlude")).toHaveLength(
          route.steps.filter((step) => step.kind === "interlude").length,
        );
      }
    }
  });

  test("keeps privacy invariants literal and omits private sentinels from the serialized model", () => {
    const secretStory =
      "SECRET_THREAD_TEXT hs_should_not_leak #host-access hostSecret=never storySeed=raw";
    const pack = buildOperatorNightPack({
      venue: "bar",
      targetDurationMinutes: 180,
      expectedPlayers: 10,
      storySeed: secretStory,
    });

    expect(pack.input.storySeedConfigured).toBe(true);
    expect(pack.privacy).toEqual({
      containsHostSecret: false,
      containsPlayerIdentity: false,
      containsPrivateAssignments: false,
      containsTranscriptsOrMedia: false,
      containsScoreReasonsOrRubrics: false,
      containsStorySeedText: false,
      reviewBeforeSharing: true,
    });
    expect(pack.handoffReminder.secretIncluded).toBe(false);
    expect(pack.handoffReminder.required).toBe(true);
    expect(pack.handoffReminder.instruction).toContain("Live safety");

    const serialized = JSON.stringify(pack);
    for (const sentinel of [
      "#host-access",
      "hs_",
      '"hostSecret"',
      '"storySeed":',
      "SECRET_THREAD_TEXT",
      "playerName",
      "transcript",
      "mediaUrl",
      "privateAssignment",
      "scoreReason",
      "scoringRubric",
    ]) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    expect(serialized.includes("storySeedConfigured")).toBe(true);
    expect(Object.hasOwn(pack.input, "storySeed")).toBe(false);
  });

  test("advertises only informational contingency previews that exist on the selected experience", () => {
    for (const venue of QUICK_START_VENUES) {
      const pack = buildOperatorNightPack({
        venue,
        targetDurationMinutes: 120,
        expectedPlayers: 8,
      });
      const experience = getExperiencePack(QUICK_START_PROFILES[venue].experienceId);
      const available = new Set(Object.keys(experience.routes));

      expect(pack.contingencyPreviews.length).toBe(available.size);
      for (const preview of pack.contingencyPreviews) {
        expect(available.has(preview.contingency)).toBe(true);
        const route = experience.routes[preview.contingency];
        expect(preview.routeDurationMinutes).toBe(
          route.steps.reduce((total, step) => total + step.durationMinutes, 0),
        );
        expect(preview.actOrder).toEqual([...route.actOrder]);
        expect(preview.stepCount).toBe(route.steps.length);
        expect(preview.informational).toBe(true);
        expect(preview.liveRemapAvailable).toBe(false);
        expect(preview.note.toLowerCase()).toContain("before start");
        expect(preview.note.toLowerCase()).toContain("live remap");
        expect(preview.note.toLowerCase()).toContain("not available");
      }
    }
  });

  test("does not mutate the quick-start input or catalog route", () => {
    const input = deepFreeze({
      venue: "festival" as const,
      targetDurationMinutes: 240 as const,
      expectedPlayers: 22,
      storySeed: "Public festival thread",
    });
    const route = getExperienceRoute("festival-field", "extended");
    const stepSnapshot = route.steps.map((step) => ({ ...step }));
    const actOrderSnapshot = [...route.actOrder];

    buildOperatorNightPack(input);

    expect(input).toEqual({
      venue: "festival",
      targetDurationMinutes: 240,
      expectedPlayers: 22,
      storySeed: "Public festival thread",
    });
    expect(route.actOrder).toEqual(actOrderSnapshot);
    expect(route.steps).toEqual(stepSnapshot);
  });

  test("accepts boundary crowd sizes 8 and 30", () => {
    for (const expectedPlayers of [8, 30]) {
      const pack = buildOperatorNightPack({
        venue: "park",
        targetDurationMinutes: 120,
        expectedPlayers,
      });
      expect(pack.input.expectedPlayers).toBe(expectedPlayers);
      expect(pack.essentials.join(" ")).toContain(`${expectedPlayers} guests`);
    }
  });

  test("rejects invalid input with the existing quick-start validation messages", () => {
    expect(
      thrownMessage(() =>
        buildOperatorNightPack({
          venue: "home",
          targetDurationMinutes: 180,
          expectedPlayers: 7,
        }),
      ),
    ).toContain("between 8 and 30");
    expect(
      thrownMessage(() =>
        buildOperatorNightPack({
          venue: "home",
          targetDurationMinutes: 90 as 120,
          expectedPlayers: 12,
        }),
      ),
    ).toContain("2, 3 or 4 hour");
    expect(
      thrownMessage(() =>
        buildOperatorNightPack({
          venue: "spaceship" as "park",
          targetDurationMinutes: 120,
          expectedPlayers: 12,
        }),
      ),
    ).toContain("supported party setting");
  });

  test("uses registry capabilities only on game cue-sheet rows and keeps recovery integrity language", () => {
    const pack = buildOperatorNightPack({
      venue: "park",
      targetDurationMinutes: 120,
      expectedPlayers: 8,
    });

    for (const step of pack.cueSheet) {
      if (step.gameId) {
        expect(Array.isArray(step.capabilities)).toBe(true);
        expect(step.label.length > 0).toBe(true);
        expect(step.cue.length > 0).toBe(true);
      } else {
        expect(Object.hasOwn(step, "gameId")).toBe(false);
        expect(Object.hasOwn(step, "capabilities")).toBe(false);
      }
    }

    const recoveryText = pack.recoveryCard
      .map((row) => `${row.symptom} ${row.hostAction} ${row.mustRemainIntact}`)
      .join(" ");
    expect(recoveryText.toLowerCase()).toContain("route");
    expect(recoveryText.toLowerCase()).toContain("private");
    expect(recoveryText.toLowerCase()).toContain("score ledger");
    expect(pack.recoveryPromise.toLowerCase()).toContain("route");
  });
});
