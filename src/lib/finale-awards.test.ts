import { describe, expect, test } from "bun:test";
import type { ScoreEventView, ScoreLedgerSummary, ScoreSubjectTotal } from "./score-events";
import { deriveFinaleAwards, finaleHighlights } from "./finale-awards";

function total(id: string, value: number, byAct: Record<string, number>): ScoreSubjectTotal {
  return { id, total: value, eventCount: 1, byAct, bySource: { deterministic: value } };
}

function summary(overrides: Partial<ScoreLedgerSummary> = {}): ScoreLedgerSummary {
  return {
    eventCount: 4,
    totalPoints: 70,
    teamTotals: [
      total("forest", 40, { grill: 12, bar: 28 }),
      total("lake", 30, { grill: 22, bar: 8 }),
    ],
    playerTotals: [total("p1", 15, { grill: 5, bar: 10 }), total("p2", 18, { grill: 18 })],
    byAct: { grill: 34, bar: 36 },
    bySource: { deterministic: 70 },
    ...overrides,
  };
}

function event(id: string, points: number, createdAt: string): ScoreEventView {
  return {
    id,
    runId: "run_1",
    gameId: "challenge",
    actId: "grill",
    teamId: "forest",
    playerId: "p1",
    points,
    reason: `Moment ${id}`,
    source: "deterministic",
    rubric: {},
    createdAt,
  };
}

describe("party finale awards", () => {
  test("derives act titles from the ledger and MVP from personal totals", () => {
    expect(deriveFinaleAwards(summary())).toEqual([
      { kind: "grill", subjectType: "team", subjectId: "lake", points: 22 },
      { kind: "bar", subjectType: "team", subjectId: "forest", points: 28 },
      { kind: "mvp", subjectType: "player", subjectId: "p2", points: 18 },
    ]);
  });

  test("works with an empty ledger and no Cross Examination events", () => {
    expect(
      deriveFinaleAwards(
        summary({
          eventCount: 0,
          totalPoints: 0,
          teamTotals: [],
          playerTotals: [],
          byAct: {},
          bySource: {},
        }),
      ),
    ).toEqual([]);
  });

  test("shows only positive highlights in deterministic order and respects the limit", () => {
    const events = [
      event("later", 7, "2026-07-15T12:01:00.000Z"),
      event("negative", -3, "2026-07-15T12:00:00.000Z"),
      event("early", 7, "2026-07-15T12:00:00.000Z"),
      event("small", 2, "2026-07-15T11:00:00.000Z"),
    ];
    expect(finaleHighlights(events, 2).map((item) => item.id)).toEqual(["early", "later"]);
  });
});
