import {
  Mic,
  Radio,
  RefreshCcw,
  Send,
  SkipForward,
  Sparkles,
  Square,
  Volume2,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_LABELS } from "@/lib/event-director";
import type { RoomState } from "@/lib/types";
import {
  type ClientVoiceSession,
  speakWithFallback,
  useRealtimeVoice,
} from "@/lib/use-realtime-voice";

type Props = {
  code: string;
  hostSecret: string | null;
  state: RoomState;
  onState?: (state: RoomState) => void;
};

type DirectorApiResponse = {
  state: RoomState;
};

type VoiceSessionResponse = ClientVoiceSession & {
  configured?: {
    openai: boolean;
    xai: boolean;
    preference: string;
  };
};

function readableElapsed(startedAt?: number) {
  if (!startedAt) return "0:00";
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DirectorPanel({ code, hostSecret, state, onState }: Props) {
  const director = state.eventDirector;
  const pending = director?.pendingSuggestion;
  const [busy, setBusy] = useState<string | null>(null);
  const [rewriteText, setRewriteText] = useState("");
  const [voiceSession, setVoiceSession] = useState<VoiceSessionResponse | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [elapsed, setElapsed] = useState(readableElapsed(director?.startedAt));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const realtime = useRealtimeVoice();

  useEffect(() => {
    setRewriteText(pending?.text ?? "");
  }, [pending?.id, pending?.text]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(readableElapsed(director?.startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [director?.startedAt]);

  const activeSegment = useMemo(
    () => director?.segments.find((segment) => segment.id === director.currentSegmentId),
    [director],
  );

  async function callDirector(action: string, payload: Record<string, unknown> = {}) {
    if (!hostSecret) throw new Error("Host secret missing on this device.");
    setBusy(action);
    try {
      const response = await fetch("/api/director", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-host-secret": hostSecret,
        },
        body: JSON.stringify({ code, action, ...payload }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as DirectorApiResponse;
      onState?.(data.state);
      return data.state;
    } finally {
      setBusy(null);
    }
  }

  async function startDirector() {
    await callDirector("start");
  }

  async function suggestNext() {
    await callDirector("suggest");
  }

  async function approveCue() {
    const text = pending?.text;
    if (text) {
      await realtime.sendText(text);
    }
    await callDirector("approve");
  }

  async function skipCue() {
    await callDirector("skip");
  }

  async function rewriteCue() {
    await callDirector("rewrite", { text: rewriteText });
  }

  async function advanceSegment() {
    await callDirector("advance");
  }

  async function stopDirector() {
    realtime.stop();
    await callDirector("stop");
  }

  async function startVoiceSession() {
    if (!hostSecret) return;
    setVoiceError(null);
    setBusy("voice");
    try {
      const response = await fetch("/api/voice-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-host-secret": hostSecret,
        },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error(await response.text());
      const session = (await response.json()) as VoiceSessionResponse;
      setVoiceSession(session);
      await realtime.start(session);
      await callDirector("provider-status", {
        provider: session.provider,
        configured: true,
        connected: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice session failed";
      setVoiceError(message);
      await callDirector("provider-status", {
        provider: "none",
        configured: false,
        connected: false,
        lastError: message,
      }).catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  async function stopVoiceSession() {
    realtime.stop();
    await callDirector("provider-status", {
      provider: voiceSession?.provider ?? "none",
      configured: !!voiceSession,
      connected: false,
    });
  }

  async function startListening() {
    setVoiceError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.addEventListener(
      "stop",
      () => {
        void finishListening();
      },
      { once: true },
    );
    recorder.start();
    setListening(true);
    await callDirector("mic-capture", { micStatus: "listening" });
  }

  async function stopListening() {
    recorderRef.current?.stop();
    setListening(false);
  }

  async function finishListening() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (blob.size === 0) {
      await callDirector("mic-capture", { micStatus: "idle" }).catch(() => {});
      return;
    }

    try {
      await callDirector("mic-capture", { micStatus: "transcribing" });
      const form = new FormData();
      form.set("file", blob, "audience.webm");
      form.set("filename", "audience.webm");
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await response.json()) as { text?: string };
      const audienceText = data.text?.trim();
      await callDirector("mic-capture", { micStatus: "idle", audienceText });
      if (audienceText) await callDirector("suggest", { audienceText });
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Could not transcribe room audio");
      await callDirector("mic-capture", { micStatus: "idle" }).catch(() => {});
    }
  }

  const providerLabel =
    realtime.status === "connected"
      ? `${voiceSession?.provider ?? "voice"} · ${voiceSession?.model ?? ""}`
      : realtime.status === "fallback"
        ? "fallback TTS"
        : director?.providerStatus.connected
          ? `${director.providerStatus.provider} connected`
          : "not connected";

  return (
    <section className="rounded-3xl border border-white/10 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Virtual host
          </div>
          <h2 className="font-display text-2xl">Event Director</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Semi-automatic, English, dry enough for academics.
          </p>
        </div>
        <div className="rounded-2xl bg-white/5 px-3 py-2 text-right text-xs">
          <div className="text-muted-foreground">runtime</div>
          <div className="font-mono text-sm">{elapsed}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void startDirector()}
          disabled={busy !== null || director?.mode === "running"}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-park-bright)] px-3 py-2 text-sm font-medium text-[oklch(0.16_0.05_160)] disabled:opacity-50"
        >
          <Sparkles size={16} /> Start festival
        </button>
        <button
          type="button"
          onClick={() => void suggestNext()}
          disabled={busy !== null || !director || director.mode === "off"}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-40"
        >
          <Wand2 size={16} /> Suggest cue
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Realtime voice
            </div>
            <div className="text-sm text-white">{providerLabel}</div>
            {(realtime.error || voiceError || director?.providerStatus.lastError) && (
              <div className="mt-1 text-xs text-amber-200">
                {realtime.error ?? voiceError ?? director?.providerStatus.lastError}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void startVoiceSession()}
              disabled={busy !== null || realtime.status === "connected"}
              title="Connect realtime voice"
              className="grid size-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/15 disabled:opacity-40"
            >
              <Radio size={17} />
            </button>
            <button
              type="button"
              onClick={() => void stopVoiceSession()}
              disabled={busy !== null || realtime.status !== "connected"}
              title="Stop realtime voice"
              className="grid size-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/15 disabled:opacity-40"
            >
              <Square size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Current segment
            </div>
            <div className="text-sm text-white">
              {activeSegment?.title ?? "No active segment"}
              {activeSegment?.gameId ? ` · ${GAME_LABELS[activeSegment.gameId]}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void advanceSegment()}
            disabled={busy !== null || !director}
            className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-2 text-xs text-white hover:bg-white/15 disabled:opacity-40"
          >
            <SkipForward size={14} /> Advance
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(director?.segments ?? []).map((segment) => (
            <span
              key={segment.id}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${
                segment.status === "active"
                  ? "bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)]"
                  : segment.status === "complete"
                    ? "bg-white/15 text-white/70"
                    : "bg-white/5 text-white/40"
              }`}
            >
              {segment.title}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Pending host cue
        </div>
        {pending ? (
          <>
            <textarea
              value={rewriteText}
              onChange={(event) => setRewriteText(event.target.value)}
              className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none focus:border-[var(--color-park-bright)]/60"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void approveCue()}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-park-bright)] px-3 py-2 text-sm font-medium text-[oklch(0.16_0.05_160)] disabled:opacity-50"
              >
                <Volume2 size={16} /> Approve
              </button>
              <button
                type="button"
                onClick={() => void rewriteCue()}
                disabled={busy !== null || rewriteText.trim() === pending.text.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-40"
              >
                <RefreshCcw size={15} /> Rewrite
              </button>
              <button
                type="button"
                onClick={() => void skipCue()}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-40"
              >
                <SkipForward size={15} /> Skip
              </button>
              <button
                type="button"
                onClick={() => void realtime.sendText(rewriteText || pending.text)}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-40"
              >
                <Send size={15} /> Speak only
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No cue pending. Ask the director for one, or advance the segment.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Room sample
            </div>
            <div className="text-sm text-white">
              {director?.micCapture.status === "transcribing"
                ? "transcribing"
                : listening
                  ? "listening"
                  : "push-to-listen"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => (listening ? void stopListening() : void startListening())}
            disabled={busy !== null && !listening}
            className={`grid size-11 place-items-center rounded-xl text-white disabled:opacity-40 ${
              listening ? "bg-red-500/80" : "bg-white/10 hover:bg-white/15"
            }`}
            title={listening ? "Stop listening" : "Listen briefly"}
          >
            <Mic size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Captures a short host-mic sample, transcribes it, then asks the director for a response.
        </p>
      </div>

      {director?.spokenTranscript.length ? (
        <div className="mt-4 max-h-40 space-y-2 overflow-auto pr-1">
          {director.spokenTranscript
            .slice()
            .reverse()
            .map((entry) => (
              <div key={entry.id} className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
                <div className="uppercase tracking-widest text-white/35">{entry.speaker}</div>
                <div className="mt-1 text-white/75">{entry.text}</div>
              </div>
            ))}
        </div>
      ) : null}

      {director && (
        <button
          type="button"
          onClick={() => void stopDirector()}
          disabled={busy !== null}
          className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 py-2 text-xs text-white/55 hover:text-white disabled:opacity-40"
        >
          Stop virtual host layer
        </button>
      )}
    </section>
  );
}
