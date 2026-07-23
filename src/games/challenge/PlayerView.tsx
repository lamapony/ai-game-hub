// Challenge game player view. Operator films; others perform.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { postPlayerArtifact } from "@/lib/player-artifact-client";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { postPlayerAction } from "@/lib/player-action-client";
import { playerSecretFor } from "@/lib/player-action-client";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import { logError } from "@/lib/structured-log";
import { VideoRecorder } from "./VideoRecorder";
import { extractFrames } from "./video-utils";
import { formatClock } from "@/lib/team-style";
import { friendlyMediaError } from "@/lib/media-errors";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import type { RoomState } from "@/lib/types";

export function ChallengePlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const ch = state.challenge!;
  const isOperator = ch.operatorId === me.id;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  if (ch.phase === "briefing") {
    if (!ch.task) {
      return (
        <Card>
          <Pill>Round loading</Pill>
          <H>The park spirit is cooking up a task…</H>
          <GameRulesChecklist gameId="challenge" />
        </Card>
      );
    }
    if (isOperator) {
      return <OperatorReady roomId={roomId} me={me} task={ch.task} />;
    }
    return (
      <Card>
        <Pill>Get ready to perform</Pill>
        <H>Task:</H>
        <p className="text-white text-xl mt-2 leading-snug">«{ch.task}»</p>
        <P>
          <strong className="text-white">{ch.operatorName}</strong> is filming. As soon as they open
          the camera — let&apos;s go.
        </P>
        <GameRulesChecklist gameId="challenge" />
      </Card>
    );
  }

  if (ch.phase === "recording") {
    const remaining = Math.max(0, (ch.recordingEndsAt ?? now) - now);
    if (isOperator)
      return <OperatorRecord roomId={roomId} state={state} me={me} remaining={remaining} />;
    return (
      <Card>
        <Pill>You&apos;re on camera!</Pill>
        <div className="text-right text-xs text-white/60">{formatClock(remaining)}</div>
        <H>Task:</H>
        <p className="text-white text-xl mt-2 leading-snug">«{ch.task}»</p>
        <P>
          Filming: <strong className="text-white">{ch.operatorName}</strong>. Go all out — AI is
          watching and scoring.
        </P>
      </Card>
    );
  }

  if (ch.phase === "judging") {
    return (
      <Card>
        <Pill>Judge is watching</Pill>
        <H>AI is analyzing the footage…</H>
        <P>Transcribing speech, scoring the scene. 10 seconds.</P>
      </Card>
    );
  }

  if (ch.phase === "results" && ch.result) {
    return (
      <Card>
        <Pill>Verdict</Pill>
        <div className="font-display text-7xl text-[var(--color-park-bright)] tabular-num">
          {ch.result.score}
          <span className="text-white/40 text-3xl">/10</span>
        </div>
        <p className="text-white mt-3">«{ch.result.feedback}»</p>
        {ch.result.breakdown && (
          <p className="mt-2 text-xs text-white/60">
            Scene {ch.result.breakdown.performance} · creative {ch.result.breakdown.creativity} ·
            energy {ch.result.breakdown.energy} · environment +{ch.result.breakdown.environment}
          </p>
        )}
        <P>Video saved to the room gallery.</P>
      </Card>
    );
  }

  return (
    <Card>
      <H>Stand by…</H>
    </Card>
  );
}

