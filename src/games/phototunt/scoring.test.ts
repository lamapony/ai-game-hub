import { describe, expect, test } from "bun:test";
import { applyPhotoHuntVotingResult, photoHuntCrowdFavorite } from "./scoring";
import type { RoomState } from "@/lib/types";

function room(votes: Record<string, string> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 1 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Cy", teamId: "forest", joinedAt: 3 },
    ],
    currentGame: "phototunt",
    speakerSlots: {},
    phototunt: {
      phase: "voting",
      roundId: "ph_1",
      audienceVotes: votes,
      results: [
        {
          playerId: "p1",
          playerName: "Ada",
          teamId: "forest",
          photoUrl: "https://example.test/a.jpg",
          rank: 1,
          points: 5,
          comment: "Sharp.",
        },
        {
          playerId: "p2",
          playerName: "Bo",
          teamId: "lake",
          photoUrl: "https://example.test/b.jpg",
          rank: 2,
          points: 3,
          comment: "Close.",
        },
      ],
    },
  };
}

describe("Photo Hunt crowd favorite", () => {
  test("unique plurality gets +3; ties pay nobody", () => {
    expect(photoHuntCrowdFavorite({ p2: "p1", p3: "p1" }).favoritePlayerId).toBe("p1");
    expect(photoHuntCrowdFavorite({ p1: "p2", p2: "p1" }).favoritePlayerId).toBeNull();
  });

  test("defers team points until the crowd vote is applied once", () => {
    const awarded = applyPhotoHuntVotingResult(room({ p2: "p1", p3: "p1" }));
    expect(awarded.phototunt?.phase).toBe("results");
    expect(awarded.phototunt?.results?.[0]?.points).toBe(8);
    expect(awarded.phototunt?.results?.[0]?.crowdFavorite).toBe(true);
    expect(awarded.teams.find((team) => team.id === "forest")?.score).toBe(9);
    expect(awarded.teams.find((team) => team.id === "lake")?.score).toBe(3);
    expect(applyPhotoHuntVotingResult(awarded)).toBe(awarded);
  });
});
