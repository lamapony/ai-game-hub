import { describe, expect, test } from "bun:test";
import { emptyRoomState, type GameId, type RoomState } from "@/lib/types";
import {
  activeLegacyGame,
  activeLegacyGamePhase,
  getLegacyGame,
  hasReadyLegacyGameState,
  launchLegacyGame,
  LEGACY_GAME_IDS,
  LEGACY_GAME_REGISTRY,
} from "./registry";

function stateWithPlayers(count: number): RoomState {
  const state = emptyRoomState();
  state.players = Array.from({ length: count }, (_, index) => ({
    id: `player-${index}`,
    name: `Player ${index}`,
    teamId: index % 2 === 0 ? "forest" : "lake",
    joinedAt: index,
  }));
  return state;
}

describe("legacy game registry", () => {
  test("defines every GameId once with matching state metadata", () => {
    expect(new Set(LEGACY_GAME_IDS).size).toBe(7);
    expect(Object.keys(LEGACY_GAME_REGISTRY).sort()).toEqual([...LEGACY_GAME_IDS].sort());

    for (const id of LEGACY_GAME_IDS) {
      const game = getLegacyGame(id);
      expect(game.id).toBe(id);
      expect(game.stateKey).toBe(id);
      expect(game.title.length > 0).toBe(true);
      expect(game.roundIdPrefix.length > 0).toBe(true);
    }
  });

  test("launch adapter preserves each legacy game's eligibility rules", () => {
    const requirements: Record<GameId, number> = {
      soundscape: 0,
      challenge: 2,
      phototunt: 1,
      trackguess: 1,
      spectrumcourt: 2,
      whoamong: 3,
      impostor: 3,
    };

    for (const id of LEGACY_GAME_IDS) {
      const requiredPlayers = requirements[id];
      const launched = launchLegacyGame(stateWithPlayers(requiredPlayers), id, {
        roundId: `round-${id}`,
        random: 0,
      });
      expect(launched?.currentGame).toBe(id);
      expect(launched && getLegacyGame(id).isReady(launched)).toBe(true);

      if (requiredPlayers > 0) {
        expect(
          launchLegacyGame(stateWithPlayers(requiredPlayers - 1), id, {
            roundId: `blocked-${id}`,
            random: 0,
          }),
        ).toBeNull();
      }
    }
  });

  test("active-game helpers expose title, readiness and phase without route switches", () => {
    const launched = launchLegacyGame(stateWithPlayers(2), "challenge", {
      roundId: "challenge-round",
      random: 0,
    });
    expect(launched).not.toBeNull();
    if (!launched) return;

    expect(activeLegacyGame(launched)?.title).toBe("Challenge");
    expect(activeLegacyGamePhase(launched)).toBe("briefing");
    expect(hasReadyLegacyGameState(launched)).toBe(true);
    expect(activeLegacyGame(emptyRoomState())).toBeNull();
  });
});
