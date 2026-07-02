import { useEffect, useRef, useState } from "react";
import { updateRoomState } from "@/lib/room";
import { formatClock } from "@/lib/team-style";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import type { RoomState } from "@/lib/types";

export function TrackGuessPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const tg = state.trackguess!;
  const [now, setNow] = useState(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (state.paused || tg.phase !== "listening" || !tg.trackUrl) return;
    const audio = new Audio(tg.trackUrl);
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [state.paused, tg.phase, tg.trackUrl, tg.roundNumber]);

  useEffect(() => {
    if (!state.paused) return;
    audioRef.current?.pause();
  }, [state.paused]);

  const myGuess = tg.guesses?.[me.id];

  async function guess(choice: "real" | "ai") {
    const guesses = { ...(tg.guesses ?? {}), [me.id]: choice };
    await updateRoomState(roomId, { ...state, trackguess: { ...tg, guesses } });
  }

  if (tg.phase === "briefing") {
    return (
      <Card>
        <Pill>Готовь уши</Pill>
        <H>Настоящий или AI?</H>
        <P>
          Скоро пойдёт трек. Слушай внимательно — потом выбери: живой трек или сгенерированный
          нейросетью. {tg.totalRounds} раундов, +2 очка команде за угадывание.
        </P>
        <GameRulesChecklist gameId="trackguess" />
      </Card>
    );
  }

  if (tg.phase === "listening") {
    const remaining = Math.max(0, (tg.listeningEndsAt ?? now) - now);
    return (
      <Card>
        <Pill>Раунд {tg.roundNumber}</Pill>
        <H>{tg.trackTitle ?? "Слушаем…"}</H>
        <div className="font-display text-4xl tabular-nums mt-2">{formatClock(remaining)}</div>
        <P>{tg.trackGenre}</P>
        {tg.trackUrl && <audio src={tg.trackUrl} controls className="mt-4 w-full" />}
        <P className="mt-3">Не спеши — скоро попросят проголосовать.</P>
      </Card>
    );
  }

  if (tg.phase === "guessing") {
    const remaining = Math.max(0, (tg.guessEndsAt ?? now) - now);
    if (myGuess) {
      return (
        <Card>
          <Pill>Голос принят</Pill>
          <H>{myGuess === "ai" ? "🤖 AI" : "🎸 Настоящий"}</H>
          <div className="text-right text-xs text-white/60 mt-1 tabular-nums">
            {formatClock(remaining)}
          </div>
          <P>Ждём остальных… Ответ покажет ведущий.</P>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <Card compact>
          <Pill>
            Раунд {tg.roundNumber} · {formatClock(remaining)}
          </Pill>
          <H>Что это было?</H>
          <P>
            «{tg.trackTitle}» — {tg.trackGenre}
          </P>
        </Card>
        <button
          type="button"
          onClick={() => void guess("real")}
          className="w-full rounded-3xl border border-[var(--color-park-bright)]/40 bg-[var(--color-park-bright)]/15 py-6 text-white"
        >
          <div className="text-3xl">🎸</div>
          <div className="font-display text-2xl mt-1">Настоящий трек</div>
          <div className="text-xs text-white/60 mt-1">Живой артист / студия</div>
        </button>
        <button
          type="button"
          onClick={() => void guess("ai")}
          className="w-full rounded-3xl border border-violet-400/40 bg-violet-500/15 py-6 text-white"
        >
          <div className="text-3xl">🤖</div>
          <div className="font-display text-2xl mt-1">AI-трек</div>
          <div className="text-xs text-white/60 mt-1">Сгенерировано нейросетью</div>
        </button>
      </div>
    );
  }

  if (tg.phase === "reveal" && typeof tg.isAi === "boolean") {
    const correct = myGuess != null && myGuess === (tg.isAi ? "ai" : "real");
    return (
      <Card>
        <Pill>{tg.isAi ? "🤖 AI" : "🎸 Настоящий"}</Pill>
        <H>{tg.trackTitle}</H>
        <div
          className={`mt-3 rounded-2xl px-4 py-3 text-center ${correct ? "bg-[var(--color-park-bright)]/20 text-[var(--color-park-bright)]" : "bg-white/10 text-white/80"}`}
        >
          {myGuess == null
            ? "Ты не успел проголосовать"
            : correct
              ? "✓ Верно! +2 команде"
              : `✗ Ты выбрал ${myGuess === "ai" ? "AI" : "настоящий"}`}
        </div>
      </Card>
    );
  }

  if (tg.phase === "results") {
    return (
      <Card>
        <Pill>Финал</Pill>
        <H>Смотри экран ведущего</H>
        <P>Там итоговая таблица и разбор всех треков.</P>
      </Card>
    );
  }

  return (
    <Card>
      <H>Жди…</H>
    </Card>
  );
}

function Card({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      className={`rounded-3xl bg-black/40 backdrop-blur border border-white/10 text-white ${compact ? "p-5" : "p-8 text-center"}`}
    >
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
  return <div className="font-display text-2xl mt-2">{children}</div>;
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-white/65 text-sm mt-2 leading-relaxed ${className ?? ""}`}>{children}</p>
  );
}
