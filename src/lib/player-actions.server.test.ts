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
  test("joins and updates a player without replacing full room state", async () => {
    const joined = await applyPlayerAction(
      roomState(),
      {
        action: "join",
        playerId: "p1",
        name: "Ada",
        teamId: "forest",
        playerSecretHash: "hash-p1",
      },
      1000,
    );
    const updated = await applyPlayerAction(
      joined,
      {
        action: "join",
        playerId: "p1",
        name: "Ada Prime",
        teamId: "lake",
        playerSecretHash: "hash-p1",
      },
      2000,
    );

    expect(updated.players).toHaveLength(1);
    expect(updated.players[0]?.id).toBe("p1");
    expect(updated.players[0]?.name).toBe("Ada Prime");
    expect(updated.players[0]?.teamId).toBe("lake");
    expect(updated.players[0]?.joinedAt).toBe(1000);
    expect(updated.players[0]?.secretHash).toBe("hash-p1");
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(joined, {
          action: "join",
          playerId: "p1",
          name: "Ada Fake",
          teamId: "lake",
          playerSecretHash: "hash-wrong",
        }),
      ),
    ).toBe(403);
  });

  test("starts Challenge recording only for the active operator", async () => {
    const state = roomState({
      status: "playing",
      currentGame: "challenge",
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1, secretHash: "hash-p1" },
        { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2, secretHash: "hash-p2" },
      ],
      challenge: {
        phase: "briefing",
        roundId: "ch_1",
        task: "Make a weather report.",
        operatorId: "p1",
        operatorName: "Ada",
      },
    });

    const started = await applyPlayerAction(
      state,
      { action: "challenge-start-recording", playerId: "p1", playerSecretHash: "hash-p1" },
      10_000,
    );

    expect(started.challenge?.phase).toBe("recording");
    expect(started.challenge?.recordingEndsAt).toBe(35_000);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(state, {
          action: "challenge-start-recording",
          playerId: "p2",
          playerSecretHash: "hash-p2",
        }),
      ),
    ).toBe(403);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(state, {
          action: "challenge-start-recording",
          playerId: "p1",
          playerSecretHash: "hash-p2",
        }),
      ),
    ).toBe(403);
  });

  test("validates Spectrum Court clue, guess, and appeal roles", async () => {
    const base = roomState({
      status: "playing",
      currentGame: "spectrumcourt",
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1, secretHash: "hash-p1" },
        { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2, secretHash: "hash-p2" },
      ],
      spectrumcourt: {
        phase: "clue",
        roundId: "sc_1",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
        clueTeamId: "forest",
        target: 62,
      },
    });

    const clue = await applyPlayerAction(base, {
      action: "spectrumcourt-clue",
      playerId: "p1",
      playerSecretHash: "hash-p1",
      clue: "quietly catastrophic",
    });
    const guessing = {
      ...clue,
      spectrumcourt: { ...clue.spectrumcourt!, phase: "guessing" as const, guessEndsAt: 20_000 },
    };
    const guessed = await applyPlayerAction(
      guessing,
      { action: "spectrumcourt-guess", playerId: "p2", playerSecretHash: "hash-p2", value: 58.8 },
      10_000,
    );

    expect(clue.spectrumcourt?.clue).toBe("quietly catastrophic");
    expect(guessed.spectrumcourt?.guesses?.p2).toBe(59);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(base, {
          action: "spectrumcourt-clue",
          playerId: "p2",
          playerSecretHash: "hash-p2",
          clue: "wrong team",
        }),
      ),
    ).toBe(403);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(
          guessing,
          {
            action: "spectrumcourt-guess",
            playerId: "p1",
            playerSecretHash: "hash-p1",
            value: 50,
          },
          10_000,
        ),
      ),
    ).toBe(403);
  });

  test("accepts Who Among votes only while voting is open", async () => {
    const state = roomState({
      status: "playing",
      currentGame: "whoamong",
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1, secretHash: "hash-p1" },
        { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2, secretHash: "hash-p2" },
      ],
      whoamong: {
        phase: "voting",
        roundId: "wa_1",
        roundNumber: 1,
        totalRounds: 5,
        usedPromptIds: [],
        promptId: "chaos",
        prompt: "Кто устроит хаос?",
        voteEndsAt: 12_000,
      },
    });

    const voted = await applyPlayerAction(
      state,
      {
        action: "whoamong-vote",
        playerId: "p1",
        playerSecretHash: "hash-p1",
        targetPlayerId: "p2",
      },
      10_000,
    );

    expect(voted.whoamong?.votes?.p1).toBe("p2");
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(
          state,
          {
            action: "whoamong-vote",
            playerId: "p1",
            playerSecretHash: "hash-p1",
            targetPlayerId: "p2",
          },
          13_000,
        ),
      ),
    ).toBe(409);
  });
});
