import { useEffect, useRef, useState } from "react";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import { formatClock } from "@/lib/team-style";
import {
  assignToastRoundClient,
  finalizeToastRoundClient,
  nextToastRoundClient,
  startToastRecordingClient,
} from "@/lib/toastsyndicate-client";
import type { RoomState, ToastSyndicateState } from "@/lib/types";
import { friendlyHostActionError } from "@/lib/host-action-errors";

export function ToastSyndicateHost({
  roomId,
  state,
}: {
  roomId: string;
  code: string;
  state: RoomState;
}) {
  const toast = state.toastsyndicate!;
  const locale = state.party?.uiLocale ?? "en";
  const [now, setNow] = useState(() => Date.now());
  const [localToast, setLocalToast] = useState<ToastSyndicateState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assigningRef = useRef<string | null>(null);
  const current = localToast?.roundId === toast.roundId ? localToast : toast;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalToast(null);
    setError(null);
  }, [toast.roundId]);

  useEffect(() => {
    if (toast.phase !== "briefing" || toast.genre || assigningRef.current === toast.roundId) return;
    assigningRef.current = toast.roundId;
    setBusy("assign");
    void assignToastRoundClient(roomId, toast.roundId)
      .then(({ toast: assigned }) => setLocalToast(assigned))
      .catch((assignError) => {
        assigningRef.current = null;
        setError(friendlyHostActionError(assignError, "toast assignment", "prepare"));
      })
      .finally(() => setBusy(null));
  }, [roomId, toast.genre, toast.phase, toast.roundId]);

  async function run(label: string, action: () => Promise<{ toast: ToastSyndicateState }>) {
    setBusy(label);
    setError(null);
    try {
      const result = await action();
      setLocalToast(result.toast);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Toast Syndicate step", "complete"));
    } finally {
      setBusy(null);
    }
  }

  const timerEnd =
    current.phase === "briefing"
      ? current.briefingEndsAt
      : current.phase === "recording"
        ? current.recordingEndsAt
        : current.phase === "catching"
          ? current.catchingEndsAt
          : undefined;
  const remaining = Math.max(0, (timerEnd ?? now) - now);
  const listenerCount = Math.max(0, state.players.length - 1);
  const completedRounds = current.roundResults.length;
  const caughtCount =
    current.result?.words.reduce((sum, word) => sum + word.caughtByPlayerIds.length, 0) ?? 0;
  const roundCode = String(current.roundNumber).padStart(2, "0");
  const isRussian = locale === "ru";

  const statusCopy =
    current.phase === "briefing"
      ? isRussian
        ? "Жанр открыт залу. Три слова едут по приватной линии."
        : "The genre is public. Three words travel on the private line."
      : current.phase === "recording"
        ? isRussian
          ? "Тост в эфире. Таможня слушает существительные без документов."
          : "Toast live. Customs is listening for nouns without paperwork."
        : current.phase === "catching"
          ? isRussian
            ? "Речь закончена. Зал заполняет декларации."
            : "The speech is over. The room is filing declarations."
          : current.phase === "judging"
            ? isRussian
              ? "Транскрипт, жанр и декларации сверяются на сервере."
              : "Transcript, genre, and declarations are being checked on the server."
            : (current.result?.comment ??
              (isRussian ? "Манифест вскрыт." : "The manifest has been opened."));

  return (
    <section className="agh-toast-host" data-toast-phase={current.phase}>
      <header className="agh-toast-host-header">
        <div className="agh-toast-host-lockup">
          <strong>{isRussian ? "СИНДИКАТ ТОСТОВ" : "TOAST SYNDICATE"}</strong>
          <span>
            {isRussian ? "БАРНАЯ ТАМОЖНЯ" : "BAR CUSTOMS"} / {current.roundNumber}{" "}
            {isRussian ? "ИЗ" : "OF"} {current.totalRounds}
          </span>
        </div>
        {timerEnd ? (
          <time>{formatClock(remaining)}</time>
        ) : (
          <span className="agh-toast-host-phase">{current.phase.toUpperCase()}</span>
        )}
      </header>

      <div className="agh-toast-host-floor">
        <div className="agh-toast-speaker-lane">
          <div className="agh-toast-speaker-copy">
            <span>
              {current.phase === "results"
                ? isRussian
                  ? "ГРУЗ ПРОШЁЛ ПРОВЕРКУ"
                  : "CARGO CLEARED"
                : isRussian
                  ? "СЕЙЧАС НА ТАМОЖНЕ"
                  : "NOW CLEARING CUSTOMS"}
            </span>
            <h2>
              {current.phase === "results"
                ? isRussian
                  ? "ЧИСТО"
                  : "CLEARED"
                : current.speakerName}
            </h2>
            <p>{statusCopy}</p>
          </div>

          <HostRouteStrip
            phase={current.phase}
            isRussian={isRussian}
            speakerName={current.speakerName}
            listenerCount={listenerCount}
            submittedCount={current.submittedListenerIds.length}
            caughtCount={caughtCount}
            speakerPoints={current.result?.speakerPoints ?? 0}
          />
        </div>

        <div className="agh-toast-manifest-lane">
          <article className="agh-toast-manifest">
            <header className="agh-toast-manifest-masthead">
              <strong>B{roundCode}</strong>
              <div>
                <span>{isRussian ? "ПУБЛИЧНЫЙ МАНИФЕСТ" : "PUBLIC MANIFEST"}</span>
                <b>VIGGOS / {isRussian ? "ПЕРВЫЙ БОКАЛ" : "ONE GLASS IN"}</b>
              </div>
            </header>

            <div className="agh-toast-manifest-body">
              <div className="agh-toast-genre">
                <span>{isRussian ? "ЗАЯВЛЕННЫЙ ЖАНР" : "DECLARED GENRE"}</span>
                <h3>{current.genre ?? (busy === "assign" ? "PACKING" : "PENDING")}</h3>
              </div>

              {current.phase === "results" && current.result ? (
                <div className="agh-toast-result-ledger">
                  <ResultRow
                    index="G"
                    label={isRussian ? "Жанр" : "Genre"}
                    value={`${current.result.genreScore}/10`}
                  />
                  {current.result.words.map((word, index) => (
                    <ResultRow
                      key={word.id}
                      index={String(index + 1).padStart(2, "0")}
                      label={word.text}
                      value={
                        !word.used
                          ? isRussian
                            ? "НЕ БЫЛО"
                            : "UNUSED"
                          : word.caughtByPlayerIds.length
                            ? `${word.caughtByPlayerIds.length} ${isRussian ? "ПОЙМАЛИ" : "CAUGHT"}`
                            : "+5 CLEAR"
                      }
                      tone={
                        !word.used ? "muted" : word.caughtByPlayerIds.length ? "caught" : "clear"
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="agh-toast-manifest-note">
                  <p>
                    {current.genreInstructions ??
                      (busy === "assign"
                        ? isRussian
                          ? "AI комплектует декларацию."
                          : "AI is packing the declaration."
                        : isRussian
                          ? "Задание ещё не выдано."
                          : "The assignment has not landed yet.")}
                  </p>
                  <div>
                    <b>
                      {current.phase === "catching"
                        ? isRussian
                          ? "БЮЛЛЕТЕНИ"
                          : "BALLOTS"
                        : current.phase === "judging"
                          ? isRussian
                            ? "ПРОВЕРКА"
                            : "CHECKING"
                          : isRussian
                            ? "ОПЕЧАТАНО"
                            : "SEALED"}
                    </b>
                    <span>
                      {current.phase === "catching"
                        ? `${current.submittedListenerIds.length}/${listenerCount} ${isRussian ? "деклараций сдано" : "declarations filed"}`
                        : current.phase === "judging"
                          ? isRussian
                            ? "AI-судья читает только публичный транскрипт и голоса."
                            : "The AI judge is reading only the public transcript and ballots."
                          : isRussian
                            ? "Три приватных слова остаются у говорящего."
                            : "Three private words remain with the speaker."}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="agh-toast-manifest-action">
              {current.phase === "briefing" && current.genre ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("recording", () => startToastRecordingClient(roomId, current.roundId))
                  }
                >
                  <span>
                    {busy === "recording"
                      ? isRussian
                        ? "ОТКРЫВАЕМ МИКРОФОН"
                        : "OPENING MICROPHONE"
                      : isRussian
                        ? "НАЧАТЬ ТОСТ"
                        : "START TOAST"}
                  </span>
                  <DiagonalArrow />
                </button>
              ) : current.phase === "recording" ? (
                <div className="agh-toast-live-footer">
                  <span>
                    {isRussian ? "МИКРОФОН У" : "MICROPHONE WITH"} {current.speakerName}
                  </span>
                  <strong>{formatClock(remaining)}</strong>
                </div>
              ) : current.phase === "catching" ? (
                <button
                  type="button"
                  disabled={busy !== null || current.submittedListenerIds.length === 0}
                  onClick={() =>
                    void run("finalize", () => finalizeToastRoundClient(roomId, current.roundId))
                  }
                >
                  <span>
                    {busy === "finalize"
                      ? isRussian
                        ? "СВЕРЯЕМ МАНИФЕСТ"
                        : "CHECKING MANIFEST"
                      : isRussian
                        ? "ЗАКРЫТЬ ТАМОЖНЮ"
                        : "CLOSE CUSTOMS"}
                  </span>
                  <DiagonalArrow />
                </button>
              ) : current.phase === "judging" ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("finalize", () => finalizeToastRoundClient(roomId, current.roundId))
                  }
                >
                  <span>{isRussian ? "ПОВТОРИТЬ ПРОВЕРКУ" : "RETRY CHECK"}</span>
                  <DiagonalArrow />
                </button>
              ) : current.roundNumber < current.totalRounds ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("next", () => nextToastRoundClient(roomId, current.roundId))
                  }
                >
                  <span>{isRussian ? "СЛЕДУЮЩИЙ ТОСТ" : "NEXT TOAST"}</span>
                  <DiagonalArrow />
                </button>
              ) : (
                <div className="agh-toast-live-footer">
                  <span>{isRussian ? "СИНДИКАТ ЗАКРЫТ" : "SYNDICATE CLOSED"}</span>
                  <strong>
                    {completedRounds}/{current.totalRounds}
                  </strong>
                </div>
              )}
            </div>
          </article>
        </div>
      </div>

      <footer className="agh-toast-finale-rail">
        <div>
          <span>{isRussian ? "ДЕЛО ВЕЧЕРА" : "TONIGHT'S RECORD"}</span>
          <p>
            {completedRounds
              ? isRussian
                ? `${completedRounds} ${completedRounds === 1 ? "тост уже стал" : "тоста уже стали"} материалом для финальной истории.`
                : `${completedRounds} completed ${completedRounds === 1 ? "toast is" : "toasts are"} now material for the final story.`
              : isRussian
                ? "Первый завершённый тост станет публичной уликой финала."
                : "The first completed toast becomes public evidence for the finale."}
          </p>
        </div>
        <div>
          <span>{isRussian ? "ГРУЗ ФИНАЛА" : "FINALE CARGO"}</span>
          <strong>
            {String(completedRounds).padStart(2, "0")} /{" "}
            {String(current.totalRounds).padStart(2, "0")}
          </strong>
        </div>
      </footer>

      {error && <p className="agh-toast-error">{error}</p>}
      <div className="agh-toast-rules">
        <GameRulesChecklist gameId="toastsyndicate" />
      </div>
    </section>
  );
}

