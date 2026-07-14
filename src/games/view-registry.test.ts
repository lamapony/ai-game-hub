import { describe, expect, test } from "bun:test";
import { LEGACY_GAME_IDS } from "./ids";
import { HOST_GAME_VIEW_REGISTRY } from "./host-view-registry";
import { PLAYER_GAME_VIEW_REGISTRY } from "./player-view-registry";

describe("game view registry", () => {
  test("provides host and player lazy view adapters for every legacy game", () => {
    expect(Object.keys(HOST_GAME_VIEW_REGISTRY).sort()).toEqual([...LEGACY_GAME_IDS].sort());
    expect(Object.keys(PLAYER_GAME_VIEW_REGISTRY).sort()).toEqual([...LEGACY_GAME_IDS].sort());

    for (const gameId of LEGACY_GAME_IDS) {
      expect(typeof HOST_GAME_VIEW_REGISTRY[gameId].View).toBe("function");
      expect(typeof HOST_GAME_VIEW_REGISTRY[gameId].isReady).toBe("function");
      expect(typeof PLAYER_GAME_VIEW_REGISTRY[gameId].View).toBe("function");
      expect(typeof PLAYER_GAME_VIEW_REGISTRY[gameId].isReady).toBe("function");
    }
  });
});
