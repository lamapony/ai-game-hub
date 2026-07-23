import { useEffect, useState } from "react";
import { TapeReel } from "@/components/tape-reel";
import { Recorder } from "@/games/soundscape/Recorder";
import type { StoredPlayer } from "@/lib/player-action-client";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { friendlyUploadError } from "@/lib/media-errors";
import {
  submitCrossExaminationAudioClient,
  voteCrossExaminationClient,
} from "@/lib/crossexamination-client";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import type { CrossExaminationState, CrossQuestionCategory, RoomState } from "@/lib/types";

const CATEGORY_LABELS: Record<CrossQuestionCategory, { en: string; ru: string }> = {
  order: { en: "event order", ru: "порядок событий" },
  object: { en: "real object", ru: "реальный предмет" },
  person: { en: "who did it", ru: "кто это сделал" },
  detail: { en: "small detail", ru: "мелкая деталь" },
};

export function CrossExaminationPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const publicRun = state.crossexamination!;
  const locale = state.party?.uiLocale ?? "en";
  const [run, setRun] = useState<CrossExaminationState>(publicRun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRun(publicRun), [publicRun]);

  const pair = run.pairOrder[run.pairNumber - 1]!;
  const isAccomplice = [pair.playerAId, pair.playerBId].includes(me.id);
  const submitted = run.submittedPlayerIds.includes(me.id);
  const voted = run.predictionVoterIds.includes(me.id);

  async function uploadStatement(blob: Blob, durationMs: number) {
    setBusy(true);
    setError(null);
    try {
      const storagePath = await uploadPlayerMedia(
        roomId,
        {
          action: "cross-audio",
          playerId: me.id,
          roundId: run.currentPairId,
          mimeType: blob.type,
        },
        blob,
      );
      const result = await submitCrossExaminationAudioClient({
        roomId,
        runId: run.runId,
        pairId: run.currentPairId,
        playerId: me.id,
        storagePath,
        durationSeconds: durationMs / 1000,
      });
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyUploadError(actionError, "audio"));
    } finally {
      setBusy(false);
    }
  }

  async function vote(category: CrossQuestionCategory) {
    setBusy(true);
    setError(null);
    try {
      const result = await voteCrossExaminationClient({
        roomId,
        runId: run.runId,
        pairId: run.currentPairId,
        playerId: me.id,
        category,
      });
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyPlayerActionError(actionError, "audience prediction"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="agh-cross agh-cross-player" data-cross-phase={run.status}>
      <header className="agh-cross-player-header">
        <div>
          <i />
          <strong>
            {isAccomplice
              ? locale === "ru"
                ? "ПРИВАТНЫЙ МИКРОФОН"
                : "PRIVATE MIC"
              : locale === "ru"
                ? "ПРОГНОЗ ЗАЛА"
                : "AUDIENCE CUT"}
          </strong>
        </div>
        <span>
          {locale === "ru" ? "ПАРА" : "PAIR"} {run.pairNumber} / {run.totalPairs}
        </span>
      </header>
      <div className="agh-cross-player-signal">
        <div>
          <h2>
            {run.status === "results" ? (
              locale === "ru" ? (
                "ДЕЛО ЗАКРЫТО."
              ) : (
                "CASE CLOSED."
              )
            ) : isAccomplice ? (
              locale === "ru" ? (
                <>
                  <span>ТВОЯ ЛЕНТА.</span> <span>ТВОЯ ВЕРСИЯ.</span>
                </>
              ) : (
                <>
                  <span>YOUR TAPE.</span> <span>YOUR VERSION.</span>
                </>
              )
            ) : locale === "ru" ? (
              <>
                <span>ГДЕ ТРЕСНЕТ</span> <span>АЛИБИ?</span>
              </>
            ) : (
              <>
                <span>WHERE DOES</span> <span>IT SPLIT?</span>
              </>
            )}
          </h2>
          <p>
            {run.status === "results"
              ? locale === "ru"
                ? "Публичные выводы сохранены; личные записи закрыты."
                : "Public findings are archived; private recordings remain sealed."
              : isAccomplice
                ? locale === "ru"
                  ? "Ответь на четыре вопроса. Зал услышит только короткую версию ведущего."
                  : "Answer four prompts. The room only hears the host's short public cut."
                : `${pair.playerAName} × ${pair.playerBName}`}
          </p>
        </div>
        <TapeReel />
      </div>

      {error && <p className="agh-cross-error">{error}</p>}

      {run.questions && run.status !== "results" && (
        <ol className="agh-cross-question-list">
          <li className="agh-cross-player-question-head" aria-hidden="true">
            <span>{locale === "ru" ? "СЕКЦИЯ" : "CUT"}</span>
            <span>
              {locale === "ru" ? "ЧЕТЫРЕ ВОПРОСА · ОДИН ДУБЛЬ" : "FOUR ANSWERS · ONE TAKE"}
            </span>
          </li>
          {run.questions.map((question, index) => (
            <li key={question.questionId} className="agh-cross-question-row">
              <div className="agh-cross-question-meta">
                0{index + 1} · {CATEGORY_LABELS[question.category][locale]}
              </div>
              <div className="agh-cross-question-text">{question.text}</div>
            </li>
          ))}
        </ol>
      )}

      {run.status === "curation" && (
        <p className="agh-cross-note">
          {locale === "ru"
            ? "Ведущий просматривает закрытые записи и исключает чувствительные эпизоды. На общий экран они не попадут."
            : "The host is reviewing private records and excluding sensitive episodes. They will not reach the public screen."}
        </p>
      )}

      {run.status === "briefing" && (
        <p className="agh-cross-note">
          {isAccomplice
            ? locale === "ru"
              ? "Сядь отдельно от второго подельника. Когда ведущий откроет микрофоны, ответь на все четыре вопроса одним показанием."
              : "Sit apart from the other accomplice. When the host opens the microphones, answer all four questions in one statement."
            : locale === "ru"
              ? "Запомни четыре категории. Скоро выберешь, где их алиби треснет сильнее всего."
              : "Remember the four categories. Soon you will predict where their alibi splits most."}
        </p>
      )}

      {run.status === "capturing" && isAccomplice && !submitted && (
        <div className="agh-cross-player-recorder">
          <p className="mb-3 text-sm leading-relaxed text-white/70">
            {locale === "ru"
              ? "Ответь на все четыре вопроса за 20–60 секунд. Не слушай второго подельника: независимость показаний — вся механика."
              : "Answer all four questions in 20–60 seconds. Do not listen to the other accomplice; independent statements are the mechanic."}
          </p>
          <Recorder
            minMs={20_000}
            maxMs={60_000}
            onComplete={uploadStatement}
            labels={{
              start: () => (locale === "ru" ? "Начать приватный дубль" : "Start private take"),
              retry: locale === "ru" ? "Перезаписать" : "Retake",
              keepGoing: (seconds) =>
                locale === "ru" ? `Продолжай ещё ${seconds} сек.` : `Keep going ${seconds}s`,
              stop: (seconds) =>
                locale === "ru" ? `Остановить · ${seconds} сек.` : `Stop take · ${seconds}s`,
              uploading: locale === "ru" ? "Опечатываем" : "Sealing",
              sent: locale === "ru" ? "Показание отправлено" : "Statement sent",
            }}
          />
          {busy && (
            <p className="mt-3 text-xs text-white/50">
              {locale === "ru" ? "Опечатываем…" : "Sealing…"}
            </p>
          )}
        </div>
      )}

      {run.status === "capturing" && isAccomplice && submitted && (
        <p className="agh-cross-note is-sealed">
          {locale === "ru"
            ? "Показание опечатано. Второй ответ тебе не покажут."
            : "Statement sealed. The other answer stays hidden from you."}
        </p>
      )}

      {run.status === "capturing" && !isAccomplice && !voted && (
        <div className="agh-cross-player-vote">
          <div>
            {locale === "ru"
              ? "Где будет самое сильное расхождение?"
              : "Where will the strongest contradiction land?"}
          </div>
          <div>
            {run.questions?.map((question) => (
              <button
                key={question.questionId}
                type="button"
                disabled={busy}
                onClick={() => void vote(question.category)}
                className="agh-cross-vote-button"
              >
                {CATEGORY_LABELS[question.category][locale]}
              </button>
            ))}
          </div>
        </div>
      )}

      {run.status === "capturing" && !isAccomplice && voted && (
        <p className="agh-cross-note is-sealed">
          {locale === "ru" ? "Прогноз опечатан до reveal." : "Prediction sealed until reveal."}
        </p>
      )}

      {["comparing", "review"].includes(run.status) && (
        <p className="agh-cross-note">
          {run.status === "review"
            ? locale === "ru"
              ? "AI воздержался. Ведущий сверяет показания вручную, полные транскрипты остаются закрытыми."
              : "AI abstained. The host is comparing statements manually; full transcripts remain private."
            : locale === "ru"
              ? "Показания сверяются. Общий экран получит только короткие версии."
              : "Statements are being compared. The public screen receives only short versions."}
        </p>
      )}

      {run.status === "reveal" && run.result && (
        <div className="agh-cross-player-reveal">
          <div className="agh-cross-reveal-verdict">
            <div className="agh-cross-points">{run.result.pairPoints} pts</div>
            <div className="mt-1 text-xs text-white/55">
              {locale === "ru" ? "алиби" : "alibi"} {run.result.alibiStrength}/10
              {run.result.environmentBonus === 5 ? " · real evidence +5" : ""}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/85">{run.result.verdict}</p>
          </div>
          <div className="agh-cross-finding-list">
            {run.result.findings.map((finding) => (
              <div key={finding.questionId} className="agh-cross-finding-row">
                <div className="font-semibold text-white/85">{finding.question}</div>
                <div className="mt-1 text-white/55">
                  {finding.versionA} / {finding.versionB}
                </div>
              </div>
            ))}
          </div>
          {run.result.correctVoterIds.includes(me.id) && (
            <p className="agh-cross-note is-correct">
              +2{" "}
              {locale === "ru"
                ? "за точный прогноз расхождения"
                : "for predicting the contradiction"}
            </p>
          )}
        </div>
      )}

      {run.status === "results" && (
        <div className="agh-cross-results-list">
          {run.pairResults.length === 0 ? (
            <p className="agh-cross-note">
              {locale === "ru"
                ? "Допрос пропущен. Финальные титулы всё равно состоятся."
                : "Investigation skipped. The final titles still proceed."}
            </p>
          ) : (
            run.pairResults.map((result) => (
              <div key={result.pairId} className="agh-cross-result-row">
                <span className="font-semibold">
                  {result.playerAName} × {result.playerBName}
                </span>
                <span className="float-right text-fuchsia-100">{result.pairPoints}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