function OperatorReady({ roomId, me, task }: { roomId: string; me: { id: string }; task: string }) {
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setErr(null);
    try {
      // Pre-prompt for camera/mic inside the user gesture so iOS Safari grants
      // permission; release immediately so VideoRecorder can re-open without prompt.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: true,
      });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setErr(friendlyMediaError(e, "camera-microphone"));
      setStarting(false);
      return;
    }

    try {
      await postPlayerAction(roomId, {
        action: "challenge-start-recording",
        playerId: me.id,
      });
    } catch (e) {
      console.error(e);
      setErr(friendlyPlayerActionError(e, "recording start"));
      setStarting(false);
    }
  }

  return (
    <div data-testid="challenge-operator-ready" className="space-y-3">
      <div className="rounded-3xl bg-[var(--color-park-bright)]/15 border border-[var(--color-park-bright)]/40 p-5 text-white">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          You&apos;re the operator 🎥
        </div>
        <div className="font-display text-2xl mt-1">You&apos;re filming</div>
        <p className="text-white/80 mt-3 text-sm">Task for everyone else:</p>
        <p className="text-white text-lg mt-1 leading-snug">«{task}»</p>
        <p className="text-white/60 text-xs mt-3">
          Read the task out loud, point the camera — then hit the button.
        </p>
        <GameRulesChecklist gameId="challenge" />
      </div>
      <button
        data-testid="challenge-open-camera"
        onClick={start}
        disabled={starting}
        className="w-full rounded-3xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] py-6 text-xl font-display disabled:opacity-50"
      >
        {starting ? "Starting…" : "📷 Open camera"}
      </button>
      {err && (
        <p data-testid="challenge-permission-error" className="text-sm text-red-300 text-center">
          {err}
        </p>
      )}
    </div>
  );
}

function OperatorRecord({
  roomId,
  state,
  me,
  remaining,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
  remaining: number;
}) {
  const ch = state.challenge!;
  const [uploaded, setUploaded] = useState(false);

  async function handleUpload(blob: Blob, mime: string) {
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const uploadLogFields = {
      game: "challenge",
      stage: "video_upload",
      roomId,
      roundId: ch.roundId,
      playerId: me.id,
      teamId: me.teamId,
      mimeType: mime,
      blobSize: blob.size,
    };
    const storagePath = await uploadPlayerMedia(
      roomId,
      {
        action: "challenge-video",
        playerId: me.id,
        roundId: ch.roundId,
        mimeType: mime,
      },
      blob,
    ).catch((error) => {
      logError("upload.failure", error, uploadLogFields);
      throw error;
    });

    // transcribe audio track (whisper can pull audio from webm/mp4)
    let transcript = "";
    try {
      const fd = new FormData();
      fd.append("file", blob, `clip.${ext}`);
      fd.append("filename", `clip.${ext}`);
      fd.append("roomId", roomId);
      fd.append("playerId", me.id);
      fd.append("roundId", ch.roundId);
      const playerSecret = playerSecretFor(me.id);
      const r = await fetch("/api/transcribe", {
        method: "POST",
        headers: playerSecret ? { "x-player-secret": playerSecret } : undefined,
        body: fd,
      });
      if (r.ok) transcript = (await r.json()).text ?? "";
    } catch {
      /* */
    }

    // extract frames as data URLs for vision judging
    let frames: string[] = [];
    try {
      frames = await extractFrames(blob, 4);
    } catch {
      /* */
    }

    const submitted = await postPlayerArtifact(roomId, {
      action: "challenge-submission",
      playerId: me.id,
      roundId: ch.roundId,
      storagePath,
      transcript,
    });
    const videoUrl = submitted.videoUrl ?? "";

    // Host listens for INSERT and runs the judge. Pass frames out-of-band via broadcast.
    const channel = supabase.channel(`judge:${roomId}`);
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      setTimeout(resolve, 2500);
    });
    await channel.send({
      type: "broadcast",
      event: "judge",
      payload: {
        roundId: ch.roundId,
        operatorId: me.id,
        frames,
        transcript,
        videoUrl,
        operatorName: me.name,
        task: ch.task,
      },
    });
    setTimeout(() => supabase.removeChannel(channel), 3000);

    setUploaded(true);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-black/40 backdrop-blur p-5 border border-white/10 text-white">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          You&apos;re the operator
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <div className="font-display text-2xl">Film the scene</div>
          <div className="font-display text-2xl tabular-num">{formatClock(remaining)}</div>
        </div>
        <p className="text-white/80 mt-2 text-sm">Task for everyone else:</p>
        <p className="text-white text-lg mt-1 leading-snug">«{ch.task}»</p>
      </div>
      {!uploaded && <VideoRecorder onComplete={handleUpload} />}
      {uploaded && (
        <Card>
          <Pill>Done</Pill>
          <H>Video sent to the judge</H>
          <P>Verdict through the speaker in about 10 seconds.</P>
        </Card>
      )}
    </div>
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
