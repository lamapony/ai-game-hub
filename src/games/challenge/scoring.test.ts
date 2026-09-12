import { describe, expect, test } from "bun:test";
import { applyChallengeVotingResult, finalizeChallengeAudienceScore } from "./scoring";
import type { RoomState } from "@/lib/types";

function room(votes: Record<string, "boost" | "cut"> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 2 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Cy", teamId: "forest", joinedAt: 3 },
    ],
    currentGame: "challenge",
    speakerSlots: {},
    challenge: {
      phase: "voting",
      roundId: "ch_1",
      operatorId: "p1",
      operatorName: "Ada",
      audienceVotes: votes,
      result: {
        score: 6,
        feedback: "The park spirit almost smiled.",
        videoUrl: "https://example.test/clip.mp4",
      },
    },
  };
}

describe("Challenge audience score", () => {
  test("majority boost adds three, majority cut subtracts one, ties stay put", () => {
    expect(finalizeChallengeAudienceScore(6, { p2: "boost", p3: "boost" })).toEqual({
      audienceBoostCount: 2,
      audienceCutCount: 0,
      audienceAdjustment: 3,
      awardedScore: 9,
    });
    expect(finalizeChallengeAudienceScore(6, { p2: "cut", p3: "cut" }).awardedScore).toBe(5);
    expect(finalizeChallengeAudienceScore(6, { p2: "boost", p3: "cut" }).audienceAdjustment).toBe(
      0,
    );
    expect(finalizeChallengeAudienceScore(0, { p2: "cut" }).awardedScore).toBe(0);
  });

  test("defers team points until the room vote is applied once", () => {
    const awarded = applyChallengeVotingResult(room({ p2: "boost", p3: "boost" }));
    expect(awarded.challenge?.phase).toBe("results");
    expect(awarded.challenge?.result?.awardedScore).toBe(9);
    expect(awarded.teams.find((team) => team.id === "forest")?.score).toBe(11);
    expect(applyChallengeVotingResult(awarded)).toBe(awarded);
  });
});
