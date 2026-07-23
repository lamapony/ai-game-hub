import { describe, expect, test } from "bun:test";
import {
  hostScoreEventsRequestSchema,
  scoreAwardInputSchema,
  scoreRowsForCurrentCycle,
  summarizeScoreEvents,
  type ScoreEventRow,
} from "./score-events";

const award = {
  idempotencyKey: "oracle:run_1:p1",
  runId: "run_1",
  gameId: "grill-oracle",
  teamId: "forest",
  playerId: "p1",
  points: 10,
  reason: "Two prophecies came true",
  source: "deterministic" as const,
  rubric: { verifiedPredictions: 2, pointsEach: 5 },
};

function row(overrides: Partial<ScoreEventRow> = {}): ScoreEventRow {
  return {
    id: "event_1",
    room_id: "room_1",
    run_id: "run_1",
    game_id: "grill-oracle",
    act_id: "grill",
    team_id: "forest",
    player_id: "p1",
    points: 10,
    reason: "Two prophecies came true",
    source: "deterministic",
    rubric: { verifiedPredictions: 2, pointsEach: 5 },
    idempotency_key: "oracle:run_1:p1",
    created_at: "2026-07-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("score event contracts", () => {
  test("accepts deterministic awards but reserves act and legacy source for the server", () => {
    expect(scoreAwardInputSchema.parse(award).rubric).toEqual(award.rubric);
    expect(scoreAwardInputSchema.safeParse({ ...award, points: 0 }).success).toBe(false);
    expect(scoreAwardInputSchema.safeParse({ ...award, source: "legacy" }).success).toBe(false);
    expect(scoreAwardInputSchema.safeParse({ ...award, actId: "bar" }).success).toBe(false);
  });

  test("rejects duplicate event keys inside one atomic batch", () => {
    const parsed = hostScoreEventsRequestSchema.safeParse({
      roomId: "room_1",
      action: "award",
      events: [award, { ...award }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("duplicate"))).toBe(true);
    }
  });

  test("enforces a bounded JSON rubric", () => {
    expect(
      scoreAwardInputSchema.safeParse({
        ...award,
        rubric: { transcript: "x".repeat(17_000) },
      }).success,
    ).toBe(false);
  });
});

describe("score ledger summary", () => {
  test("builds team, player, act and source totals for the finale", () => {
    const summary = summarizeScoreEvents([
      row(),
      row({
        id: "event_2",
        act_id: "bar",
        team_id: "lake",
        player_id: "p2",
        points: 7,
        source: "vote",
        idempotency_key: "toast:run_2:p2",
      }),
      row({
        id: "event_3",
        run_id: "legacy:one",
        game_id: "classic",
        act_id: "classic",
        team_id: "forest",
        player_id: null,
        points: -2,
        source: "legacy",
        idempotency_key: "legacy:forest:one",
      }),
    ]);

    expect(summary.eventCount).toBe(3);
    expect(summary.totalPoints).toBe(15);
    expect(summary.byAct).toEqual({ grill: 10, bar: 7, classic: -2 });
    expect(summary.bySource).toEqual({ deterministic: 10, vote: 7, legacy: -2 });
    expect(summary.teamTotals.map(({ id, total }) => ({ id, total }))).toEqual([
      { id: "forest", total: 8 },
      { id: "lake", total: 7 },
    ]);
    expect(summary.playerTotals.map(({ id, total }) => ({ id, total }))).toEqual([
      { id: "p1", total: 10 },
      { id: "p2", total: 7 },
    ]);
    expect(summary.playerTotals[0]?.byAct).toEqual({ grill: 10 });
  });

  test("starts the current ledger after the latest full-team reset reconciliation", () => {
    const rows = [
      row({ id: "old_forest", points: 10, created_at: "2026-07-15T12:00:00.000Z" }),
      row({
        id: "old_lake",
        team_id: "lake",
        player_id: "p2",
        points: 7,
        created_at: "2026-07-15T12:01:00.000Z",
      }),
      row({
        id: "new_forest",
        run_id: "run_2",
        points: 5,
        created_at: "2026-07-15T13:00:00.000Z",
        idempotency_key: "new:forest:run_2",
      }),
      row({
        id: "reset_lake",
        run_id: "legacy:reset",
        game_id: "classic",
        act_id: "classic",
        team_id: "lake",
        player_id: null,
        points: -7,
        source: "legacy",
        created_at: "2026-07-15T13:00:00.000Z",
        idempotency_key: "legacy:reset:lake",
      }),
      row({
        id: "reset_forest",
        run_id: "legacy:reset",
        game_id: "classic",
        act_id: "classic",
        player_id: null,
        points: -10,
        source: "legacy",
        created_at: "2026-07-15T13:00:00.000Z",
        idempotency_key: "legacy:reset:forest",
      }),
    ];

    const current = scoreRowsForCurrentCycle(rows, ["forest", "lake"]);
    expect(current.map((event) => event.id)).toEqual(["new_forest"]);
    expect(summarizeScoreEvents(current).totalPoints).toBe(5);
  });

  test("does not mistake a partial legacy reconciliation for a new score cycle", () => {
    const rows = [
      row({ id: "old_forest", points: 10 }),
      row({ id: "old_lake", team_id: "lake", player_id: "p2", points: 7 }),
      row({
        id: "partial_reset",
        run_id: "legacy:partial",
        team_id: "forest",
        player_id: null,
        points: -10,
        source: "legacy",
        created_at: "2026-07-15T13:00:00.000Z",
      }),
    ];

    expect(scoreRowsForCurrentCycle(rows, ["forest", "lake"]).map((event) => event.id)).toEqual([
      "old_forest",
      "old_lake",
      "partial_reset",
    ]);
  });

  test("ignores retired-team history when recognizing a reset for the current roster", () => {
    const rows = [
      row({ id: "retired", team_id: "retired", points: 99 }),
      row({ id: "old_forest", points: 10 }),
      row({
        id: "reset_forest",
        run_id: "legacy:reset",
        player_id: null,
        points: -10,
        source: "legacy",
        created_at: "2026-07-15T13:00:00.000Z",
      }),
      row({
        id: "new_lake",
        run_id: "run_2",
        team_id: "lake",
        player_id: "p2",
        points: 3,
        created_at: "2026-07-15T13:01:00.000Z",
      }),
    ];

    expect(scoreRowsForCurrentCycle(rows, ["forest", "lake"]).map((event) => event.id)).toEqual([
      "new_lake",
    ]);
  });

  test("uses the room session clock when an old zero-sum ledger needs no reset row", () => {
    const rows = [
      row({ id: "old_gain", points: 10, created_at: "2026-07-15T12:00:00.000Z" }),
      row({
        id: "old_loss",
        points: -10,
        created_at: "2026-07-15T12:01:00.000Z",
        idempotency_key: "old:loss",
      }),
      row({
        id: "new_gain",
        run_id: "run_2",
        points: 4,
        created_at: "2026-07-15T13:01:00.000Z",
        idempotency_key: "new:gain",
      }),
    ];

    expect(
      scoreRowsForCurrentCycle(rows, ["forest", "lake"], Date.parse("2026-07-15T13:00:00Z")).map(
        (event) => event.id,
      ),
    ).toEqual(["new_gain"]);
  });
});
