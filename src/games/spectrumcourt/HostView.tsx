import { useEffect, useRef, useState } from "react";
import { updateRoomState } from "@/lib/room";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import {
  SPECTRUM_COURT_APPEAL_MS,
  SPECTRUM_COURT_GUESS_MS,
  SPECTRUM_COURT_REVEAL_MS,
} from "@/lib/host-controls";
import type { RoomState, SpectrumCourtState, Team } from "@/lib/types";
import { pickSpectrumPrompt, randomSpectrumTarget } from "./catalog";
import { scoreSpectrumCourtRound } from "./scoring";

function speak(text: string) {
  const a = new Audio(`/api/speak?text=${encodeURIComponent(text)}`);
  a.play().catch(() => {});
}

function activeTeams(state: RoomState) {
  const activeIds = new Set(state.players.map((player) => player.teamId));
  return state.teams.filter((team) => activeIds.has(team.id));
}

function teamName(state: RoomState, teamId?: string) {
  return state.teams.find((team) => team.id === teamId)?.name ?? "Команда";
}

export function SpectrumCourtHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const sc = state.spectrumcourt!;
  const [now, setNow] = useState(Date.now());
  const introSpokenRef = useRef(false);
  const scoredRoundRef = useRef<string | null>(null);
  const advancedRoundRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const update = (patch: Partial<SpectrumCourtState>) =>
    updateRoomState(roomId, { ...state, spectrumcourt: { ...sc, ...patch } });

  function startRound() {
    const teams = activeTeams(state);
    if (teams.length < 2) return;
    const clueTeam = teams[(sc.roundNumber - 1) % teams.length];
    const prompt = pickSpectrumPrompt(sc.usedSpectrumIds);
    void update({
      phase: "clue",
      spectrumId: prompt.id,
      leftLabel: prompt.leftLabel,
      rightLabel: prompt.rightLabel,
      prompt: prompt.prompt,
      target: randomSpectrumTarget(),
      clueTeamId: clueTeam.id,
      cluePlayerId: undefined,
      clue: undefined,
      guesses: {},
      appeals: {},
      guessEndsAt: undefined,
      appealEndsAt: undefined,
      revealEndsAt: undefined,
      usedSpectrumIds: [...sc.usedSpectrumIds, prompt.id],
    });
  }

  useEffect(() => {
    if (state.paused) return;
    if (sc.phase !== "briefing") return;
    if (introSpokenRef.current) return;
    introSpokenRef.current = true;
    speak(
      "Spectrum Court. Команда получает скрытую точку на шкале, дает подсказку, остальные спорят и ставят маркер.",
    );
    const t = window.setTimeout(() => startRound(), 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, sc.phase]);

  useEffect(() => {
    if (state.paused) return;
    if (sc.phase !== "clue" || !sc.clue) return;
    const t = window.setTimeout(() => {
      void update({ phase: "guessing", guessEndsAt: Date.now() + SPECTRUM_COURT_GUESS_MS });
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, sc.phase, sc.clue]);

  useEffect(() => {
    if (state.paused) return;
    if (sc.phase !== "guessing") return;
    if (!sc.guessEndsAt || now < sc.guessEndsAt) return;
    void update({
      phase: "appeal",
      appealEndsAt: Date.now() + SPECTRUM_COURT_APPEAL_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, sc.phase, sc.guessEndsAt, now]);

  useEffect(() => {
    if (state.paused) return;
    if (sc.phase !== "appeal") return;
    if (!sc.appealEndsAt || now < sc.appealEndsAt) return;
    const key = `${sc.roundId}:${sc.roundNumber}:${sc.spectrumId}`;
    if (scoredRoundRef.current === key) return;
    scoredRoundRef.current = key;

    const scored = scoreSpectrumCourtRound(state, sc);
    if (!scored) return;
    speak(`Вердикт суда. Цель была ${sc.target} из 100.`);
    void updateRoomState(roomId, {
      ...state,
      teams: scored.teams,
      spectrumcourt: {
        ...sc,
        phase: "reveal",
        roundResults: [...(sc.roundResults ?? []), scored.roundResult],
        revealEndsAt: Date.now() + SPECTRUM_COURT_REVEAL_MS,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, sc.phase, sc.appealEndsAt, now]);

  useEffect(() => {
    if (state.paused) return;
    if (sc.phase !== "reveal") return;
    if (!sc.revealEndsAt || now < sc.revealEndsAt) return;
    const key = `${sc.roundId}:advance:${sc.roundNumber}`;
    if (advancedRoundRef.current === key) return;
    advancedRoundRef.current = key;

    if (sc.roundNumber >= sc.totalRounds) {
      void update({ phase: "results" });
      return;
    }

    const teams = activeTeams(state);
    if (teams.length < 2) {
      void update({ phase: "results" });
      return;
    }
    const nextRoundNumber = sc.roundNumber + 1;
    const clueTeam = teams[(nextRoundNumber - 1) % teams.length];
    const prompt = pickSpectrumPrompt(sc.usedSpectrumIds);
    void update({
      phase: "clue",
      roundNumber: nextRoundNumber,
      spectrumId: prompt.id,
      leftLabel: prompt.leftLabel,
      rightLabel: prompt.rightLabel,
      prompt: prompt.prompt,
      target: randomSpectrumTarget(),
      clueTeamId: clueTeam.id,
      cluePlayerId: undefined,
      clue: undefined,
      guesses: {},
      appeals: {},
      guessEndsAt: undefined,
      appealEndsAt: undefined,
      revealEndsAt: undefined,
      usedSpectrumIds: [...sc.usedSpectrumIds, prompt.id],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, sc.phase, sc.revealEndsAt, sc.roundNumber, now]);

  return (
    <div className="rounded-3xl border border-white/10 bg-card p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Spectrum Court
          </div>
          <h2 className="font-display text-3xl mt-1">
            Раунд {Math.min(sc.roundNumber, sc.totalRounds)} / {sc.totalRounds}
          </h2>
        </div>
        <PhasePill phase={sc.phase} />
      </header>

      {sc.phase === "briefing" && (
        <Panel title="Суд собирается">
          <p className="text-muted-foreground">
            Сейчас одна команда увидит скрытую точку на шкале и даст подсказку. Остальные будут
            спорить, где она находится.
          </p>
        </Panel>
      )}

      {sc.phase !== "briefing" && sc.phase !== "results" && (
        <Panel title={sc.prompt ?? "Шкала"}>
          <SpectrumScale state={state} sc={sc} now={now} />
          {sc.phase === "clue" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Подсказку дает команда{" "}
              <span className="text-foreground font-medium">{teamName(state, sc.clueTeamId)}</span>.
              Цель скрыта от остальных.
            </p>
          )}
          {sc.clue && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Подсказка
              </div>
              <div className="font-display text-2xl mt-1">{sc.clue}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {state.players.find((player) => player.id === sc.cluePlayerId)?.name ??
                  teamName(state, sc.clueTeamId)}
              </div>
            </div>
          )}
          {sc.phase === "guessing" && <GuessTally state={state} sc={sc} />}
          {sc.phase === "appeal" && <AppealTally state={state} sc={sc} />}
          {sc.phase === "reveal" && <Reveal state={state} sc={sc} />}
        </Panel>
      )}

      {sc.phase === "results" && (
        <Panel title="Итоги суда">
          <div className="space-y-2">
            {(sc.roundResults ?? []).map((result, index) => (
              <div key={`${result.spectrumId}-${index}`} className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Раунд {index + 1} · {teamName(state, result.clueTeamId)}
                </div>
                <div className="mt-1 font-medium">
                  {result.leftLabel} ← {result.target} → {result.rightLabel}
                </div>
                <div className="text-sm text-muted-foreground">“{result.clue}”</div>
              </div>
            ))}
          </div>
          <ScoreGrid teams={state.teams} />
          <button
            type="button"
            onClick={() =>
              updateRoomState(roomId, {
                ...state,
                status: "lobby",
                currentGame: null,
                spectrumcourt: undefined,
              })
            }
            className="mt-4 rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm"
          >
            ↺ В лобби
          </button>
        </Panel>
      )}
    </div>
  );
}

function PhasePill({ phase }: { phase: SpectrumCourtState["phase"] }) {
  const label = {
    briefing: "Старт",
    clue: "Подсказка",
    guessing: "Маркер",
    appeal: "Апелляция",
    reveal: "Вердикт",
    results: "Итоги",
  }[phase];
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-widest">
      {label}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="font-display text-xl">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SpectrumScale({
  state,
  sc,
  now,
}: {
  state: RoomState;
  sc: SpectrumCourtState;
  now: number;
}) {
  const targetVisible = sc.phase === "clue" || sc.phase === "reveal";
  const teamGuesses = teamGuessPositions(state, sc);
  const timer =
    sc.phase === "guessing" && sc.guessEndsAt
      ? sc.guessEndsAt - now
      : sc.phase === "appeal" && sc.appealEndsAt
        ? sc.appealEndsAt - now
        : sc.phase === "reveal" && sc.revealEndsAt
          ? sc.revealEndsAt - now
          : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{sc.leftLabel}</span>
        {timer != null && (
          <span className="font-display text-3xl tabular-nums">{formatClock(timer)}</span>
        )}
        <span className="text-right">{sc.rightLabel}</span>
      </div>
      <div className="relative h-14 rounded-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-rose-400">
        {targetVisible && typeof sc.target === "number" && (
          <Marker value={sc.target} label="цель" className="bg-black text-white" />
        )}
        {teamGuesses.map((guess) => (
          <Marker
            key={guess.team.id}
            value={guess.value}
            label={guess.team.name}
            className={teamColorClasses(guess.team.color).bg}
          />
        ))}
      </div>
    </div>
  );
}

function Marker({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-center"
      style={{ left: `${value}%` }}
    >
      <div className={`mx-auto size-5 rounded-full ring-2 ring-white ${className}`} />
      <div className="mt-1 max-w-20 truncate rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
        {label}
      </div>
    </div>
  );
}

function teamGuessPositions(state: RoomState, sc: SpectrumCourtState) {
  return state.teams
    .filter((team) => team.id !== sc.clueTeamId)
    .map((team) => {
      const values = state.players
        .filter((player) => player.teamId === team.id)
        .map((player) => sc.guesses?.[player.id])
        .filter((value): value is number => typeof value === "number");
      if (values.length === 0) return null;
      return {
        team,
        value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      };
    })
    .filter((entry): entry is { team: Team; value: number } => entry != null);
}

function GuessTally({ state, sc }: { state: RoomState; sc: SpectrumCourtState }) {
  const eligible = state.players.filter((player) => player.teamId !== sc.clueTeamId);
  const voted = eligible.filter((player) => typeof sc.guesses?.[player.id] === "number").length;
  return (
    <p className="text-sm text-muted-foreground mt-4">
      Маркеры поставили {voted} из {eligible.length} игроков.
    </p>
  );
}

function AppealTally({ state, sc }: { state: RoomState; sc: SpectrumCourtState }) {
  const appeals = Object.values(sc.appeals ?? {});
  const lower = appeals.filter((appeal) => appeal.direction === "lower").length;
  const higher = appeals.filter((appeal) => appeal.direction === "higher").length;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
      <div className="rounded-2xl bg-white/5 p-3">Левее: {lower}</div>
      <div className="rounded-2xl bg-white/5 p-3">Правее: {higher}</div>
      <div className="col-span-2 text-muted-foreground">
        Апелляция сдвигает маркер команды на 5 пунктов по большинству.
      </div>
    </div>
  );
}

function Reveal({ state, sc }: { state: RoomState; sc: SpectrumCourtState }) {
  const result = sc.roundResults?.[sc.roundResults.length - 1];
  if (!result) return null;
  return (
    <div className="mt-4 space-y-2">
      {result.teamResults.map((teamResult) => {
        const team = state.teams.find((entry) => entry.id === teamResult.teamId);
        if (!team) return null;
        return (
          <div
            key={teamResult.teamId}
            className={`rounded-2xl border px-3 py-2 ${teamColorClasses(team.color).chip}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{team.name}</span>
              <span className="font-display text-xl">+{teamResult.points}</span>
            </div>
            <div className="text-xs opacity-75">
              Маркер {teamResult.finalGuess}, дистанция {teamResult.distance}
              {teamResult.appealDirection
                ? `, апелляция ${teamResult.appealDirection === "higher" ? "правее" : "левее"}`
                : ""}
            </div>
          </div>
        );
      })}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
        Команда подсказки {teamName(state, result.clueTeamId)} получает +{result.clueTeamPoints}.
      </div>
    </div>
  );
}

function ScoreGrid({ teams }: { teams: Team[] }) {
  return (
    <div className="mt-4 grid sm:grid-cols-2 gap-2">
      {[...teams]
        .sort((a, b) => b.score - a.score)
        .map((team) => (
          <div
            key={team.id}
            className={`rounded-2xl border px-3 py-2 ${teamColorClasses(team.color).chip}`}
          >
            <div className="font-medium">{team.name}</div>
            <div className="font-display text-2xl tabular-nums">{team.score}</div>
          </div>
        ))}
    </div>
  );
}
