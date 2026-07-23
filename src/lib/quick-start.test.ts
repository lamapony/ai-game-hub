import { describe, expect, test } from "bun:test";
import { getExperienceRoute } from "@/experiences/catalog";
import {
  QUICK_START_DURATIONS,
  QUICK_START_PROFILES,
  QUICK_START_VENUES,
  buildQuickStartRoomState,
  getQuickStartReadiness,
  quickStartContingency,
  validateQuickStartInput,
} from "./quick-start";
import { emptyRoomState } from "./types";

function thrownMessage(run: () => unknown): string {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("quick start", () => {
  test("assembles every setting into an exact 2, 3 or 4 hour route", () => {
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const state = buildQuickStartRoomState(
          "Director",
          { venue, targetDurationMinutes, expectedPlayers: 12 },
          1_000,
        );
        const profile = QUICK_START_PROFILES[venue];
        const route = getExperienceRoute(
          profile.experienceId,
          quickStartContingency(targetDurationMinutes),
        );
        const routeMinutes = route.steps.reduce((total, step) => total + step.durationMinutes, 0);
        const secretSteps = route.steps.filter(
          (step) => "gameId" in step && step.gameId === "smokescreen",
        );
        const assignIndex = route.steps.findIndex(
          (step) => "gameId" in step && step.gameId === "smokescreen" && step.stage === "assign",
        );
        const revealIndex = route.steps.findIndex(
          (step) => "gameId" in step && step.gameId === "smokescreen" && step.stage === "reveal",
        );
        const secretWindowMinutes = route.steps
          .slice(assignIndex + 1, revealIndex)
          .reduce((total, step) => total + step.durationMinutes, 0);

        expect(state.hostName).toBe("Director");
        expect(state.party?.experienceId).toBe(profile.experienceId);
        expect(state.party?.contingency).toBe(quickStartContingency(targetDurationMinutes));
        expect(state.quickStart).toEqual({
          venue,
          targetDurationMinutes,
          expectedPlayers: 12,
          configuredAt: 1_000,
        });
        expect(routeMinutes).toBe(targetDurationMinutes);
        expect(secretSteps).toHaveLength(2);
        expect(assignIndex >= 0).toBe(true);
        expect(revealIndex > assignIndex).toBe(true);
        expect(secretWindowMinutes >= 30).toBe(true);
      }
    }
  });

  test("rejects settings outside the supported 8–30 person and 2–4 hour promise", () => {
    expect(
      thrownMessage(() =>
        validateQuickStartInput({ venue: "home", targetDurationMinutes: 180, expectedPlayers: 7 }),
      ),
    ).toContain("between 8 and 30");
    expect(
      thrownMessage(() =>
        validateQuickStartInput({
          venue: "home",
          targetDurationMinutes: 90 as 120,
          expectedPlayers: 12,
        }),
      ),
    ).toContain("2, 3 or 4 hour");
  });

  test("normalizes one public story seed into both setup and every party prompt context", () => {
    const state = buildQuickStartRoomState(
      "Director",
      {
        venue: "bar",
        targetDurationMinutes: 180,
        expectedPlayers: 12,
        storySeed: "  Mira's birthday   and the missing silver tongs  ",
      },
      2_000,
    );

    expect(state.quickStart?.storySeed).toBe("Mira's birthday and the missing silver tongs");
    expect(state.party?.storySeed).toBe("Mira's birthday and the missing silver tongs");
    expect(
      thrownMessage(() =>
        validateQuickStartInput({
          venue: "bar",
          targetDurationMinutes: 180,
          expectedPlayers: 12,
          storySeed: "x".repeat(161),
        }),
      ),
    ).toContain("160 characters or fewer");
  });

  test("measures the two-minute readiness promise from real route and roster state", () => {
    const state = buildQuickStartRoomState(
      "Director",
      { venue: "festival", targetDurationMinutes: 240, expectedPlayers: 20 },
      10_000,
    );
    state.players = Array.from({ length: 8 }, (_, index) => ({
      id: `player-${index}`,
      name: `Player ${index}`,
      teamId: index % 2 ? "lake" : "forest",
      joinedAt: 10_000 + index,
    }));

    const readiness = getQuickStartReadiness(state, 100_000);
    expect(readiness?.ready).toBe(true);
    expect(readiness?.readyWithinTwoMinutes).toBe(true);
    expect(readiness?.routeDurationMinutes).toBe(240);
    expect(readiness?.routeMatchesPromise).toBe(true);
    expect(readiness?.joinedPlayers).toBe(8);
    expect(readiness?.expectedPlayers).toBe(20);
    expect(readiness?.maximumPlayers).toBe(30);
    expect(readiness?.withinPlayerCapacity).toBe(true);
    expect(getQuickStartReadiness(state, 200_000)?.readyWithinTwoMinutes).toBe(false);

    state.quickStart!.startedAt = 100_000;
    expect(getQuickStartReadiness(state, 9_000_000)?.elapsedMs).toBe(90_000);
    expect(getQuickStartReadiness(state, 9_000_000)?.readyWithinTwoMinutes).toBe(true);

    state.players.pop();
    expect(getQuickStartReadiness(state, 100_000)?.ready).toBe(false);

    state.players = Array.from({ length: 31 }, (_, index) => ({
      id: `overflow-${index}`,
      name: `Overflow ${index}`,
      teamId: index % 2 ? "lake" : "forest",
      joinedAt: 10_000 + index,
    }));
    expect(getQuickStartReadiness(state, 100_000)?.withinPlayerCapacity).toBe(false);
    expect(getQuickStartReadiness(state, 100_000)?.ready).toBe(false);
  });

  test("keeps legacy free-play rooms outside quick-start measurement", () => {
    expect(getQuickStartReadiness(emptyRoomState())).toBeNull();
  });
});
