import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useRoom, updateRoomState, useBroadcast } from "@/lib/room";
import { Orchestra } from "@/games/soundscape/Orchestra";
import { SPEAKER_NAMES } from "@/lib/types";
import { SPEAKER_HEARTBEAT_MS } from "@/lib/speaker-status";

export const Route = createFileRoute("/speaker/$code")({
  validateSearch: (s: Record<string, unknown>) => ({
    slot: Math.max(1, Math.min(5, Number(s.slot) || 2)),
  }),
  component: SpeakerPage,
});

function SpeakerPage() {
  const { code } = Route.useParams();
  const { slot } = Route.useSearch();
  const { room, loading, error } = useRoom(code);
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
      const slots = { ...(current.state.speakerSlots ?? {}) };
      const existing = slots[slot] ?? { connected: false, name: SPEAKER_NAMES[slot] };
      slots[slot] = {
        ...existing,
        connected,
        name: existing.name || SPEAKER_NAMES[slot],
        lastSeenAt: connected ? Date.now() : existing.lastSeenAt,
      };
      updateRoomState(current.id, { ...current.state, speakerSlots: slots }).catch(() => {});
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
    if (e.type === "test-tone" && e.slot === slot) {
      const a = new Audio(
        `/api/speak?text=${encodeURIComponent(`Speaker ${slot}, ${SPEAKER_NAMES[slot]}, online.`)}`,
      );
      a.play().catch(() => {});
    }
    if (e.type === "speak" && e.slot === slot) {
      const a = new Audio(`/api/speak?text=${encodeURIComponent(e.text)}`);
      a.play().catch(() => {});
    }
  });
  void send;

  if (loading)
    return (
      <Shell>
        <div className="text-white/70">Загружаем…</div>
      </Shell>
    );
  if (error || !room)
    return (
      <Shell>
        <div className="text-white/80 text-center">
          Комната не найдена.
          <div>
            <Link to="/" className="underline">
              на главную
            </Link>
          </div>
        </div>
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
          slot={slot}
          mix={activeMix}
          startAt={snd?.playback?.startAt ?? null}
          intro={null}
        />
      )}

      <div className="w-full max-w-md text-center text-white">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
          Колонка {slot} · комната {code}
        </div>
        <h1 className="font-display text-5xl mt-2">{SPEAKER_NAMES[slot]}</h1>

        {!armed ? (
          <>
            <p className="mt-3 text-white/70 text-sm">
              3 шага — и этот телефон станет «голосом» парка.
            </p>
            <ol className="mt-5 text-left space-y-3">
              <SpeakerStep n={1} title="Подключи Bluetooth-колонку">
                Настройки → Bluetooth → найди колонку → подключись. Громкость на максимум.
              </SpeakerStep>
              <SpeakerStep n={2} title="Поставь у дерева">
                Чем дальше друг от друга колонки, тем интереснее. Не оставляй без присмотра 😉
              </SpeakerStep>
              <SpeakerStep n={3} title="Нажми кнопку и не блокируй экран">
                Браузеры не дают играть звук, пока ты не разрешишь. Жми кнопку — и спрячь телефон в
                карман, не выключая экран.
              </SpeakerStep>
            </ol>
            <button
              onClick={() => {
                const a = new Audio();
                a.muted = true;
                a.play().catch(() => {});
                setArmed(true);
              }}
              className="mt-5 w-full rounded-3xl bg-white text-[oklch(0.18_0.05_160)] py-6 text-xl font-display"
            >
              ▶ Включить колонку
            </button>
            <p className="mt-3 text-xs text-white/60">
              Ведущий нажмёт «🔊 тест» — ты должен услышать голос.
            </p>
          </>
        ) : (
          <div
            className={`mt-8 rounded-3xl border border-white/20 p-6 ${snd?.phase === "playback" ? "bg-[var(--color-park-bright)]/20 animate-pulse" : "bg-white/5"}`}
          >
            <div className="text-sm uppercase tracking-widest text-white/70">
              {room.state.paused
                ? "Пауза"
                : snd?.phase === "playback"
                  ? "Выступаю"
                  : snd?.phase
                    ? `Жду · ${snd.phase}`
                    : "На связи"}
            </div>
            <div className="font-display text-3xl mt-1">
              {room.state.paused
                ? "||"
                : snd?.phase === "playback"
                  ? (activeMix?.cues.filter((c) => c.slot === slot).length ?? 0) + " реплик"
                  : "✓"}
            </div>
            <p className="text-xs text-white/60 mt-3">
              Не выключай экран. Колонка ждёт сигнала от AI.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function SpeakerStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-2xl bg-black/30 backdrop-blur border border-white/10 p-3.5">
      <span className="shrink-0 size-7 grid place-items-center rounded-full bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-display text-sm">
        {n}
      </span>
      <div>
        <div className="font-medium text-white text-sm">{title}</div>
        <div className="text-white/70 text-xs mt-0.5">{children}</div>
      </div>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh park-gradient flex items-center justify-center px-5">
      {children}
    </main>
  );
}
