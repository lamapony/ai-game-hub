import { useEffect, useState } from "react";
import { Recorder } from "@/games/soundscape/Recorder";
import type { StoredPlayer } from "@/lib/player-action-client";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import { startTongsRecordingClient, submitTongsAudioClient } from "@/lib/tongsoftruth-client";
import type { RoomState, TongsOfTruthState } from "@/lib/types";

export function TongsOfTruthBackgroundPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const publicRun = state.tongsoftruth!;
  const locale = state.party?.uiLocale ?? "en";
  const [run, setRun] = useState<TongsOfTruthState>(publicRun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRun(publicRun), [publicRun]);

  const myTurn = run.speakerPlayerId === me.id && run.status !== "results";
  const urgent = myTurn || run.status === "reveal";

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const result = await startTongsRecordingClient(roomId, run.runId, me.id);
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyPlayerActionError(actionError, "Tongs microphone", "open"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAnswer(blob: Blob, durationMs: number) {
    setError(null);
    const storagePath = await uploadPlayerMedia(
      roomId,
      {
        action: "tongs-audio",
        playerId: me.id,
        roundId: run.currentRoundId,
        mimeType: blob.type,
      },
      blob,
    );
    const result = await submitTongsAudioClient({
      roomId,
      runId: run.runId,
      roundId: run.currentRoundId,
      playerId: me.id,
      storagePath,
      durationSeconds: durationMs / 1000,
    });
    setRun(result.run);
  }

  return (
    <details
      open={urgent}
      className="mb-4 rounded-3xl border border-orange-200/25 bg-orange-950/45 p-4 text-white backdrop-blur"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.23em] text-orange-200/70">
              🍢 {locale === "ru" ? "Щипцы Правды" : "Tongs of Truth"}
            </div>
            <div className="mt-1 text-sm text-white/75">
              {run.status === "results"
                ? locale === "ru"
                  ? "Показания опечатаны"
                  : "Testimony sealed"
                : `${run.speakerName} · ${run.roundNumber}/${run.totalRounds} · 🔥${run.level}`}
            </div>
          </div>
          {myTurn && (
            <span className="rounded-full bg-orange-200 px-3 py-1 text-xs font-bold text-orange-950">
              {locale === "ru" ? "ТВОЙ ХОД" : "YOUR TURN"}
            </span>
          )}
        </div>
      </summary>

      {error && <p className="mt-3 rounded-xl bg-red-950/70 p-3 text-sm text-red-100">{error}</p>}

      {run.status !== "results" && (
        <div className="mt-4 rounded-2xl border border-orange-100/15 bg-black/25 p-4">
          <div className="font-display text-2xl leading-tight">
            {run.question ?? (locale === "ru" ? "Вопрос готовится…" : "Question incoming…")}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            {locale === "ru"
              ? "Держи настоящие щипцы. AI оценивает конкретику текста, не фактическую правду."
              : "Hold the real tongs. AI scores textual specificity, not factual truth."}
          </p>
        </div>
      )}

      {myTurn && run.status === "question" && run.question && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void start()}
          className="mt-4 w-full rounded-2xl bg-orange-200 px-4 py-4 text-base font-bold text-orange-950 disabled:opacity-40"
        >
          {locale === "ru"
            ? "Щипцы у меня — открыть микрофон"
            : "I have the tongs — open microphone"}
        </button>
      )}

      {myTurn && run.status === "recording" && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-white/70">
            {locale === "ru"
              ? "Ответь за 10–20 секунд: одна история, одна деталь, без пресс-релиза."
              : "Answer in 10–20 seconds: one story, one detail, no press release."}
          </p>
          <Recorder minMs={10_000} maxMs={20_000} onComplete={uploadAnswer} />
        </div>
      )}

      {(run.status === "judging" || run.status === "review") && (
        <p className="mt-4 rounded-2xl bg-white/8 p-4 text-sm text-white/65">
          {run.status === "review"
            ? locale === "ru"
              ? "Техника не вынесла вердикт. Ведущий оценит услышанное вручную."
              : "The technical judge abstained. The host will score what the room heard."
            : locale === "ru"
              ? "Показание расшифровано. Судья считает конкретику…"
              : "Testimony transcribed. The judge is counting specifics…"}
        </p>
      )}

      {run.status === "reveal" && run.result && (
        <div className="mt-4 rounded-2xl border border-lime-200/25 bg-lime-950/35 p-4">
          <div className="font-display text-3xl">
            {run.result.speakerName} · +{run.result.points}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/80">{run.result.comment}</p>
          <div className="mt-2 text-xs text-white/55">
            {locale === "ru" ? "конкретика" : "specificity"} {run.result.honestyScore}/10 ·{" "}
            {locale === "ru" ? "артистизм" : "stagecraft"} {run.result.artistryScore}/5
            {run.result.environmentUsed ? " · environment +5" : ""}
          </div>
        </div>
      )}

      {run.status === "results" && (
        <div className="mt-4 space-y-2">
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
    </details>
  );
}
