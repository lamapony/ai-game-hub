import { describe, expect, test } from "bun:test";
import { applyPlayerAction } from "./player-actions.server";
import type { RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "lobby",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [],
    currentGame: null,
    speakerSlots: {
      1: { connected: true, name: "Main Stage" },
      2: { connected: false, name: "Oak Spirit" },
      3: { connected: false, name: "The Wind" },
      4: { connected: false, name: "Field Notes" },
      5: { connected: false, name: "Forest Echo" },
    },
    ...overrides,
  };
}

async function rejectedStatus(run: () => Promise<unknown>) {
  try {
    await run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("player server actions", () => {
  test("rejects unknown player actions", async () => {
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(roomState(), { action: "unknown" as never, playerId: "p1" }),
      ),
    ).toBe(400);
  });

  test("joins and updates a player using the latest room state", async () => {
    const joined = await applyPlayerAction(
      roomState(),
      { action: "join", playerId: "p1", name: "Ada", teamId: "forest" },
      1000,
    );
    const updated = await applyPlayerAction(
      joined,
      { action: "join", playerId: "p1", name: "Ada Lovelace", teamId: "lake" },
      2000,
    );

    expect(joined.players[0]?.id).toBe("p1");
    expect(joined.players[0]?.name).toBe("Ada");
    expect(joined.players[0]?.teamId).toBe("forest");
    expect(updated.players).toHaveLength(1);
    expect(updated.players[0]?.id).toBe("p1");
    expect(updated.players[0]?.name).toBe("Ada Lovelace");
    expect(updated.players[0]?.teamId).toBe("lake");
    expect(updated.players[0]?.joinedAt).toBe(1000);
  });

  test("ensures a stored player and refuses invalid team switches", async () => {
    const ensured = await applyPlayerAction(
      roomState(),
      { action: "ensure-player", playerId: "p1", name: "Ada", teamId: "missing" },
      1000,
    );

    expect(ensured.players[0]?.teamId).toBe("forest");
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(ensured, {
          action: "switch-team",
          playerId: "p1",
          name: "Ada",
          teamId: "missing",
        }),
      ),
    ).toBe(409);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(ensured, {
          action: "switch-team",
          playerId: "ghost",
          name: "Ghost",
          teamId: "lake",
        }),
      ),
    ).toBe(404);
  });

  test("accepts one valid director audience response per player and moment", async () => {
    const state = roomState({
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
      eventDirector: {
        mode: "running",
        playlist: [],
        segments: [],
        spokenTranscript: [],
        micCapture: { status: "idle" },
        providerStatus: { provider: "none", configured: false, connected: false },
        safetyMode: "smart-adult",
        playerMoment: {
          id: "moment_1",
          mode: "react",
          prompt: "Pick a mood.",
          options: ["precise", "reckless"],
          createdAt: 1000,
          expiresAt: 5000,
        },
      },
    });

    const reacted = await applyPlayerAction(
      state,
      { action: "audience-response", playerId: "p1", option: "precise" },
      2000,
    );
    const duplicate = await applyPlayerAction(
      reacted,
      { action: "audience-response", playerId: "p1", option: "reckless" },
      3000,
    );

    expect(reacted.eventDirector?.audienceResponses).toHaveLength(1);
    expect(reacted.eventDirector?.audienceResponses?.[0]?.momentId).toBe("moment_1");
    expect(reacted.eventDirector?.audienceResponses?.[0]?.playerId).toBe("p1");
    expect(reacted.eventDirector?.audienceResponses?.[0]?.option).toBe("precise");
    expect(duplicate.eventDirector?.audienceResponses).toHaveLength(1);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(state, {
          action: "audience-response",
          playerId: "p1",
          option: "not available",
        }),
      ),
    ).toBe(409);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(
          state,
          { action: "audience-response", playerId: "p1", option: "precise" },
          6000,
        ),
      ),
    ).toBe(409);
  });

  test("validates Soundscape topic voting against the active topic list", async () => {
    const state = roomState({
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
      status: "playing",
      currentGame: "soundscape",
      soundscape: {
        phase: "topics",
        roundId: "snd_1",
        topics: ["wind", "water"],
      },
    });

    const voted = await applyPlayerAction(state, {
      action: "soundscape-topic-vote",
      playerId: "p1",
      topic: "wind",
    });

    expect(voted.soundscape?.topicVotes?.p1).toBe("wind");
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(state, {
          action: "soundscape-topic-vote",
          playerId: "p1",
          topic: "fire",
        }),
      ),
    ).toBe(409);
  });

  test("starts Challenge recording only for the current operator", async () => {
    const state = roomState({
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
        { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2 },
      ],
      status: "playing",
      currentGame: "challenge",
      challenge: {
        phase: "briefing",
        roundId: "ch_1",
        task: "Make a field report.",
        operatorId: "p1",
        operatorName: "Ada",
      },
    });

    const started = await applyPlayerAction(
      state,
      { action: "challenge-start-recording", playerId: "p1" },
      10_000,
    );

    expect(started.challenge?.phase).toBe("recording");
    expect(started.challenge?.recordingEndsAt).toBe(35_000);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(state, { action: "challenge-start-recording", playerId: "p2" }),
      ),
    ).toBe(403);
  });

  test("accepts Track Guess choices only while guessing is open", async () => {
    const state = roomState({
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
      status: "playing",
      currentGame: "trackguess",
      trackguess: {
        phase: "guessing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: [],
        roundResults: [],
        guessEndsAt: 12_000,
      },
    });

    const guessed = await applyPlayerAction(
      state,
      { action: "trackguess-guess", playerId: "p1", choice: "ai" },
      10_000,
    );

    expect(guessed.trackguess?.guesses?.p1).toBe("ai");
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(
          state,
          { action: "trackguess-guess", playerId: "p1", choice: "real" },
          13_000,
        ),
      ),
    ).toBe(409);
  });

  test("validates Spectrum Court clue, guess, and appeal roles", async () => {
    const base = roomState({
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
        { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2 },
      ],
      status: "playing",
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "clue",
        roundId: "sc_1",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
        roundResults: [],
        clueTeamId: "forest",
        target: 62,
      },
    });

    const clue = await applyPlayerAction(base, {
      action: "spectrumcourt-clue",
      playerId: "p1",
      clue: "quietly catastrophic",
    });
    const guessing = {
      ...clue,
      spectrumcourt: { ...clue.spectrumcourt!, phase: "guessing" as const },
    };
    const guessed = await applyPlayerAction(
      guessing,
      { action: "spectrumcourt-guess", playerId: "p2", value: 58.8 },
      10_000,
    );
    const appealState = {
      ...guessed,
      spectrumcourt: { ...guessed.spectrumcourt!, phase: "appeal" as const },
    };
    const appealed = await applyPlayerAction(
      appealState,
      { action: "spectrumcourt-appeal", playerId: "p2", direction: "higher" },
      11_000,
    );

    expect(clue.spectrumcourt?.clue).toBe("quietly catastrophic");
    expect(guessed.spectrumcourt?.guesses?.p2).toBe(59);
    expect(appealed.spectrumcourt?.appeals?.p2?.direction).toBe("higher");
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(base, {
          action: "spectrumcourt-clue",
          playerId: "p2",
          clue: "wrong team",
        }),
      ),
    ).toBe(403);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(guessing, {
          action: "spectrumcourt-guess",
          playerId: "p1",
          value: 50,
        }),
      ),
    ).toBe(403);
  });
});
