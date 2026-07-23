import { describe, expect, test } from "bun:test";
import { launchGrillOracleState } from "./game-state";
import {
  assertOracleRoundOwner,
  oracleReadingResponseBody,
  oracleRecordIdempotencyKey,
} from "./grilloracle.server";
import { emptyRoomState } from "./types";

function rejectedStatus(run: () => unknown) {
  try {
    run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("Grill Oracle server invariants", () => {
  test("derives stable bounded record keys without exposing player or round ids", () => {
    const first = oracleRecordIdempotencyKey("oracle_round_1", "player_1");
    expect(first).toBe(oracleRecordIdempotencyKey("oracle_round_1", "player_1"));
    expect(first !== oracleRecordIdempotencyKey("oracle_round_1", "player_2")).toBe(true);
    expect(first.startsWith("oracle_")).toBe(true);
    expect(first).toHaveLength(71);
    expect(first.includes("player_1")).toBe(false);
  });

  test("accepts only a participant from the active server round", () => {
    const state = emptyRoomState("Host");
    state.players = [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }];
    const launched = launchGrillOracleState(state, "oracle_1", 1_000)!;

    expect(assertOracleRoundOwner(launched, "oracle_1", "p1").name).toBe("Ada");
    expect(rejectedStatus(() => assertOracleRoundOwner(launched, "wrong", "p1"))).toBe(409);
    expect(rejectedStatus(() => assertOracleRoundOwner(launched, "oracle_1", "p2"))).toBe(404);
    expect(
      rejectedStatus(() =>
        assertOracleRoundOwner({ ...launched, currentGame: "phototunt" }, "oracle_1", "p1"),
      ),
    ).toBe(409);
  });

  test("never returns a fallback prophecy payload to the host", () => {
    const result = {
      payload: {
        version: 1 as const,
        reading: {
          item_guess: "Evidence",
          doneness_verdict: "Charred",
          prophecy: "Private",
          predictions: ["one", "two", "three"] as [string, string, string],
          char_reading_style: "ash",
          points: 10,
        },
        capture: { mode: "host-fallback" as const, capturedAt: 1 },
      },
      replayed: false,
    };

    expect("payload" in oracleReadingResponseBody("analyze", result)).toBe(true);
    const hostBody = oracleReadingResponseBody("host-fallback", result);
    expect(hostBody).toEqual({ replayed: false });
    expect(JSON.stringify(hostBody).includes("Private")).toBe(false);
  });
});
