import { describe, expect, test } from "bun:test";
import {
  advanceDirectorSegmentState,
  approveDirectorSuggestionState,
  createEventDirectorState,
  markDirectorProviderState,
  proposeDirectorFallbackState,
  rewriteDirectorSuggestionState,
  skipDirectorSuggestionState,
  startDirectorState,
} from "./event-director";
import type { RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "lobby",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 4 },
      { id: "lake", name: "Lake", color: "blue", score: 2 },
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

describe("event director state", () => {
  test("creates a default run of show with all existing games", () => {
    const director = createEventDirectorState(1000);

    expect(director.mode).toBe("setup");
    expect(director.playlist).toEqual([
      "soundscape",
      "phototunt",
      "trackguess",
      "spectrumcourt",
      "challenge",
    ]);
    expect(director.segments.filter((segment) => segment.kind === "game").length).toBe(5);
  });

  test("starts with an opening cue and a listen moment", () => {
    const next = startDirectorState(roomState(), 2000);

    expect(next.eventDirector?.mode).toBe("running");
    expect(next.eventDirector?.currentSegmentId).toBe("opening");
    expect(next.eventDirector?.pendingSuggestion?.intent).toBe("speak");
    expect(next.eventDirector?.playerMoment?.mode).toBe("listen");
  });

  test("approves, rewrites, and skips cues without touching active game state", () => {
    const started = startDirectorState(roomState({ currentGame: "trackguess" }), 2000);
    const rewritten = rewriteDirectorSuggestionState(started, "Sharper, please.", 2100);
    const approved = approveDirectorSuggestionState(rewritten, 2200);
    const skipped = skipDirectorSuggestionState(started, 2300);

    expect(rewritten.eventDirector?.pendingSuggestion?.text).toBe("Sharper, please.");
    expect(approved.currentGame).toBe("trackguess");
    expect(approved.eventDirector?.pendingSuggestion).toBeUndefined();
    expect(approved.eventDirector?.spokenTranscript[0]?.text).toBe("Sharper, please.");
    expect(skipped.eventDirector?.pendingSuggestion).toBeUndefined();
  });

  test("records provider failures and fallback status", () => {
    const started = startDirectorState(roomState(), 2000);
    const next = markDirectorProviderState(started, "xai", true, false, 2500, "token rejected");

    expect(next.eventDirector?.providerStatus.provider).toBe("xai");
    expect(next.eventDirector?.providerStatus.connected).toBe(false);
    expect(next.eventDirector?.providerStatus.lastError).toBe("token rejected");
    expect(next.eventDirector?.fallback).toBe(true);
  });

  test("advances through the playlist to completion", () => {
    let state = startDirectorState(roomState(), 2000);
    const segmentCount = state.eventDirector?.segments.length ?? 0;
    for (let i = 0; i < segmentCount; i++) {
      state = advanceDirectorSegmentState(state, 2100 + i);
    }

    expect(state.eventDirector?.mode).toBe("finished");
    expect(state.eventDirector?.segments.every((segment) => segment.status === "complete")).toBe(
      true,
    );
  });

  test("uses audience text for a fallback callback", () => {
    const started = startDirectorState(roomState(), 2000);
    const next = proposeDirectorFallbackState(started, 2400, "The room says yes.");

    expect(next.eventDirector?.pendingSuggestion?.text).toContain("The room says yes.");
  });
});
