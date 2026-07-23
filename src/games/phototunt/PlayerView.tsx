// Photo Hunt player view: see task, snap one photo within timer, upload, wait for verdict.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { postPlayerArtifact } from "@/lib/player-artifact-client";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import { formatClock } from "@/lib/team-style";
import { friendlyUploadError } from "@/lib/media-errors";
import { logError } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";
import { PhotoCapture } from "./PhotoCapture";
import { downscaleImage } from "./image-utils";
import { GameRulesChecklist } from "@/components/game-rules-ui";

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
        <Pill>Get ready</Pill>
        {ph.task ? (
          <>
            <H>Task:</H>
            <p className="text-white text-xl mt-2 leading-snug">«{ph.task}»</p>
            <P>When the host hits start — you&apos;ve got 60 seconds to find and snap ONE shot.</P>
            <GameRulesChecklist gameId="phototunt" />
          </>
        ) : (
          <>
            <H>The park spirit is cooking up a hunt…</H>
            <GameRulesChecklist gameId="phototunt" />
          </>
        )}
      </Card>
    );
  }

  if (ph.phase === "hunting") {
    const remaining = Math.max(0, (ph.huntEndsAt ?? now) - now);
    if (submitted) {
      return (
        <div data-testid="phototunt-submitted">
          <Card>
            <Pill>Shot sent</Pill>
            <H>Waiting on everyone else…</H>
            <div className="text-right text-xs text-white/60 mt-1">
              {formatClock(remaining)} left
            </div>
            {myPhotoUrl && (
              <div className="mt-3 rounded-2xl overflow-hidden bg-black/30 border border-white/10">
                <img
                  src={myPhotoUrl}
                  alt="Your shot"
                  className="w-full max-h-[40vh] object-contain"
                />
              </div>
            )}
            <P>No take-backs — what you shot is what you got.</P>
          </Card>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="rounded-3xl bg-black/40 backdrop-blur p-5 border border-white/10 text-white">
          <div className="flex items-baseline justify-between">
            <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
              Hunt on
            </div>
            <div className="font-display text-2xl tabular-num">{formatClock(remaining)}</div>
          </div>
          <div className="font-display text-xl mt-1">Find and snap:</div>
          <p className="text-white text-lg mt-1 leading-snug">«{ph.task}»</p>
          <p className="text-white/60 text-xs mt-2">ONE shot only. Tap to send.</p>
        </div>

        <PhotoCapture
          disabled={uploading}
          onCapture={async (file) => {
            setUploading(true);
            setErr(null);
            try {
              const { blob, dataUrl } = await downscaleImage(file, 1024, 0.82);
              setMyPhotoUrl(dataUrl);
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
              const storagePath = await uploadPlayerMedia(
                roomId,
                {
                  action: "photo",
                  playerId: me.id,
                  roundId: ph.roundId,
                  mimeType: "image/jpeg",
                },
                blob,
              ).catch((error) => {
                logError("upload.failure", error, uploadLogFields);
                throw error;
              });
              const submitted = await postPlayerArtifact(roomId, {
                action: "photo-submission",
                playerId: me.id,
                roundId: ph.roundId,
                storagePath,
              });
              if (submitted.photoUrl) setMyPhotoUrl(submitted.photoUrl);
              setSubmitted(true);
            } catch (e) {
              console.error(e);
              setErr(friendlyUploadError(e, "photo"));
            } finally {
              setUploading(false);
            }
          }}
        />
        {uploading && (
          <p data-testid="phototunt-uploading" className="text-center text-white/70 text-sm">
            Uploading shot…
          </p>
        )}
        {err && (
          <p data-testid="phototunt-upload-error" className="text-center text-red-300 text-sm">
            {err}
          </p>
        )}
      </div>
    );
  }

  if (ph.phase === "judging") {
    return (
      <Card>
        <Pill>AI watching</Pill>
        <H>The park spirit squints at your shot…</H>
        <P>Verdict coming through the speaker any second.</P>
        {myPhotoUrl && (
          <div className="mt-3 rounded-2xl overflow-hidden bg-black/30 border border-white/10">
            <img src={myPhotoUrl} alt="Your shot" className="w-full max-h-[40vh] object-contain" />
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
        <Pill>Results</Pill>
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
            <div className="font-display text-2xl mt-1">+{mine.points} to team</div>
            <p className="text-white mt-3 leading-snug">«{mine.comment}»</p>
            {mine.photoUrl && (
              <div className="mt-3 rounded-2xl overflow-hidden bg-black/30 border border-white/10">
                <img
                  src={mine.photoUrl}
                  alt="Your shot"
                  className="w-full max-h-[40vh] object-contain"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <H>You didn&apos;t submit a shot</H>
            <P>Tough break. Move faster next time.</P>
          </>
        )}
        {winner && winner.playerId !== me.id && <P>First place: {winner.playerName}.</P>}
      </Card>
    );
  }

  return (
    <Card>
      <H>Stand by…</H>
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
