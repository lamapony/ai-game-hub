import { describe, expect, test } from "bun:test";
import { applyPlayerAction } from "./player-actions.server";
import { MAX_ROOM_PLAYERS } from "./room-capacity";
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
  test("requires a non-generic player name when joining", async () => {
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(roomState(), {
          action: "join",
          playerId: "p1",
          name: "",
          teamId: "forest",
          playerSecretHash: "hash-p1",
        }),
      ),
    ).toBe(400);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(roomState(), {
          action: "join",
          playerId: "p1",
          name: "Player 1",
          teamId: "forest",
          playerSecretHash: "hash-p1",
        }),
      ),
    ).toBe(400);
  });

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

  test("caps new identities at 30 while allowing an existing player to rejoin", async () => {
    const fullRoom = roomState({
      players: Array.from({ length: MAX_ROOM_PLAYERS }, (_, index) => ({
        id: `p${index + 1}`,
        name: `Guest ${index + 1}`,
        teamId: index % 2 === 0 ? "forest" : "lake",
        joinedAt: index + 1,
        secretHash: `hash-p${index + 1}`,
      })),
    });

    expect(
      await rejectedStatus(() =>
        applyPlayerAction(fullRoom, {
          action: "join",
          playerId: "p31",
          name: "Overflow Guest",
          teamId: "forest",
          playerSecretHash: "hash-p31",
        }),
      ),
    ).toBe(409);

    const rejoined = await applyPlayerAction(fullRoom, {
      action: "join",
      playerId: "p30",
      name: "Returning Guest",
      teamId: "forest",
      playerSecretHash: "hash-p30",
    });

    expect(rejoined.players).toHaveLength(MAX_ROOM_PLAYERS);
    expect(rejoined.players.find((player) => player.id === "p30")?.name).toBe("Returning Guest");
  });

  test("stores an authorized lobby device check and preserves it through team changes", async () => {
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
    const checked = await applyPlayerAction(
      joined,
      {
        action: "device-check",
        playerId: "p1",
        cameraStatus: "ready",
        microphoneStatus: "ready",
        playerSecretHash: "hash-p1",
      },
      2000,
    );
    const switched = await applyPlayerAction(
      checked,
      {
        action: "switch-team",
        playerId: "p1",
        name: "Ada",
        teamId: "lake",
        playerSecretHash: "hash-p1",
      },
      3000,
    );

    expect(switched.players[0]?.deviceCheck).toEqual({
      camera: "ready",
      microphone: "ready",
      checkedAt: 2000,
    });
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(checked, {
          action: "device-check",
          playerId: "p1",
          cameraStatus: "ready",
          microphoneStatus: "not-a-status" as never,
          playerSecretHash: "hash-p1",
        }),
      ),
    ).toBe(400);
    expect(
      await rejectedStatus(() =>
        applyPlayerAction(
          { ...checked, status: "playing" },
          {
            action: "device-check",
            playerId: "p1",
            cameraStatus: "ready",
            microphoneStatus: "ready",
            playerSecretHash: "hash-p1",
          },
        ),
      ),
    ).toBe(409);
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
        prompt: "Who would cause chaos?",
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
