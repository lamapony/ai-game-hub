import { describe, expect, test } from "bun:test";
import { emptyRoomState } from "./types";
import type { ScoreAwardInput } from "./score-events";
import { assertScoreAwardTargets, scoreLedgerError } from "./score-events.server";

const award: ScoreAwardInput = {
  idempotencyKey: "oracle:run_1:p1",
  runId: "run_1",
  gameId: "grill-oracle",
  teamId: "forest",
  playerId: "p1",
  points: 10,
  reason: "Two prophecies came true",
  source: "deterministic",
  rubric: { verifiedPredictions: 2 },
};

function rejectedStatus(run: () => unknown) {
  try {
    run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("score ledger server invariants", () => {
  test("requires the team and optional player/team relationship from server state", () => {
    const state = {
      ...emptyRoomState("Host"),
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
    };

    expect(assertScoreAwardTargets(state, [award])).toBeUndefined();
    expect(
      rejectedStatus(() => assertScoreAwardTargets(state, [{ ...award, teamId: "missing" }])),
    ).toBe(409);
    expect(
      rejectedStatus(() => assertScoreAwardTargets(state, [{ ...award, teamId: "lake" }])),
    ).toBe(409);
    expect(
      rejectedStatus(() => assertScoreAwardTargets(state, [{ ...award, playerId: "missing" }])),
    ).toBe(409);
  });

  test("maps transactional database conflicts to stable HTTP statuses", () => {
    expect(scoreLedgerError({ code: "23505", message: "duplicate" }).status).toBe(409);
    expect(scoreLedgerError({ code: "23503", message: "bad target" }).status).toBe(409);
    expect(scoreLedgerError({ code: "P0002", message: "room not found" }).status).toBe(404);
    expect(scoreLedgerError({ code: "22023", message: "invalid batch" }).status).toBe(400);
    expect(scoreLedgerError(new Error("network")).status).toBeUndefined();
  });
});
