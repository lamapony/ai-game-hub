import type { ScoreEventView, ScoreLedgerSummary, ScoreSubjectTotal } from "./score-events";

export type FinaleAward = {
  kind: "grill" | "bar" | "mvp";
  subjectType: "team" | "player";
  subjectId: string;
  points: number;
};

function topByAct(totals: ScoreSubjectTotal[], actId: string) {
  return [...totals]
    .map((total) => ({ total, points: total.byAct[actId] ?? 0 }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.total.id.localeCompare(b.total.id))[0];
}

export function deriveFinaleAwards(summary: ScoreLedgerSummary): FinaleAward[] {
  const awards: FinaleAward[] = [];
  const grill = topByAct(summary.teamTotals, "grill");
  const bar = topByAct(summary.teamTotals, "bar");
  const mvp = [...summary.playerTotals]
    .filter((total) => total.total > 0)
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))[0];
  if (grill) {
    awards.push({
      kind: "grill",
      subjectType: "team",
      subjectId: grill.total.id,
      points: grill.points,
    });
  }
  if (bar) {
    awards.push({ kind: "bar", subjectType: "team", subjectId: bar.total.id, points: bar.points });
  }
  if (mvp) {
    awards.push({ kind: "mvp", subjectType: "player", subjectId: mvp.id, points: mvp.total });
  }
  return awards;
}

export function finaleHighlights(events: ScoreEventView[], limit = 4) {
  return [...events]
    .filter((event) => event.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
