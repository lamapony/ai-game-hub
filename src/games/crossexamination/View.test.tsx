import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState } from "@/lib/types";
import type {
  CrossExaminationPair,
  CrossExaminationPairResult,
  CrossExaminationQuestion,
  CrossExaminationStatus,
  RoomState,
} from "@/lib/types";
import { CrossExaminationHost } from "./HostView";
import { CrossExaminationPlayer } from "./PlayerView";

const pair: CrossExaminationPair = {
  pairId: "pair_1",
  playerAId: "p1",
  playerAName: "Nora",
  playerBId: "p2",
  playerBName: "Mads",
};

const questions: CrossExaminationQuestion[] = [
  { questionId: "q1", category: "order", text: "Who touched the empty glass first?" },
  { questionId: "q2", category: "object", text: "Where were the tongs?" },
  { questionId: "q3", category: "person", text: "Whose coat moved?" },
  { questionId: "q4", category: "detail", text: "What did the room misunderstand?" },
];

const result: CrossExaminationPairResult = {
  ...pair,
  findings: questions.map((question, index) => ({
    ...question,
    question: question.text,
    versionA: "The glass was empty.",
    versionB: "The toast came first.",
    severity: index === 0 ? 3 : 0,
  })),
  alibiStrength: 7,
  environmentBonus: 5,
  pairPoints: 12,
  verdict: "The glass lied first.",
  predictionCounts: { order: 4 },
  correctPredictionCategories: ["order"],
  correctVoterIds: ["p3"],
  source: "ai",
};

function state(status: CrossExaminationStatus): RoomState {
  const value = emptyRoomState("Host");
  value.status = "playing";
  value.players = [
    { id: "p1", name: "Nora", teamId: "a", joinedAt: 1 },
    { id: "p2", name: "Mads", teamId: "b", joinedAt: 2 },
    { id: "p3", name: "Liv", teamId: "a", joinedAt: 3 },
  ];
  value.teams = [
    { id: "a", name: "A", color: "green", score: 0 },
    { id: "b", name: "B", color: "blue", score: 0 },
  ];
  value.crossexamination = {
    runId: "cross_1",
    status,
    participantIds: ["p1", "p2", "p3"],
    pairOrder: [pair],
    pairNumber: 1,
    totalPairs: 1,
    currentPairId: pair.pairId,
    questions,
    selectedSourceCount: 3,
    submittedPlayerIds: status === "capturing" ? ["p1"] : ["p1", "p2"],
    predictionVoterIds: ["p3"],
    result: status === "reveal" ? result : undefined,
    pairResults: status === "reveal" ? [result] : [],
  };
  return value;
}

describe("Cross Examination views", () => {
  test("renders the host reveal as a tape comparison without exposing microphone decoration", () => {
    const html = renderToStaticMarkup(
      <CrossExaminationHost roomId="room_1" code="TAPE" state={state("reveal")} />,
    );

    expect(html).toContain('class="agh-cross agh-cross-host"');
    expect(html).toContain('data-cross-phase="reveal"');
    expect(html).toContain("TWO STORIES.");
    expect(html).toContain("The glass lied first.");
    expect(html).toContain("REAL EVIDENCE +5");
    expect(html.includes("🎙")).toBe(false);
    expect(html.includes("🚨")).toBe(false);
  });

  test("keeps the audience prediction buttons real and category-specific", () => {
    const audienceState = state("capturing");
    audienceState.crossexamination!.predictionVoterIds = [];
    const html = renderToStaticMarkup(
      <CrossExaminationPlayer
        roomId="room_1"
        state={audienceState}
        me={{ id: "p3", name: "Liv", teamId: "a" }}
      />,
    );

    expect(html).toContain('class="agh-cross-vote-button"');
    expect(html).toContain("event order");
    expect(html).toContain("real object");
    expect(html).toContain("who did it");
    expect(html).toContain("small detail");
  });

  test("gives an accomplice a private recorder with the authored control copy", () => {
    const html = renderToStaticMarkup(
      <CrossExaminationPlayer
        roomId="room_1"
        state={state("capturing")}
        me={{ id: "p2", name: "Mads", teamId: "b" }}
      />,
    );

    expect(html).toContain('data-testid="audio-recorder"');
    expect(html).toContain("Start private take");
    expect(html).toContain("The room only hears the host&#x27;s short public cut.");
  });
});
