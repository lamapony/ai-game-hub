import { useEffect, useRef, useState } from "react";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import {
  chooseSommelierCrowdFavoriteClient,
  currentSommelierCardClient,
  nextSommelierClient,
  prepareSommelierClient,
  revealSommelierClient,
} from "@/lib/sommelier-client";
import { formatClock } from "@/lib/team-style";
import { friendlyHostActionError } from "@/lib/host-action-errors";
import type { RoomState, SommelierState } from "@/lib/types";

type CurrentCard = {
  entryId: string;
  imageUrl: string;
  ownerPlayerId?: string;
  ownerPlayerName?: string;
};

const PHASE_RANK: Record<SommelierState["phase"], number> = {
  capture: 0,
  analyzing: 1,
  voting: 2,
  reveal: 3,
  "crowd-favorite": 4,
  results: 5,
};

function progressRank(state: SommelierState) {
  return state.roundNumber * 100 + PHASE_RANK[state.phase] * 10 + state.submittedVoterIds.length;
}

export function SommelierHost({
  roomId,
  state,
}: {
  roomId: string;
  code: string;
  state: RoomState;
}) {
  const sommelier = state.sommelier!;
  const locale = state.party?.uiLocale ?? "en";
  const [now, setNow] = useState(() => Date.now());
  const [localSommelier, setLocalSommelier] = useState<SommelierState | null>(null);
  const [card, setCard] = useState<CurrentCard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preparingRef = useRef<string | null>(null);
  const current =
    localSommelier?.sessionId === sommelier.sessionId &&
    progressRank(localSommelier) > progressRank(sommelier)
      ? localSommelier
      : sommelier;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalSommelier(null);
    setCard(null);
    setBusy(null);
    setError(null);
    preparingRef.current = null;
  }, [sommelier.sessionId]);

  useEffect(() => {
    if (current.phase !== "analyzing" || preparingRef.current === current.sessionId) return;
    preparingRef.current = current.sessionId;
    setBusy("prepare");
    void prepareSommelierClient(roomId, current.sessionId)
      .then(({ sommelier: prepared }) => setLocalSommelier(prepared))
      .catch((prepareError) => {
        preparingRef.current = null;
        setError(friendlyHostActionError(prepareError, "Sommelier analysis", "prepare"));
      })
      .finally(() => setBusy(null));
  }, [current.phase, current.sessionId, roomId]);

  useEffect(() => {
    if (!current.currentEntryId || !["voting", "reveal"].includes(current.phase)) {
      setCard(null);
      return;
    }
    let cancelled = false;
    void currentSommelierCardClient(roomId, current.sessionId)
      .then((response) => {
        if (!cancelled) setCard(response.card);
      })
      .catch((cardError) => {
        if (!cancelled) setError(friendlyHostActionError(cardError, "drink image", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [current.currentEntryId, current.phase, current.sessionId, roomId]);

  async function run(label: string, action: () => Promise<{ sommelier: SommelierState }>) {
    setBusy(label);
    setError(null);
    try {
      const response = await action();
      setLocalSommelier(response.sommelier);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Sommelier step", "complete"));
    } finally {
      setBusy(null);
    }
  }

  const timerEnd = current.phase === "capture" ? current.captureEndsAt : current.votingEndsAt;
  const remaining = Math.max(0, (timerEnd ?? now) - now);
  const visibleCard = card?.entryId === current.currentEntryId ? card : null;
  const eligibleVoters = Math.max(0, state.players.length - 1);
  const participantNames = current.participantIds.map(
    (playerId) => state.players.find((player) => player.id === playerId)?.name ?? playerId,
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-fuchsia-100/15 bg-[radial-gradient(circle_at_10%_0%,oklch(0.58_0.2_330/0.3),transparent_42%),linear-gradient(145deg,oklch(0.22_0.06_320),oklch(0.11_0.025_285))] text-white shadow-2xl">
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.26em] text-fuchsia-100/55">
              {locale === "ru" ? "Сомелье-Шарлатан" : "Sommelier Charlatan"}
              {current.roundNumber > 0 ? ` · ${current.roundNumber}/${current.totalRounds}` : ""}
            </div>
            <h2 className="mt-2 font-display text-4xl">
              {current.phase === "capture"
                ? locale === "ru"
                  ? "Соберите анонимный бар"
                  : "Assemble the anonymous bar"
                : current.phase === "analyzing"
                  ? locale === "ru"
                    ? "Диплом печатается"
                    : "Diploma printing"
                  : current.phase === "crowd-favorite"
                    ? locale === "ru"
                      ? "Какой портрет взорвал зал?"
                      : "Which portrait broke the room?"
                    : current.phase === "results"
                      ? locale === "ru"
                        ? "Бар опознан"
                        : "The bar has been identified"
                      : current.currentProfile?.drink_guess}
            </h2>
          </div>
          {timerEnd && (
            <div className="rounded-2xl border border-white/15 bg-black/20 px-5 py-3 text-right">
              <div className="font-display text-3xl tabular-nums">{formatClock(remaining)}</div>
              <div className="text-xs text-white/45">{current.phase}</div>
            </div>
          )}
        </div>

        {current.phase === "capture" && (
          <div className="mt-6 space-y-5">
            <p className="text-sm leading-relaxed text-white/65">
              {locale === "ru"
                ? "Выбранные гости снимают уже стоящий перед ними напиток — алкоголь не нужен. Лица, имена и чужие телефоны в кадр не попадают."
                : "Selected guests photograph the drink already in front of them—alcohol is not required. Keep faces, names and other phones out of frame."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {current.participantIds.map((playerId) => {
                const name =
                  state.players.find((player) => player.id === playerId)?.name ?? playerId;
                const submitted = current.submittedPlayerIds.includes(playerId);
                return (
                  <div
                    key={playerId}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="font-semibold">{name}</div>
                    <div
                      className={`mt-1 text-xs ${submitted ? "text-emerald-200" : "text-white/40"}`}
                    >
                      {submitted
                        ? locale === "ru"
                          ? "Бокал опечатан"
                          : "Glass sealed"
                        : locale === "ru"
                          ? "Снимает без свидетелей"
                          : "Photographing without witnesses"}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              disabled={busy !== null || current.submittedPlayerIds.length < 2}
              onClick={() => {
                preparingRef.current = current.sessionId;
                void run("prepare", () => prepareSommelierClient(roomId, current.sessionId));
              }}
              className="w-full rounded-2xl bg-fuchsia-100 px-5 py-4 font-semibold text-stone-950 disabled:opacity-40"
            >
              {busy === "prepare"
                ? locale === "ru"
                  ? "Сомелье смотрит в бокалы…"
                  : "Sommelier staring into glasses…"
                : locale === "ru"
                  ? `Разобрать ${current.submittedPlayerIds.length} напитка(ов)`
                  : `Profile ${current.submittedPlayerIds.length} drinks`}
            </button>
            <div className="text-center text-xs text-white/35">{participantNames.join(" · ")}</div>
          </div>
        )}

        {current.phase === "analyzing" && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-8 text-center">
            <div className="animate-pulse text-5xl">🍷</div>
            <p className="mt-4 text-sm text-white/60">
              {locale === "ru"
                ? "AI изучает стекло, лёд и тёплый свет. Владельцев ему не показывают."
                : "AI is studying glass, ice and warm light. Owner identities are withheld."}
            </p>
          </div>
        )}

        {current.phase === "voting" && current.currentProfile && (
          <div className="mt-6 space-y-5">
            <DrinkProfile
              profile={current.currentProfile}
              imageUrl={visibleCard?.imageUrl}
              locale={locale}
            />
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
              <div className="text-xs uppercase tracking-widest text-white/35">
                {locale === "ru" ? "Бюллетени" : "Ballots"}
              </div>
              <div className="mt-1 font-display text-3xl">
                {current.submittedVoterIds.length}/{eligibleVoters}
              </div>
            </div>
            <button
              type="button"
              disabled={busy !== null || current.submittedVoterIds.length === 0}
              onClick={() =>
                void run("reveal", () =>
                  revealSommelierClient(roomId, current.sessionId, current.currentEntryId!),
                )
              }
              className="w-full rounded-2xl bg-fuchsia-100 px-5 py-4 font-semibold text-stone-950 disabled:opacity-40"
            >
              {locale === "ru" ? "Раскрыть владельца" : "Reveal the owner"}
            </button>
            {remaining <= 0 && current.submittedVoterIds.length === 0 && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run("reveal", () =>
                    revealSommelierClient(roomId, current.sessionId, current.currentEntryId!, true),
                  )
                }
                className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/70 disabled:opacity-40"
              >
                {locale === "ru" ? "Закрыть без бюллетеней" : "Close without ballots"}
              </button>
            )}
          </div>
        )}

        {current.phase === "reveal" && current.result && (
          <div className="mt-6 space-y-5">
            <DrinkProfile
              profile={current.result.profile}
              imageUrl={visibleCard?.imageUrl}
              locale={locale}
            />
            <div className="rounded-3xl border border-emerald-100/20 bg-emerald-300/10 p-6 text-center">
              <div className="text-xs uppercase tracking-[0.24em] text-emerald-100/55">
                {locale === "ru" ? "Владелец бокала" : "Glass owner"}
              </div>
              <div className="mt-2 font-display text-4xl">{current.result.ownerPlayerName}</div>
              <div className="mt-2 text-sm text-emerald-50/65">
                {current.result.correctGuesserIds.length > 0
                  ? locale === "ru"
                    ? `Раскрыли: ${current.result.correctGuesserIds
                        .map((id) => state.players.find((player) => player.id === id)?.name ?? id)
                        .join(", ")} · каждому +3`
                    : `Found by ${current.result.correctGuesserIds
                        .map((id) => state.players.find((player) => player.id === id)?.name ?? id)
                        .join(", ")} · +3 each`
                  : locale === "ru"
                    ? "Никто не раскрыл владельца · ему +5"
                    : "Nobody found the owner · owner +5"}
              </div>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run("next", () =>
                  nextSommelierClient(roomId, current.sessionId, current.result!.entryId),
                )
              }
              className="w-full rounded-2xl bg-fuchsia-100 px-5 py-4 font-semibold text-stone-950 disabled:opacity-40"
            >
              {current.roundNumber >= current.totalRounds
                ? locale === "ru"
                  ? "Выбрать реакцию вечера"
                  : "Choose reaction of the night"
                : locale === "ru"
                  ? "Следующий бокал"
                  : "Next glass"}
            </button>
          </div>
        )}

        {current.phase === "crowd-favorite" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-white/65">
              {locale === "ru"
                ? "Выберите один reveal, который вызвал самый громкий живой ор. Владельцу — единственный бонус +3."
                : "Choose the one reveal that caused the loudest real reaction. Its owner gets the single +3 bonus."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {current.roundResults.map((result) => (
                <button
                  key={result.entryId}
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("favorite", () =>
                      chooseSommelierCrowdFavoriteClient(roomId, current.sessionId, result.entryId),
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-black/20 p-5 text-left disabled:opacity-40"
                >
                  <div className="font-display text-2xl">{result.ownerPlayerName}</div>
                  <div className="mt-1 text-sm text-fuchsia-100/70">
                    {result.profile.drink_guess}
                  </div>
                  <div className="mt-3 text-xs text-white/40">
                    {locale === "ru" ? "Отдать +3 за громкость" : "Award +3 for volume"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {current.phase === "results" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-fuchsia-100/20 bg-fuchsia-300/10 p-7 text-center">
              <div className="text-xs uppercase tracking-[0.24em] text-fuchsia-100/55">
                {locale === "ru" ? "Реакция вечера · +3" : "Reaction of the night · +3"}
              </div>
              <div className="mt-2 font-display text-4xl">
                {state.players.find((player) => player.id === current.crowdFavoriteOwnerId)?.name ??
                  current.crowdFavoriteOwnerId}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {current.roundResults.map((result) => (
                <div
                  key={result.entryId}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="font-semibold">{result.ownerPlayerName}</div>
                  <div className="mt-1 text-sm text-white/65">{result.profile.drink_guess}</div>
                  <div className="mt-2 text-xs text-white/35">
                    {result.correctGuesserIds.length} correct · owner +{result.ownerPoints}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200/20 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}
        <GameRulesChecklist gameId="sommelier" />
      </div>
    </section>
  );
}

function DrinkProfile({
  profile,
  imageUrl,
  locale,
}: {
  profile: NonNullable<SommelierState["currentProfile"]>;
  imageUrl?: string;
  locale: "en" | "ru";
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="aspect-square overflow-hidden rounded-3xl border border-white/10 bg-black/30">
        {imageUrl ? (
          <img src={imageUrl} alt="Anonymous drink" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-white/35">
            {locale === "ru" ? "Поднимаем бокал…" : "Raising the glass…"}
          </div>
        )}
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-widest text-white/35">
            {locale === "ru" ? "Дегустационные ноты" : "Tasting notes"}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/70">{profile.tasting_notes}</p>
        </div>
        <div className="rounded-2xl border border-fuchsia-100/15 bg-fuchsia-300/10 p-5">
          <div className="text-[10px] uppercase tracking-widest text-fuchsia-100/45">
            {locale === "ru" ? "Психопортрет владельца" : "Owner profile"}
          </div>
          <p className="mt-2 leading-relaxed text-white/85">{profile.owner_profile}</p>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
          <span className="text-white/50">
            {locale === "ru" ? "Претенциозность" : "Pretentiousness"}
          </span>
          <span className="font-display text-2xl text-fuchsia-100">
            {profile.pretentiousness}/10
          </span>
        </div>
        <p className="px-2 text-xs leading-relaxed text-white/45">{profile.pairing_advice}</p>
      </div>
    </div>
  );
}
