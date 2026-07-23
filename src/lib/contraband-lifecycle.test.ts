import { describe, expect, test } from "bun:test";
import { aiOutcome, contrabandRequestSchema, outcomePoints } from "./contraband-lifecycle";

describe("Contraband lifecycle contract", () => {
  test("keeps the scoring threshold server-side", () => {
    expect(aiOutcome(6)).toBe("caught");
    expect(aiOutcome(7)).toBe("clean");
    expect(outcomePoints("caught")).toEqual({
      smugglerPoints: 0,
      catcherPoints: 5,
      falseAccusationPenalty: 0,
    });
    expect(outcomePoints("clean").smugglerPoints).toBe(10);
    expect(outcomePoints("false-accusation").falseAccusationPenalty).toBe(-2);
  });

  test("requires a bounded quote and explicit accused player", () => {
    expect(
      contrabandRequestSchema.safeParse({
        action: "accuse",
        roomId: "room_1",
        runId: "run_1",
        playerId: "player_1",
        accusedPlayerId: "player_2",
        suspectedQuote: "I trust ducks",
      }).success,
    ).toBe(true);
    expect(
      contrabandRequestSchema.safeParse({
        action: "accuse",
        roomId: "room_1",
        runId: "run_1",
        playerId: "player_1",
        suspectedQuote: "I trust ducks",
      }).success,
    ).toBe(false);
  });
});
