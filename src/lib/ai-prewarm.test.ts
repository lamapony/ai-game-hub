import { describe, expect, test } from "bun:test";
import { aiPrewarmCacheKey, autoAiPrewarmAttemptKey } from "./ai-prewarm";
import { emptyRoomState } from "./types";

describe("AI prewarm identity", () => {
  test("is stable across player order but changes with roster, act, game, or context", () => {
    const state = emptyRoomState("Host");
    state.players = [
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
    ];
    const first = aiPrewarmCacheKey(state, "smokescreen", "grill");
    const reordered = {
      ...state,
      players: [...state.players].reverse(),
    };

    expect(aiPrewarmCacheKey(reordered, "smokescreen", "grill")).toBe(first);
    expect(
      aiPrewarmCacheKey(
        {
          ...state,
          players: [state.players[0]!, { id: "p3", name: "Three", teamId: "fire", joinedAt: 3 }],
        },
        "smokescreen",
        "grill",
      ) === first,
    ).toBe(false);
    expect(aiPrewarmCacheKey(state, "contraband", "grill") === first).toBe(false);
    expect(aiPrewarmCacheKey(state, "smokescreen", "bar") === first).toBe(false);

    const changedContext = {
      ...state,
      party: { ...state.party!, contingency: "compact" as const },
    };
    expect(aiPrewarmCacheKey(changedContext, "smokescreen", "grill") === first).toBe(false);

    const changedStory = {
      ...state,
      party: {
        ...state.party!,
        storyEvidence: [
          {
            id: "challenge:r1",
            gameId: "challenge",
            title: "The bucket",
            detail: "It became a co-star.",
          },
        ],
      },
    };
    expect(aiPrewarmCacheKey(changedStory, "smokescreen", "grill") === first).toBe(false);

    const changedThread = {
      ...state,
      party: { ...state.party!, storySeed: "The blue bag is tonight's recurring suspect." },
    };
    expect(aiPrewarmCacheKey(changedThread, "smokescreen", "grill") === first).toBe(false);

    const changedVenue = {
      ...state,
      party: { ...state.party!, venue: "bar" as const },
    };
    expect(aiPrewarmCacheKey(changedVenue, "smokescreen", "grill") === first).toBe(false);

    const changedAiMode = {
      ...state,
      party: { ...state.party!, aiMode: "manual" as const },
    };
    expect(aiPrewarmCacheKey(changedAiMode, "smokescreen", "grill") === first).toBe(false);

    const firstRun = {
      ...state,
      quickStart: {
        venue: "park" as const,
        targetDurationMinutes: 180 as const,
        expectedPlayers: 8,
        storySeed: "The blue bag is tonight's recurring suspect.",
        configuredAt: 100,
      },
    };
    const nextRun = {
      ...firstRun,
      quickStart: { ...firstRun.quickStart, configuredAt: 200 },
    };
    expect(
      aiPrewarmCacheKey(firstRun, "smokescreen", "grill") ===
        aiPrewarmCacheKey(nextRun, "smokescreen", "grill"),
    ).toBe(false);
  });

  test("keeps roster-independent opening prompts warm for late arrivals", () => {
    const state = emptyRoomState("Host");
    state.players = [{ id: "p1", name: "One", teamId: "forest", joinedAt: 1 }];
    const lateArrival = {
      ...state,
      players: [...state.players, { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 }],
    };

    for (const gameId of ["soundscape", "challenge", "impostor", "phototunt"] as const) {
      const first = aiPrewarmCacheKey(state, gameId, "classic");
      expect(aiPrewarmCacheKey(lateArrival, gameId, "classic")).toBe(first);
      expect(
        aiPrewarmCacheKey(
          { ...state, party: { ...state.party!, storySeed: "A new public thread" } },
          gameId,
          "classic",
        ) === first,
      ).toBe(false);
    }
  });

  test("builds one bounded attempt identity per upcoming game while an interlude is live", () => {
    const candidate = {
      triggerId: "home-arrival-180",
      gameId: "smokescreen" as const,
      cacheKey: "fresh-cache",
    };

    expect(autoAiPrewarmAttemptKey(candidate)).toBe("home-arrival-180:smokescreen:fresh-cache");
    expect(autoAiPrewarmAttemptKey({ ...candidate, triggerId: undefined })).toBeNull();
    expect(autoAiPrewarmAttemptKey({ ...candidate, gameId: undefined })).toBeNull();
    expect(autoAiPrewarmAttemptKey({ ...candidate, preparedCacheKey: "fresh-cache" })).toBeNull();
  });
});
