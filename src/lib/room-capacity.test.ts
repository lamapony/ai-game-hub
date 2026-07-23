import { describe, expect, test } from "bun:test";
import {
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  canRemovePlayerBeforeParty,
  roomHasPlayerCapacity,
} from "./room-capacity";

describe("room capacity", () => {
  test("matches the public 8–30 person contract", () => {
    expect(MIN_ROOM_PLAYERS).toBe(8);
    expect(MAX_ROOM_PLAYERS).toBe(30);
    expect(roomHasPlayerCapacity(29)).toBe(true);
    expect(roomHasPlayerCapacity(30)).toBe(false);
    expect(roomHasPlayerCapacity(31)).toBe(false);
  });

  test("allows ghost cleanup only before the first live cue", () => {
    expect(canRemovePlayerBeforeParty({ status: "lobby" })).toBe(true);
    expect(
      canRemovePlayerBeforeParty({
        status: "lobby",
        quickStart: {
          venue: "park",
          targetDurationMinutes: 120,
          expectedPlayers: 8,
          configuredAt: 1,
          startedAt: 2,
        },
      }),
    ).toBe(false);
    expect(
      canRemovePlayerBeforeParty({
        status: "lobby",
        runOfShow: {
          experienceId: "park-story",
          contingency: "compact",
          completedStepIds: ["park-arrival-120"],
        },
      }),
    ).toBe(false);
    expect(canRemovePlayerBeforeParty({ status: "playing" })).toBe(false);
  });
});
