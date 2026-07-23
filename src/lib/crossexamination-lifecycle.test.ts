import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import {
  correctCrossPredictionCategories,
  crossAlibiStrength,
  crossEnvironmentBonus,
  crossPairPoints,
  fixedCrossSeverity,
  splitCrossPairPoints,
} from "@/games/crossexamination/scoring";
import {
  dismissCrossExaminationState,
  launchCrossExaminationState,
  markCrossExaminationPredictionState,
  markCrossExaminationSubmittedState,
  nextCrossExaminationPairState,
  openCrossExaminationCaptureState,
  revealCrossExaminationState,
  reviewCrossExaminationState,
  selectCrossExaminationPairs,
  setCrossExaminationQuestionsState,
} from "./game-state";
import { crossExaminationRequestSchema } from "./crossexamination-lifecycle";
import type {
  CrossExaminationPair,
  CrossExaminationPairResult,
  CrossExaminationQuestion,
  RoomState,
} from "./types";

function room(count = 8): RoomState {
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
    currentGame: null,
    party: contextForExperience("smoke-neon-norrebro", "normal"),
    speakerSlots: {},
  };
}

function questions(pair: CrossExaminationPair): CrossExaminationQuestion[] {
  return ["order", "object", "person", "detail"].map((category, index) => ({
    questionId: `${pair.pairId}_q${index + 1}`,
    category: category as CrossExaminationQuestion["category"],
    text: `Question ${index + 1} about the real scene?`,
  }));
}

function result(pair: CrossExaminationPair): CrossExaminationPairResult {
  return {
    pairId: pair.pairId,
    playerAId: pair.playerAId,
    playerAName: pair.playerAName,
    playerBId: pair.playerBId,
    playerBName: pair.playerBName,
    findings: questions(pair).map((question) => ({
      ...question,
      question: question.text,
      versionA: "The foil moved first",
      versionB: "The foil moved first",
      severity: 0,
    })),
    alibiStrength: 10,
    environmentBonus: 5,
    pairPoints: 15,
    verdict: "An inconveniently sturdy alibi.",
    predictionCounts: {},
    correctPredictionCategories: [],
    correctVoterIds: [],
    source: "ai",
  };
}

