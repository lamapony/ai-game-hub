import { useEffect, useRef, useState } from "react";
import type { TongsTestimonyRecord } from "./model";
import {
  getTongsCaseClient,
  manualTongsVerdictClient,
  nextTongsRoundClient,
  prepareTongsQuestionClient,
  skipTongsRoundClient,
} from "@/lib/tongsoftruth-client";
import { tongsPoints } from "./scoring";
import { friendlyHostActionError } from "@/lib/host-action-errors";
import type { RoomState, TongsOfTruthState } from "@/lib/types";

function secondsLeft(endsAt: number | undefined, now: number) {
  return Math.max(0, Math.ceil(((endsAt ?? now) - now) / 1000));
}

export function TongsOfTruthBackgroundHost({
  roomId,
  state,
}: {
  roomId: string;
  state: RoomState;
}) {
  const publicRun = state.tongsoftruth!;
  const locale = state.party?.uiLocale ?? "en";
  const [run, setRun] = useState<TongsOfTruthState>(publicRun);
  const [testimony, setTestimony] = useState<TongsTestimonyRecord | null>(null);
  const [honestyScore, setHonestyScore] = useState(5);
  const [artistryScore, setArtistryScore] = useState(2);
  const [dodgeDetected, setDodgeDetected] = useState(false);
  const [environmentUsed, setEnvironmentUsed] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const preparingRef = useRef<string | null>(null);

  useEffect(() => setRun(publicRun), [publicRun]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (run.status !== "question" || run.question || preparingRef.current === run.currentRoundId) {
      return;
    }
    preparingRef.current = run.currentRoundId;
    setError(null);
    void prepareTongsQuestionClient(roomId, run.runId)
      .then((result) => setRun(result.run))
      .catch((loadError) => {
        preparingRef.current = null;
        setError(friendlyHostActionError(loadError, "Tongs question", "prepare"));
      });
  }, [roomId, run.currentRoundId, run.question, run.runId, run.status]);

  useEffect(() => {
    if (run.status !== "review") {
      setTestimony(null);
      return;
    }
    let cancelled = false;
    void getTongsCaseClient(roomId, run.runId)
      .then((result) => {
        if (!cancelled) setTestimony(result.testimony);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyHostActionError(loadError, "testimony", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, run.runId, run.status]);

  async function manualVerdict() {
    if (!comment.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await manualTongsVerdictClient({
        roomId,
        runId: run.runId,
        roundId: run.currentRoundId,
        honestyScore,
        dodgeDetected,
        artistryScore,
        environmentUsed,
        comment: comment.trim(),
      });
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Tongs verdict", "complete"));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (
      !window.confirm(
        locale === "ru"
          ? "Передать щипцы без очков?"
          : "Pass the tongs with no points for this turn?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await skipTongsRoundClient(roomId, run.runId, run.currentRoundId);
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Tongs skip", "complete"));
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setBusy(true);
    setError(null);
    try {
      const result = await nextTongsRoundClient(roomId, run.runId, run.currentRoundId);
      preparingRef.current = null;
      setRun(result.run);
      setComment("");
      setHonestyScore(5);
      setArtistryScore(2);
      setDodgeDetected(false);
      setEnvironmentUsed(false);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "next Tongs turn", "load"));
    } finally {
      setBusy(false);
    }
  }

  const manualPoints = tongsPoints({
    honestyScore,
    dodgeDetected,
    artistryScore,
    environmentUsed,
  });
  const urgent = run.status !== "results";

  return (
    <details
      open={urgent}
      className="mb-4 rounded-3xl border border-orange-200/25 bg-orange-950/45 p-4 text-white backdrop-blur"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.23em] text-orange-200/70">
              🍢 {locale === "ru" ? "Щипцы Правды · фон" : "Tongs of Truth · background"}
            </div>
            <div className="mt-1 font-display text-xl">
              {run.status === "results"
                ? locale === "ru"
                  ? "Показания собраны"
                  : "Testimony sealed"
                : `${run.speakerName} · ${run.roundNumber}/${run.totalRounds} · 🔥${run.level}`}
            </div>
          </div>
          {run.status === "recording" && (
            <span className="rounded-full bg-red-300 px-3 py-1 text-xs font-bold text-red-950">
              REC {secondsLeft(run.recordingEndsAt, now)}s
            </span>
          )}
        </div>
      </summary>

      {error && <p className="mt-3 rounded-xl bg-red-950/70 p-3 text-sm text-red-100">{error}</p>}

      {run.status !== "results" && (
        <div className="mt-4 rounded-2xl border border-orange-100/15 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-orange-200/55">
            {locale === "ru" ? "Передай реальные щипцы" : "Pass the real tongs"}
          </div>
          <div className="mt-2 font-display text-2xl leading-tight">
            {run.question ??
              (locale === "ru"
                ? "Следователь формулирует вопрос…"
                : "The investigator is writing…")}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            {locale === "ru"
              ? "AI оценивает конкретику текста, а не знает правду и не читает голос как полиграф."
              : "AI scores textual specificity; it cannot know truth or read a voice like a polygraph."}
          </p>
        </div>
      )}

      {run.status === "question" && run.question && (
        <p className="mt-3 text-sm text-white/70">
          {locale === "ru"
            ? `Ждём, пока ${run.speakerName} возьмёт щипцы и откроет микрофон на телефоне.`
            : `Waiting for ${run.speakerName} to take the tongs and open the microphone.`}
        </p>
      )}

      {run.status === "judging" && (
        <p className="mt-3 rounded-2xl bg-white/8 p-4 text-sm text-white/70">
          {locale === "ru"
            ? "Whisper снял показания. Судья проверяет конкретику…"
            : "Whisper captured the testimony. The judge is checking specificity…"}
        </p>
      )}

      {run.status === "review" && (
        <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-950/35 p-4">
          <div className="text-sm font-semibold text-amber-100">
            {locale === "ru" ? "Ручной вердикт" : "Manual verdict"}
          </div>
          <p className="mt-1 text-xs text-white/55">
            {testimony?.transcript ||
              (locale === "ru"
                ? "Транскрипт недоступен: оцени услышанный живой ответ."
                : "Transcript unavailable; score the live answer you heard.")}
          </p>
          <label className="mt-4 block text-xs text-white/65">
            {locale === "ru" ? "Конкретика" : "Specificity"}: {honestyScore}/10
            <input
              type="range"
              min={0}
              max={10}
              value={honestyScore}
              onChange={(event) => setHonestyScore(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <label className="mt-3 block text-xs text-white/65">
            {locale === "ru" ? "Артистизм" : "Stagecraft"}: {artistryScore}/5
            <input
              type="range"
              min={0}
              max={5}
              value={artistryScore}
              onChange={(event) => setArtistryScore(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={dodgeDetected}
                onChange={(event) => setDodgeDetected(event.target.checked)}
              />
              {locale === "ru" ? "Было уклонение −3" : "Detected a dodge −3"}
            </label>
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={environmentUsed}
                onChange={(event) => setEnvironmentUsed(event.target.checked)}
              />
              {locale === "ru" ? "Реальная среда +5" : "Real environment +5"}
            </label>
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={800}
            placeholder={
              locale === "ru" ? "Меткий публичный комментарий…" : "Sharp public comment…"
            }
            className="mt-3 min-h-20 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm"
          />
          <button
            type="button"
            disabled={busy || !comment.trim()}
            onClick={() => void manualVerdict()}
            className="mt-3 rounded-xl bg-amber-200 px-4 py-3 text-sm font-bold text-amber-950 disabled:opacity-40"
          >
            {locale === "ru" ? `Зафиксировать ${manualPoints} очк.` : `Lock ${manualPoints} points`}
          </button>
        </div>
      )}

      {run.status === "reveal" && run.result && (
        <div className="mt-4 rounded-2xl border border-lime-200/25 bg-lime-950/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-display text-3xl">+{run.result.points}</div>
            <div className="text-xs text-white/60">
              {locale === "ru" ? "конкретика" : "specificity"} {run.result.honestyScore}/10 ·{" "}
              {locale === "ru" ? "артистизм" : "stagecraft"} {run.result.artistryScore}/5
              {run.result.dodgeDetected ? " · dodge −3" : ""}
              {run.result.environmentUsed ? " · environment +5" : ""}
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/80">{run.result.comment}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void next()}
            className="mt-4 rounded-xl bg-lime-200 px-4 py-3 text-sm font-bold text-lime-950 disabled:opacity-40"
          >
            {run.roundNumber >= run.totalRounds
              ? locale === "ru"
                ? "Опечатать показания"
                : "Seal testimony"
              : locale === "ru"
                ? "Передать щипцы →"
                : "Pass the tongs →"}
          </button>
        </div>
      )}

      {run.status === "results" && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[...run.roundResults]
            .sort((a, b) => b.points - a.points || a.speakerName.localeCompare(b.speakerName))
            .map((entry) => (
              <div key={entry.roundId} className="rounded-xl bg-black/25 px-3 py-2 text-sm">
                <span className="font-semibold">{entry.speakerName}</span>
                <span className="float-right text-orange-200">+{entry.points}</span>
              </div>
            ))}
        </div>
      )}

      {["question", "recording", "judging", "review"].includes(run.status) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void skip()}
          className="mt-4 text-xs text-white/45 underline decoration-white/20 underline-offset-4 hover:text-white"
        >
          {locale === "ru" ? "Пас без штрафа" : "Pass with no penalty"}
        </button>
      )}
    </details>
  );
}
