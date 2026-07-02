import { describe, expect, test } from "bun:test";
import {
  buildGameGuideContext,
  buildSpiritContextText,
  gameGuide,
  isSpiritWindowOpen,
  nextLikelyGameId,
} from "./game-guide";
import { emptyRoomState, type RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    ...emptyRoomState("Host"),
    players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
    ...overrides,
  };
}

describe("game guide", () => {
  test("describes all current games for the spirit concierge", () => {
    expect(gameGuide("soundscape").howToPlay.length > 1).toBe(true);
    expect(gameGuide("challenge").scoring).toContain("score");
    expect(gameGuide("phototunt").title).toBe("Photo Hunt");
    expect(gameGuide("trackguess").rounds).toContain("Five");
    expect(gameGuide("spectrumcourt").timing).toContain("appeal");
  });

  test("chooses next game from director suggestions and open windows", () => {
    const state = roomState({
      eventDirector: {
        mode: "running",
        playlist: ["soundscape"],
        segments: [],
        pendingSuggestion: {
          id: "s1",
          intent: "launch-game",
          text: "Next",
          createdAt: 1,
          gameId: "trackguess",
          safety: "clear",
        },
        spokenTranscript: [],
        micCapture: { status: "idle" },
        providerStatus: { provider: "none", configured: false, connected: false },
        safetyMode: "smart-adult",
      },
    });

    expect(nextLikelyGameId(state)).toBe("trackguess");
    expect(buildGameGuideContext(state).nextGuide.title).toBe("Track Guess");
    expect(isSpiritWindowOpen(state)).toBe(true);
  });

  test("opens spirit only in lobby and briefing phases", () => {
    expect(isSpiritWindowOpen(roomState())).toBe(true);
    expect(
      isSpiritWindowOpen(
        roomState({
          currentGame: "phototunt",
          status: "playing",
          phototunt: { phase: "briefing", roundId: "ph1" },
        }),
      ),
    ).toBe(true);
    expect(
      isSpiritWindowOpen(
        roomState({
          currentGame: "phototunt",
          status: "playing",
          phototunt: { phase: "hunting", roundId: "ph1" },
        }),
      ),
    ).toBe(false);
  });

  test("builds compact room context with player, team, playlist and rules", () => {
    const context = buildSpiritContextText({
      roomCode: "abcd",
      state: roomState(),
      playerId: "p1",
    });

    expect(context).toContain("Room code: ABCD");
    expect(context).toContain("Player: Ada");
    expect(context).toContain("Team: Forest");
    expect(context).toContain("Soundscape:");
    expect(context).toContain("Spectrum Court:");
  });
});
