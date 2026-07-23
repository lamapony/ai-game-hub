import { useEffect, useState } from "react";
import { PhotoCapture } from "@/components/photo-capture";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import { downscaleImage } from "@/lib/image-client";
import { friendlyUploadError } from "@/lib/media-errors";
import { analyzeOraclePhoto, listOracleRecordsForPlayer } from "@/lib/oracle-client";
import { logError } from "@/lib/structured-log";
import { formatClock } from "@/lib/team-style";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import type { StoredPlayer } from "@/lib/player-action-client";
import type { RoomState } from "@/lib/types";
import { oracleRecordPayloadSchema, type OracleRecordPayload } from "./model";

export function GrillOraclePlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const oracle = state.grilloracle!;
  const locale = state.party?.uiLocale ?? "en";
  const [now, setNow] = useState(() => Date.now());
  const [readingState, setReadingState] = useState<{
    roundId: string;
    payload: OracleRecordPayload;
  } | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmitted = oracle.submittedPlayerIds.includes(me.id);
  const reading = readingState?.roundId === oracle.roundId ? readingState.payload : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReadingState((current) => (current?.roundId === oracle.roundId ? current : null));
    setLoadingRecord(true);
    setError(null);
    void listOracleRecordsForPlayer({ roomId, playerId: me.id, roundId: oracle.roundId })
      .then(({ records }) => {
        const payload = records.find((record) => !record.payloadRedacted)?.payload;
        const parsed = oracleRecordPayloadSchema.safeParse(payload);
        if (!cancelled && parsed.success) {
          setReadingState({ roundId: oracle.roundId, payload: parsed.data });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          logError("oracle.record_load.failure", loadError, {
            roomId,
            roundId: oracle.roundId,
            playerId: me.id,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRecord(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSubmitted, me.id, oracle.roundId, roomId]);

  if (!oracle.participantIds.includes(me.id)) {
    return (
      <OracleCard>
        <OracleLabel>{locale === "ru" ? "Раунд уже начался" : "Round in progress"}</OracleLabel>
        <OracleHeading>
          {locale === "ru"
            ? "Эта улика собиралась до твоего прихода"
            : "This evidence was assigned before you joined"}
        </OracleHeading>
      </OracleCard>
    );
  }

  if (reading) return <OracleReadingCard payload={reading} locale={locale} />;

  if (loadingRecord || isSubmitted) {
    return (
      <OracleCard>
        <OracleLabel>{locale === "ru" ? "Протокол найден" : "Evidence logged"}</OracleLabel>
        <OracleHeading>
          {locale === "ru"
            ? "Мадам Гриль сверяет почерк золы..."
            : "Madame Grill is checking the ash handwriting..."}
        </OracleHeading>
        <p className="agh-oracle-card-note">
          {locale === "ru"
            ? "Не закрывай экран. Личное чтение появится здесь."
            : "Keep this screen open. Your private reading will appear here."}
        </p>
      </OracleCard>
    );
  }

  if (oracle.phase === "results") {
    return (
      <OracleCard>
        <OracleLabel>{locale === "ru" ? "Улики закрыты" : "Evidence closed"}</OracleLabel>
        <OracleHeading>
          {locale === "ru" ? "Пророчество не было снято" : "No prophecy was captured"}
        </OracleHeading>
        <p className="agh-oracle-card-note">
          {locale === "ru"
            ? "Судьба сегодня работала строго по записи."
            : "Fate was appointment-only tonight."}
        </p>
      </OracleCard>
    );
  }

  const remaining = Math.max(0, (oracle.captureEndsAt ?? now) - now);
  return (
    <section className="agh-oracle-player" data-phase={oracle.phase}>
      <div className="agh-oracle-player-brief">
        <header>
          <div>
            <span>{locale === "ru" ? "Личная улика" : "Private evidence"}</span>
            <strong>{locale === "ru" ? "Гриль-Оракул" : "Grill Oracle"}</strong>
          </div>
          <time>{formatClock(remaining)}</time>
        </header>
        <div className="agh-oracle-player-copy">
          <h2>{locale === "ru" ? "Сними знак вечера" : "Capture the omen"}</h2>
          <span aria-hidden="true">01</span>
        </div>
        <p className="agh-oracle-player-direction">
          {locale === "ru"
            ? "Еда, угли, бокал или гарнир. Выбери предмет, на котором вечер уже оставил показания. Ты увидишь пророчество; ведущий увидит только факт готовности."
            : "Food, char, a glass or garnish. Pick something the room has already left fingerprints on. You see the prophecy; the host only sees that it exists."}
        </p>
        <div className="agh-oracle-rules">
          <GameRulesChecklist gameId="grilloracle" />
        </div>
      </div>

      <div className="agh-oracle-capture">
        <PhotoCapture
          disabled={uploading}
          captureLabel={locale === "ru" ? "Снять улику  ↗" : "Capture evidence  ↗"}
          retakeLabel={locale === "ru" ? "Переснять до отправки" : "Retake before sending"}
          buttonClassName="agh-oracle-capture-button"
          onCapture={async (file) => {
            setUploading(true);
            setError(null);
            try {
              const { blob } = await downscaleImage(file, 1280, 0.84);
              const storagePath = await uploadPlayerMedia(
                roomId,
                {
                  action: "oracle-photo",
                  playerId: me.id,
                  roundId: oracle.roundId,
                  mimeType: "image/jpeg",
                },
                blob,
              );
              const result = await analyzeOraclePhoto({
                roomId,
                playerId: me.id,
                roundId: oracle.roundId,
                storagePath,
              });
              setReadingState({
                roundId: oracle.roundId,
                payload: oracleRecordPayloadSchema.parse(result.payload),
              });
            } catch (captureError) {
              logError("oracle.capture.failure", captureError, {
                roomId,
                roundId: oracle.roundId,
                playerId: me.id,
              });
              const message = captureError instanceof Error ? captureError.message : "";
              setError(
                message.includes("host for a manual reading")
                  ? locale === "ru"
                    ? "Зрение Оракула отключилось. Попроси ведущего выдать ручное пророчество."
                    : "The Oracle lost vision. Ask the host to issue a manual reading."
                  : friendlyUploadError(captureError, "photo"),
              );
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      {uploading && (
        <p className="agh-oracle-feedback" role="status">
          {locale === "ru" ? "Дым уходит в архив..." : "Sending smoke to the archive..."}
        </p>
      )}
      {error && <p className="agh-oracle-feedback is-error">{error}</p>}
    </section>
  );
}

function OracleReadingCard({
  payload,
  locale,
}: {
  payload: OracleRecordPayload;
  locale: "en" | "ru";
}) {
  const reading = payload.reading;
  return (
    <article className="agh-oracle-reading">
      <header>
        <span>
          {payload.capture.mode === "host-fallback"
            ? locale === "ru"
              ? "Ручное чтение"
              : "Manual reading"
            : locale === "ru"
              ? "Личная улика"
              : "Private evidence"}
        </span>
        <b>{reading.points}/15</b>
      </header>
      <div className="agh-oracle-reading-verdict">
        <h2>{reading.item_guess}</h2>
        <p>{reading.doneness_verdict}</p>
      </div>
      <p className="agh-oracle-reading-prophecy">{reading.prophecy}</p>
      <div className="agh-oracle-reading-predictions">
        <strong>
          {locale === "ru" ? "Три проверяемых предсказания" : "Three verifiable predictions"}
        </strong>
        <ol>
          {reading.predictions.map((prediction, index) => (
            <li key={prediction}>
              <span>0{index + 1}</span>
              <span>{prediction}</span>
            </li>
          ))}
        </ol>
      </div>
      <footer>
        <span>{reading.char_reading_style}</span>
        <span>
          {locale === "ru" ? "Не очки. Запомни до вскрытия." : "Not score. Remember until reveal."}
        </span>
      </footer>
    </article>
  );
}

function OracleCard({ children }: { children: React.ReactNode }) {
  return <article className="agh-oracle-card">{children}</article>;
}

function OracleLabel({ children }: { children: React.ReactNode }) {
  return <div className="agh-oracle-card-label">{children}</div>;
}

function OracleHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="agh-oracle-card-heading">{children}</h2>;
}
