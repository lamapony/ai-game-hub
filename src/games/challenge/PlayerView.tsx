// Challenge game player view. Operator films; others perform.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateRoomState } from "@/lib/room";
import { isRetryableError, retryOperation } from "@/lib/retry";
import { logError } from "@/lib/structured-log";
import { VideoRecorder } from "./VideoRecorder";
import { extractFrames } from "./video-utils";
import { formatClock } from "@/lib/team-style";
import { friendlyMediaError } from "@/lib/media-errors";
import type { RoomState } from "@/lib/types";

const RECORDING_MS = 25_000;

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
          <Pill>Раунд готовится</Pill>
          <H>Дух парка придумывает задание…</H>
        </Card>
      );
    }
    if (isOperator) {
      return <OperatorReady roomId={roomId} state={state} task={ch.task} />;
    }
    return (
      <Card>
        <Pill>Готовься выступать</Pill>
        <H>Задание:</H>
        <p className="text-white text-xl mt-2 leading-snug">«{ch.task}»</p>
        <P>
          Снимает <strong className="text-white">{ch.operatorName}</strong>. Как только он откроет
          камеру — погнали.
        </P>
      </Card>
    );
  }

  if (ch.phase === "recording") {
    const remaining = Math.max(0, (ch.recordingEndsAt ?? now) - now);
    if (isOperator)
      return <OperatorRecord roomId={roomId} state={state} me={me} remaining={remaining} />;
    return (
      <Card>
        <Pill>Снимают тебя!</Pill>
        <div className="text-right text-xs text-white/60">{formatClock(remaining)}</div>
        <H>Задание:</H>
        <p className="text-white text-xl mt-2 leading-snug">«{ch.task}»</p>
        <P>
          Снимает: <strong className="text-white">{ch.operatorName}</strong>. Жги по полной — AI
          смотрит и оценивает.
        </P>
      </Card>
    );
  }

  if (ch.phase === "judging") {
    return (
      <Card>
        <Pill>Судья смотрит запись</Pill>
        <H>AI анализирует кадры…</H>
        <P>Распознаём речь, оцениваем сценку. 10 секунд.</P>
      </Card>
    );
  }

  if (ch.phase === "results" && ch.result) {
    return (
      <Card>
        <Pill>Вердикт</Pill>
        <div className="font-display text-7xl text-[var(--color-park-bright)] tabular-num">
          {ch.result.score}
          <span className="text-white/40 text-3xl">/10</span>
        </div>
        <p className="text-white mt-3">«{ch.result.feedback}»</p>
        <P>Видео сохранили в галерею комнаты.</P>
      </Card>
    );
  }

  return (
    <Card>
      <H>Стой по стойке…</H>
    </Card>
  );
}

function OperatorReady({
  roomId,
  state,
  task,
}: {
  roomId: string;
  state: RoomState;
  task: string;
}) {
  const ch = state.challenge!;
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
      await updateRoomState(roomId, {
        ...state,
        challenge: { ...ch, phase: "recording", recordingEndsAt: Date.now() + RECORDING_MS },
      });
    } catch (e) {
      console.error(e);
      setErr(friendlyMediaError(e, "camera-microphone"));
      setStarting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-[var(--color-park-bright)]/15 border border-[var(--color-park-bright)]/40 p-5 text-white">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          Ты — оператор 🎥
        </div>
        <div className="font-display text-2xl mt-1">Снимаешь ты</div>
        <p className="text-white/80 mt-3 text-sm">Задание для остальных:</p>
        <p className="text-white text-lg mt-1 leading-snug">«{task}»</p>
        <p className="text-white/60 text-xs mt-3">
          Прочитай вслух задание, наведи камеру — и жми кнопку.
        </p>
      </div>
      <button
        onClick={start}
        disabled={starting}
        className="w-full rounded-3xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] py-6 text-xl font-display disabled:opacity-50"
      >
        {starting ? "Включаем…" : "📷 Открыть камеру"}
      </button>
      {err && <p className="text-sm text-red-300 text-center">{err}</p>}
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
    const path = `${roomId}/challenge/${ch.roundId}/${me.id}-${Date.now()}.${ext}`;
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
    const up = await retryOperation(
      async () => {
        const result = await supabase.storage
          .from("recordings")
          .upload(path, blob, { contentType: mime });
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
      logError("upload.failure", signed.error, { ...uploadLogFields, stage: "signed_url" });
      throw signed.error;
    }
    const video_url = signed.data?.signedUrl ?? null;

    // transcribe audio track (whisper can pull audio from webm/mp4)
    let transcript = "";
    try {
      const fd = new FormData();
      fd.append("file", blob, `clip.${ext}`);
      fd.append("filename", `clip.${ext}`);
      const r = await fetch("/api/transcribe", { method: "POST", body: fd });
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

    const inserted = await supabase.from("challenges").insert({
      room_id: roomId,
      round_id: ch.roundId,
      task: ch.task ?? "",
      operator_id: me.id,
      operator_name: me.name,
      video_url,
      transcript,
    });
    if (inserted.error) {
      logError("upload.failure", inserted.error, { ...uploadLogFields, stage: "challenge_insert" });
      throw inserted.error;
    }

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
        frames,
        transcript,
        videoUrl: video_url,
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
          Ты — оператор
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <div className="font-display text-2xl">Снимай сценку</div>
          <div className="font-display text-2xl tabular-num">{formatClock(remaining)}</div>
        </div>
        <p className="text-white/80 mt-2 text-sm">Задание для остальных:</p>
        <p className="text-white text-lg mt-1 leading-snug">«{ch.task}»</p>
      </div>
      {!uploaded && <VideoRecorder onComplete={handleUpload} />}
      {uploaded && (
        <Card>
          <Pill>Готово</Pill>
          <H>Видео улетело судье</H>
          <P>Через секунд 10 — вердикт через колонку.</P>
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
