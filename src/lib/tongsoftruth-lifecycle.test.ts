import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { scoreTongsAudienceBets } from "@/games/tongsoftruth/scoring";
import {
  launchTongsOfTruthState,
  markTongsJudgingState,
  nextTongsRoundState,
  placeTongsAudienceBetState,
  revealTongsRoundState,
  reviewTongsRoundState,
  setTongsQuestionState,
  startTongsRecordingState,
} from "./game-state";
import { tongsPoints, tongsRequestSchema } from "./tongsoftruth-lifecycle";
import type { RoomState } from "./types";

function room(count = 6, compact = false): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: Array.from({ length: count }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
      teamId: index % 2 ? "lake" : "forest",
      joinedAt: index,
    })),
    currentGame: "challenge",
    party: {
      ...contextForExperience("smoke-neon-norrebro", compact ? "compact" : "normal"),
    },
    speakerSlots: {},
  };
}

describe("Tongs of Truth lifecycle", () => {
  test("runs beside a foreground game and never puts transcript fields in public state", () => {
    const launched = launchTongsOfTruthState(room(6), "tongs_1", 0)!;
    expect(launched.currentGame).toBe("challenge");
    expect(launched.tongsoftruth?.totalRounds).toBe(6);
    expect(launched.tongsoftruth?.level).toBe(1);
    expect(/transcript|storagePath|audioUrl/i.test(JSON.stringify(launched.tongsoftruth))).toBe(
      false,
    );

    const questioned = setTongsQuestionState(launched, {
      runId: "tongs_1",
      roundId: "tongs_1_r1",
      question: "Which plan burned first?",
      aiFallback: false,
    })!;
    const recording = startTongsRecordingState(questioned, {
      runId: "tongs_1",
      playerId: "p1",
      now: 1_000,
    })!;
    const judging = markTongsJudgingState(recording, "tongs_1", "tongs_1_r1")!;
    const review = reviewTongsRoundState(judging, "tongs_1", "tongs_1_r1")!;
    expect(review.tongsoftruth?.status).toBe("review");
  });

  test("compact mode selects five speakers and keeps every turn at heat level three", () => {
    let state = launchTongsOfTruthState(room(8, true), "compact_tongs", 0)!;
    expect(state.tongsoftruth?.speakerOrder).toHaveLength(5);
    expect(state.tongsoftruth?.level).toBe(3);

    for (let round = 1; round <= 5; round += 1) {
      const run = state.tongsoftruth!;
      state = setTongsQuestionState(state, {
        runId: run.runId,
        roundId: run.currentRoundId,
        question: `Question ${round}?`,
        aiFallback: false,
      })!;
      state = revealTongsRoundState(state, run.runId, {
        roundId: run.currentRoundId,
        speakerPlayerId: run.speakerPlayerId,
        speakerName: run.speakerName,
        level: run.level,
        question: `Question ${round}?`,
        honestyScore: 5,
        dodgeDetected: false,
        artistryScore: 2,
        environmentUsed: false,
        points: 7,
        comment: "Specific enough.",
        source: "ai",
      })!;
      state = nextTongsRoundState(state, run.runId, 10_000 + round)!;
      if (round < 5) expect(state.tongsoftruth?.level).toBe(3);
    }

    expect(state.tongsoftruth?.status).toBe("results");
    expect(state.tongsoftruth?.roundResults).toHaveLength(5);
    expect(state.finale?.evidence.at(-1)?.gameId).toBe("tongsoftruth");
    expect(state.party?.storyEvidence?.at(-1)?.gameId).toBe("tongsoftruth");
    expect(nextTongsRoundState(state, "compact_tongs", 20_000)).toBe(state);
  });

  test("keeps the scoring formula and manual payload bounds server-side", () => {
    expect(
      tongsPoints({
        honestyScore: 8,
        dodgeDetected: false,
        artistryScore: 4,
        environmentUsed: false,
      }),
    ).toBe(12);
    expect(
      tongsPoints({
        honestyScore: 2,
        dodgeDetected: true,
        artistryScore: 1,
        environmentUsed: false,
      }),
    ).toBe(0);
    expect(
      tongsPoints({
        honestyScore: 8,
        dodgeDetected: false,
        artistryScore: 4,
        environmentUsed: true,
      }),
    ).toBe(17);

    expect(
      tongsRequestSchema.safeParse({
        action: "manual-verdict",
        roomId: "room_1",
        runId: "run_1",
        roundId: "round_1",
        honestyScore: 11,
        dodgeDetected: false,
        artistryScore: 2,
        environmentUsed: false,
        comment: "No.",
      }).success,
    ).toBe(false);
  });

  test("lets the audience bet dodge or stand and clears bets on the next turn", () => {
    const launched = launchTongsOfTruthState(room(4), "tongs_bet", 0)!;
    const questioned = setTongsQuestionState(launched, {
      runId: "tongs_bet",
      roundId: "tongs_bet_r1",
      question: "Who burned the first sausage?",
      aiFallback: false,
    })!;

    expect(
      placeTongsAudienceBetState(questioned, {
        runId: "tongs_bet",
        playerId: "p1",
        guess: "dodge",
      }),
    ).toBeNull();

    const withBet = placeTongsAudienceBetState(questioned, {
      runId: "tongs_bet",
      playerId: "p2",
      guess: "dodge",
    })!;
    expect(withBet.tongsoftruth?.audienceBets).toEqual({ p2: "dodge" });
    expect(withBet.currentGame).toBe("challenge");

    const changed = placeTongsAudienceBetState(withBet, {
      runId: "tongs_bet",
      playerId: "p2",
      guess: "stand",
    })!;
    expect(changed.tongsoftruth?.audienceBets).toEqual({ p2: "stand" });

    const revealed = revealTongsRoundState(changed, "tongs_bet", {
      roundId: "tongs_bet_r1",
      speakerPlayerId: "p1",
      speakerName: "Player 1",
      level: 1,
      question: "Who burned the first sausage?",
      honestyScore: 4,
      dodgeDetected: true,
      artistryScore: 1,
      environmentUsed: false,
      points: 2,
      comment: "Slipped the question.",
      source: "ai",
      audienceDodgeCount: 0,
      audienceStandCount: 1,
      correctBetterIds: [],
    })!;
    const next = nextTongsRoundState(revealed, "tongs_bet", 20_000)!;
    expect(next.tongsoftruth?.audienceBets).toEqual({});
    expect(next.tongsoftruth?.status).toBe("question");
  });

  test("scores the dodge side bet and pays nothing on a skipped round", () => {
    const bets = { p2: "dodge" as const, p3: "stand" as const, p4: "dodge" as const };
    expect(scoreTongsAudienceBets(bets, true)).toEqual({
      audienceDodgeCount: 2,
      audienceStandCount: 1,
      correctBetterIds: ["p2", "p4"],
    });
    expect(scoreTongsAudienceBets(bets, false)).toEqual({
      audienceDodgeCount: 2,
      audienceStandCount: 1,
      correctBetterIds: ["p3"],
    });
    expect(scoreTongsAudienceBets(bets, true, true).correctBetterIds).toEqual([]);
  });

  test("accepts the audience-bet payload", () => {
    expect(
      tongsRequestSchema.safeParse({
        action: "audience-bet",
        roomId: "room_1",
        runId: "run_1",
        playerId: "p2",
        guess: "dodge",
      }).success,
    ).toBe(true);
    expect(
      tongsRequestSchema.safeParse({
        action: "audience-bet",
        roomId: "room_1",
        runId: "run_1",
        playerId: "p2",
        guess: "flee",
      }).success,
    ).toBe(false);
  });

  test("rejects rooms outside the 3–30 player contract", () => {
    expect(launchTongsOfTruthState(room(2), "too_small", 0)).toBeNull();
    expect(launchTongsOfTruthState(room(31), "too_large", 0)).toBeNull();
  });
});
