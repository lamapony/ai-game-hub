import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS } from "@/lib/room-capacity";
import { emptyRoomState, type RoomState } from "@/lib/types";
import type { LegacyGameId } from "./ids";
import {
  GAME_IDS,
  GAME_REGISTRY,
  activeGame,
  getGame,
  getRecommendedGames,
  launchGame,
  activeLegacyGame,
  activeLegacyGamePhase,
  getLegacyGame,
  getLegacyGameAvailability,
  getRecommendedLegacyGames,
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
      expect(game.localizedTitle.en.length > 0).toBe(true);
      expect(game.localizedTitle.ru.length > 0).toBe(true);
      expect(game.description.en.length > 0).toBe(true);
      expect(game.durationMinutes > 0).toBe(true);
      expect(game.supportedActs.length > 0).toBe(true);
      expect(game.roundIdPrefix.length > 0).toBe(true);
    }
  });

  test("launch adapter preserves each legacy game's eligibility rules", () => {
    const requirements: Record<LegacyGameId, number> = {
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

  test("availability distinguishes act fit from objective player/team blockers", () => {
    const state = stateWithPlayers(3);
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    const bar = { ...grill, actId: "bar" as const, venue: "bar" as const };
    const transition = {
      ...grill,
      actId: "transition" as const,
      venue: "grill-site" as const,
    };

    expect(getLegacyGameAvailability(getLegacyGame("phototunt"), grill, state).status).toBe(
      "recommended",
    );
    expect(getLegacyGameAvailability(getLegacyGame("whoamong"), grill, state).status).toBe(
      "available",
    );
    expect(getLegacyGameAvailability(getLegacyGame("phototunt"), transition, state).status).toBe(
      "available",
    );
    expect(getLegacyGameAvailability(getLegacyGame("whoamong"), bar, state).status).toBe(
      "recommended",
    );

    const blocked = getLegacyGameAvailability(getLegacyGame("whoamong"), bar, stateWithPlayers(2));
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toContain("3 players");
  });

  test("recommendations are ordered for the current environment", () => {
    const state = stateWithPlayers(3);
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    const bar = { ...grill, actId: "bar" as const, venue: "bar" as const };

    expect(getRecommendedLegacyGames(state, grill)[0]?.game.id).toBe("phototunt");
    expect(getRecommendedLegacyGames(state, bar)[0]?.game.id).toBe("whoamong");
    expect(
      getRecommendedLegacyGames(stateWithPlayers(0), grill).every(
        ({ availability }) => availability.status === "blocked",
      ),
    ).toBe(true);
  });
});

describe("registered party game surface", () => {
  test("adds party-native foreground and background games without changing the legacy subset", () => {
    expect(GAME_IDS).toHaveLength(15);
    expect(Object.keys(GAME_REGISTRY).sort()).toEqual([...GAME_IDS].sort());
    expect(getGame("grilloracle").capabilities).toEqual(["camera", "vision"]);
    expect(getGame("grilloracle").supportedActs).toEqual(["grill", "bar"]);
    expect(getGame("smokescreen").format).toBe("background");
    expect(getGame("toastsyndicate").capabilities).toEqual(["microphone", "stt"]);
    expect(getGame("toastsyndicate").supportedActs).toEqual(["bar"]);
    expect(getGame("stilllife").capabilities).toEqual(["camera", "vision"]);
    expect(getGame("stilllife").minActiveTeams).toBe(2);
    expect(getGame("sommelier").capabilities).toEqual(["camera", "vision"]);
    expect(getGame("sommelier").supportedActs).toEqual(["bar"]);
    expect(getGame("contraband").format).toBe("background");
    expect(getGame("contraband").capabilities).toEqual(["microphone", "stt"]);
    expect(getGame("tongsoftruth").format).toBe("background");
    expect(getGame("tongsoftruth").supportedActs).toEqual(["grill"]);
    expect(getGame("tongsoftruth").capabilities).toEqual(["microphone", "stt"]);
    expect(getGame("crossexamination").format).toBe("foreground");
    expect(getGame("crossexamination").supportedActs).toEqual(["bar", "finale"]);
    expect(getGame("crossexamination").capabilities).toEqual(["microphone", "stt"]);

    const launched = launchGame(stateWithPlayers(2), "grilloracle", {
      roundId: "oracle_1",
      now: 1_000,
    });
    expect(launched?.grilloracle?.participantIds).toEqual(["player-0", "player-1"]);
    expect(activeGame(launched!)?.id).toBe("grilloracle");

    const foreground = launchGame(stateWithPlayers(3), "challenge", {
      roundId: "challenge_1",
      random: 0,
    })!;
    const background = launchGame(foreground, "smokescreen", {
      roundId: "smoke_1",
      now: 2_000,
    })!;
    expect(background.currentGame).toBe("challenge");
    expect(background.smokescreen?.status).toBe("assigning");
    expect(activeGame(background)?.id).toBe("challenge");

    const withContraband = launchGame(foreground, "contraband", {
      roundId: "contraband_1",
      now: 2_000,
    })!;
    expect(withContraband.currentGame).toBe("challenge");
    expect(withContraband.contraband?.status).toBe("assigning");

    const withTongs = launchGame(foreground, "tongsoftruth", {
      roundId: "tongs_1",
      random: 0,
    })!;
    expect(withTongs.currentGame).toBe("challenge");
    expect(withTongs.tongsoftruth?.status).toBe("question");

    const cross = launchGame(stateWithPlayers(6), "crossexamination", {
      roundId: "cross_1",
      random: 0,
    })!;
    expect(cross.currentGame).toBe("crossexamination");
    expect(cross.crossexamination?.totalPairs).toBe(3);
    expect(activeGame(cross)?.id).toBe("crossexamination");
  });

  test("makes the implemented story opener the first grill and bar recommendation", () => {
    const state = stateWithPlayers(3);
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    const bar = { ...grill, actId: "bar" as const, venue: "bar" as const };

    expect(getRecommendedGames(state, grill)[0]?.game.id).toBe("smokescreen");
    expect(getRecommendedGames(state, bar)[0]?.game.id).toBe("smokescreen");
  });

  test("launches every registered game across the complete 8–30 person contract", () => {
    for (let count = MIN_ROOM_PLAYERS; count <= MAX_ROOM_PLAYERS; count += 1) {
      const expectedPlayerIds = stateWithPlayers(count).players.map((player) => player.id);

      for (const gameId of GAME_IDS) {
        const game = getGame(gameId);
        const launched = launchGame(stateWithPlayers(count), gameId, {
          roundId: `scale_${count}_${gameId}`,
          random: 0.37,
          now: 1_000,
        });

        expect(launched).not.toBeNull();
        if (!launched) continue;

        expect(launched.players.map((player) => player.id)).toEqual(expectedPlayerIds);
        expect(new Set(launched.players.map((player) => player.id)).size).toBe(count);
        expect(game.isReady(launched)).toBe(true);
        if (game.format === "foreground") expect(launched.currentGame).toBe(gameId);
        else expect(launched.currentGame).toBeNull();
      }
    }
  });

  test("keeps every server-assigned role unique and inside each 8–30 person roster", () => {
    for (let count = MIN_ROOM_PLAYERS; count <= MAX_ROOM_PLAYERS; count += 1) {
      const state = stateWithPlayers(count);
      const roster = new Set(state.players.map((player) => player.id));
      const launch = (gameId: (typeof GAME_IDS)[number]) =>
        launchGame(state, gameId, {
          roundId: `roles_${count}_${gameId}`,
          random: 0.37,
          now: 1_000,
        })!;
      const expectRosterSubset = (ids: readonly string[], expectedCount: number) => {
        expect(ids).toHaveLength(expectedCount);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => roster.has(id))).toBe(true);
      };

      expectRosterSubset(launch("grilloracle").grilloracle!.participantIds, count);
      expectRosterSubset(launch("smokescreen").smokescreen!.participantIds, count);
      expectRosterSubset(launch("contraband").contraband!.participantIds, count);

      const tongs = launch("tongsoftruth").tongsoftruth!;
      expectRosterSubset(tongs.participantIds, count);
      expectRosterSubset(tongs.speakerOrder, count);
      expect(roster.has(tongs.speakerPlayerId)).toBe(true);

      const cross = launch("crossexamination").crossexamination!;
      expectRosterSubset(cross.participantIds, count);
      const pairedPlayerIds = cross.pairOrder.flatMap((pair) => [pair.playerAId, pair.playerBId]);
      expectRosterSubset(pairedPlayerIds, cross.totalPairs * 2);

      const sommelier = launch("sommelier").sommelier!;
      expectRosterSubset(sommelier.participantIds, Math.min(10, count));
      const challengeOperatorId = launch("challenge").challenge!.operatorId;
      expect(typeof challengeOperatorId).toBe("string");
      if (challengeOperatorId) expect(roster.has(challengeOperatorId)).toBe(true);
      expect(roster.has(launch("toastsyndicate").toastsyndicate!.speakerPlayerId)).toBe(true);
    }
  });
});
