// Photo Hunt player view: see task, snap one photo within timer, upload, wait for verdict.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatClock } from "@/lib/team-style";
import { friendlyUploadError } from "@/lib/media-errors";
import { isRetryableError, retryOperation } from "@/lib/retry";
import { logError } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";
import { PhotoCapture } from "./PhotoCapture";
import { downscaleImage } from "./image-utils";

export function PhotoHuntPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const ph = state.phototunt!;
  const [now, setNow] = useState(Date.now());
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Reset local submission state when round changes
  useEffect(() => {
    setSubmitted(false);
    setMyPhotoUrl(null);
    setErr(null);
  }, [ph.roundId]);

  // Look up if we already submitted (e.g. page reload)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("photos")
        .select("photo_url")
        .eq("room_id", roomId)
        .eq("round_id", ph.roundId)
        .eq("player_id", me.id)
        .maybeSingle();
      if (!cancelled && data?.photo_url) {
        setSubmitted(true);
        setMyPhotoUrl(data.photo_url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, ph.roundId, me.id]);

  if (ph.phase === "briefing") {
    return (
      <Card>
        <Pill>Готовься</Pill>
        {ph.task ? (
          <>
            <H>Задание:</H>
            <p className="text-white text-xl mt-2 leading-snug">«{ph.task}»</p>
            <P>
              Когда ведущий нажмёт старт — у тебя будет 60 секунд, чтобы найти и снять ОДИН кадр.
            </P>
          </>
        ) : (
          <H>Дух парка придумывает охоту…</H>
        )}
      </Card>
    );
  }

  if (ph.phase === "hunting") {
    const remaining = Math.max(0, (ph.huntEndsAt ?? now) - now);
    if (submitted) {
      return (
        <Card>
          <Pill>Кадр отправлен</Pill>
          <H>Жди остальных…</H>
          <div className="text-right text-xs text-white/60 mt-1">
            {formatClock(remaining)} до конца
          </div>
          {myPhotoUrl && (
            <div className="mt-3 rounded-2xl overflow-hidden bg-black/30 border border-white/10">
              <img
                src={myPhotoUrl}
                alt="Твой кадр"
                className="w-full max-h-[40vh] object-contain"
              />
            </div>
          )}
          <P>Менять уже нельзя — что снял, то снял.</P>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <div className="rounded-3xl bg-black/40 backdrop-blur p-5 border border-white/10 text-white">
          <div className="flex items-baseline justify-between">
            <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
              Охота идёт
            </div>
            <div className="font-display text-2xl tabular-num">{formatClock(remaining)}</div>
          </div>
          <div className="font-display text-xl mt-1">Найди и сними:</div>
          <p className="text-white text-lg mt-1 leading-snug">«{ph.task}»</p>
          <p className="text-white/60 text-xs mt-2">Только ОДИН кадр. Жмёшь — отправляешь.</p>
        </div>

        <PhotoCapture
          disabled={uploading}
          onCapture={async (file) => {
            setUploading(true);
            setErr(null);
            try {
              const { blob, dataUrl } = await downscaleImage(file, 1024, 0.82);
              setMyPhotoUrl(dataUrl);
              const path = `${roomId}/photos/${ph.roundId}/${me.id}-${Date.now()}.jpg`;
              const uploadLogFields = {
                game: "phototunt",
                stage: "photo_upload",
                roomId,
                roundId: ph.roundId,
                playerId: me.id,
                teamId: me.teamId,
                mimeType: "image/jpeg",
                blobSize: blob.size,
              };
              const up = await retryOperation(
                async () => {
                  const result = await supabase.storage
                    .from("recordings")
                    .upload(path, blob, { contentType: "image/jpeg" });
                  if (result.error && isRetryableError(result.error)) throw result.error;
                  return result;
                },
                { shouldRetry: (error) => isRetryableError(error) },
              );
              if (up.error) {
                logError("upload.failure", up.error, uploadLogFields);
                throw up.error;
              }
              const signed = await retryOperation(
                async () => {
                  const result = await supabase.storage
                    .from("recordings")
                    .createSignedUrl(path, 60 * 60 * 24);
                  if (result.error && isRetryableError(result.error)) throw result.error;
                  return result;
                },
                { shouldRetry: (error) => isRetryableError(error) },
              );
              if (signed.error) {
                logError("upload.failure", signed.error, {
                  ...uploadLogFields,
                  stage: "signed_url",
                });
                throw signed.error;
              }
              const photo_url = signed.data?.signedUrl;
              if (!photo_url) {
                const error = new Error("no signed url");
                logError("upload.failure", error, { ...uploadLogFields, stage: "signed_url" });
                throw error;
              }
              const ins = await supabase.from("photos").insert({
                room_id: roomId,
                round_id: ph.roundId,
                player_id: me.id,
                player_name: me.name,
                team_id: me.teamId,
                photo_url,
              });
              if (ins.error) {
                logError("upload.failure", ins.error, {
                  ...uploadLogFields,
                  stage: "photo_insert",
                });
                throw ins.error;
              }
              setSubmitted(true);
            } catch (e) {
              console.error(e);
              setErr(friendlyUploadError(e, "photo"));
            } finally {
              setUploading(false);
            }
          }}
        />
        {uploading && <p className="text-center text-white/70 text-sm">Загружаем кадр…</p>}
        {err && <p className="text-center text-red-300 text-sm">{err}</p>}
      </div>
    );
  }

  if (ph.phase === "judging") {
    return (
      <Card>
        <Pill>AI смотрит</Pill>
        <H>Дух парка щурится на твой кадр…</H>
        <P>Сейчас огласит вердикт через колонку.</P>
        {myPhotoUrl && (
          <div className="mt-3 rounded-2xl overflow-hidden bg-black/30 border border-white/10">
            <img src={myPhotoUrl} alt="Твой кадр" className="w-full max-h-[40vh] object-contain" />
          </div>
        )}
      </Card>
    );
  }

  if (ph.phase === "results" && ph.results) {
    const mine = ph.results.find((r) => r.playerId === me.id);
    const winner = ph.results.find((r) => r.rank === 1);
    return (
      <Card>
        <Pill>Результаты</Pill>
        {mine ? (
          <>
            <div className="font-display text-6xl mt-1">
              {mine.rank === 1
                ? "🥇"
                : mine.rank === 2
                  ? "🥈"
                  : mine.rank === 3
                    ? "🥉"
                    : `#${mine.rank}`}
            </div>
            <div className="font-display text-2xl mt-1">+{mine.points} команде</div>
            <p className="text-white mt-3 leading-snug">«{mine.comment}»</p>
            {mine.photoUrl && (
              <div className="mt-3 rounded-2xl overflow-hidden bg-black/30 border border-white/10">
                <img
                  src={mine.photoUrl}
                  alt="Твой кадр"
                  className="w-full max-h-[40vh] object-contain"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <H>Ты не сдал кадр</H>
            <P>Грустно. В следующий раз шевелись быстрее.</P>
          </>
        )}
        {winner && winner.playerId !== me.id && <P>Первое место: {winner.playerName}.</P>}
      </Card>
    );
  }

  return (
    <Card>
      <H>Стой смирно…</H>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur p-6 border border-white/10 text-center text-white">
      {children}
    </div>
  );
}
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
      {children}
    </div>
  );
}
function H({ children }: { children: React.ReactNode }) {
  return <div className="font-display text-2xl mt-1">{children}</div>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-white/65 text-sm mt-2">{children}</p>;
}
