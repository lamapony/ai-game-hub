import { describe, expect, test } from "bun:test";
import { scoreTrackGuessRound } from "./scoring";
import type { RoomState } from "@/lib/types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
    ],
    currentGame: "trackguess",
    speakerSlots: {
      1: { connected: true, name: "Main Stage" },
      2: { connected: false, name: "Oak Spirit" },
      3: { connected: false, name: "The Wind" },
      4: { connected: false, name: "Squirrel Gossip" },
      5: { connected: false, name: "Forest Echo" },
    },
    ...overrides,
  };
}

describe("track guess scoring", () => {
  test("awards points to teams with correct guesses", () => {
    const state = roomState({
      trackguess: {
        phase: "reveal",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["real-lounge"],
        trackId: "real-lounge",
        guesses: { p1: "real", p2: "ai" },
      },
    });

    const { teams, roundResult } = scoreTrackGuessRound(state, state.trackguess!);

    expect(roundResult?.isAi).toBe(false);
    expect(roundResult?.correctPlayerIds).toEqual(["p1"]);
    expect(teams.find((t) => t.id === "forest")?.score).toBe(2);
    expect(teams.find((t) => t.id === "lake")?.score).toBe(0);
  });
});
