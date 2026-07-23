import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useRoom, useBroadcast } from "@/lib/room";
import { Orchestra } from "@/games/soundscape/Orchestra";
import { SPEAKER_NAMES } from "@/lib/types";
import { SPEAKER_HEARTBEAT_MS } from "@/lib/speaker-status";
import { postSpeakerStatus } from "@/lib/speaker-status-client";
import { speechUrl } from "@/lib/speech-client";
import { RoomLoadRecovery } from "@/components/room-load-recovery";

export const Route = createFileRoute("/speaker/$code")({
  validateSearch: (s: Record<string, unknown>) => ({
    slot: Math.max(1, Math.min(5, Number(s.slot) || 2)),
  }),
  component: SpeakerPage,
});

function SpeakerPage() {
  const { code } = Route.useParams();
  const { slot } = Route.useSearch();
  const { room, loading, error, refreshRoom } = useRoom(code);
  const [armed, setArmed] = useState(false); // mobile audio needs user gesture
  const roomRef = useRef(room);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Mark slot as connected once user arms
  useEffect(() => {
    if (!room || !armed) return;

    function updateSpeakerSlot(connected: boolean) {
      const current = roomRef.current;
      if (!current) return;
      postSpeakerStatus(current.code, slot, connected).catch(() => {});
    }

    updateSpeakerSlot(true);
    const heartbeat = window.setInterval(() => updateSpeakerSlot(true), SPEAKER_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeat);
      updateSpeakerSlot(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, armed, slot]);

  const { send } = useBroadcast(room?.id, (e) => {
    const currentRoomId = roomRef.current?.id;
    if (!currentRoomId) return;
    if (e.type === "test-tone" && e.slot === slot) {
      const a = new Audio(
        speechUrl(`Speaker ${slot}, ${SPEAKER_NAMES[slot]}, online.`, currentRoomId),
      );
      a.play().catch(() => {});
    }
    if (e.type === "speak" && e.slot === slot) {
      const a = new Audio(speechUrl(e.text, currentRoomId));
      a.play().catch(() => {});
    }
  });
  void send;

  if (loading)
    return (
      <Shell>
        <div className="text-white/70">Loading…</div>
      </Shell>
    );
  if (!room)
    return (
      <Shell>
        <RoomLoadRecovery code={code} error={error} onRetry={refreshRoom} />
      </Shell>
    );

  const snd = room.state.soundscape;
  const activeMix =
    !room.state.paused && snd?.phase === "playback" && snd.playback
      ? snd.mixes?.[snd.playback.teamId]
      : null;

  return (
    <Shell>
      {armed && !room.state.paused && (
        <Orchestra
          roomId={room.id}
          slot={slot}
          mix={activeMix}
          startAt={snd?.playback?.startAt ?? null}
          intro={null}
        />
      )}

      <div className="w-full max-w-md text-center text-white">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
          Speaker {slot} · room {code}
        </div>
        <h1 className="font-display text-5xl mt-2">{SPEAKER_NAMES[slot]}</h1>

        {!armed ? (
          <>
            <p className="mt-4 text-white/75 text-sm leading-relaxed">
              Connect Bluetooth speaker, max volume. Tap the button — and keep screen on.
            </p>
            <button
              onClick={() => {
                const a = new Audio();
                a.muted = true;
                a.play().catch(() => {});
                setArmed(true);
              }}
              className="mt-6 w-full rounded-3xl bg-white text-[oklch(0.18_0.05_160)] py-6 text-xl font-display"
            >
              ▶ Turn on {SPEAKER_NAMES[slot]}
            </button>
            <p className="mt-3 text-xs text-white/60">
              Host will test sound with the "🔊 test" button on their screen.
            </p>
          </>
        ) : (
          <div
            className={`mt-8 rounded-3xl border border-white/20 p-6 ${snd?.phase === "playback" ? "bg-[var(--color-park-bright)]/20 animate-pulse" : "bg-white/5"}`}
          >
            <div className="text-sm uppercase tracking-widest text-white/70">
              {room.state.paused
                ? "Paused"
                : snd?.phase === "playback"
                  ? "Performing"
                  : snd?.phase
                    ? `Waiting · ${snd.phase}`
                    : "Online"}
            </div>
            <div className="font-display text-3xl mt-1">
              {room.state.paused
                ? "||"
                : snd?.phase === "playback"
                  ? (activeMix?.cues.filter((c) => c.slot === slot).length ?? 0) + " cues"
                  : "✓"}
            </div>
            <p className="text-xs text-white/60 mt-3">
              Keep screen on. Speaker is waiting for the AI signal.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh park-gradient flex items-center justify-center px-5">
      {children}
    </main>
  );
}
