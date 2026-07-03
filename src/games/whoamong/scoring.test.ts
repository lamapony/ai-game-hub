import { describe, expect, test } from "bun:test";
import { scoreWhoAmongRound } from "./scoring";
import type { RoomState } from "@/lib/types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
      { id: "fire", name: "Fire", color: "red", score: 0 },
    ],
    players: [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Three", teamId: "fire", joinedAt: 3 },
    ],
    currentGame: "whoamong",
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

function whoAmongState(
  overrides: Partial<NonNullable<RoomState["whoamong"]>> = {},
): NonNullable<RoomState["whoamong"]> {
  return {
    phase: "reveal",
    roundId: "wa_1",
    roundNumber: 1,
    totalRounds: 5,
    usedPromptIds: ["sleep-party"],
    promptId: "sleep-party",
    prompt: "Who among us is most likely to fall asleep before the party ends?",
    ...overrides,
  };
}

describe("who among scoring", () => {
  test("awards star and voter points for clear winner", () => {
    const state = roomState({
      whoamong: whoAmongState({
        votes: { p1: "p2", p2: "p2", p3: "p1" },
      }),
    });

    const { teams, roundResult } = scoreWhoAmongRound(state, state.whoamong!);

    expect(roundResult?.starIds).toEqual(["p2"]);
    expect(roundResult?.correctVoterIds.sort()).toEqual(["p1", "p2"]);
    expect(teams.find((t) => t.id === "lake")?.score).toBe(5);
    expect(teams.find((t) => t.id === "forest")?.score).toBe(2);
    expect(teams.find((t) => t.id === "fire")?.score).toBe(0);
  });

  test("gives star points to every team when multiple players tie for first", () => {
    const state = roomState({
      whoamong: whoAmongState({
        votes: { p1: "p2", p2: "p3", p3: "p2" },
      }),
    });

    const tied = roomState({
      whoamong: whoAmongState({
        votes: { p1: "p2", p2: "p3", p3: "p1" },
      }),
    });

    const { teams, roundResult } = scoreWhoAmongRound(tied, tied.whoamong!);

    expect(roundResult?.starIds.sort()).toEqual(["p1", "p2", "p3"]);
    expect(teams.find((t) => t.id === "forest")?.score).toBe(5);
    expect(teams.find((t) => t.id === "lake")?.score).toBe(5);
    expect(teams.find((t) => t.id === "fire")?.score).toBe(5);
  });

  test("awards nothing when nobody voted", () => {
    const state = roomState({
      whoamong: whoAmongState({ votes: {} }),
    });

    const { teams, roundResult } = scoreWhoAmongRound(state, state.whoamong!);

    expect(roundResult?.starIds).toEqual([]);
    expect(roundResult?.correctVoterIds).toEqual([]);
    expect(teams.every((t) => t.score === 0)).toBe(true);
  });

  test("returns null round result without prompt", () => {
    const state = roomState({
      whoamong: whoAmongState({ promptId: undefined, prompt: undefined }),
    });

    const { teams, roundResult } = scoreWhoAmongRound(state, state.whoamong!);

    expect(roundResult).toBeNull();
    expect(teams).toBe(state.teams);
  });
});
