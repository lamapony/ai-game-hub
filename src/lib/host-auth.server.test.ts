import { describe, expect, test } from "bun:test";
import { mergeHostSubmittedState } from "./host-auth.server";
import { emptyRoomState, type RoomState } from "./types";

function baseState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    ...emptyRoomState("Host"),
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    ...overrides,
  };
}

describe("mergeHostSubmittedState", () => {
  test("preserves players who joined after the host snapshot was rendered", () => {
    const submitted = baseState({
      status: "playing",
      currentGame: "trackguess",
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
      trackguess: {
        phase: "briefing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: [],
      },
    });
    const current = baseState({
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1, secretHash: "hash-p1" },
        { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2, secretHash: "hash-p2" },
      ],
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.currentGame).toBe("trackguess");
    expect(merged.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(merged.players.find((player) => player.id === "p1")?.secretHash).toBe("hash-p1");
    expect(merged.players.find((player) => player.id === "p2")?.secretHash).toBe("hash-p2");
  });

  test("keeps newer speaker heartbeats from the current room state", () => {
    const submitted = baseState({
      speakerSlots: {
        1: { connected: true, name: "Main Stage", lastSeenAt: 100 },
        2: { connected: true, name: "Oak Spirit", lastSeenAt: 100 },
      },
    });
    const current = baseState({
      speakerSlots: {
        1: { connected: true, name: "Main Stage", lastSeenAt: 110 },
        2: { connected: true, name: "Oak Spirit", lastSeenAt: 200 },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.speakerSlots[1]?.lastSeenAt).toBe(110);
    expect(merged.speakerSlots[2]?.lastSeenAt).toBe(200);
  });

  test("preserves same-round votes from current state when host submitted a stale snapshot", () => {
    const submitted = baseState({
      currentGame: "trackguess",
      paused: { startedAt: 5000 },
      trackguess: {
        phase: "guessing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real" },
      },
    });
    const current = baseState({
      currentGame: "trackguess",
      trackguess: {
        phase: "guessing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real", p2: "ai" },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.paused?.startedAt).toBe(5000);
    expect(merged.trackguess?.guesses).toEqual({ p1: "real", p2: "ai" });
  });

  test("does not merge player votes across a host phase transition", () => {
    const submitted = baseState({
      currentGame: "trackguess",
      trackguess: {
        phase: "reveal",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real" },
        revealEndsAt: 9000,
      },
    });
    const current = baseState({
      currentGame: "trackguess",
      trackguess: {
        phase: "guessing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real", p2: "ai" },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.trackguess?.phase).toBe("reveal");
    expect(merged.trackguess?.guesses).toEqual({ p1: "real" });
  });

  test("preserves same-round Spectrum Court clue and appeals from current state", () => {
    const submitted = baseState({
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "appeal",
        roundId: "sc_1",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: ["spicy"],
        guesses: { p1: 40 },
      },
    });
    const current = baseState({
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "appeal",
        roundId: "sc_1",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: ["spicy"],
        clue: "quiet chaos",
        cluePlayerId: "p3",
        guesses: { p1: 40, p2: 64 },
        appeals: { p2: { direction: "higher" } },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.spectrumcourt?.clue).toBe("quiet chaos");
    expect(merged.spectrumcourt?.cluePlayerId).toBe("p3");
    expect(merged.spectrumcourt?.guesses).toEqual({ p1: 40, p2: 64 });
    expect(merged.spectrumcourt?.appeals).toEqual({ p2: { direction: "higher" } });
  });
});
