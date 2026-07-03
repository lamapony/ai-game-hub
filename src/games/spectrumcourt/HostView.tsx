import { useEffect, useRef, useState } from "react";
import { updateRoomState } from "@/lib/room";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import {
  SPECTRUM_COURT_APPEAL_MS,
  SPECTRUM_COURT_CLUE_MS,
  SPECTRUM_COURT_GUESS_MS,
  SPECTRUM_COURT_REVEAL_MS,
  spectrumCourtFallbackClue,
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
  return state.teams.find((team) => team.id === teamId)?.name ?? "Team";
}

export function SpectrumCourtHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const sc = state.spectrumcourt!;
  const [now, setNow] = useState(Date.now());
  const introSpokenRef = useRef(false);
  const scoredRoundRef = useRef<string | null>(null);
  const advancedRoundRef = useRef<string | null>(null);
  const clueTimeoutRef = useRef<string | null>(null);

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
      clueEndsAt: Date.now() + SPECTRUM_COURT_CLUE_MS,
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
      "Spectrum Court. One team gets a hidden point on the spectrum, gives a clue, everyone else argues and places a marker.",
    );
    const t = window.setTimeout(() => startRound(), 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, sc.phase]);

  useEffect(() => {
    if (state.paused) return;
    if (sc.phase !== "clue" || sc.clue) return;
    if (!sc.clueEndsAt || now < sc.clueEndsAt) return;
    const key = `${sc.roundId}:${sc.roundNumber}:clue-timeout`;
    if (clueTimeoutRef.current === key) return;
    clueTimeoutRef.current = key;
    const cluePlayer =
      state.players.find((player) => player.teamId === sc.clueTeamId)?.id ?? "host";
    void update({
      clue: spectrumCourtFallbackClue(sc),
      cluePlayerId: cluePlayer,
      phase: "guessing",
      clueEndsAt: undefined,
      guessEndsAt: Date.now() + SPECTRUM_COURT_GUESS_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, sc.phase, sc.clue, sc.clueEndsAt, now]);

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
    if (!scored) {
      void update({
        phase: "reveal",
        revealEndsAt: Date.now() + SPECTRUM_COURT_REVEAL_MS,
      });
      return;
    }
    speak(`Court verdict. Target was ${sc.target} out of 100.`);
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
      clueEndsAt: Date.now() + SPECTRUM_COURT_CLUE_MS,
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
            Round {Math.min(sc.roundNumber, sc.totalRounds)} / {sc.totalRounds}
          </h2>
        </div>
        <PhasePill phase={sc.phase} />
      </header>

      {sc.phase === "briefing" && (
        <Panel title="Court is assembling">
          <p className="text-muted-foreground">
            One team will see a hidden point on the spectrum and give a clue. Everyone else argues
            about where it lands.
          </p>
        </Panel>
      )}

      {sc.phase !== "briefing" && sc.phase !== "results" && (
        <Panel title={sc.prompt ?? "Spectrum"}>
          <SpectrumScale state={state} sc={sc} now={now} />
          {sc.phase === "clue" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Clue from{" "}
              <span className="text-foreground font-medium">{teamName(state, sc.clueTeamId)}</span>.
              Target hidden from everyone else.
              {!sc.clue && sc.clueEndsAt && (
                <span className="block mt-1">
                  Time left: {formatClock(Math.max(0, sc.clueEndsAt - now))}
                </span>
              )}
            </p>
          )}
          {sc.clue && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Clue</div>
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
        <Panel title="Court results">
          <div className="space-y-2">
            {(sc.roundResults ?? []).map((result, index) => (
              <div key={`${result.spectrumId}-${index}`} className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Round {index + 1} · {teamName(state, result.clueTeamId)}
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
            ↺ Back to lobby
          </button>
        </Panel>
      )}
    </div>
  );
}

function PhasePill({ phase }: { phase: SpectrumCourtState["phase"] }) {
  const label = {
    briefing: "Start",
    clue: "Clue",
    guessing: "Marker",
    appeal: "Appeal",
    reveal: "Verdict",
    results: "Results",
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
    sc.phase === "clue" && sc.clueEndsAt && !sc.clue
      ? sc.clueEndsAt - now
      : sc.phase === "guessing" && sc.guessEndsAt
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
          <Marker value={sc.target} label="target" className="bg-black text-white" />
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
      {voted} of {eligible.length} players placed markers.
    </p>
  );
}

function AppealTally({ state, sc }: { state: RoomState; sc: SpectrumCourtState }) {
  const appeals = Object.values(sc.appeals ?? {});
  const lower = appeals.filter((appeal) => appeal.direction === "lower").length;
  const higher = appeals.filter((appeal) => appeal.direction === "higher").length;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
      <div className="rounded-2xl bg-white/5 p-3">Left: {lower}</div>
      <div className="rounded-2xl bg-white/5 p-3">Right: {higher}</div>
      <div className="col-span-2 text-muted-foreground">
        An appeal shifts a team&apos;s marker 5 points by majority vote.
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
              Marker {teamResult.finalGuess}, distance {teamResult.distance}
              {teamResult.appealDirection
                ? `, appeal ${teamResult.appealDirection === "higher" ? "right" : "left"}`
                : ""}
            </div>
          </div>
        );
      })}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
        Clue team {teamName(state, result.clueTeamId)} gets +{result.clueTeamPoints}.
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