describe("Cross Examination lifecycle", () => {
  test("selects three to four unique pairs and exposes no private evidence", () => {
    const pairs = selectCrossExaminationPairs(room(), "cross_1", 0);
    expect(pairs).toHaveLength(4);
    expect(new Set(pairs.flatMap((pair) => [pair.playerAId, pair.playerBId])).size).toBe(8);
    expect(pairs.every((pair) => pair.pairId.startsWith("cross_1_p"))).toBe(true);

    const launched = launchCrossExaminationState(room(), "cross_1", 0)!;
    expect(launched.currentGame).toBe("crossexamination");
    expect(launched.crossexamination?.status).toBe("curation");
    expect(
      /transcript|storagePath|evidenceRecordIds|manualFacts/i.test(
        JSON.stringify(launched.crossexamination),
      ),
    ).toBe(false);
  });

  test("moves from briefing through private capture, review and reveal", () => {
    let state = launchCrossExaminationState(room(), "cross_1", 0)!;
    const pair = state.crossexamination!.pairOrder[0]!;
    const pairQuestions = questions(pair);
    state = setCrossExaminationQuestionsState(state, {
      runId: "cross_1",
      pairId: pair.pairId,
      questions: pairQuestions,
      selectedSourceCount: 3,
      aiFallback: false,
    })!;
    expect(state.crossexamination?.status).toBe("briefing");
    expect((JSON.stringify(state.crossexamination) ?? "").includes("record_1")).toBe(false);

    state = openCrossExaminationCaptureState(state, "cross_1", pair.pairId, 1_000)!;
    state = markCrossExaminationPredictionState(state, "cross_1", pair.pairId, "p2")!;
    state = markCrossExaminationPredictionState(state, "cross_1", pair.pairId, "p2")!;
    expect(state.crossexamination?.predictionVoterIds).toEqual(["p2"]);

    state = markCrossExaminationSubmittedState(state, "cross_1", pair.pairId, pair.playerAId)!;
    expect(state.crossexamination?.status).toBe("capturing");
    state = markCrossExaminationSubmittedState(state, "cross_1", pair.pairId, pair.playerBId)!;
    expect(state.crossexamination?.status).toBe("comparing");
    state = reviewCrossExaminationState(state, "cross_1", pair.pairId)!;
    expect(state.crossexamination?.status).toBe("review");
    state = revealCrossExaminationState(state, "cross_1", result(pair))!;
    expect(state.crossexamination?.status).toBe("reveal");
    expect(state.crossexamination?.pairResults).toHaveLength(1);
  });

  test("ends cleanly and publishes the last pair before returning to the conductor", () => {
    const launched = launchCrossExaminationState(room(6), "cross_final", 0)!;
    const run = launched.crossexamination!;
    const lastPair = run.pairOrder.at(-1)!;
    const revealed: RoomState = {
      ...launched,
      crossexamination: {
        ...run,
        status: "reveal",
        pairNumber: run.totalPairs,
        currentPairId: lastPair.pairId,
        questions: questions(lastPair),
        result: result(lastPair),
        pairResults: [result(lastPair)],
      },
    };

    const completed = nextCrossExaminationPairState(revealed, {
      runId: run.runId,
      pairId: lastPair.pairId,
      now: 5_000,
    })!;
    expect(completed.currentGame).toBeNull();
    expect(completed.crossexamination?.status).toBe("results");
    expect(completed.crossexamination?.completedAt).toBe(5_000);
    expect(completed.finale?.evidence.at(-1)?.gameId).toBe("crossexamination");
    expect(completed.party?.storyEvidence?.at(-1)?.gameId).toBe("crossexamination");

    const replay = nextCrossExaminationPairState(completed, {
      runId: run.runId,
      pairId: lastPair.pairId,
      now: 9_000,
    });
    expect(replay).toBe(completed);
  });

  test("dismiss publishes already revealed pairs before leaving an interrupted run", () => {
    const launched = launchCrossExaminationState(room(6), "cross_dismiss", 0)!;
    const run = launched.crossexamination!;
    const pair = run.pairOrder[0]!;
    const dismissed = dismissCrossExaminationState(
      {
        ...launched,
        crossexamination: {
          ...run,
          status: "curation",
          pairResults: [result(pair)],
        },
      },
      run.runId,
      6_000,
    )!;

    expect(dismissed.currentGame).toBeNull();
    expect(dismissed.crossexamination?.status).toBe("results");
    expect(dismissed.finale?.evidence.at(-1)?.gameId).toBe("crossexamination");
    expect(dismissed.party?.storyEvidence?.at(-1)?.gameId).toBe("crossexamination");
  });

  test("keeps severity, environment bonus and point splitting deterministic", () => {
    expect(fixedCrossSeverity("The foil moved first", "The foil moved first")).toBe(0);
    expect(fixedCrossSeverity("I do not remember", "Dana moved the foil")).toBe(2);
    expect(fixedCrossSeverity("Dana moved the foil", "Dana moved foil slowly")).toBe(1);
    expect(fixedCrossSeverity("Dana moved the foil", "Alex ordered another round")).toBe(3);
    expect(crossAlibiStrength([{ severity: 3 }, { severity: 2 }, { severity: 1 }])).toBe(4);

    const promptFree = questions({
      pairId: "pair_1",
      playerAId: "p1",
      playerAName: "A",
      playerBId: "p2",
      playerBName: "B",
    });
    expect(crossEnvironmentBonus("The smoke took it", "I also saw smoke", promptFree)).toBe(5);
    expect(
      crossEnvironmentBonus(
        "The smoke took it",
        "I also saw smoke",
        promptFree.map((question) => ({ ...question, text: `${question.text} smoke` })),
      ),
    ).toBe(0);
    expect(crossPairPoints(10, 5)).toBe(15);
    expect(splitCrossPairPoints(15)).toEqual([8, 7]);
    expect(
      correctCrossPredictionCategories([
        { category: "order", severity: 3 },
        { category: "object", severity: 1 },
        { category: "detail", severity: 3 },
      ]),
    ).toEqual(["order", "detail"]);
  });

  test("enforces exact bounded host and player request payloads", () => {
    expect(
      crossExaminationRequestSchema.safeParse({
        action: "submit-audio",
        roomId: "room_1",
        runId: "run_1",
        pairId: "pair_1",
        playerId: "player_1",
        storagePath: "room_1/crossexamination/pair_1/player_1-audio.webm",
        durationSeconds: 20,
      }).success,
    ).toBe(true);
    expect(
      crossExaminationRequestSchema.safeParse({
        action: "submit-audio",
        roomId: "room_1",
        runId: "run_1",
        pairId: "pair_1",
        playerId: "player_1",
        storagePath: "path",
        durationSeconds: 61,
      }).success,
    ).toBe(false);
    expect(
      crossExaminationRequestSchema.safeParse({
        action: "prepare",
        roomId: "room_1",
        runId: "run_1",
        excludedRecordIds: [],
        manualFacts: ["A real fact"],
        transcript: "must not enter this route",
      }).success,
    ).toBe(false);
  });

  test("rejects rooms outside the 6–30 player contract", () => {
    expect(launchCrossExaminationState(room(5), "too_small", 0)).toBeNull();
    expect(launchCrossExaminationState(room(31), "too_large", 0)).toBeNull();
  });
});
