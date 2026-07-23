import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { GAME_IDS } from "./ids";
import { HOST_GAME_VIEW_REGISTRY, type HostGameViewProps } from "./host-view-registry";
import { PLAYER_GAME_VIEW_REGISTRY } from "./player-view-registry";
import { emptyRoomState } from "@/lib/types";

describe("game view registry", () => {
  test("provides host and player lazy view adapters for every registered game", () => {
    expect(Object.keys(HOST_GAME_VIEW_REGISTRY).sort()).toEqual([...GAME_IDS].sort());
    expect(Object.keys(PLAYER_GAME_VIEW_REGISTRY).sort()).toEqual([...GAME_IDS].sort());

    for (const gameId of GAME_IDS) {
      expect(typeof HOST_GAME_VIEW_REGISTRY[gameId].View).toBe("function");
      expect(typeof HOST_GAME_VIEW_REGISTRY[gameId].isReady).toBe("function");
      expect(typeof PLAYER_GAME_VIEW_REGISTRY[gameId].View).toBe("function");
      expect(typeof PLAYER_GAME_VIEW_REGISTRY[gameId].isReady).toBe("function");
    }
  });

  test("threads the story-preserving host exit into every legacy result view", () => {
    const gameIds = [
      "soundscape",
      "challenge",
      "phototunt",
      "trackguess",
      "spectrumcourt",
      "whoamong",
      "impostor",
    ] as const;
    const onBackToHub = () => {};
    const props: HostGameViewProps = {
      roomId: "room_1",
      code: "PARTY1",
      state: emptyRoomState("Host"),
      onBackToHub,
    };

    for (const gameId of gameIds) {
      const Adapter = HOST_GAME_VIEW_REGISTRY[gameId].View as (
        value: HostGameViewProps,
      ) => ReactElement<{ onBackToHub?: HostGameViewProps["onBackToHub"] }>;
      expect(Adapter(props).props.onBackToHub).toBe(onBackToHub);
    }
  });
});
