import { describe, expect, test } from "bun:test";
import { writeAuthorizedRoomStateResult } from "./host-auth.server";
import { emptyRoomState, type RoomState } from "./types";

const ROOM_ID = "host-state-race-test";
const BEFORE = "2026-10-13T00:00:00.000001Z";
const AFTER = "2026-10-13T00:00:00.000002Z";

function photoRound(): RoomState {
  return {
    ...emptyRoomState("Host"),
    status: "playing",
    currentGame: "phototunt",
    phototunt: { phase: "briefing", roundId: "photo_1" },
    runOfShow: {
      experienceId: "park-story",
      contingency: "compact",
      completedStepIds: [],
    },
  };
}

async function interleavedWrite(
  nextState: RoomState,
  foregroundPoints = 0,
  submittedRoundId = "photo_1",
) {
  const originalFetch = globalThis.fetch;
  const initial = photoRound();
  let stored = initial;
  let revision = BEFORE;
  let writes = 0;
  let acceptedWrites = 0;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!url.pathname.endsWith("/rest/v1/rooms")) {
      throw new Error("Unexpected request in host-state concurrency test");
    }
    if (init?.method === "PATCH") {
      writes += 1;
      if (writes === 1) {
        // A host command commits after authorization/guard checking but before this write.
        stored = nextState;
        revision = AFTER;
      }
      const expectedRevision = url.searchParams.get("updated_at");
      if (expectedRevision && expectedRevision !== `eq.${revision}`) return Response.json([]);
      stored = (JSON.parse(String(init.body)) as { state: RoomState }).state;
      acceptedWrites += 1;
    }
    return Response.json([{ id: ROOM_ID, state: stored, updated_at: revision }]);
  }) as typeof fetch;
  try {
    const { state: result, skipped } = await writeAuthorizedRoomStateResult(
      ROOM_ID,
      {
        ...initial,
        teams: initial.teams.map((team, index) => ({
          ...team,
          score: team.score + (index === 0 ? foregroundPoints : 0),
        })),
        phototunt: { ...initial.phototunt!, roundId: submittedRoundId, task: "Late AI task" },
      },
      initial,
      { updatedAt: BEFORE, guard: { gameId: "phototunt", roundId: "photo_1" } },
    );
    return { result, stored, acceptedWrites, skipped };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("host state writes across concurrent commands", () => {
  test("a late AI write cannot resurrect a game or erase the next live cue", async () => {
    const next = photoRound();
    next.status = "lobby";
    next.currentGame = null;
    next.phototunt = undefined;
    next.runOfShow = {
      ...next.runOfShow!,
      completedStepIds: ["park-photo-120"],
      activeStepId: "park-picnic-120",
      activeStepStartedAt: 1234,
    };
    const { result, stored, acceptedWrites } = await interleavedWrite(next);
    expect(stored.currentGame).toBeNull();
    expect(stored.runOfShow).toEqual(next.runOfShow);
    expect(result).toEqual(next);
    expect(acceptedWrites).toBe(0);
  });

  test("an applicable retry merges the current cue and newly joined player", async () => {
    const next = photoRound();
    next.runOfShow = { ...next.runOfShow!, activeStepId: "server-cue", activeStepStartedAt: 1234 };
    next.players = [{ id: "late-player", name: "Guest", teamId: "forest", joinedAt: 10 }];
    const { result, stored, acceptedWrites } = await interleavedWrite(next);
    expect(stored.phototunt?.task).toBe("Late AI task");
    expect(stored.runOfShow).toEqual(next.runOfShow);
    expect(stored.players).toEqual(next.players);
    expect(result).toEqual(stored);
    expect(acceptedWrites).toBe(1);
  });

  test("a late reply cannot replace a newer round of the same game", async () => {
    const next = photoRound();
    next.phototunt = { phase: "briefing", roundId: "photo_2", task: "Current task" };
    const { result, stored, acceptedWrites } = await interleavedWrite(next);
    expect(stored.phototunt).toEqual(next.phototunt);
    expect(result).toEqual(next);
    expect(acceptedWrites).toBe(0);
  });

  test("a retry cannot erase points awarded by the score ledger while AI was pending", async () => {
    const next = photoRound();
    next.teams = next.teams.map((team, index) => ({ ...team, score: index === 0 ? 2 : 0 }));
    const { result, stored } = await interleavedWrite(next);
    expect(stored.teams).toEqual(next.teams);
    expect(result.teams).toEqual(next.teams);
  });

  test("rebases a foreground award onto concurrently changed scores", async () => {
    for (const backgroundPoints of [2, -2]) {
      const next = photoRound();
      next.teams = next.teams.map((team, index) => ({
        ...team,
        score: index === 0 ? backgroundPoints : 0,
      }));
      const { result, stored, acceptedWrites } = await interleavedWrite(next, 5);
      expect(stored.teams[0]?.score).toBe(backgroundPoints + 5);
      expect(result.teams[0]?.score).toBe(backgroundPoints + 5);
      expect(acceptedWrites).toBe(1);
    }
  });

  test("a legitimate next-round write is accepted rather than reported stale", async () => {
    const { result, skipped, acceptedWrites } = await interleavedWrite(photoRound(), 0, "photo_2");
    expect(result.phototunt?.roundId).toBe("photo_2");
    expect(acceptedWrites).toBe(1);
    expect(skipped).toBe(false);
  });
});