function HostRouteStrip({
  phase,
  isRussian,
  speakerName,
  listenerCount,
  submittedCount,
  caughtCount,
  speakerPoints,
}: {
  phase: ToastSyndicateState["phase"];
  isRussian: boolean;
  speakerName: string;
  listenerCount: number;
  submittedCount: number;
  caughtCount: number;
  speakerPoints: number;
}) {
  const content =
    phase === "briefing"
      ? {
          label: isRussian ? "ПРИВАТНАЯ ЛИНИЯ" : "PRIVATE LINE",
          body: isRussian
            ? `${speakerName} видит груз. Зал видит только жанр.`
            : `${speakerName} sees the cargo. The room sees only the genre.`,
          value: "3",
        }
      : phase === "recording"
        ? {
            label: isRussian ? "ЖИВОЙ ЗВУК" : "LIVE AUDIO",
            body: isRussian
              ? "Ловите слова, которые вошли в речь без документов."
              : "Listen for words that entered the speech without paperwork.",
            value: String(listenerCount),
          }
        : phase === "catching"
          ? {
              label: isRussian ? "ДЕКЛАРАЦИИ" : "DECLARATIONS",
              body: isRussian
                ? "Каждый слушатель сдаёт до трёх подозрительных слов."
                : "Each listener files up to three suspicious words.",
              value: `${submittedCount}/${listenerCount}`,
            }
          : phase === "judging"
            ? {
                label: isRussian ? "СВЕРКА" : "CLEARANCE",
                body: isRussian
                  ? "Счёт пересчитает сервер. Комментарий оставим AI."
                  : "The server owns the score. AI only writes the comment.",
                value: "AI",
              }
            : {
                label: isRussian ? "ИТОГ" : "RESULT",
                body: caughtCount
                  ? isRussian
                    ? `${caughtCount} точных перехватов у зала.`
                    : `${caughtCount} exact ${caughtCount === 1 ? "interception" : "interceptions"} by the room.`
                  : isRussian
                    ? "Ни один использованный груз не пойман."
                    : "No used cargo was intercepted.",
                value: `+${speakerPoints}`,
              };

  return (
    <div className="agh-toast-route-strip">
      <strong>{content.label}</strong>
      <span>{content.body}</span>
      <b>{content.value}</b>
    </div>
  );
}

function ResultRow({
  index,
  label,
  value,
  tone = "default",
}: {
  index: string;
  label: string;
  value: string;
  tone?: "default" | "muted" | "caught" | "clear";
}) {
  return (
    <div className={`agh-toast-result-row is-${tone}`}>
      <b>{index}</b>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DiagonalArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28">
      <path d="M6 22 22 6M11 6h11v11" />
    </svg>
  );
}
