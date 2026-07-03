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
        usedTrackIds: ["real-soundhelix-1"],
        trackId: "real-soundhelix-1",
        guesses: { p1: "real", p2: "ai" },
      },
    });

    const { teams, roundResult } = scoreTrackGuessRound(state, state.trackguess!);

    expect(roundResult?.isAi).toBe(false);
    expect(roundResult?.correctPlayerIds).toEqual(["p1"]);
    expect(teams.find((t) => t.id === "forest")?.score).toBe(2);
    expect(teams.find((t) => t.id === "lake")?.score).toBe(0);
  });

  test("scores host-added real tracks from round state metadata", () => {
    const state = roomState({
      trackguess: {
        phase: "reveal",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["custom-real-1"],
        trackId: "custom-real-1",
        trackTitle: "Guestlist Anthem",
        trackArtist: "Actual Human",
        trackGenre: "Pop",
        trackUrl: "https://example.com/anthem.mp3",
        trackSourceLabel: "Spotify",
        trackSourceUrl: "https://open.spotify.com/track/example",
        isAi: false,
        guesses: { p1: "ai", p2: "real" },
      },
    });

    const { teams, roundResult } = scoreTrackGuessRound(state, state.trackguess!);

    expect(roundResult?.title).toBe("Guestlist Anthem");
    expect(roundResult?.artist).toBe("Actual Human");
    expect(roundResult?.sourceLabel).toBe("Spotify");
    expect(roundResult?.sourceUrl).toBe("https://open.spotify.com/track/example");
    expect(roundResult?.correctPlayerIds).toEqual(["p2"]);
    expect(teams.find((t) => t.id === "forest")?.score).toBe(0);
    expect(teams.find((t) => t.id === "lake")?.score).toBe(2);
  });
});
