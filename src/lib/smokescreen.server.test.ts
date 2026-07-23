import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import {
  buildSmokeScreenScoreEvents,
  canRunSmokeScreenLifecyclePhase,
  smokeGuessIdempotencyKey,
  smokeMissionIdempotencyKey,
  smokeScoreIdempotencyKey,
} from "./smokescreen.server";
import { emptyRoomState } from "./types";

describe("Smoke Screen server invariants", () => {
  test("allows the sealed lifecycle in single-act quick-start venues", () => {
    for (const experienceId of ["park-story", "house-party", "festival-field"] as const) {
      const state = emptyRoomState("Host");
      state.party = contextForExperience(experienceId, "compact");
      expect(canRunSmokeScreenLifecyclePhase(state, "deal")).toBe(true);
      expect(canRunSmokeScreenLifecyclePhase(state, "seal")).toBe(true);
      expect(canRunSmokeScreenLifecyclePhase(state, "reveal")).toBe(true);
      expect(canRunSmokeScreenLifecyclePhase(state, "finalize")).toBe(true);
    }

    const grill = emptyRoomState("Host");
    grill.party = contextForExperience("smoke-neon-norrebro", "normal");
    expect(canRunSmokeScreenLifecyclePhase(grill, "deal")).toBe(true);
    expect(canRunSmokeScreenLifecyclePhase(grill, "seal")).toBe(true);
    expect(canRunSmokeScreenLifecyclePhase(grill, "reveal")).toBe(false);

    const bar = emptyRoomState("Host");
    bar.party = contextForExperience("bar-night", "compact");
    expect(canRunSmokeScreenLifecyclePhase(bar, "reveal")).toBe(true);
    expect(canRunSmokeScreenLifecyclePhase(bar, "finalize")).toBe(true);
  });

  test("derives stable opaque keys for private records and score events", () => {
    const mission = smokeMissionIdempotencyKey("run_1", "player_1");
    const guess = smokeGuessIdempotencyKey("run_1", "player_1");
    const score = smokeScoreIdempotencyKey("run_1", "player_1", "detective");

    expect(mission).toBe(smokeMissionIdempotencyKey("run_1", "player_1"));
    expect(guess).toBe(smokeGuessIdempotencyKey("run_1", "player_1"));
    expect(score).toBe(smokeScoreIdempotencyKey("run_1", "player_1", "detective"));
    expect(`${mission}${guess}${score}`.includes("player_1")).toBe(false);
    expect([mission, guess, score].every((key) => key.length <= 128)).toBe(true);
  });

  test("builds deterministic owner and aggregated detective events without zero rows", () => {
    const state = emptyRoomState("Host");
    state.players = [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Three", teamId: "fire", joinedAt: 3 },
    ];
    state.smokescreen = {
      runId: "run_1",
      status: "results",
      participantIds: ["p1", "p2", "p3"],
      assignedPlayerIds: ["p1", "p2", "p3"],
      submittedVoterIds: ["p1", "p2"],
      startedAt: 1,
    };
    const events = buildSmokeScreenScoreEvents({
      state,
      runId: "run_1",
      payload: {
        version: 1,
        completedMissionIds: ["m1", "m2"],
        recap: "Recap",
        aiFallback: false,
        completedAt: 100,
        results: [
          {
            missionId: "m1",
            ownerPlayerId: "p1",
            tier: 3,
            completed: true,
            caught: false,
            correctDetectiveIds: [],
            ownerPoints: 15,
          },
          {
            missionId: "m2",
            ownerPlayerId: "p2",
            tier: 2,
            completed: true,
            caught: true,
            correctDetectiveIds: ["p1", "p3"],
            ownerPoints: 0,
          },
        ],
      },
    });

    expect(events.map((event) => [event.playerId, event.teamId, event.points])).toEqual([
      ["p1", "forest", 15],
      ["p1", "forest", 2],
      ["p3", "fire", 2],
    ]);
    expect(new Set(events.map((event) => event.idempotencyKey)).size).toBe(events.length);
    expect(events.every((event) => event.gameId === "smokescreen")).toBe(true);
    expect(events.every((event) => event.source === "deterministic")).toBe(true);
  });
});
