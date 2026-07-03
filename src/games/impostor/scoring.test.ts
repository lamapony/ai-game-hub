import { describe, expect, test } from "bun:test";
import type { ImpostorState, RoomState } from "@/lib/types";
import { scoreImpostorRound } from "./scoring";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    currentGame: "impostor",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "Anya", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Boris", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Vera", teamId: "forest", joinedAt: 3 },
    ],
    speakerSlots: {},
    ...overrides,
  };
}

function impostorState(overrides: Partial<ImpostorState> = {}): ImpostorState {
  return {
    phase: "voting",
    roundId: "imp-1",
    roundNumber: 1,
    totalRounds: 4,
    usedQuestionIds: ["q1"],
    questionId: "q1",
    question: "Худший тост?",
    answers: { p1: "за налоги", p2: "за нас", p3: "за понедельник" },
    shuffled: [
      { id: "a1", playerId: "p1", text: "за налоги" },
      { id: "a2", playerId: "p2", text: "за нас" },
      { id: "a3", playerId: "p3", text: "за понедельник" },
      { id: "ai", text: "за стабильность" },
    ],
    aiAnswerId: "ai",
    votes: {},
    ...overrides,
  };
}

describe("scoreImpostorRound", () => {
  test("awards +3 per correct bot spotter", () => {
    const state = roomState();
    const imp = impostorState({ votes: { p1: "ai", p2: "ai", p3: "a1" } });
    const { teams, roundResult } = scoreImpostorRound(state, imp);

    expect(roundResult).not.toBeNull();
    expect(roundResult!.correctVoterIds.sort()).toEqual(["p1", "p2"]);
    // p1 (forest) +3 spotter; p3 voted for p1's answer → p1 +1 decoy
    expect(teams.find((t) => t.id === "forest")!.score).toBe(4);
    // p2 (lake) +3 spotter
    expect(teams.find((t) => t.id === "lake")!.score).toBe(3);
  });

  test("awards decoy points for votes on human answers", () => {
    const state = roomState();
    const imp = impostorState({ votes: { p1: "a2", p3: "a2" } });
    const { teams, roundResult } = scoreImpostorRound(state, imp);

    expect(roundResult!.correctVoterIds).toEqual([]);
    // p2's answer fooled two voters → lake +2
    expect(teams.find((t) => t.id === "lake")!.score).toBe(2);
    expect(teams.find((t) => t.id === "forest")!.score).toBe(0);
  });

  test("returns null result when round data is incomplete", () => {
    const state = roomState();
    const imp = impostorState({ shuffled: undefined, aiAnswerId: undefined });
    const { teams, roundResult } = scoreImpostorRound(state, imp);
    expect(roundResult).toBeNull();
    expect(teams).toBe(state.teams);
  });

  test("no self-decoy points if voter picks own answer", () => {
    const state = roomState();
    const imp = impostorState({ votes: { p1: "a1" } });
    const { teams } = scoreImpostorRound(state, imp);
    expect(teams.every((t) => t.score === 0)).toBe(true);
  });
});
