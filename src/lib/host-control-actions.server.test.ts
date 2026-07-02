import { describe, expect, test } from "bun:test";
import { applyHostControlAction } from "./host-control-actions.server";
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
  return applyHostControlAction(state, { action: "launch-game", gameId }, 2000);
}

async function rejectedStatus(run: () => Promise<unknown>) {
  try {
    await run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("host control server actions", () => {
  test("launches all existing games through the host-only control path", async () => {
    expect((await launch("soundscape")).currentGame).toBe("soundscape");
    expect((await launch("challenge")).currentGame).toBe("challenge");
    expect((await launch("phototunt")).currentGame).toBe("phototunt");
    expect((await launch("trackguess")).currentGame).toBe("trackguess");
    expect((await launch("spectrumcourt")).currentGame).toBe("spectrumcourt");
  });

  test("rejects invalid launches and games that cannot satisfy player constraints", async () => {
    const onePlayer = roomState({
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
    });

    expect(
      await rejectedStatus(() =>
        applyHostControlAction(roomState(), { action: "launch-game", gameId: "bad" as GameId }),
      ),
    ).toBe(400);
    expect(await rejectedStatus(() => launch("challenge", onePlayer))).toBe(409);
  });

  test("pauses and resumes by shifting active timers", async () => {
    const active = roomState({
      status: "playing",
      currentGame: "soundscape",
      soundscape: { phase: "recording", roundId: "snd_1", recordingEndsAt: 4000 },
    });

    const paused = await applyHostControlAction(active, { action: "pause-toggle" }, 2000);
    const resumed = await applyHostControlAction(paused, { action: "pause-toggle" }, 5000);

    expect(paused.paused?.startedAt).toBe(2000);
    expect(resumed.paused).toBeUndefined();
    expect(resumed.soundscape?.recordingEndsAt).toBe(7000);
  });

  test("skips eligible phases and restarts the current game", async () => {
    const active = roomState({
      status: "playing",
      currentGame: "challenge",
      challenge: {
        phase: "briefing",
        roundId: "ch_1",
        task: "Perform a skeptical weather report.",
        operatorId: "p1",
        operatorName: "Ada",
      },
    });

    const skipped = await applyHostControlAction(active, { action: "skip-phase" }, 3000);
    const restarted = await applyHostControlAction(skipped, { action: "restart-game" }, 4000);

    expect(skipped.challenge?.phase).toBe("recording");
    expect(skipped.challenge?.recordingEndsAt).toBe(28_000);
    expect(restarted.currentGame).toBe("challenge");
    expect(restarted.challenge?.phase).toBe("briefing");
    expect(restarted.challenge?.roundId === "ch_1").toBe(false);
  });

  test("returns to the hub and manages teams", async () => {
    const active = await launch("soundscape");
    const hub = await applyHostControlAction(active, { action: "force-back-to-hub" });
    const added = await applyHostControlAction(hub, { action: "add-team", name: "Lab" });
    const labId = added.teams.find((team) => team.name === "Lab")?.id;
    const renamed = await applyHostControlAction(added, {
      action: "rename-team",
      teamId: labId,
      name: "Field Lab",
    });
    const removed = await applyHostControlAction(renamed, {
      action: "remove-team",
      teamId: labId,
    });

    expect(hub.currentGame).toBe(null);
    expect(hub.status).toBe("lobby");
    expect(renamed.teams.some((team) => team.name === "Field Lab")).toBe(true);
    expect(removed.teams.some((team) => team.id === labId)).toBe(false);
  });
});
