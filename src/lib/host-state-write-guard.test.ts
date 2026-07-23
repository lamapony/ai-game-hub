import { describe, expect, test } from "bun:test";
import { emptyRoomState } from "./types";
import { hostStateWriteGuardMatches, parseHostStateWriteGuard } from "./host-state-write-guard";

describe("host state write guard", () => {
  test("accepts only supported active-round guards", () => {
    expect(parseHostStateWriteGuard({ gameId: "challenge", roundId: "ch_1" })).toEqual({
      gameId: "challenge",
      roundId: "ch_1",
    });
    expect(parseHostStateWriteGuard({ gameId: "soundscape", roundId: "snd_1" })).toBeUndefined();
    expect(parseHostStateWriteGuard({ gameId: "phototunt", roundId: "" })).toBeUndefined();
  });

  test("rejects a late AI write after the host moved to another game", () => {
    const state = emptyRoomState("Host");
    state.status = "playing";
    state.currentGame = "phototunt";
    state.phototunt = { phase: "briefing", roundId: "ph_1" };

    expect(hostStateWriteGuardMatches(state, { gameId: "challenge", roundId: "ch_1" })).toBe(false);
    expect(hostStateWriteGuardMatches(state, { gameId: "phototunt", roundId: "ph_1" })).toBe(true);
    expect(hostStateWriteGuardMatches(state, { gameId: "phototunt", roundId: "ph_old" })).toBe(
      false,
    );
  });
});
