import { describe, expect, test } from "bun:test";
import {
  deterministicOracleDecision,
  oracleLifecycleRequestSchema,
  oracleScoreForResults,
  oracleScoreTargets,
  sameOracleResults,
} from "./oracle-lifecycle";
import { emptyRoomState } from "./types";

describe("Oracle lifecycle contracts", () => {
  test("accepts exactly three verification decisions and rejects extra input", () => {
    expect(
      oracleLifecycleRequestSchema.safeParse({
        action: "verify",
        roomId: "room_1",
        runId: "oracle_1",
        playerId: "player_1",
        results: [true, false, true],
      }).success,
    ).toBe(true);
    expect(
      oracleLifecycleRequestSchema.safeParse({
        action: "verify",
        roomId: "room_1",
        runId: "oracle_1",
        playerId: "player_1",
        results: [true, false],
      }).success,
    ).toBe(false);
    expect(
      oracleLifecycleRequestSchema.safeParse({
        action: "reveal",
        roomId: "room_1",
        runId: "oracle_1",
        force: true,
      }).success,
    ).toBe(false);
  });

  test("computes the fixed 5/3 rubric without trusting AI numbers", () => {
    expect(oracleScoreForResults([true, false, true])).toEqual({
      fulfilledCount: 2,
      unfulfilledCount: 1,
      oraclePoints: 10,
      skepticPoints: 3,
    });
    const allDisproved = oracleScoreForResults([false, false, false]);
    expect(allDisproved.oraclePoints).toBe(0);
    expect(allDisproved.skepticPoints).toBe(9);
    expect(
      deterministicOracleDecision(
        {
          verdict: "The model writes the line, never the score.",
          fulfilled_count: 0,
          oracle_points: 0,
          skeptic_points: 9,
        },
        [true, false, true],
      ),
    ).toEqual({
      verdict: "The model writes the line, never the score.",
      fulfilled_count: 2,
      oracle_points: 10,
      skeptic_points: 3,
    });
  });

  test("sends skeptic points only to represented opposing teams", () => {
    const state = emptyRoomState("Host");
    state.players = [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
    ];

    expect(oracleScoreTargets(state, "p1").skepticTeamIds).toEqual(["lake"]);
    expect(sameOracleResults([true, false, true], [true, false, true])).toBe(true);
    expect(sameOracleResults([true, false, true], [true, true, false])).toBe(false);
  });
});
