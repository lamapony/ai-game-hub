import { useEffect, useMemo, useState } from "react";
import { deriveFinaleAwards, finaleHighlights } from "@/lib/finale-awards";
import {
  getHostScoreLedgerSummaryClient,
  listHostScoreEventsClient,
} from "@/lib/score-events-client";
import type { ScoreEventView, ScoreLedgerSummary } from "@/lib/score-events";
import type { RoomState } from "@/lib/types";
import { friendlyHostActionError } from "@/lib/host-action-errors";

const AWARD_COPY = {
  grill: { code: "GR", en: "Grill Royalty", ru: "Королева Гриля" },
  bar: { code: "BR", en: "Bar Legend", ru: "Легенда Бара" },
  mvp: { code: "MVP", en: "Evening MVP", ru: "MVP Вечера" },
} as const;

export function PartyFinaleLedger({ roomId, state }: { roomId: string; state: RoomState }) {
  const locale = state.party?.uiLocale ?? "en";
  const [summary, setSummary] = useState<ScoreLedgerSummary | null>(null);
  const [events, setEvents] = useState<ScoreEventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      getHostScoreLedgerSummaryClient(roomId),
      listHostScoreEventsClient(roomId, 250),
    ])
      .then(([summaryResult, eventsResult]) => {
        if (cancelled) return;
        setSummary(summaryResult.summary);
        setEvents(eventsResult.events);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyHostActionError(loadError, "score ledger", "load"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const awards = useMemo(() => (summary ? deriveFinaleAwards(summary) : []), [summary]);
  const highlights = useMemo(() => finaleHighlights(events), [events]);
  const teamNames = new Map(state.teams.map((team) => [team.id, team.name]));
  const playerNames = new Map(state.players.map((player) => [player.id, player.name]));

  if (loading) {
    return (
      <div className="agh-finale-ledger-status">
        {locale === "ru"
          ? "Собираем титулы по журналу вечера…"
          : "Building titles from the evening ledger…"}
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="agh-finale-ledger-status is-error">
        {locale === "ru"
          ? "Детализация журнала недоступна, поэтому финал использует сохранённый общий счёт выше. Титулы не блокируются."
          : "Ledger detail is unavailable, so the finale keeps the saved scoreboard above. Titles are never blocked."}
      </div>
    );
  }

  return (
    <div className="agh-finale-ledger">
      <section className="agh-finale-awards">
        <div className="agh-finale-ledger-label">
          {locale === "ru" ? "Титулы вечера" : "Evening titles"}
        </div>
        {awards.length === 0 ? (
          <p className="agh-finale-ledger-empty">
            {locale === "ru"
              ? "Журнал пуст, но пьедестал выше остаётся финалом."
              : "The ledger is empty, but the podium above remains the finale."}
          </p>
        ) : (
          <div className="agh-finale-award-list">
            {awards.map((award) => {
              const copy = AWARD_COPY[award.kind];
              const name =
                award.subjectType === "team"
                  ? (teamNames.get(award.subjectId) ?? award.subjectId)
                  : (playerNames.get(award.subjectId) ?? award.subjectId);
              return (
                <div key={award.kind} className="agh-finale-award">
                  <b>{copy.code}</b>
                  <div>{copy[locale]}</div>
                  <strong>{name}</strong>
                  <span>{award.points} pts</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {summary.teamTotals.length > 0 && (
        <section className="agh-finale-act-scores">
          <div className="agh-finale-ledger-label">
            {locale === "ru" ? "Счёт по актам" : "Score by act"}
          </div>
          <div>
            {summary.teamTotals.map((total) => (
              <div key={total.id} className="agh-finale-score-row">
                <span className="font-medium">{teamNames.get(total.id) ?? total.id}</span>
                <span>
                  GR {total.byAct.grill ?? 0} · BR {total.byAct.bar ?? 0} ·{" "}
                  <strong>{total.total}</strong>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {highlights.length > 0 && (
        <section className="agh-finale-highlights">
          <div className="agh-finale-ledger-label">
            {locale === "ru" ? "Главные моменты" : "Personal highlights"}
          </div>
          <div>
            {highlights.map((event) => (
              <div key={event.id} className="agh-finale-highlight-row">
                <div className="text-sm font-semibold">
                  {event.playerId
                    ? (playerNames.get(event.playerId) ?? event.playerId)
                    : (teamNames.get(event.teamId) ?? event.teamId)}
                  <span>+{event.points}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{event.reason}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
