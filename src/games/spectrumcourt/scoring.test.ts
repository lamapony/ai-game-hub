import { describe, expect, test } from "bun:test";
import { scoreSpectrumCourtRound } from "./scoring";
import type { RoomState, SpectrumCourtState } from "@/lib/types";

function roomState(): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    currentGame: "spectrumcourt",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
      { id: "fire", name: "Fire", color: "red", score: 0 },
    ],
    players: [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Three", teamId: "lake", joinedAt: 3 },
      { id: "p4", name: "Four", teamId: "fire", joinedAt: 4 },
    ],
    speakerSlots: {
      1: { connected: true, name: "Main Stage" },
      2: { connected: false, name: "Oak Spirit" },
      3: { connected: false, name: "The Wind" },
      4: { connected: false, name: "Squirrel Gossip" },
      5: { connected: false, name: "Forest Echo" },
    },
  };
}

function spectrumState(overrides: Partial<SpectrumCourtState> = {}): SpectrumCourtState {
  return {
    phase: "appeal",
    roundId: "sc_1",
    roundNumber: 1,
    totalRounds: 4,
    usedSpectrumIds: ["romantic-cringe"],
    spectrumId: "romantic-cringe",
    leftLabel: "romantic",
    rightLabel: "cringe",
    target: 64,
    clueTeamId: "forest",
    cluePlayerId: "p1",
    clue: "matching tattoos on a first date",
    guesses: { p2: 58, p3: 60, p4: 90 },
    appeals: {},
    roundResults: [],
    ...overrides,
  };
}

describe("spectrum court scoring", () => {
  test("scores team averages and gives clue team the best guess score", () => {
    const result = scoreSpectrumCourtRound(roomState(), spectrumState());

    expect(result?.roundResult.teamResults).toHaveLength(2);
    expect(result?.roundResult.teamResults[0]?.teamId).toBe("lake");
    expect(result?.roundResult.teamResults[0]?.rawGuess).toBe(59);
    expect(result?.roundResult.teamResults[0]?.distance).toBe(5);
    expect(result?.roundResult.teamResults[0]?.points).toBe(10);
    expect(result?.teams.find((team) => team.id === "forest")?.score).toBe(10);
    expect(result?.teams.find((team) => team.id === "lake")?.score).toBe(10);
    expect(result?.teams.find((team) => team.id === "fire")?.score).toBe(7);
  });

  test("majority appeal nudges a team guess before scoring", () => {
    const result = scoreSpectrumCourtRound(
      roomState(),
      spectrumState({
        target: 64,
        guesses: { p2: 56, p3: 58 },
        appeals: {
          p2: { direction: "higher" },
          p3: { direction: "higher" },
        },
      }),
    );

    const lake = result?.roundResult.teamResults.find((entry) => entry.teamId === "lake");
    expect(lake?.rawGuess).toBe(57);
    expect(lake?.finalGuess).toBe(62);
    expect(lake?.appealDirection).toBe("higher");
    expect(lake?.points).toBe(10);
  });

  test("returns null for incomplete round state", () => {
    expect(scoreSpectrumCourtRound(roomState(), spectrumState({ clue: undefined }))).toBeNull();
  });
});
