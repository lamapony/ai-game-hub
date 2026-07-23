import { describe, expect, test } from "bun:test";
import {
  buildOracleScoreEvents,
  oracleScoreIdempotencyKey,
  oracleVerdictIdempotencyKey,
} from "./grilloracle-lifecycle.server";
import { emptyRoomState } from "./types";

describe("Grill Oracle lifecycle server invariants", () => {
  test("derives stable opaque verdict and score keys", () => {
    const verdict = oracleVerdictIdempotencyKey("oracle_1", "player_1");
    const score = oracleScoreIdempotencyKey("oracle_1", "player_1", "oracle", "forest");

    expect(verdict).toBe(oracleVerdictIdempotencyKey("oracle_1", "player_1"));
    expect(score).toBe(oracleScoreIdempotencyKey("oracle_1", "player_1", "oracle", "forest"));
    expect(verdict.includes("player_1")).toBe(false);
    expect(score.includes("forest")).toBe(false);
    expect(verdict.length <= 128).toBe(true);
    expect(score.length <= 128).toBe(true);
  });

  test("awards fulfilled points once to the owner and disproved points to each represented rival", () => {
    const state = emptyRoomState("Host");
    state.players = [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Three", teamId: "fire", joinedAt: 3 },
    ];

    const events = buildOracleScoreEvents({
      state,
      runId: "oracle_1",
      playerId: "p1",
      results: [true, false, true],
    });

    expect(events.map((event) => [event.teamId, event.playerId, event.points])).toEqual([
      ["forest", "p1", 10],
      ["lake", undefined, 3],
      ["fire", undefined, 3],
    ]);
    expect(new Set(events.map((event) => event.idempotencyKey)).size).toBe(events.length);
    expect(events.every((event) => event.source === "deterministic")).toBe(true);
    expect(events.every((event) => event.gameId === "grilloracle")).toBe(true);
  });

  test("does not create zero-point events", () => {
    const state = emptyRoomState("Host");
    state.players = [{ id: "p1", name: "One", teamId: "forest", joinedAt: 1 }];

    expect(
      buildOracleScoreEvents({
        state,
        runId: "oracle_1",
        playerId: "p1",
        results: [false, false, false],
      }),
    ).toEqual([]);
  });
});
