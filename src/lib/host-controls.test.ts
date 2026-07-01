import { describe, expect, test } from "bun:test";
import {
  canSkipCurrentPhase,
  forceBackToHubState,
  pauseRoomState,
  resumeRoomState,
  skipCurrentPhaseState,
} from "./host-controls";
import type { RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
    ],
    currentGame: "soundscape",
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

describe("host controls state helpers", () => {
  test("pause/resume shifts active timers by pause duration", () => {
    const state = roomState({
      soundscape: {
        phase: "playback",
        roundId: "snd",
        recordingEndsAt: 11_000,
        voteOpenAt: 12_000,
        playback: { teamId: "forest", startAt: 13_000 },
      },
      challenge: {
        phase: "recording",
        roundId: "ch",
        recordingEndsAt: 14_000,
      },
      phototunt: {
        phase: "hunting",
        roundId: "ph",
        huntEndsAt: 15_000,
      },
    });

    const paused = pauseRoomState(state, 20_000);
    const resumed = resumeRoomState(paused, 25_500);

    expect(resumed.paused).toBeUndefined();
    expect(resumed.soundscape?.recordingEndsAt).toBe(16_500);
    expect(resumed.soundscape?.voteOpenAt).toBe(17_500);
    expect(resumed.soundscape?.playback?.startAt).toBe(18_500);
    expect(resumed.challenge?.recordingEndsAt).toBe(19_500);
    expect(resumed.phototunt?.huntEndsAt).toBe(20_500);
  });

  test("forceBackToHub clears active games and pause state", () => {
    const state = roomState({
      paused: { startedAt: 10 },
      currentGame: "challenge",
      soundscape: { phase: "topics", roundId: "snd" },
      challenge: { phase: "briefing", roundId: "ch" },
      phototunt: { phase: "briefing", roundId: "ph" },
    });

    const result = forceBackToHubState(state);

    expect(result.status).toBe("lobby");
    expect(result.currentGame).toBeNull();
    expect(result.paused).toBeUndefined();
    expect(result.soundscape).toBeUndefined();
    expect(result.challenge).toBeUndefined();
    expect(result.phototunt).toBeUndefined();
  });

  test("skip soundscape topics picks top voted topic and starts recording", () => {
    const state = roomState({
      soundscape: {
        phase: "topics",
        roundId: "snd",
        topics: ["rain", "wind"],
        topicVotes: { p1: "wind", p2: "wind" },
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);

    const result = skipCurrentPhaseState(state, 1000);

    expect(result.soundscape?.phase).toBe("recording");
    expect(result.soundscape?.topic).toBe("wind");
    expect(result.soundscape?.recordingEndsAt).toBe(181_000);
  });

  test("skip disabled while paused", () => {
    const state = roomState({
      paused: { startedAt: 1 },
      soundscape: {
        phase: "recording",
        roundId: "snd",
        recordingEndsAt: 5000,
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(false);
    expect(skipCurrentPhaseState(state, 10_000)).toBe(state);
  });

  test("skip challenge briefing starts recording only after task exists", () => {
    const noTask = roomState({
      currentGame: "challenge",
      challenge: { phase: "briefing", roundId: "ch" },
    });
    const withTask = roomState({
      currentGame: "challenge",
      challenge: { phase: "briefing", roundId: "ch", task: "Dance" },
    });

    expect(canSkipCurrentPhase(noTask)).toBe(false);
    expect(canSkipCurrentPhase(withTask)).toBe(true);
    expect(skipCurrentPhaseState(withTask, 2000).challenge?.recordingEndsAt).toBe(27_000);
  });

  test("skip phototunt hunt ends current timer immediately", () => {
    const state = roomState({
      currentGame: "phototunt",
      phototunt: { phase: "hunting", roundId: "ph", huntEndsAt: 99_000 },
    });

    const result = skipCurrentPhaseState(state, 44_000);

    expect(result.phototunt?.phase).toBe("hunting");
    expect(result.phototunt?.huntEndsAt).toBe(44_000);
  });
});
