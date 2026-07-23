import { describe, expect, test } from "bun:test";
import {
  CONTRABAND_SERVER_SCORING,
  contrabandAccusationKey,
  contrabandAssignmentKey,
  contrabandResolutionKey,
  contrabandScoreKey,
} from "./contraband.server";

describe("Contraband server invariants", () => {
  test("uses stable opaque keys without leaking phrases", () => {
    const phrase = "I generally trust ducks";
    const keys = [
      contrabandAssignmentKey("run_1", "player_1"),
      contrabandAccusationKey("run_1", "case_1"),
      contrabandResolutionKey("run_1", "case_1"),
      contrabandScoreKey("run_1", "case_1:catcher"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((value) => /^[A-Za-z0-9_-]+$/.test(value))).toBe(true);
    expect(keys.every((value) => !value.includes(phrase))).toBe(true);
  });

  test("exports the immutable server scoring table", () => {
    expect(CONTRABAND_SERVER_SCORING).toEqual({ smuggler: 10, catcher: 5, falseAccusation: -2 });
  });
});
