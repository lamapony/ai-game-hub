import { describe, expect, test } from "bun:test";
import { writeAuthorizedRoomStateResult } from "./host-auth.server";
import { emptyRoomState, type RoomState } from "./types";
import { hostStateWriteGuardFromState } from "./host-state-write-guard";
import { hostScoreBaseline } from "./host-score-baseline";
import {
  launchChallengeState,
  launchPhotoHuntState,
  launchSoundscapeState,
  launchImpostorState,
  launchWhoAmongState,
  launchTrackGuessState,
  launchSpectrumCourtState,
} from "./game-state";

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
      {
        updatedAt: BEFORE,
        guard: hostStateWriteGuardFromState(initial),
        scoreBaseline: hostScoreBaseline(initial.teams),
      },
    );
    return { result, stored, acceptedWrites, skipped };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function staleClientWrite(source: RoomState, submitted: RoomState, current: RoomState) {
  const originalFetch = globalThis.fetch;
  let stored = current;
  let writes = 0;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!url.pathname.endsWith("/rest/v1/rooms")) throw new Error("Unexpected request");
    if (init?.method === "PATCH") {
      stored = (JSON.parse(String(init.body)) as { state: RoomState }).state;
      writes += 1;
    }
    return Response.json([{ id: ROOM_ID, state: stored, updated_at: AFTER }]);
  }) as typeof fetch;
  try {
    const result = await writeAuthorizedRoomStateResult(ROOM_ID, submitted, current, {
      updatedAt: AFTER,
      guard: hostStateWriteGuardFromState(source),
      scoreBaseline: hostScoreBaseline(source.teams),
    });
    return { ...result, stored, writes };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("host state from an already stale screen", () => {
  test("an ordinary update preserves awards and corrections committed before authorization", async () => {
    for (const points of [2, -2]) {
      const source = photoRound();
      source.teams[0]!.score = 10;
      const current = structuredClone(source);
      current.teams[0]!.score += points;
      const submitted = structuredClone(source);
      submitted.phototunt!.task = "Prepared task";
      const result = await staleClientWrite(source, submitted, current);
      expect(result.stored.teams[0]!.score).toBe(10 + points);
      expect(result.stored.phototunt!.task).toBe("Prepared task");
    }
  });

  test("adds only the foreground award to the current score", async () => {
    for (const points of [2, -2]) {
      const source = photoRound();
      source.teams[0]!.score = 10;
      const current = structuredClone(source);
      current.teams[0]!.score += points;
      const submitted = structuredClone(source);
      submitted.teams[0]!.score += 5;
      submitted.phototunt!.phase = "results";
      const result = await staleClientWrite(source, submitted, current);
      expect(result.stored.teams[0]!.score).toBe(10 + points + 5);
    }
  });

  test("another host cannot replace a committed result or score it twice", async () => {
    const source = photoRound();
    source.phototunt!.phase = "judging";
    const current = structuredClone(source);
    current.teams[0]!.score = 5;
    current.phototunt = { ...current.phototunt!, phase: "results", task: "Accepted result" };
    const submitted = structuredClone(source);
    submitted.teams[0]!.score = 10;
    submitted.phototunt = { ...submitted.phototunt!, phase: "results", task: "Second result" };
    const result = await staleClientWrite(source, submitted, current);
    expect(result.skipped).toBe(true);
    expect(result.writes).toBe(0);
    expect(result.stored).toEqual(current);
  });

  test("the same game id cannot roll a later numbered round back", async () => {
    const source = photoRound();
    source.currentGame = "whoamong";
    source.whoamong = {
      phase: "voting",
      roundId: "session_1",
      roundNumber: 1,
      totalRounds: 3,
      usedPromptIds: [],
      promptId: "prompt_1",
      prompt: "Who?",
      votes: {},
    };
    const current = structuredClone(source);
    current.whoamong!.roundNumber = 2;
    current.whoamong!.promptId = "prompt_2";
    const submitted = structuredClone(source);
    submitted.whoamong!.phase = "reveal";
    submitted.teams[0]!.score = 3;
    const result = await staleClientWrite(source, submitted, current);
    expect(result.skipped).toBe(true);
    expect(result.writes).toBe(0);
    expect(result.stored).toEqual(current);
  });

  test("all seven legacy games preserve background points and commit one foreground outcome", async () => {
    const party = emptyRoomState("Host");
    party.players = Array.from({ length: 4 }, (_, index) => ({
      id: `player_${index}`,
      name: `Guest ${index}`,
      joinedAt: 1,
      teamId: party.teams[index % 2]!.id,
    }));
    const launches = [
      launchChallengeState,
      launchPhotoHuntState,
      launchSoundscapeState,
      launchImpostorState,
      launchWhoAmongState,
      launchTrackGuessState,
      launchSpectrumCourtState,
    ];
    for (const launch of launches) {
      const source = launch(party, "game_session")!;
      const guard = hostStateWriteGuardFromState(source)!;
      const round = source[guard.gameId]!;
      const outcomePhase = "roundNumber" in round ? "reveal" : "results";
      const submitted = { ...source, [guard.gameId]: { ...round, phase: outcomePhase } };
      submitted.teams = source.teams.map((team, index) => ({
        ...team,
        score: index === 0 ? 5 : 0,
      }));
      const current = structuredClone(source);
      current.teams[0]!.score = 2;
      const first = await staleClientWrite(source, submitted, current);
      expect(first.skipped).toBe(false);
      expect(first.stored.teams[0]!.score).toBe(7);
      const second = await staleClientWrite(source, submitted, first.stored);
      expect(second.skipped).toBe(true);
      expect(second.writes).toBe(0);
      expect(second.stored).toEqual(first.stored);
    }
  });

  test("revealed numbered rounds can advance and finish without another award", async () => {
    const party = emptyRoomState("Host");
    party.players = Array.from({ length: 3 }, (_, index) => ({
      id: `player_${index}`,
      name: `Guest ${index}`,
      joinedAt: 1,
      teamId: party.teams[0]!.id,
    }));
    const source = launchWhoAmongState(party, "game_session")!;
    source.whoamong!.phase = "reveal";
    const current = structuredClone(source);
    current.teams[0]!.score = 7;
    const next = structuredClone(source);
    next.whoamong!.roundNumber = 2;
    next.whoamong!.phase = "voting";
    const advanced = await staleClientWrite(source, next, current);
    expect(advanced.skipped).toBe(false);
    expect(advanced.stored.whoamong!.roundNumber).toBe(2);
    expect(advanced.stored.teams[0]!.score).toBe(7);
    const finished = structuredClone(source);
    finished.whoamong!.phase = "results";
    finished.teams[0]!.score = 50;
    const result = await staleClientWrite(source, finished, current);
    expect(result.skipped).toBe(false);
    expect(result.stored.whoamong!.phase).toBe("results");
    expect(result.stored.teams[0]!.score).toBe(7);
  });

  test("a host that has seen results cannot reopen the same outcome", async () => {
    const source = photoRound();
    source.phototunt!.phase = "results";
    source.teams[0]!.score = 5;
    const next = structuredClone(source);
    next.phototunt!.phase = "judging";
    const result = await staleClientWrite(source, next, source);
    expect(result.skipped).toBe(true);
    expect(result.writes).toBe(0);
    expect(result.stored).toEqual(source);
  });

  test("only one host can claim a pending AI judgement", async () => {
    const source = photoRound();
    source.phototunt!.phase = "hunting";
    const submitted = structuredClone(source);
    submitted.phototunt!.phase = "judging";
    const first = await staleClientWrite(source, submitted, source);
    expect(first.skipped).toBe(false);
    const second = await staleClientWrite(source, submitted, first.stored);
    expect(second.skipped).toBe(true);
    expect(second.writes).toBe(0);
  });

  test("the accepted judge can finish from its original hunting snapshot", async () => {
    const source = photoRound();
    source.phototunt!.phase = "hunting";
    const current = structuredClone(source);
    current.phototunt!.phase = "judging";
    current.teams[0]!.score = 2;
    const submitted = structuredClone(source);
    submitted.phototunt!.phase = "results";
    submitted.teams[0]!.score = 5;
    const result = await staleClientWrite(source, submitted, current);
    expect(result.skipped).toBe(false);
    expect(result.stored.teams[0]!.score).toBe(7);
    expect(result.stored.phototunt!.phase).toBe("results");
  });
});

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

  test("a second outcome committed during CAS causes a scoring retry to skip", async () => {
    const next = photoRound();
    next.phototunt!.phase = "results";
    next.teams[0]!.score = 5;
    const result = await interleavedWrite(next, 5);
    expect(result.skipped).toBe(true);
    expect(result.acceptedWrites).toBe(0);
    expect(result.stored).toEqual(next);
  });

  test("a legitimate next-round write is accepted rather than reported stale", async () => {
    const { result, skipped, acceptedWrites } = await interleavedWrite(photoRound(), 0, "photo_2");
    expect(result.phototunt?.roundId).toBe("photo_2");
    expect(acceptedWrites).toBe(1);
    expect(skipped).toBe(false);
  });
});
