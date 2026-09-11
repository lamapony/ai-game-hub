import { useEffect, useRef, useState } from "react";
import { updateRoomState } from "@/lib/room";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import { WHO_AMONG_PLEA_MS, WHO_AMONG_REVEAL_MS, WHO_AMONG_VOTE_MS } from "@/lib/host-controls";
import type { RoomState, WhoAmongRoundResult, WhoAmongState } from "@/lib/types";
import { pickCatalogPrompt } from "./catalog";
import { scoreWhoAmongRound, tallyWhoAmongVotes, whoAmongIsLastLash } from "./scoring";
import { speechUrl } from "@/lib/speech-client";

function speak(text: string, roomId: string) {
  const a = new Audio(speechUrl(text, roomId));
  a.play().catch(() => {});
}

export function WhoAmongHost({
  roomId,
  state,
  onBackToHub,
}: {
  roomId: string;
  state: RoomState;
  onBackToHub: () => void | Promise<void>;
}) {
  const wa = state.whoamong!;
  const [now, setNow] = useState(Date.now());
  const introSpokenRef = useRef(false);
  const pleaOpenedRef = useRef<string | null>(null);
  const scoredRoundRef = useRef<string | null>(null);
  const advancedRoundRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const update = (patch: Partial<WhoAmongState>) =>
    updateRoomState(roomId, { ...state, whoamong: { ...wa, ...patch } });

  function nextPrompt(lastLash: boolean) {
    return pickCatalogPrompt(wa.usedPromptIds, Math.random(), {
      actId: state.party?.actId,
      preferHeat: lastLash ? 3 : undefined,
    });
  }

  function startRound(nowMs = Date.now()) {
    const lastLash = whoAmongIsLastLash({
      roundNumber: wa.roundNumber,
      totalRounds: wa.totalRounds,
    });
    const prompt = nextPrompt(lastLash);
    void update({
      phase: "voting",
      promptId: prompt.id,
      prompt: prompt.text,
      usedPromptIds: [...wa.usedPromptIds, prompt.id],
      votes: {},
      exhibits: {},
      pleas: {},
      provisionalStarIds: [],
      voteEndsAt: nowMs + WHO_AMONG_VOTE_MS,
      pleaEndsAt: undefined,
      revealEndsAt: undefined,
    });
  }

  // Briefing → first round
  useEffect(() => {
    if (state.paused) return;
    if (wa.phase !== "briefing") return;
    if (introSpokenRef.current) return;
    introSpokenRef.current = true;
    speak(
      `Who Among Us. ${wa.totalRounds} rounds. Vote who fits, file a one-line charge, then the accused testify. Last round is Last Lash — double points.`,
      roomId,
    );
    const t = window.setTimeout(() => startRound(), 3500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, wa.phase]);

  // voting → plea (or empty reveal)
  useEffect(() => {
    if (state.paused) return;
    if (wa.phase !== "voting") return;
    const voted = Object.keys(wa.votes ?? {}).length;
    const allVoted = state.players.length > 0 && voted >= state.players.length;
    const timerExpired = !!wa.voteEndsAt && now >= wa.voteEndsAt;
    if (!allVoted && !timerExpired) return;

    const key = `${wa.roundId}:${wa.roundNumber}:${wa.promptId}:plea`;
    if (pleaOpenedRef.current === key) return;
    pleaOpenedRef.current = key;

    const { starIds } = tallyWhoAmongVotes(wa.votes);
    if (starIds.length === 0) {
      const revealKey = `${wa.roundId}:${wa.roundNumber}:${wa.promptId}`;
      scoredRoundRef.current = revealKey;
      void update({
        phase: "reveal",
        provisionalStarIds: [],
        revealEndsAt: Date.now() + WHO_AMONG_REVEAL_MS,
        voteEndsAt: undefined,
        pleaEndsAt: undefined,
      });
      speak("Nobody filed a charge. The docket is empty.", roomId);
      return;
    }

    const starNames = starIds
      .map((id) => state.players.find((p) => p.id === id)?.name)
      .filter(Boolean);
    speak(`The docket is open. ${starNames.join(" and ")}, confess or deny.`, roomId);
    void update({
      phase: "plea",
      provisionalStarIds: starIds,
      pleas: {},
      voteEndsAt: undefined,
      pleaEndsAt: Date.now() + WHO_AMONG_PLEA_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, wa.phase, wa.voteEndsAt, wa.votes, now]);

  // plea → score → reveal
  useEffect(() => {
    if (state.paused) return;
    if (wa.phase !== "plea") return;
    const accused = wa.provisionalStarIds ?? [];
    const pleaded = accused.length > 0 && accused.every((id) => Boolean(wa.pleas?.[id]?.trim()));
    const timerExpired = !!wa.pleaEndsAt && now >= wa.pleaEndsAt;
    if (!pleaded && !timerExpired) return;

    const key = `${wa.roundId}:${wa.roundNumber}:${wa.promptId}`;
    if (scoredRoundRef.current === key) return;
    scoredRoundRef.current = key;

    const scored = scoreWhoAmongRound(state, wa);
    const revealEndsAt = Date.now() + WHO_AMONG_REVEAL_MS;

    if (!scored.roundResult) {
      void update({ phase: "reveal", revealEndsAt, pleaEndsAt: undefined });
      return;
    }

    const starNames = scored.roundResult.starIds
      .map((id) => state.players.find((p) => p.id === id)?.name)
      .filter(Boolean);
    const lash = scored.roundResult.lastLash ? " Last Lash." : "";
    if (starNames.length === 1) {
      speak(`Round star — ${starNames[0]}.${lash}`, roomId);
    } else if (starNames.length > 1) {
      speak(`Round stars — ${starNames.join(" and ")}.${lash}`, roomId);
    } else {
      speak("Nobody got votes this round.", roomId);
    }

    void updateRoomState(roomId, {
      ...state,
      teams: scored.teams,
      whoamong: {
        ...wa,
        phase: "reveal",
        roundResults: [...(wa.roundResults ?? []), scored.roundResult],
        revealEndsAt,
        pleaEndsAt: undefined,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, wa.phase, wa.pleaEndsAt, wa.pleas, now]);

  // reveal → next round or results
  useEffect(() => {
    if (state.paused) return;
    if (wa.phase !== "reveal") return;
    if (!wa.revealEndsAt || now < wa.revealEndsAt) return;

    const advanceKey = `${wa.roundId}:advance:${wa.roundNumber}`;
    if (advancedRoundRef.current === advanceKey) return;
    advancedRoundRef.current = advanceKey;

    if (wa.roundNumber >= wa.totalRounds) {
      void update({ phase: "results" });
      return;
    }

    const nextRound = wa.roundNumber + 1;
    const lastLash = nextRound >= wa.totalRounds;
    const prompt = pickCatalogPrompt(wa.usedPromptIds, Math.random(), {
      actId: state.party?.actId,
      preferHeat: lastLash ? 3 : undefined,
    });
    void updateRoomState(roomId, {
      ...state,
      whoamong: {
        ...wa,
        phase: "voting",
        roundNumber: nextRound,
        promptId: prompt.id,
        prompt: prompt.text,
        usedPromptIds: [...wa.usedPromptIds, prompt.id],
        votes: {},
        exhibits: {},
        pleas: {},
        provisionalStarIds: [],
        voteEndsAt: Date.now() + WHO_AMONG_VOTE_MS,
        pleaEndsAt: undefined,
        revealEndsAt: undefined,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, wa.phase, wa.revealEndsAt, wa.roundNumber, now]);

  const lastResult = wa.roundResults?.[wa.roundResults.length - 1];
  const starRanking = buildStarRanking(state, wa.roundResults ?? []);
  const lastLashRound = whoAmongIsLastLash(wa);

  return (
    <div className="rounded-3xl border border-white/10 bg-card p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Who Among Us
          </div>
          <h2 className="font-display text-3xl mt-1">
            Round {Math.min(wa.roundNumber, wa.totalRounds)} / {wa.totalRounds}
            {lastLashRound && wa.phase !== "briefing" && wa.phase !== "results" ? (
              <span className="ml-2 text-lg text-amber-300">Last Lash</span>
            ) : null}
          </h2>
        </div>
        <PhasePill phase={wa.phase} />
      </header>

      {wa.phase === "briefing" && (
        <Panel title="Getting ready">
          <p className="text-muted-foreground">
            First charge coming up. Players secretly vote, file a one-line exhibit, then the accused
            get a short plea. Last round pays double.
          </p>
        </Panel>
      )}

      {wa.phase === "voting" && wa.prompt && (
        <Panel title={lastLashRound ? "Last Lash — file a charge" : "File a charge"}>
          <p className="font-display text-2xl sm:text-3xl leading-snug">{wa.prompt}</p>
          {wa.voteEndsAt && (
            <div className="mt-4 font-display text-4xl tabular-nums">
              {formatClock(Math.max(0, wa.voteEndsAt - now))}
            </div>
          )}
          <VoteTally state={state} wa={wa} />
        </Panel>
      )}

      {wa.phase === "plea" && wa.prompt && (
        <Panel title="The accused may testify">
          <p className="font-display text-2xl sm:text-3xl leading-snug">{wa.prompt}</p>
          <AccusedList state={state} starIds={wa.provisionalStarIds ?? []} pleas={wa.pleas} />
          {wa.pleaEndsAt && (
            <div className="mt-4 font-display text-4xl tabular-nums">
              {formatClock(Math.max(0, wa.pleaEndsAt - now))}
            </div>
          )}
        </Panel>
      )}

      {wa.phase === "reveal" && lastResult && (
        <Panel title={lastResult.lastLash ? "Last Lash — the docket" : "The docket"}>
          <p className="text-sm text-muted-foreground">{lastResult.prompt}</p>
          <RevealBars state={state} result={lastResult} />
          <Docket state={state} result={lastResult} />
        </Panel>
      )}

      {wa.phase === "results" && (
        <Panel title="Stars of the night">
          <div className="space-y-2">
            {starRanking.length > 0 ? (
              starRanking.map((entry, i) => {
                const player = state.players.find((p) => p.id === entry.playerId);
                const team = state.teams.find((t) => t.id === player?.teamId);
                const c = team ? teamColorClasses(team.color) : teamColorClasses("green");
                return (
                  <div
                    key={entry.playerId}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${c.chip}`}
                  >
                    <span>
                      {i + 1}. {player?.name ?? "?"} {i === 0 && "👑"}
                    </span>
                    <span className="opacity-80">
                      {entry.starCount}× star · {entry.votesReceived} votes
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No stars yet — it happens!</p>
            )}
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-2">
            {[...state.teams]
              .sort((a, b) => b.score - a.score)
              .map((t) => {
                const c = teamColorClasses(t.color);
                return (
                  <div key={t.id} className={`rounded-2xl border px-3 py-2 ${c.chip}`}>
                    <div className="font-medium">{t.name}</div>
                    <div className="font-display text-2xl tabular-nums">{t.score}</div>
                  </div>
                );
              })}
          </div>
          <button
            type="button"
            onClick={onBackToHub}
            className="mt-4 rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm"
          >
            ↺ Back to lobby
          </button>
        </Panel>
      )}
    </div>
  );
}

function buildStarRanking(
  state: RoomState,
  roundResults: NonNullable<WhoAmongState["roundResults"]>,
) {
  const tally = new Map<string, { starCount: number; votesReceived: number }>();
  for (const player of state.players) {
    tally.set(player.id, { starCount: 0, votesReceived: 0 });
  }
  for (const round of roundResults) {
    for (const starId of round.starIds) {
      const entry = tally.get(starId);
      if (entry) entry.starCount += 1;
    }
    for (const [playerId, count] of Object.entries(round.voteCounts)) {
      const entry = tally.get(playerId);
      if (entry) entry.votesReceived += count;
    }
  }
  return [...tally.entries()]
    .map(([playerId, stats]) => ({ playerId, ...stats }))
    .filter((e) => e.starCount > 0 || e.votesReceived > 0)
    .sort((a, b) => b.starCount - a.starCount || b.votesReceived - a.votesReceived);
}

function PhasePill({ phase }: { phase: WhoAmongState["phase"] }) {
  const label = {
    briefing: "Start",
    voting: "Charge",
    plea: "Plea",
    reveal: "Docket",
    results: "Final",
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

function VoteTally({ state, wa }: { state: RoomState; wa: WhoAmongState }) {
  const voted = Object.keys(wa.votes ?? {}).length;
  const exhibits = Object.keys(wa.exhibits ?? {}).length;
  return (
    <p className="text-sm text-muted-foreground mt-2">
      {voted} of {state.players.length} voted · {exhibits} exhibit{exhibits === 1 ? "" : "s"} filed
    </p>
  );
}

function AccusedList({
  state,
  starIds,
  pleas,
}: {
  state: RoomState;
  starIds: string[];
  pleas?: Record<string, string>;
}) {
  return (
    <div className="mt-4 space-y-2">
      {starIds.map((id) => {
        const player = state.players.find((p) => p.id === id);
        const filed = Boolean(pleas?.[id]?.trim());
        return (
          <div
            key={id}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            <span>{player?.name ?? "Accused"}</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {filed ? "plea filed" : "silent"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RevealBars({ state, result }: { state: RoomState; result: WhoAmongRoundResult }) {
  const ranked = state.players
    .map((player) => ({
      player,
      count: result.voteCounts[player.id] ?? 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const maxCount = ranked[0]?.count ?? 1;

  return (
    <div className="mt-4 space-y-3">
      {ranked.map(({ player, count }) => {
        const team = state.teams.find((t) => t.id === player.teamId);
        const c = team ? teamColorClasses(team.color) : teamColorClasses("green");
        const isStar = result.starIds.includes(player.id);
        return (
          <div key={player.id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className={isStar ? "font-medium" : ""}>
                {player.name} {isStar && "👑"}
              </span>
              <span className="opacity-70">{count}</span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${c.bg}`}
                style={{ width: `${Math.max(8, (count / maxCount) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      {ranked.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody got votes this round.</p>
      )}
    </div>
  );
}

function Docket({ state, result }: { state: RoomState; result: WhoAmongRoundResult }) {
  const votes = result.votes ?? {};
  const exhibits = Object.entries(result.exhibits ?? {}).filter(([, text]) => text.trim());
  const pleas = result.starIds
    .map((id) => ({
      player: state.players.find((p) => p.id === id),
      text: result.pleas?.[id]?.trim(),
    }))
    .filter((entry) => entry.player);

  if (exhibits.length === 0 && pleas.every((entry) => !entry.text)) {
    return null;
  }

  return (
    <div className="mt-5 space-y-3">
      {pleas.map(({ player, text }) => (
        <div
          key={player!.id}
          className="rounded-xl border border-amber-200/20 bg-amber-500/10 px-3 py-2"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/80">
            Plea · {player!.name}
          </div>
          <p className="mt-1 text-sm">{text || "The accused declined to testify."}</p>
        </div>
      ))}
      {exhibits.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Exhibits
          </div>
          {exhibits.map(([voterId, text]) => {
            const voter = state.players.find((p) => p.id === voterId);
            const target = state.players.find((p) => p.id === votes[voterId]);
            return (
              <p key={voterId} className="text-sm text-white/80">
                <span className="text-white/50">{voter?.name ?? "Someone"}</span>
                {target ? (
                  <>
                    {" "}
                    on {target.name}: “{text}”
                  </>
                ) : (
                  <>: “{text}”</>
                )}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
