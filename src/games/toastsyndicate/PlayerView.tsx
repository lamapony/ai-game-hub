import { useEffect, useState, type ReactNode } from "react";
import { Recorder } from "@/games/soundscape/Recorder";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import type { StoredPlayer } from "@/lib/player-action-client";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import {
  listToastRecordsForPlayer,
  submitToastCatchClient,
  submitToastRecordingClient,
} from "@/lib/toastsyndicate-client";
import type { RoomState } from "@/lib/types";
import {
  TOAST_ASSIGNMENT_KIND,
  toastAssignmentRecordSchema,
  type ToastAssignmentRecord,
} from "./model";

export function ToastSyndicatePlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const toast = state.toastsyndicate!;
  const locale = state.party?.uiLocale ?? "en";
  const isRussian = locale === "ru";
  const isSpeaker = toast.speakerPlayerId === me.id;
  const [assignment, setAssignment] = useState<ToastAssignmentRecord | null>(null);
  const [guesses, setGuesses] = useState(["", "", ""]);
  const [submitted, setSubmitted] = useState(toast.submittedListenerIds.includes(me.id));
  const [cargoOpen, setCargoOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roundCode = String(toast.roundNumber).padStart(2, "0");

  useEffect(() => {
    setAssignment(null);
    setGuesses(["", "", ""]);
    setSubmitted(false);
    setCargoOpen(true);
    setError(null);
  }, [me.id, toast.roundId]);

  useEffect(() => {
    setSubmitted(toast.submittedListenerIds.includes(me.id));
  }, [me.id, toast.submittedListenerIds]);

  useEffect(() => {
    if (!isSpeaker || !toast.genre) return;
    let cancelled = false;
    void listToastRecordsForPlayer({ roomId, roundId: toast.roundId, playerId: me.id })
      .then(({ records }) => {
        const record = records.find((candidate) => candidate.kind === TOAST_ASSIGNMENT_KIND);
        const parsed = toastAssignmentRecordSchema.safeParse(record?.payload);
        if (!cancelled && parsed.success) setAssignment(parsed.data);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyPlayerActionError(loadError, "toast cargo", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [isSpeaker, me.id, roomId, toast.genre, toast.roundId]);

  async function uploadToast(blob: Blob, durationMs: number) {
    setError(null);
    const storagePath = await uploadPlayerMedia(
      roomId,
      {
        action: "toast-audio",
        playerId: me.id,
        roundId: toast.roundId,
        mimeType: blob.type,
      },
      blob,
    );
    await submitToastRecordingClient({
      roomId,
      roundId: toast.roundId,
      playerId: me.id,
      storagePath,
      durationSeconds: durationMs / 1000,
    });
  }

  async function submitCatch() {
    setBusy(true);
    setError(null);
    try {
      await submitToastCatchClient({
        roomId,
        roundId: toast.roundId,
        playerId: me.id,
        guesses: guesses.map((guess) => guess.trim()).filter(Boolean),
      });
      setSubmitted(true);
    } catch (catchError) {
      setError(friendlyPlayerActionError(catchError, "toast ballot"));
    } finally {
      setBusy(false);
    }
  }

  if (toast.phase === "results" && toast.result) {
    const myListenerPoints = toast.result.listenerPoints[me.id] ?? 0;
    const myPoints = isSpeaker ? toast.result.speakerPoints : myListenerPoints;
    return (
      <PlayerFrame label={isRussian ? "МАНИФЕСТ ВСКРЫТ" : "MANIFEST OPENED"}>
        <PlayerManifest
          code={`R${roundCode}`}
          kicker={isRussian ? "ГРУЗ ПРОВЕРЕН" : "CARGO CLEARED"}
          title={toast.result.genre}
          footer={
            <div className="agh-toast-player-score">
              <span>
                {isSpeaker
                  ? isRussian
                    ? "ГОВОРЯЩИЙ"
                    : "SPEAKER"
                  : isRussian
                    ? "ТАМОЖНЯ"
                    : "CUSTOMS"}
              </span>
              <strong>+{myPoints}</strong>
            </div>
          }
        >
          <div className="agh-toast-player-result-words">
            {toast.result.words.map((word, index) => (
              <CargoWord
                key={word.id}
                index={index + 1}
                word={word.text}
                trailing={
                  !word.used
                    ? isRussian
                      ? "НЕ БЫЛО"
                      : "UNUSED"
                    : word.caughtByPlayerIds.length
                      ? isRussian
                        ? "ПОЙМАНО"
                        : "CAUGHT"
                      : "+5 CLEAR"
                }
                tone={!word.used ? "muted" : word.caughtByPlayerIds.length ? "caught" : "clear"}
                detail={word.used ? `${word.smoothness}/5 smooth` : undefined}
              />
            ))}
          </div>
          <div className="agh-toast-player-comment">
            <span>{isRussian ? "КОММЕНТАРИЙ СУДЬИ" : "JUDGE'S NOTE"}</span>
            <p>{toast.result.comment}</p>
          </div>
          <div className="agh-toast-player-finale-note">
            <b>{isRussian ? "ДЕЛО ВЕЧЕРА" : "TONIGHT'S RECORD"}</b>
            <span>
              {isRussian
                ? "Этот тост уже стал публичным материалом для финальной истории."
                : "This toast is now public material for the final story."}
            </span>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </PlayerManifest>
      </PlayerFrame>
    );
  }

  if (toast.phase === "briefing") {
    if (isSpeaker && assignment && !cargoOpen) {
      return (
        <PlayerFrame label={isRussian ? "ПРИВАТНАЯ ЛИНИЯ ЗАКРЫТА" : "PRIVATE LINE CLOSED"}>
          <PlayerManifest
            code={`M${roundCode}`}
            kicker={isRussian ? "ГРУЗ ЗАПОМНЕН" : "CARGO MEMORIZED"}
            title={toast.genre ?? "TOAST"}
            footer={
              <button
                className="agh-toast-player-action"
                type="button"
                onClick={() => setCargoOpen(true)}
              >
                <span>{isRussian ? "ОТКРЫТЬ СНОВА" : "OPEN AGAIN"}</span>
                <DiagonalArrow />
              </button>
            }
          >
            <div className="agh-toast-cargo-closed">
              <strong>{isRussian ? "ЭКРАН МОЖНО УБРАТЬ" : "RETURN TO THE ROOM"}</strong>
              <p>
                {isRussian
                  ? "Три слова остаются в памяти и в приватной записи. Никто другой их не видит."
                  : "The three words remain in your memory and private record. Nobody else can see them."}
              </p>
            </div>
          </PlayerManifest>
        </PlayerFrame>
      );
    }

    return (
      <PlayerFrame
        label={
          isSpeaker
            ? isRussian
              ? "ПРИВАТНАЯ ЛИНИЯ"
              : "PRIVATE LINE"
            : isRussian
              ? "ПУБЛИЧНАЯ ЛИНИЯ"
              : "PUBLIC LINE"
        }
      >
        <PlayerManifest
          code={`${isSpeaker ? "M" : "B"}${roundCode}`}
          kicker={
            isSpeaker
              ? isRussian
                ? "ГРУЗ ГОВОРЯЩЕГО"
                : "SPEAKER CARGO"
              : isRussian
                ? "СЛЕДУЮЩИЙ ГОВОРЯЩИЙ"
                : "NEXT SPEAKER"
          }
          title={isSpeaker ? (isRussian ? "НЕ ПОКАЗЫВАТЬ" : "DO NOT SHOW") : toast.speakerName}
          accent={isSpeaker ? "pink" : "blue"}
          footer={
            isSpeaker && assignment ? (
              <button
                className="agh-toast-player-action"
                type="button"
                onClick={() => setCargoOpen(false)}
              >
                <span>{isRussian ? "ЗАПОМНИТЬ + ЗАКРЫТЬ" : "MEMORIZE + CLOSE"}</span>
                <DiagonalArrow />
              </button>
            ) : undefined
          }
        >
          <GenreBlock
            genre={toast.genre}
            instructions={toast.genreInstructions}
            isRussian={isRussian}
          />
          {isSpeaker ? (
            assignment ? (
              <div className="agh-toast-cargo-list">
                {assignment.assignment.words.map((word, index) => (
                  <CargoWord key={word.id} index={index + 1} word={word.text} trailing="5PT" />
                ))}
              </div>
            ) : (
              <div className="agh-toast-player-loading">
                {isRussian
                  ? "Приватный груз едет по защищённой линии."
                  : "Private cargo is arriving over the protected line."}
              </div>
            )
          ) : (
            <div className="agh-toast-player-route-note">
              <span>{isRussian ? "ИНСТРУКЦИЯ ЗАЛУ" : "ROOM INSTRUCTION"}</span>
              <p>
                {isRussian
                  ? "Три слова видит только говорящий. Запоминай всё, что звучит слишком конкретно."
                  : "Only the speaker sees the three words. Remember anything that sounds suspiciously specific."}
              </p>
            </div>
          )}
          {isSpeaker && assignment && (
            <div className="agh-toast-player-route-note">
              <span>{isRussian ? "МАРШРУТНАЯ ПОМЕТКА" : "ROUTE NOTE"}</span>
              <p>
                {isRussian
                  ? "Используй все слова. Пусть зал поверит, что каждое всегда было частью тоста."
                  : "Use every word. Make the room believe each one always belonged in the toast."}
              </p>
            </div>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </PlayerManifest>
      </PlayerFrame>
    );
  }

  if (toast.phase === "recording") {
    return (
      <PlayerFrame label={isRussian ? "ЖИВОЙ ЗВУК" : "LIVE AUDIO"}>
        <PlayerManifest
          code={`L${roundCode}`}
          kicker={
            isSpeaker
              ? isRussian
                ? "МИКРОФОН У ТЕБЯ"
                : "YOU HAVE THE MICROPHONE"
              : isRussian
                ? "ТАМОЖНЯ СЛУШАЕТ"
                : "CUSTOMS IS LISTENING"
          }
          title={isSpeaker ? (isRussian ? "ГОВОРИ" : "SPEAK") : toast.speakerName}
          accent={isSpeaker ? "pink" : "blue"}
        >
          <GenreBlock
            genre={toast.genre}
            instructions={toast.genreInstructions}
            isRussian={isRussian}
          />
          {isSpeaker ? (
            <>
              {assignment && (
                <div className="agh-toast-cargo-list is-compact">
                  {assignment.assignment.words.map((word, index) => (
                    <CargoWord key={word.id} index={index + 1} word={word.text} trailing="5PT" />
                  ))}
                </div>
              )}
              <div className="agh-toast-recorder">
                <Recorder
                  maxMs={60_000}
                  minMs={30_000}
                  onComplete={uploadToast}
                  labels={{
                    start: (seconds) =>
                      isRussian
                        ? `Начать запись: до ${seconds} сек`
                        : `Start recording: up to ${seconds}s`,
                    retry: isRussian ? "Повторить доступ к микрофону" : "Try microphone again",
                    keepGoing: (seconds) =>
                      isRussian ? `Продолжай ещё ${seconds} сек` : `Keep going for ${seconds}s`,
                    stop: (seconds) =>
                      isRussian ? `Закончить: осталось ${seconds} сек` : `Finish: ${seconds}s left`,
                    uploading: isRussian
                      ? "Отправляем и расшифровываем"
                      : "Uploading and transcribing",
                    sent: isRussian ? "Отправлено. Записать заново?" : "Sent. Record again?",
                  }}
                />
              </div>
              <p className="agh-toast-recorder-note">
                {isRussian
                  ? "После отправки сервер сам откроет таможню."
                  : "After upload, the server opens customs automatically."}
              </p>
            </>
          ) : (
            <div className="agh-toast-player-listen-note">
              <strong>{isRussian ? "СЛУШАЙ СУЩЕСТВИТЕЛЬНЫЕ" : "LISTEN FOR NOUNS"}</strong>
              <p>
                {isRussian
                  ? "Не смотри в чужой экран. Лови слова, которые вошли в бар без уважительной причины."
                  : "Do not inspect the speaker's screen. Catch words that entered the bar without a plausible reason."}
              </p>
            </div>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </PlayerManifest>
      </PlayerFrame>
    );
  }

  if (toast.phase === "catching") {
    if (isSpeaker) {
      return (
        <WaitingManifest
          roundCode={roundCode}
          label={isRussian ? "ТАМОЖНЯ РАБОТАЕТ" : "CUSTOMS AT WORK"}
          title={isRussian ? "НЕ ПОДСКАЗЫВАЙ" : "NO HINTS"}
          body={
            isRussian
              ? "Твой груз уже в транскрипте. Зал сдаёт декларации."
              : "Your cargo is already in the transcript. The room is filing declarations."
          }
        />
      );
    }

    return (
      <PlayerFrame label={isRussian ? "ТАМОЖЕННАЯ ДЕКЛАРАЦИЯ" : "CUSTOMS DECLARATION"}>
        <PlayerManifest
          code={`C${roundCode}`}
          kicker={
            submitted
              ? isRussian
                ? "БЮЛЛЕТЕНЬ ПРИНЯТ"
                : "BALLOT FILED"
              : isRussian
                ? "ДО ТРЁХ СЛОВ"
                : "UP TO THREE WORDS"
          }
          title={
            submitted
              ? isRussian
                ? "ОПЕЧАТАНО"
                : "SEALED"
              : isRussian
                ? "ЧТО ТЫ ПОЙМАЛ?"
                : "WHAT DID YOU CATCH?"
          }
          footer={
            !submitted ? (
              <button
                className="agh-toast-player-action"
                type="button"
                disabled={busy}
                onClick={() => void submitCatch()}
              >
                <span>
                  {busy
                    ? isRussian
                      ? "ЗАПЕЧАТЫВАЕМ"
                      : "SEALING"
                    : isRussian
                      ? "СДАТЬ ДЕКЛАРАЦИЮ"
                      : "FILE DECLARATION"}
                </span>
                <DiagonalArrow />
              </button>
            ) : undefined
          }
        >
          {submitted ? (
            <div className="agh-toast-cargo-closed">
              <strong>{isRussian ? "ИСПРАВЛЕНИЯ ЗАКРЫТЫ" : "EDITING CLOSED"}</strong>
              <p>
                {isRussian
                  ? "Жди публичного манифеста. Твои догадки остаются приватными до вердикта."
                  : "Wait for the public manifest. Your guesses stay private until the verdict."}
              </p>
            </div>
          ) : (
            <div className="agh-toast-ballot-list">
              {guesses.map((guess, index) => (
                <label key={index}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <input
                    value={guess}
                    onChange={(event) =>
                      setGuesses((current) =>
                        current.map((value, candidate) =>
                          candidate === index ? event.target.value : value,
                        ),
                      )
                    }
                    placeholder={isRussian ? "Подозрительное слово" : "Suspicious word"}
                    maxLength={80}
                  />
                  <span>WORD</span>
                </label>
              ))}
              <p>
                {isRussian
                  ? "Ничего не заметил? Оставь строки пустыми и всё равно сдай декларацию."
                  : "Caught nothing? Leave the rows empty and still file the declaration."}
              </p>
            </div>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </PlayerManifest>
      </PlayerFrame>
    );
  }

  return (
    <WaitingManifest
      roundCode={roundCode}
      label={isRussian ? "СВЕРКА МАНИФЕСТА" : "MANIFEST CHECK"}
      title={isRussian ? "СУДЬЯ ЧИТАЕТ" : "JUDGE READING"}
      body={
        isRussian
          ? "Жанр, транскрипт и декларации сейчас встретятся в одном вердикте."
          : "Genre, transcript, and declarations are about to meet in one verdict."
      }
    />
  );
}

function PlayerFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="agh-toast-player" data-toast-syndicate="true">
      <div className="agh-toast-player-line-label">TOAST SYNDICATE / {label}</div>
      {children}
    </section>
  );
}

function PlayerManifest({
  code,
  kicker,
  title,
  accent = "pink",
  footer,
  children,
}: {
  code: string;
  kicker: string;
  title: string;
  accent?: "pink" | "blue" | "black";
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="agh-toast-player-manifest">
      <header className={`agh-toast-player-masthead is-${accent}`}>
        <strong>{code}</strong>
        <div>
          <span>{kicker}</span>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="agh-toast-player-manifest-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </article>
  );
}

function GenreBlock({
  genre,
  instructions,
  isRussian,
}: {
  genre?: string;
  instructions?: string;
  isRussian: boolean;
}) {
  return (
    <div className="agh-toast-player-genre">
      <span>{isRussian ? "ЗАЯВЛЕННЫЙ ЖАНР" : "DECLARED GENRE"}</span>
      <h3>{genre ?? (isRussian ? "В ПУТИ" : "IN TRANSIT")}</h3>
      {instructions && <p>{instructions}</p>}
    </div>
  );
}

function CargoWord({
  index,
  word,
  trailing,
  tone = "default",
  detail,
}: {
  index: number;
  word: string;
  trailing: string;
  tone?: "default" | "muted" | "caught" | "clear";
  detail?: string;
}) {
  return (
    <div className={`agh-toast-cargo-word is-${tone}`}>
      <b>{String(index).padStart(2, "0")}</b>
      <span>
        <strong>{word}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <em>{trailing}</em>
    </div>
  );
}

function WaitingManifest({
  roundCode,
  label,
  title,
  body,
}: {
  roundCode: string;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <PlayerFrame label={label}>
      <PlayerManifest code={`W${roundCode}`} kicker={label} title={title} accent="blue">
        <div className="agh-toast-player-listen-note">
          <strong>TOAST SYNDICATE</strong>
          <p>{body}</p>
        </div>
      </PlayerManifest>
    </PlayerFrame>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="agh-toast-player-error">{children}</p>;
}

function DiagonalArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28">
      <path d="M6 22 22 6M11 6h11v11" />
    </svg>
  );
}
