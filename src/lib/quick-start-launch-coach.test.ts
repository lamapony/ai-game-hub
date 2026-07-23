import { describe, expect, test } from "bun:test";
import { buildQuickStartRoomState, type QuickStartReadiness } from "./quick-start";
import {
  buildQuickStartLaunchCoach,
  getCurrentQuickStartLaunchSignal,
} from "./quick-start-launch-coach";

function readiness(overrides: Partial<QuickStartReadiness> = {}): QuickStartReadiness {
  return {
    ready: false,
    readyWithinTwoMinutes: false,
    elapsedMs: 42_000,
    joinedPlayers: 0,
    expectedPlayers: 12,
    minimumPlayers: 8,
    maximumPlayers: 30,
    withinPlayerCapacity: true,
    routeDurationMinutes: 180,
    routeMatchesPromise: true,
    ...overrides,
  };
}

describe("quick-start launch coach", () => {
  test("exposes only the signal visible before the first live cue", () => {
    const state = buildQuickStartRoomState(
      "Host",
      { venue: "home", targetDurationMinutes: 120, expectedPlayers: 8 },
      1_000,
    );
    expect(getCurrentQuickStartLaunchSignal(state, "ready")).toBe("INVITE.");

    state.players = Array.from({ length: 8 }, (_, index) => ({
      id: `p${index}`,
      name: `Player ${index + 1}`,
      teamId: state.teams[index % state.teams.length]!.id,
      joinedAt: 2_000 + index,
    }));
    expect(getCurrentQuickStartLaunchSignal(state, "ready")).toBe("START.");

    state.quickStart = { ...state.quickStart!, startedAt: 3_000 };
    expect(getCurrentQuickStartLaunchSignal(state, "ready")).toBeUndefined();
  });

  test("rebuilds a mismatched program before any other launch advice", () => {
    const coach = buildQuickStartLaunchCoach(
      readiness({ routeMatchesPromise: false, routeDurationMinutes: 175 }),
      "degraded",
    );

    expect(coach.state).toBe("repair-program");
    expect(coach.signal).toBe("REBUILD.");
    expect(coach.action).toBe("home");
    expect(coach.detail).toContain("175 minutes");
  });

  test("waits while the live service is being checked", () => {
    const coach = buildQuickStartLaunchCoach(readiness(), "checking");

    expect(coach.state).toBe("checking-backend");
    expect(coach.signal).toBe("CHECK.");
    expect(coach.action).toBe("wait");
  });

  test("sends both degraded and failed checks to Live safety", () => {
    for (const status of ["degraded", "error"] as const) {
      const coach = buildQuickStartLaunchCoach(readiness({ joinedPlayers: 8 }), status);
      expect(coach.state).toBe("repair-backend");
      expect(coach.signal).toBe("FIX.");
      expect(coach.action).toBe("live-safety");
      expect(coach.detail).toContain("will not lose their place");
    }
  });

  test("turns an empty room into one concrete QR action", () => {
    const coach = buildQuickStartLaunchCoach(readiness(), "ready");

    expect(coach.state).toBe("invite-guests");
    expect(coach.signal).toBe("INVITE.");
    expect(coach.title).toContain("8 more guests");
    expect(coach.action).toBe("show-qr");
    expect(coach.detail).toContain("later arrivals can still join");
  });

  test("uses singular copy for the eighth guest", () => {
    const coach = buildQuickStartLaunchCoach(readiness({ joinedPlayers: 7 }), "ready");

    expect(coach.title).toBe("Invite one more guest to unlock the start");
  });

  test("unlocks the opening cue at eight even when more guests are expected", () => {
    const coach = buildQuickStartLaunchCoach(
      readiness({
        ready: true,
        readyWithinTwoMinutes: true,
        joinedPlayers: 8,
        expectedPlayers: 30,
      }),
      "ready",
    );

    expect(coach.state).toBe("ready-to-start");
    expect(coach.signal).toBe("START.");
    expect(coach.action).toBe("start");
    expect(coach.detail).toContain("42 seconds");
    expect(coach.detail).toContain("Extra guests can join");
  });

  test("blocks an over-capacity legacy room and tells the host where to recover", () => {
    const coach = buildQuickStartLaunchCoach(
      readiness({ joinedPlayers: 31, ready: false, withinPlayerCapacity: false }),
      "ready",
    );

    expect(coach.state).toBe("repair-capacity");
    expect(coach.signal).toBe("REDUCE.");
    expect(coach.action).toBe("players");
    expect(coach.detail).toContain("31/30");
  });

  test("does not promise more late joins when all 30 places are occupied", () => {
    const coach = buildQuickStartLaunchCoach(
      readiness({
        ready: true,
        readyWithinTwoMinutes: true,
        joinedPlayers: 30,
        expectedPlayers: 30,
      }),
      "ready",
    );

    expect(coach.state).toBe("ready-to-start");
    expect(coach.detail).toContain("exactly 30/30");
    expect(coach.detail.includes("Extra guests")).toBe(false);
  });
});
