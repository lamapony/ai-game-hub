import { describe, expect, test } from "bun:test";
import { launchChallengeState, launchPhotoHuntState, launchSoundscapeState } from "./game-state";
import type { RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "lobby",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 4 },
      { id: "lake", name: "Lake", color: "blue", score: 7 },
    ],
    players: [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
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

describe("game state launch helpers", () => {
  test("launchSoundscape starts topics and clears previous game state", () => {
    const state = roomState({
      paused: { startedAt: 100 },
      currentGame: "challenge",
      challenge: { phase: "briefing", roundId: "old-ch" },
      phototunt: { phase: "briefing", roundId: "old-ph" },
    });

    const result = launchSoundscapeState(state, "snd_1");

    expect(result.status).toBe("playing");
    expect(result.currentGame).toBe("soundscape");
    expect(result.paused).toBeUndefined();
    expect(result.soundscape?.phase).toBe("topics");
    expect(result.soundscape?.roundId).toBe("snd_1");
    expect(result.challenge).toBeUndefined();
    expect(result.phototunt).toBeUndefined();
    expect(result.teams[0]?.score).toBe(4);
  });

  test("launchChallenge picks a deterministic operator and clears other games", () => {
    const state = roomState({
      currentGame: "soundscape",
      soundscape: { phase: "recording", roundId: "old-snd" },
      phototunt: { phase: "hunting", roundId: "old-ph" },
    });

    const result = launchChallengeState(state, "ch_1", 0.75);

    expect(result?.status).toBe("playing");
    expect(result?.currentGame).toBe("challenge");
    expect(result?.challenge?.phase).toBe("briefing");
    expect(result?.challenge?.roundId).toBe("ch_1");
    expect(result?.challenge?.operatorId).toBe("p2");
    expect(result?.challenge?.operatorName).toBe("Two");
    expect(result?.challenge?.pastOperatorIds?.length).toBe(0);
    expect(result?.soundscape).toBeUndefined();
    expect(result?.phototunt).toBeUndefined();
  });

  test("launchChallenge refuses to start with fewer than two players", () => {
    const state = roomState({
      players: [{ id: "p1", name: "One", teamId: "forest", joinedAt: 1 }],
    });

    expect(launchChallengeState(state, "ch_1")).toBeNull();
  });

  test("launchPhotoHunt starts briefing only when at least one player joined", () => {
    const withPlayer = launchPhotoHuntState(roomState(), "ph_1");
    const withoutPlayers = launchPhotoHuntState(roomState({ players: [] }), "ph_2");

    expect(withPlayer?.status).toBe("playing");
    expect(withPlayer?.currentGame).toBe("phototunt");
    expect(withPlayer?.phototunt?.phase).toBe("briefing");
    expect(withPlayer?.phototunt?.roundId).toBe("ph_1");
    expect(withPlayer?.phototunt?.pastTasks?.length).toBe(0);
    expect(withoutPlayers).toBeNull();
  });
});
