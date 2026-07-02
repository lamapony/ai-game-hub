import { describe, expect, test } from "bun:test";
import { applyDirectorAction } from "./director-actions.server";
import { startDirectorState } from "./event-director";
import type { GameId, RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "lobby",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2 },
    ],
    currentGame: null,
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

async function launch(gameId: GameId, state = roomState()) {
  return applyDirectorAction(state, { action: "launch-game", gameId }, 2000);
}

async function rejectedStatus(run: () => Promise<unknown>) {
  try {
    await run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("director server actions", () => {
  test("starts and suggests using fallback when no AI key is configured", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "";

    const started = await applyDirectorAction(roomState(), { action: "start" }, 1000);
    const suggested = await applyDirectorAction(started, { action: "suggest" }, 1100);

    process.env.OPENAI_API_KEY = oldKey;
    expect(started.eventDirector?.mode).toBe("running");
    expect(suggested.eventDirector?.pendingSuggestion?.fallback).toBe(true);
  });

  test("launches all existing games through protected director action flow", async () => {
    expect((await launch("soundscape")).currentGame).toBe("soundscape");
    expect((await launch("challenge")).currentGame).toBe("challenge");
    expect((await launch("phototunt")).currentGame).toBe("phototunt");
    expect((await launch("trackguess")).currentGame).toBe("trackguess");
    expect((await launch("spectrumcourt")).currentGame).toBe("spectrumcourt");
  });

  test("refuses games that do not meet player or team constraints", async () => {
    const onePlayer = roomState({
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
    });
    const oneTeam = roomState({
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
        { id: "p2", name: "Bo", teamId: "forest", joinedAt: 2 },
      ],
    });

    expect(await rejectedStatus(() => launch("challenge", onePlayer))).toBe(409);
    expect(await rejectedStatus(() => launch("spectrumcourt", oneTeam))).toBe(409);
  });

  test("approve launches a pending game cue and records its transcript", async () => {
    const started = startDirectorState(roomState(), 1000);
    const suggested = {
      ...started,
      eventDirector: {
        ...started.eventDirector!,
        pendingSuggestion: {
          id: "cue_1",
          intent: "launch-game" as const,
          text: "Next: Soundscape Battle.",
          createdAt: 1000,
          gameId: "soundscape" as const,
          fallback: true,
          safety: "clear" as const,
        },
      },
    };

    const next = await applyDirectorAction(suggested, { action: "approve" }, 1200);

    expect(next.currentGame).toBe("soundscape");
    expect(next.eventDirector?.spokenTranscript[0]?.text).toBe("Next: Soundscape Battle.");
    expect(next.eventDirector?.pendingSuggestion).toBeUndefined();
  });
});
