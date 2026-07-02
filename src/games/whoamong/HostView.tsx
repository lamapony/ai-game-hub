import { useEffect, useRef, useState } from "react";
import { updateRoomState } from "@/lib/room";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import { WHO_AMONG_REVEAL_MS, WHO_AMONG_VOTE_MS } from "@/lib/host-controls";
import type { RoomState, WhoAmongState } from "@/lib/types";
import { pickCatalogPrompt } from "./catalog";
import { scoreWhoAmongRound } from "./scoring";

function speak(text: string) {
  const a = new Audio(`/api/speak?text=${encodeURIComponent(text)}`);
  a.play().catch(() => {});
}

export function WhoAmongHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const wa = state.whoamong!;
  const [now, setNow] = useState(Date.now());
  const introSpokenRef = useRef(false);
  const scoredRoundRef = useRef<string | null>(null);
  const advancedRoundRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const update = (patch: Partial<WhoAmongState>) =>
    updateRoomState(roomId, { ...state, whoamong: { ...wa, ...patch } });

  function startRound(nowMs = Date.now()) {
    const prompt = pickCatalogPrompt(wa.usedPromptIds);
    void update({
      phase: "voting",
      promptId: prompt.id,
      prompt: prompt.text,
      usedPromptIds: [...wa.usedPromptIds, prompt.id],
      votes: {},
      voteEndsAt: nowMs + WHO_AMONG_VOTE_MS,
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
      `Игра «Кто из нас». ${wa.totalRounds} раундов. На экране — острый вопрос, а вы тайно голосуете за того, кто подходит больше всех.`,
    );
    const t = window.setTimeout(() => startRound(), 3500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, wa.phase]);

  // voting → reveal
  useEffect(() => {
    if (state.paused) return;
    if (wa.phase !== "voting") return;
    const voted = Object.keys(wa.votes ?? {}).length;
    const allVoted = state.players.length > 0 && voted >= state.players.length;
    const timerExpired = !!wa.voteEndsAt && now >= wa.voteEndsAt;
    if (!allVoted && !timerExpired) return;

    const key = `${wa.roundId}:${wa.roundNumber}:${wa.promptId}`;
    if (scoredRoundRef.current === key) return;
    scoredRoundRef.current = key;

    const scored = scoreWhoAmongRound(state, wa);
    const revealEndsAt = Date.now() + WHO_AMONG_REVEAL_MS;

    if (!scored.roundResult) {
      void update({ phase: "reveal", revealEndsAt });
      return;
    }

    const starNames = scored.roundResult.starIds
      .map((id) => state.players.find((p) => p.id === id)?.name)
      .filter(Boolean);
    if (starNames.length === 1) {
      speak(`Звезда раунда — ${starNames[0]}!`);
    } else if (starNames.length > 1) {
      speak(`Звёзды раунда — ${starNames.join(" и ")}!`);
    } else {
      speak("В этом раунде никто не получил голосов.");
    }

    void updateRoomState(roomId, {
      ...state,
      teams: scored.teams,
      whoamong: {
        ...wa,
        phase: "reveal",
        roundResults: [...(wa.roundResults ?? []), scored.roundResult],
        revealEndsAt,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, wa.phase, wa.voteEndsAt, wa.votes, now]);

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

    const prompt = pickCatalogPrompt(wa.usedPromptIds);
    void updateRoomState(roomId, {
      ...state,
      whoamong: {
        ...wa,
        phase: "voting",
        roundNumber: wa.roundNumber + 1,
        promptId: prompt.id,
        prompt: prompt.text,
        usedPromptIds: [...wa.usedPromptIds, prompt.id],
        votes: {},
        voteEndsAt: Date.now() + WHO_AMONG_VOTE_MS,
        revealEndsAt: undefined,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, wa.phase, wa.revealEndsAt, wa.roundNumber, now]);

  const lastResult = wa.roundResults?.[wa.roundResults.length - 1];
  const starRanking = buildStarRanking(state, wa.roundResults ?? []);

  return (
    <div className="rounded-3xl border border-white/10 bg-card p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Кто из нас
          </div>
          <h2 className="font-display text-3xl mt-1">
            Раунд {Math.min(wa.roundNumber, wa.totalRounds)} / {wa.totalRounds}
          </h2>
        </div>
        <PhasePill phase={wa.phase} />
      </header>

      {wa.phase === "briefing" && (
        <Panel title="Готовимся">
          <p className="text-muted-foreground">
            Сейчас пойдёт первый вопрос. Игроки тайно голосуют за того, кто лучше всех подходит под
            описание.
          </p>
        </Panel>
      )}

      {wa.phase === "voting" && wa.prompt && (
        <Panel title="Голосование">
          <p className="font-display text-2xl sm:text-3xl leading-snug">{wa.prompt}</p>
          {wa.voteEndsAt && (
            <div className="mt-4 font-display text-4xl tabular-nums">
              {formatClock(Math.max(0, wa.voteEndsAt - now))}
            </div>
          )}
          <VoteTally state={state} wa={wa} />
        </Panel>
      )}

      {wa.phase === "reveal" && lastResult && (
        <Panel title="Звезда раунда">
          <p className="text-sm text-muted-foreground">{lastResult.prompt}</p>
          <RevealBars state={state} result={lastResult} />
        </Panel>
      )}

      {wa.phase === "results" && (
        <Panel title="Главные звёзды вечера">
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
                      {entry.starCount}× звезда · {entry.votesReceived} голосов
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Пока без звёзд — бывает!</p>
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
            onClick={() =>
              updateRoomState(roomId, {
                ...state,
                status: "lobby",
                currentGame: null,
                whoamong: undefined,
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
    briefing: "Старт",
    voting: "Голосуем",
    reveal: "Итог",
    results: "Финал",
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
  return (
    <p className="text-sm text-muted-foreground mt-2">
      Проголосовало {voted} из {state.players.length}
    </p>
  );
}

function RevealBars({
  state,
  result,
}: {
  state: RoomState;
  result: NonNullable<WhoAmongState["roundResults"]>[number];
}) {
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
        <p className="text-sm text-muted-foreground">Никто не получил голосов в этом раунде.</p>
      )}
    </div>
  );
}
