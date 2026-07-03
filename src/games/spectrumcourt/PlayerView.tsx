import { useEffect, useState } from "react";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { postPlayerAction } from "@/lib/player-action-client";
import { formatClock } from "@/lib/team-style";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import { eventProfile } from "@/lib/event-profile";
import { useLocalDraft } from "@/lib/use-local-draft";
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
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [clue, setClue, clearClueDraft] = useLocalDraft(
    `${eventProfile.storagePrefix}:draft:${roomId}:${me.id}:spectrumcourt:${sc.roundId}:clue`,
  );
  const [guess, setGuess] = useState(50);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const isClueTeam = me.teamId === sc.clueTeamId;
  const myGuess = sc.guesses?.[me.id];
  const myAppeal = sc.appeals?.[me.id];

  useEffect(() => {
    setPendingAction(null);
    setActionError(null);
  }, [sc.phase, sc.roundNumber, sc.spectrumId]);

  useEffect(() => {
    setGuess(typeof myGuess === "number" ? myGuess : 50);
  }, [myGuess, sc.roundNumber, sc.spectrumId]);

  async function submitClue() {
    const trimmed = clue.trim();
    if (!trimmed || pendingAction) return;
    setPendingAction("clue");
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "spectrumcourt-clue",
        playerId: me.id,
        clue: trimmed,
      });
      clearClueDraft();
    } catch (error) {
      setActionError(friendlyPlayerActionError(error, "clue"));
    } finally {
      setPendingAction(null);
    }
  }

  async function submitGuess(value: number) {
    if (pendingAction) return;
    setPendingAction("guess");
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "spectrumcourt-guess",
        playerId: me.id,
        value,
      });
    } catch (error) {
      setActionError(friendlyPlayerActionError(error, "marker"));
    } finally {
      setPendingAction(null);
    }
  }

  async function submitAppeal(direction: SpectrumCourtAppeal["direction"]) {
    if (pendingAction) return;
    setPendingAction(`appeal-${direction}`);
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "spectrumcourt-appeal",
        playerId: me.id,
        direction,
      });
    } catch (error) {
      setActionError(friendlyPlayerActionError(error, "appeal"));
    } finally {
      setPendingAction(null);
    }
  }

  if (sc.phase === "briefing") {
    return (
      <Card>
        <Pill>Spectrum Court</Pill>
        <H>A spectrum is coming</H>
        <P>
          One team gets a clue to a hidden point. Everyone else argues, places a marker, and can
          file an appeal.
        </P>
        <GameRulesChecklist gameId="spectrumcourt" />
      </Card>
    );
  }

  if (sc.phase === "clue") {
    if (!isClueTeam) {
      return (
        <Card>
          <Pill>Waiting for clue</Pill>
          <H>
            {sc.leftLabel} ↔ {sc.rightLabel}
          </H>
          <P>The clue team sees the hidden point. Get your arguments ready.</P>
        </Card>
      );
    }

    if (sc.clue) {
      return (
        <Card>
          <Pill>Clue submitted</Pill>
          <H>“{sc.clue}”</H>
          <P>Other teams are placing their markers now.</P>
        </Card>
      );
    }

    return (
      <Card>
        <Pill>You&apos;re on the clue team</Pill>
        <H>
          {sc.leftLabel} ← {sc.target} → {sc.rightLabel}
        </H>
        <P>{sc.prompt}. Give a clue that nudges everyone toward this spot on the spectrum.</P>
        <input
          value={clue}
          onChange={(event) => setClue(event.target.value)}
          maxLength={80}
          placeholder="e.g. matching tattoos on a first date"
          className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 text-white placeholder-white/35 outline-none focus:bg-white/15"
        />
        <button
          type="button"
          onClick={() => void submitClue()}
          disabled={!!pendingAction || !clue.trim()}
          className="mt-3 w-full rounded-2xl bg-[var(--color-park-bright)] px-4 py-3 font-medium text-[oklch(0.16_0.05_160)] disabled:opacity-40"
        >
          {pendingAction === "clue" ? "Sending…" : "Submit clue"}
        </button>
        {actionError && <ActionError>{actionError}</ActionError>}
      </Card>
    );
  }

  if (sc.phase === "guessing") {
    const remaining = Math.max(0, (sc.guessEndsAt ?? now) - now);
    if (isClueTeam) {
      return (
        <Card>
          <Pill>{formatClock(remaining)}</Pill>
          <H>No gesturing</H>
          <P>Other teams are placing markers from your clue: “{sc.clue}”.</P>
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
          disabled={!!pendingAction}
          className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 font-medium text-white hover:bg-white/15"
        >
          {pendingAction === "guess"
            ? "Sending…"
            : typeof myGuess === "number"
              ? "Update marker"
              : "Place marker"}
        </button>
        {actionError && <ActionError>{actionError}</ActionError>}
      </Card>
    );
  }

  if (sc.phase === "appeal") {
    const remaining = Math.max(0, (sc.appealEndsAt ?? now) - now);
    if (isClueTeam) {
      return (
        <Card>
          <Pill>{formatClock(remaining)}</Pill>
          <H>Appeal</H>
          <P>Teams can shift their marker 5 points left or right.</P>
        </Card>
      );
    }
    return (
      <Card>
        <Pill>{formatClock(remaining)}</Pill>
        <H>Last chance to argue</H>
        <P>Think your marker is a bit off? Tap a direction.</P>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void submitAppeal("lower")}
            disabled={!!pendingAction}
            className={`rounded-2xl border px-4 py-5 ${myAppeal?.direction === "lower" ? "border-[var(--color-park-bright)] bg-[var(--color-park-bright)]/20" : "border-white/10 bg-white/10"}`}
          >
            {pendingAction === "appeal-lower" ? "Sending…" : "← Left"}
          </button>
          <button
            type="button"
            onClick={() => void submitAppeal("higher")}
            disabled={!!pendingAction}
            className={`rounded-2xl border px-4 py-5 ${myAppeal?.direction === "higher" ? "border-[var(--color-park-bright)] bg-[var(--color-park-bright)]/20" : "border-white/10 bg-white/10"}`}
          >
            {pendingAction === "appeal-higher" ? "Sending…" : "Right →"}
          </button>
        </div>
        {actionError && <ActionError>{actionError}</ActionError>}
      </Card>
    );
  }

  if (sc.phase === "reveal") {
    const result = sc.roundResults?.[sc.roundResults.length - 1];
    const teamResult = result?.teamResults.find((entry) => entry.teamId === me.teamId);
    return (
      <Card>
        <Pill>Verdict</Pill>
        <H>
          Target was {sc.target}: {sc.leftLabel} ↔ {sc.rightLabel}
        </H>
        {teamResult ? (
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3">
            <div className="text-sm text-white/60">Your team</div>
            <div className="font-display text-3xl">+{teamResult.points}</div>
            <div className="text-sm text-white/60">
              Marker {teamResult.finalGuess}, distance {teamResult.distance}
            </div>
          </div>
        ) : (
          <P>The clue team scores based on the best marker from everyone else.</P>
        )}
      </Card>
    );
  }

  if (sc.phase === "results") {
    return (
      <Card>
        <Pill>Final</Pill>
        <H>Check the host screen</H>
        <P>Final Spectrum Court leaderboard is up there.</P>
      </Card>
    );
  }

  return (
    <Card>
      <H>Hang tight…</H>
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

function ActionError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/15 px-4 py-3 text-center text-sm text-red-100">
      {children}
    </p>
  );
}
