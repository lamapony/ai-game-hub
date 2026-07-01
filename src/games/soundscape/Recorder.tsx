import { useEffect, useRef, useState } from "react";

type Props = {
  maxMs?: number;
  onComplete: (blob: Blob, durationMs: number) => Promise<void> | void;
  disabled?: boolean;
};

export function Recorder({ maxMs = 15000, onComplete, disabled }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "uploading" | "done" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      recRef.current?.stop();
      if (tickRef.current) clearInterval(tickRef.current);
    },
    [],
  );

  async function start() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const duration = Date.now() - startTimeRef.current;
        if (blob.size < 1024) {
          setState("error");
          setErr("Recording too short");
          return;
        }
        setState("uploading");
        try {
          await onComplete(blob, duration);
          setState("done");
        } catch (e) {
          setState("error");
          setErr(e instanceof Error ? e.message : "Upload failed");
        }
      };
      startTimeRef.current = Date.now();
      rec.start();
      setState("recording");
      setElapsed(0);
      tickRef.current = setInterval(() => {
        const e = Date.now() - startTimeRef.current;
        setElapsed(e);
        if (e >= maxMs) stop();
      }, 100);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mic denied");
      setState("error");
    }
  }
  function stop() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  const pct = Math.min(100, (elapsed / maxMs) * 100);

  return (
    <div className="space-y-3">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--color-park-bright)] transition-[width] duration-100"
          style={{ width: `${pct}%` }}
        />
      </div>
      {state === "recording" ? (
        <button
          onClick={stop}
          className="w-full rounded-3xl bg-red-500 text-white py-6 text-xl font-display animate-pulse"
        >
          ⏹ Stop ({Math.ceil((maxMs - elapsed) / 1000)}s)
        </button>
      ) : state === "uploading" ? (
        <div className="rounded-3xl bg-white/10 text-white/80 py-6 text-center">
          Uploading + transcribing…
        </div>
      ) : state === "done" ? (
        <button
          onClick={() => {
            setState("idle");
            setElapsed(0);
          }}
          disabled={disabled}
          className="w-full rounded-3xl bg-[var(--color-park-bright)] text-[oklch(0.18_0.05_160)] py-5 text-lg font-medium"
        >
          ✓ Sent. Record another?
        </button>
      ) : (
        <button
          onClick={start}
          disabled={disabled}
          className="w-full rounded-3xl bg-red-500 text-white py-6 text-xl font-display disabled:opacity-40"
        >
          ● Record sound ({Math.round(maxMs / 1000)}s max)
        </button>
      )}
      {err && <p className="text-sm text-red-300">{err}</p>}
    </div>
  );
}
