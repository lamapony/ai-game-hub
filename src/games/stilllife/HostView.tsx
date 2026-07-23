import { useEffect, useMemo, useRef, useState } from "react";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import {
  finalizeStillLifeClient,
  judgeStillLifeClient,
  listStillLifeGalleryClient,
  nextStillLifeClient,
  prepareStillLifeClient,
} from "@/lib/stilllife-client";
import type { StillLifeManualScore } from "@/lib/stilllife-lifecycle";
import { formatClock } from "@/lib/team-style";
import { friendlyHostActionError } from "@/lib/host-action-errors";
import type { RoomState, StillLifeState } from "@/lib/types";

type GalleryPhoto = { teamId: string; teamName: string; imageUrl: string };
type ScoreDraft = { compositionScore: number; dramaScore: number; materialScore: number };

const PHASE_ORDER: Record<StillLifeState["phase"], number> = {
  briefing: 0,
  building: 1,
  judging: 2,
  voting: 3,
  results: 4,
};

function progressRank(still: StillLifeState) {
  return (
    PHASE_ORDER[still.phase] * 100 +
    still.submittedTeamIds.length * 10 +
    still.submittedVoterIds.length
  );
}

export function StillLifeHost({
  roomId,
  state,
}: {
  roomId: string;
  code: string;
  state: RoomState;
}) {
  const still = state.stilllife!;
  const locale = state.party?.uiLocale ?? "en";
  const [now, setNow] = useState(() => Date.now());
  const [localStill, setLocalStill] = useState<StillLifeState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const preparingRef = useRef<string | null>(null);
  const current =
    localStill?.roundId === still.roundId && progressRank(localStill) > progressRank(still)
      ? localStill
      : still;
  const submittedTeamKey = current.submittedTeamIds.join(":");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalStill(null);
    setGallery([]);
    setManualMode(false);
    setScoreDrafts({});
    setError(null);
  }, [still.roundId]);

  useEffect(() => {
    if (still.phase !== "briefing" || preparingRef.current === still.roundId) return;
    preparingRef.current = still.roundId;
    setBusy("prepare");
    void prepareStillLifeClient(roomId, still.roundId)
      .then(({ still: prepared }) => setLocalStill(prepared))
      .catch((prepareError) => {
        preparingRef.current = null;
        setError(friendlyHostActionError(prepareError, "Still Life headline", "prepare"));
      })
      .finally(() => setBusy(null));
  }, [roomId, still.phase, still.roundId]);

  useEffect(() => {
    if (current.phase === "briefing") return;
    let cancelled = false;
    void listStillLifeGalleryClient(roomId, current.roundId)
      .then(({ photos }) => {
        if (!cancelled) setGallery(photos);
      })
      .catch((galleryError) => {
        if (!cancelled)
          setError(friendlyHostActionError(galleryError, "Still Life gallery", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [current.phase, current.roundId, submittedTeamKey, roomId]);

  useEffect(() => {
    if (!manualMode) return;
    setScoreDrafts((drafts) => {
      const next = { ...drafts };
      current.submittedTeamIds.forEach((teamId) => {
        next[teamId] ??= { compositionScore: 6, dramaScore: 6, materialScore: 3 };
      });
      return next;
    });
  }, [current.submittedTeamIds, manualMode]);

  async function run(label: string, action: () => Promise<{ still: StillLifeState }>) {
    setBusy(label);
    setError(null);
    try {
      const result = await action();
      setLocalStill(result.still);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Still Life step", "complete"));
    } finally {
      setBusy(null);
    }
  }

  const submittedTeams = useMemo(
    () =>
      current.submittedTeamIds.map(
        (teamId) => state.teams.find((team) => team.id === teamId) ?? { id: teamId, name: teamId },
      ),
    [current.submittedTeamIds, state.teams],
  );
  const timerEnd = current.phase === "building" ? current.buildingEndsAt : current.votingEndsAt;
  const remaining = Math.max(0, (timerEnd ?? now) - now);
  const eligibleVoterCount = state.players.filter((player) =>
    current.judgments?.some((entry) => entry.teamId !== player.teamId),
  ).length;

  function updateDraft(teamId: string, field: keyof ScoreDraft, raw: string) {
    const limits = { compositionScore: 10, dramaScore: 10, materialScore: 5 };
    const value = Math.max(0, Math.min(limits[field], Number(raw) || 0));
    setScoreDrafts((drafts) => ({
      ...drafts,
      [teamId]: {
        ...(drafts[teamId] ?? { compositionScore: 6, dramaScore: 6, materialScore: 3 }),
        [field]: value,
      },
    }));
  }

  function manualScores(): StillLifeManualScore[] | undefined {
    if (!manualMode) return undefined;
    return current.submittedTeamIds.map((teamId) => ({
      teamId,
      ...(scoreDrafts[teamId] ?? { compositionScore: 6, dramaScore: 6, materialScore: 3 }),
    }));
  }

  const winnerNames = current.result?.winningTeamIds
    .map((teamId) => state.teams.find((team) => team.id === teamId)?.name ?? teamId)
    .join(" + ");

  return (
    <section className="overflow-hidden rounded-3xl border border-orange-200/20 bg-[radial-gradient(circle_at_12%_0%,oklch(0.7_0.16_55/0.3),transparent_42%),linear-gradient(145deg,oklch(0.23_0.055_45),oklch(0.12_0.025_28))] text-white shadow-2xl">
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.26em] text-orange-100/55">
              {locale === "ru" ? "Натюрморт: Выживание" : "Still Life Survival"} ·{" "}
              {current.roundNumber}/{current.totalRounds}
            </div>
            <h2 className="mt-2 font-display text-4xl">
              {current.phase === "briefing"
                ? locale === "ru"
                  ? "Аукцион готовит лот"
                  : "Auction preparing the lot"
                : current.headline}
            </h2>
          </div>
          {timerEnd && (
            <div className="rounded-2xl border border-white/15 bg-black/20 px-5 py-3 text-right">
              <div className="font-display text-3xl tabular-nums">{formatClock(remaining)}</div>
              <div className="text-xs text-white/45">{current.phase}</div>
            </div>
          )}
        </div>

        {current.phase === "briefing" && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/65">
            <div className={busy === "prepare" ? "animate-pulse" : ""}>
              {locale === "ru"
                ? "AI пишет заголовок, который еде придётся пережить физически…"
                : "AI is writing a headline the food will have to survive physically…"}
            </div>
          </div>
        )}

        {current.phase === "building" && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {current.activeTeamIds.map((teamId) => {
                const team = state.teams.find((candidate) => candidate.id === teamId);
                const submitted = current.submittedTeamIds.includes(teamId);
                return (
                  <div key={teamId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="font-display text-xl">{team?.name ?? teamId}</div>
                    <div
                      className={`mt-2 text-xs ${submitted ? "text-emerald-200" : "text-white/45"}`}
                    >
                      {submitted
                        ? locale === "ru"
                          ? "Фото принято"
                          : "Photo accepted"
                        : locale === "ru"
                          ? "Строит в реальности"
                          : "Building in reality"}
                    </div>
                  </div>
                );
              })}
            </div>

            {gallery.length > 0 && <Gallery photos={gallery} />}

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              <input
                type="checkbox"
                checked={manualMode}
                onChange={(event) => setManualMode(event.target.checked)}
                disabled={busy !== null}
              />
              {locale === "ru"
                ? "Живое жюри: ведущий задаёт три оценки вместо vision-AI"
                : "Live jury: host sets the three scores instead of vision AI"}
            </label>

            {manualMode && submittedTeams.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {submittedTeams.map((team) => {
                  const draft = scoreDrafts[team.id] ?? {
                    compositionScore: 6,
                    dramaScore: 6,
                    materialScore: 3,
                  };
                  return (
                    <div
                      key={team.id}
                      className="rounded-2xl border border-orange-100/15 bg-black/20 p-4"
                    >
                      <div className="font-semibold">{team.name}</div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <ScoreInput
                          label="Comp"
                          value={draft.compositionScore}
                          max={10}
                          onChange={(value) => updateDraft(team.id, "compositionScore", value)}
                        />
                        <ScoreInput
                          label="Drama"
                          value={draft.dramaScore}
                          max={10}
                          onChange={(value) => updateDraft(team.id, "dramaScore", value)}
                        />
                        <ScoreInput
                          label="Env"
                          value={draft.materialScore}
                          max={5}
                          onChange={(value) => updateDraft(team.id, "materialScore", value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              disabled={busy !== null || current.submittedTeamIds.length < 2}
              onClick={() =>
                void run("judge", () =>
                  judgeStillLifeClient(roomId, current.roundId, manualScores()),
                )
              }
              className="w-full rounded-2xl bg-orange-100 px-5 py-4 font-semibold text-stone-950 disabled:opacity-40"
            >
              {busy === "judge"
                ? locale === "ru"
                  ? "Открываем Sotheby's…"
                  : "Opening Sotheby's…"
                : locale === "ru"
                  ? `Закрыть мастерскую и судить · ${current.submittedTeamIds.length}/${current.activeTeamIds.length}`
                  : `Close studio and judge · ${current.submittedTeamIds.length}/${current.activeTeamIds.length}`}
            </button>
          </div>
        )}

        {current.phase === "judging" && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-6 text-center">
            <p className={`text-sm text-white/65 ${busy === "judge" ? "animate-pulse" : ""}`}>
              {locale === "ru"
                ? "Критик пересчитывает фольгу в датские кроны…"
                : "The critic is converting foil into Danish kroner…"}
            </p>
            {!busy && (
              <button
                type="button"
                onClick={() =>
                  void run("judge", () => judgeStillLifeClient(roomId, current.roundId))
                }
                className="mt-4 rounded-xl border border-white/20 px-4 py-2 text-xs"
              >
                {locale === "ru" ? "Повторить оценку" : "Retry judgment"}
              </button>
            )}
          </div>
        )}

        {current.phase === "voting" && current.judgments && (
          <div className="mt-6 space-y-5">
            {gallery.length > 0 && <Gallery photos={gallery} />}
            <JudgmentGrid entries={current.judgments} locale={locale} />
            <div className="flex items-center justify-between text-sm text-white/60">
              <span>{locale === "ru" ? "Бюллетени зала" : "Audience ballots"}</span>
              <span>
                {current.submittedVoterIds.length}/{eligibleVoterCount}
              </span>
            </div>
            <button
              type="button"
              disabled={busy !== null || (current.submittedVoterIds.length === 0 && remaining > 0)}
              onClick={() =>
                void run("finalize", () =>
                  finalizeStillLifeClient(
                    roomId,
                    current.roundId,
                    current.submittedVoterIds.length === 0,
                  ),
                )
              }
              className="w-full rounded-2xl bg-white px-5 py-4 font-semibold text-stone-950 disabled:opacity-40"
            >
              {busy === "finalize"
                ? locale === "ru"
                  ? "Удар молотка…"
                  : "Hammer falling…"
                : current.submittedVoterIds.length === 0
                  ? locale === "ru"
                    ? "Закрыть без бюллетеней"
                    : "Close without ballots"
                  : locale === "ru"
                    ? "Закрыть голосование"
                    : "Close voting"}
            </button>
          </div>
        )}

        {current.phase === "results" && current.result && (
          <div className="mt-6 space-y-5">
            <div className="rounded-3xl border border-emerald-100/20 bg-emerald-300/10 p-6 text-center">
              <div className="text-xs uppercase tracking-[0.24em] text-emerald-100/55">
                {locale === "ru" ? "Лот вечера" : "Lot of the round"}
              </div>
              <div className="mt-2 font-display text-4xl">{winnerNames}</div>
            </div>
            {gallery.length > 0 && <Gallery photos={gallery} />}
            <JudgmentGrid entries={current.result.entries} locale={locale} />
            {current.roundNumber < current.totalRounds ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("next", () => nextStillLifeClient(roomId, current.roundId))}
                className="w-full rounded-2xl bg-orange-100 px-5 py-4 font-semibold text-stone-950 disabled:opacity-40"
              >
                {locale === "ru" ? "Следующий заголовок" : "Next headline"}
              </button>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/65">
                {locale === "ru"
                  ? "Два лота проданы. Еду наконец можно перестать называть медиумом."
                  : "Two lots sold. The food may finally stop being called a medium."}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 rounded-xl bg-red-950/60 p-3 text-sm text-red-100">{error}</p>}
        <GameRulesChecklist gameId="stilllife" />
      </div>
    </section>
  );
}

function ScoreInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-center text-[10px] uppercase tracking-wider text-white/45">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-white/10 bg-stone-950/70 px-2 py-2 text-center text-base text-white"
      />
    </label>
  );
}

function Gallery({ photos }: { photos: GalleryPhoto[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {photos.map((photo) => (
        <figure
          key={photo.teamId}
          className="overflow-hidden rounded-2xl border border-white/10 bg-black/25"
        >
          <img src={photo.imageUrl} alt={photo.teamName} className="h-56 w-full object-cover" />
          <figcaption className="px-4 py-3 text-sm font-semibold">{photo.teamName}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function JudgmentGrid({
  entries,
  locale,
}: {
  entries: NonNullable<StillLifeState["judgments"]>;
  locale: "en" | "ru";
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {entries.map((entry) => (
        <article key={entry.teamId} className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-white/45">{entry.teamName}</div>
              <h3 className="mt-1 font-display text-2xl">{entry.catalogTitle}</h3>
            </div>
            <div className="rounded-full bg-orange-100 px-3 py-1 font-bold text-stone-950">
              {entry.points}
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/65">{entry.critique}</p>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
            <Metric label="C" value={`${entry.compositionScore}/10`} />
            <Metric label="D" value={`${entry.dramaScore}/10`} />
            <Metric label="Env" value={`${entry.materialScore}/5`} />
            <Metric label={locale === "ru" ? "Зал" : "Vote"} value={String(entry.audienceVotes)} />
          </div>
          <div className="mt-3 text-xs text-orange-100/50">
            {new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-DK").format(
              entry.auctionPriceDkk,
            )}{" "}
            DKK
            {entry.manualOverride ? " · live jury" : entry.aiFallback ? " · local fallback" : ""}
          </div>
        </article>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2">
      <div className="text-white/35">{label}</div>
      <div className="mt-1 font-semibold text-white/80">{value}</div>
    </div>
  );
}
