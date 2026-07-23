import { describe, expect, test } from "bun:test";
import { sommelierProfileSchema } from "@/games/sommelier/model";
import {
  scoreSommelierRound,
  SOMMELIER_CROWD_FAVORITE_POINTS,
  sommelierRequestSchema,
} from "./sommelier-lifecycle";

const profile = sommelierProfileSchema.parse({
  drink_guess: "A lager that has declined all glassware",
  tasting_notes: "Notes of Monday despair and respectable carbonation",
  owner_profile:
    "This person says they read the research and means one comment thread. They answer messages six hours later. Their strongest opinion is that everything is basically fine.",
  pretentiousness: 2,
  pairing_advice: "Pairs with a story from 2019 and an emergency order of fries",
});

function score(ballots: Array<{ voterPlayerId: string; guessedOwnerPlayerId: string }>) {
  return scoreSommelierRound({
    entryId: "entry_1",
    ownerPlayerId: "p1",
    ownerPlayerName: "Dana",
    ownerTeamId: "forest",
    profile,
    aiFallback: false,
    candidatePlayerIds: ["p1", "p2", "p3"],
    ballots,
  });
}

describe("Sommelier Charlatan lifecycle contract", () => {
  test("awards each correct human guess and nothing to a discovered owner", () => {
    const result = score([
      { voterPlayerId: "p2", guessedOwnerPlayerId: "p1" },
      { voterPlayerId: "p3", guessedOwnerPlayerId: "p1" },
    ]);

    expect(result.correctGuesserIds).toEqual(["p2", "p3"]);
    expect(result.guesserPoints).toEqual({ p2: 3, p3: 3 });
    expect(result.ownerPoints).toBe(0);
  });

  test("awards the hidden owner only when nobody finds them", () => {
    const result = score([
      { voterPlayerId: "p2", guessedOwnerPlayerId: "p3" },
      { voterPlayerId: "p3", guessedOwnerPlayerId: "p2" },
    ]);

    expect(result.correctGuesserIds).toEqual([]);
    expect(result.guesserPoints).toEqual({});
    expect(result.ownerPoints).toBe(5);
  });

  test("ignores owner ballots, self guesses, duplicate voters and invalid candidates", () => {
    const result = score([
      { voterPlayerId: "p1", guessedOwnerPlayerId: "p1" },
      { voterPlayerId: "p3", guessedOwnerPlayerId: "p3" },
      { voterPlayerId: "p2", guessedOwnerPlayerId: "p3" },
      { voterPlayerId: "p2", guessedOwnerPlayerId: "p1" },
      { voterPlayerId: "p3", guessedOwnerPlayerId: "outsider" },
    ]);

    expect(result.ballotCount).toBe(1);
    expect(result.ownerPoints).toBe(5);
  });

  test("validates player/host actions and fixes the crowd favorite bonus", () => {
    expect(
      sommelierRequestSchema.safeParse({
        roomId: "room_1",
        sessionId: "session_1",
        action: "guess",
        playerId: "p2",
        entryId: "entry_1",
        guessedOwnerPlayerId: "p1",
      }).success,
    ).toBe(true);
    expect(
      sommelierRequestSchema.safeParse({
        roomId: "room_1",
        sessionId: "session_1",
        action: "guess",
        playerId: "p2",
        entryId: "entry_1",
      }).success,
    ).toBe(false);
    expect(SOMMELIER_CROWD_FAVORITE_POINTS).toBe(3);
  });
});
