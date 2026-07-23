// Video recorder for the Challenge game: operator films other players.
import { useEffect, useRef, useState } from "react";
import { friendlyMediaError, friendlyUploadError } from "@/lib/media-errors";

type Props = {
  maxMs?: number;
  onComplete: (blob: Blob, mimeType: string) => Promise<void> | void;
};

export function VideoRecorder({
  maxMs = 20000,
  onComplete,
  autoOpen = true,
}: Props & { autoOpen?: boolean }) {
  const [state, setState] = useState<
    "idle" | "preview" | "recording" | "uploading" | "done" | "error"
  >("idle");
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => cleanup(), []);
  useEffect(() => {
    if (autoOpen) {
      openCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function cleanup() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      if (recRef.current && recRef.current.state !== "inactive") {
        recRef.current.stop();
      }
    } catch {
      /* */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function openCamera() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("preview");
    } catch (e) {
      setErr(friendlyMediaError(e, "camera-microphone"));
      setState("error");
    }
  }

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : "";
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 })
      : new MediaRecorder(stream);
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (blob.size < 10_000) {
        setState("error");
        setErr("Video too short");
        return;
      }
      setState("uploading");
      try {
        await onComplete(blob, rec.mimeType || "video/webm");
        setState("done");
      } catch (e) {
        setState("error");
        setErr(friendlyUploadError(e, "video"));
      }
    };
    startRef.current = Date.now();
    rec.start();
    setState("recording");
    setElapsed(0);
    tickRef.current = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= maxMs) stop();
    }, 100);
  }

  function stop() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  const pct = Math.min(100, (elapsed / maxMs) * 100);
  const remaining = Math.ceil((maxMs - elapsed) / 1000);

  return (
    <div data-testid="video-recorder" data-state={state} className="space-y-3">
      <div className="relative aspect-video rounded-3xl overflow-hidden bg-black ring-1 ring-white/10">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        {state === "idle" && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-center px-4">
            <div className="text-white">
              <div className="text-5xl">🎥</div>
              <div className="font-display text-xl mt-2">Ready to film?</div>
              <div className="text-xs text-white/60 mt-1">Allow camera and microphone access</div>
            </div>
          </div>
        )}
        {state === "recording" && (
          <>
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-red-500/90 text-white text-xs px-2 py-1 font-medium">
              <span className="size-1.5 rounded-full bg-white animate-pulse" /> REC {remaining}s
            </div>
            <div className="absolute bottom-0 inset-x-0 h-1.5 bg-white/10">
              <div className="h-full bg-red-500" style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
        {state === "uploading" && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 text-white text-center">
            <div>
              <div className="font-display text-xl">Sending to the park spirit…</div>
              <div className="text-xs text-white/60 mt-1">Transcribing speech, slicing frames</div>
            </div>
          </div>
        )}
      </div>

      {state === "idle" && (
        <button
          data-testid="video-recorder-open"
          onClick={openCamera}
          className="w-full rounded-3xl bg-[var(--color-park-bright)] text-[oklch(0.18_0.05_160)] py-5 text-lg font-medium"
        >
          📷 Open camera
        </button>
      )}
      {state === "error" && (
        <button
          data-testid="video-recorder-retry"
          onClick={openCamera}
          className="w-full rounded-3xl bg-[var(--color-park-bright)] text-[oklch(0.18_0.05_160)] py-5 text-lg font-medium"
        >
          Try camera and microphone again
        </button>
      )}
      {state === "preview" && (
        <button
          data-testid="video-recorder-start"
          onClick={start}
          className="w-full rounded-3xl bg-red-500 text-white py-6 text-xl font-display"
        >
          ● Let&apos;s go! ({Math.round(maxMs / 1000)}s)
        </button>
      )}
      {state === "recording" && (
        <button
          data-testid="video-recorder-stop"
          onClick={stop}
          className="w-full rounded-3xl bg-red-500 text-white py-6 text-xl font-display animate-pulse"
        >
          ⏹ Stop
        </button>
      )}
      {state === "done" && (
        <div className="rounded-3xl bg-[var(--color-park-bright)]/15 border border-[var(--color-park-bright)]/40 text-white py-5 text-center">
          ✓ Video sent to the judge. Waiting for verdict.
        </div>
      )}
      {err && (
        <p data-testid="video-recorder-error" className="text-sm text-red-300 text-center">
          {err}
        </p>
      )}
    </div>
  );
}
