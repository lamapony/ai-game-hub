import { useEffect, useState } from "react";
import { updateRoomState } from "@/lib/room";
import { formatClock } from "@/lib/team-style";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import type { RoomState, SpectrumCourtAppeal } from "@/lib/types";

export function SpectrumCourtPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const sc = state.spectrumcourt!;
  const [now, setNow] = useState(Date.now());
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState(50);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const isClueTeam = me.teamId === sc.clueTeamId;
  const myGuess = sc.guesses?.[me.id];
  const myAppeal = sc.appeals?.[me.id];

  useEffect(() => {
    setGuess(typeof myGuess === "number" ? myGuess : 50);
  }, [myGuess, sc.roundNumber, sc.spectrumId]);

  async function submitClue() {
    const trimmed = clue.trim();
    if (!trimmed) return;
    await updateRoomState(roomId, {
      ...state,
      spectrumcourt: {
        ...sc,
        clue: trimmed.slice(0, 80),
        cluePlayerId: me.id,
      },
    });
  }

  async function submitGuess(value: number) {
    await updateRoomState(roomId, {
      ...state,
      spectrumcourt: {
        ...sc,
        guesses: { ...(sc.guesses ?? {}), [me.id]: value },
      },
    });
  }

  async function submitAppeal(direction: SpectrumCourtAppeal["direction"]) {
    await updateRoomState(roomId, {
      ...state,
      spectrumcourt: {
        ...sc,
        appeals: { ...(sc.appeals ?? {}), [me.id]: { direction } },
      },
    });
  }

  if (sc.phase === "briefing") {
    return (
      <Card>
        <Pill>Spectrum Court</Pill>
        <H>Сейчас будет шкала</H>
        <P>
          Одна команда даст подсказку к скрытой точке. Остальные спорят, ставят маркер и могут
          подать апелляцию.
        </P>
        <GameRulesChecklist gameId="spectrumcourt" />
      </Card>
    );
  }

  if (sc.phase === "clue") {
    if (!isClueTeam) {
      return (
        <Card>
          <Pill>Ждём подсказку</Pill>
          <H>
            {sc.leftLabel} ↔ {sc.rightLabel}
          </H>
          <P>Команда подсказки видит скрытую точку. Готовь аргументы для спора.</P>
        </Card>
      );
    }

    if (sc.clue) {
      return (
        <Card>
          <Pill>Подсказка принята</Pill>
          <H>“{sc.clue}”</H>
          <P>Сейчас остальные команды будут ставить маркер.</P>
        </Card>
      );
    }

    return (
      <Card>
        <Pill>Ты в команде подсказки</Pill>
        <H>
          {sc.leftLabel} ← {sc.target} → {sc.rightLabel}
        </H>
        <P>{sc.prompt}. Дай подсказку, которая наведёт остальных на это место шкалы.</P>
        <input
          value={clue}
          onChange={(event) => setClue(event.target.value)}
          maxLength={80}
          placeholder="Например: парная татуировка на первом свидании"
          className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 text-white placeholder-white/35 outline-none focus:bg-white/15"
        />
        <button
          type="button"
          onClick={() => void submitClue()}
          disabled={!clue.trim()}
          className="mt-3 w-full rounded-2xl bg-[var(--color-park-bright)] px-4 py-3 font-medium text-[oklch(0.16_0.05_160)] disabled:opacity-40"
        >
          Отправить подсказку
        </button>
      </Card>
    );
  }

  if (sc.phase === "guessing") {
    const remaining = Math.max(0, (sc.guessEndsAt ?? now) - now);
    if (isClueTeam) {
      return (
        <Card>
          <Pill>{formatClock(remaining)}</Pill>
          <H>Не подсказывай жестами</H>
          <P>Остальные команды ставят маркер по вашей подсказке: “{sc.clue}”.</P>
        </Card>
      );
    }

    return (
      <Card>
        <Pill>{formatClock(remaining)}</Pill>
        <H>{sc.clue}</H>
        <P>
          {sc.leftLabel} ↔ {sc.rightLabel}
        </P>
        <div className="mt-5">
          <input
            type="range"
            min={0}
            max={100}
            value={guess}
            onChange={(event) => setGuess(Number(event.target.value))}
            className="w-full accent-[var(--color-park-bright)]"
          />
          <div className="mt-2 flex justify-between text-xs text-white/55">
            <span>{sc.leftLabel}</span>
            <span className="font-mono text-white">{myGuess ?? guess}</span>
            <span>{sc.rightLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void submitGuess(guess)}
          className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 font-medium text-white hover:bg-white/15"
        >
          {typeof myGuess === "number" ? "Обновить маркер" : "Поставить маркер"}
        </button>
      </Card>
    );
  }

  if (sc.phase === "appeal") {
    const remaining = Math.max(0, (sc.appealEndsAt ?? now) - now);
    if (isClueTeam) {
      return (
        <Card>
          <Pill>{formatClock(remaining)}</Pill>
          <H>Апелляция</H>
          <P>Команды могут сдвинуть свой маркер на 5 пунктов левее или правее.</P>
        </Card>
      );
    }
    return (
      <Card>
        <Pill>{formatClock(remaining)}</Pill>
        <H>Последний спор</H>
        <P>Если команда думает, что маркер чуть не там, жмите направление.</P>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void submitAppeal("lower")}
            className={`rounded-2xl border px-4 py-5 ${myAppeal?.direction === "lower" ? "border-[var(--color-park-bright)] bg-[var(--color-park-bright)]/20" : "border-white/10 bg-white/10"}`}
          >
            ← Левее
          </button>
          <button
            type="button"
            onClick={() => void submitAppeal("higher")}
            className={`rounded-2xl border px-4 py-5 ${myAppeal?.direction === "higher" ? "border-[var(--color-park-bright)] bg-[var(--color-park-bright)]/20" : "border-white/10 bg-white/10"}`}
          >
            Правее →
          </button>
        </div>
      </Card>
    );
  }

  if (sc.phase === "reveal") {
    const result = sc.roundResults?.[sc.roundResults.length - 1];
    const teamResult = result?.teamResults.find((entry) => entry.teamId === me.teamId);
    return (
      <Card>
        <Pill>Вердикт</Pill>
        <H>
          Цель была {sc.target}: {sc.leftLabel} ↔ {sc.rightLabel}
        </H>
        {teamResult ? (
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3">
            <div className="text-sm text-white/60">Твоя команда</div>
            <div className="font-display text-3xl">+{teamResult.points}</div>
            <div className="text-sm text-white/60">
              Маркер {teamResult.finalGuess}, дистанция {teamResult.distance}
            </div>
          </div>
        ) : (
          <P>Команда подсказки получает очки за лучший маркер остальных.</P>
        )}
      </Card>
    );
  }

  if (sc.phase === "results") {
    return (
      <Card>
        <Pill>Финал</Pill>
        <H>Смотри экран ведущего</H>
        <P>Там итоговая таблица Spectrum Court.</P>
      </Card>
    );
  }

  return (
    <Card>
      <H>Жди…</H>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur border border-white/10 p-8 text-center text-white">
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

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-white/65 text-sm mt-2 leading-relaxed">{children}</p>;
}
