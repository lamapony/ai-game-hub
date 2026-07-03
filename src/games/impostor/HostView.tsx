// "Who's the Bot?" host orchestration: AI asks a question, everyone (including AI) writes
// an answer, players hunt for the machine among the humans. AI IS the gameplay here.
import { useEffect, useRef, useState } from "react";
import { updateRoomState, genId } from "@/lib/room";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import { IMPOSTOR_ANSWER_MS, IMPOSTOR_REVEAL_MS, IMPOSTOR_VOTE_MS } from "@/lib/host-controls";
import {
  generateImpostorAnswer,
  generateImpostorQuestion,
  impostorRevealComment,
} from "@/lib/ai/impostor.functions";
import type { ImpostorAnswer, ImpostorState, RoomState } from "@/lib/types";
import { pickImpostorQuestion } from "./catalog";
import { scoreImpostorRound } from "./scoring";

function speak(text: string) {
  const a = new Audio(`/api/speak?text=${encodeURIComponent(text)}`);
  a.play().catch(() => {});
}

function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function ImpostorHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const imp = state.impostor!;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const questionForRef = useRef<string | null>(null);
  const mixedForRef = useRef<string | null>(null);
  const scoredForRef = useRef<string | null>(null);
  const advancedForRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const update = (patch: Partial<ImpostorState>) =>
    updateRoomState(roomId, { ...state, impostor: { ...imp, ...patch } });

  const roundKey = `${imp.roundId}:${imp.roundNumber}`;

  // briefing → generate question → answering
  useEffect(() => {
    if (state.paused) return;
    if (imp.phase !== "briefing") return;
    if (questionForRef.current === roundKey) return;
    questionForRef.current = roundKey;

    void (async () => {
      setBusy("Host is writing a question…");
      try {
        const pastQuestions = (imp.roundResults ?? []).map((r) => r.question);
        const r = await generateImpostorQuestion({
          data: { pastQuestions, venue: state.venue },
        });
        const fallbackQuestion = pickImpostorQuestion(imp.usedQuestionIds);
        const question = r.fallback || !r.question ? fallbackQuestion.text : r.question;
        const questionId = r.fallback || !r.question ? fallbackQuestion.id : genId("q");
        if (imp.roundNumber === 1) {
          speak(
            `Who's the Bot? Everyone writes a funny answer to the question, and I secretly slip in mine. Find mine — earn points.`,
          );
        }
        if (r.intro && !r.fallback) speak(r.intro);
        await update({
          phase: "answering",
          questionId,
          question,
          usedQuestionIds: [...imp.usedQuestionIds, questionId],
          answers: {},
          shuffled: undefined,
          aiAnswerId: undefined,
          votes: {},
          answerEndsAt: Date.now() + IMPOSTOR_ANSWER_MS,
          voteEndsAt: undefined,
          revealEndsAt: undefined,
          aiFallback: imp.aiFallback || r.fallback,
        });
      } catch (e) {
        console.error(e);
        questionForRef.current = null;
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, imp.phase, roundKey]);

  // answering → mix in the AI answer → voting
  useEffect(() => {
    if (state.paused) return;
    if (imp.phase !== "answering" || !imp.question) return;
    const answered = Object.keys(imp.answers ?? {}).length;
    const allAnswered = state.players.length > 0 && answered >= state.players.length;
    const timerExpired = !!imp.answerEndsAt && now >= imp.answerEndsAt;
    if (!allAnswered && !timerExpired) return;
    if (mixedForRef.current === roundKey) return;
    mixedForRef.current = roundKey;

    void (async () => {
      setBusy("The bot is writing its answer…");
      try {
        const humanEntries = Object.entries(imp.answers ?? {});
        const ai = await generateImpostorAnswer({
          data: {
            question: imp.question!,
            humanAnswers: humanEntries.map(([, text]) => text),
            venue: state.venue,
          },
        });
        const aiAnswerId = genId("ai");
        const answers: ImpostorAnswer[] = [
          ...humanEntries.map(([playerId, text]) => ({
            id: genId("ans"),
            playerId,
            text,
          })),
          { id: aiAnswerId, text: ai.answer },
        ];
        await update({
          phase: "voting",
          shuffled: shuffle(answers),
          aiAnswerId,
          answerEndsAt: undefined,
          voteEndsAt: Date.now() + IMPOSTOR_VOTE_MS,
          aiFallback: imp.aiFallback || ai.fallback,
        });
        speak("Answers are on screen. One of them is mine. Vote.");
      } catch (e) {
        console.error(e);
        mixedForRef.current = null;
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, imp.phase, imp.answers, imp.answerEndsAt, now, roundKey]);

  // voting → score → reveal
  useEffect(() => {
    if (state.paused) return;
    if (imp.phase !== "voting" || !imp.shuffled || !imp.aiAnswerId) return;
    const voted = Object.keys(imp.votes ?? {}).length;
    const allVoted = state.players.length > 0 && voted >= state.players.length;
    const timerExpired = !!imp.voteEndsAt && now >= imp.voteEndsAt;
    if (!allVoted && !timerExpired) return;
    if (scoredForRef.current === roundKey) return;
    scoredForRef.current = roundKey;

    void (async () => {
      const scored = scoreImpostorRound(state, imp);
      const revealEndsAt = Date.now() + IMPOSTOR_REVEAL_MS;
      if (!scored.roundResult) {
        await update({ phase: "reveal", revealEndsAt });
        return;
      }
      await updateRoomState(roomId, {
        ...state,
        teams: scored.teams,
        impostor: {
          ...imp,
          phase: "reveal",
          roundResults: [...(imp.roundResults ?? []), scored.roundResult],
          revealEndsAt,
        },
      });
      try {
        const aiAnswer = imp.shuffled!.find((a) => a.id === imp.aiAnswerId)?.text ?? "";
        const r = await impostorRevealComment({
          data: {
            question: imp.question ?? "",
            aiAnswer,
            caughtCount: scored.roundResult.correctVoterIds.length,
            totalVoters: Object.keys(scored.roundResult.votes).length,
          },
        });
        speak(r.verdict);
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, imp.phase, imp.votes, imp.voteEndsAt, now, roundKey]);

  // reveal → next round or results
  useEffect(() => {
    if (state.paused) return;
    if (imp.phase !== "reveal") return;
    if (!imp.revealEndsAt || now < imp.revealEndsAt) return;
    const advanceKey = `${roundKey}:advance`;
    if (advancedForRef.current === advanceKey) return;
    advancedForRef.current = advanceKey;

    if (imp.roundNumber >= imp.totalRounds) {
      void update({ phase: "results" });
      return;
    }
    void update({
      phase: "briefing",
      roundNumber: imp.roundNumber + 1,
      questionId: undefined,
      question: undefined,
      answers: {},
      shuffled: undefined,
      aiAnswerId: undefined,
      votes: {},
      answerEndsAt: undefined,
      voteEndsAt: undefined,
      revealEndsAt: undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, imp.phase, imp.revealEndsAt, imp.roundNumber, now]);

  const lastResult = imp.roundResults?.[imp.roundResults.length - 1];

  return (
    <div className="rounded-3xl border border-white/10 bg-card p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Who's the Bot?
          </div>
          <h2 className="font-display text-3xl mt-1">
            Round {Math.min(imp.roundNumber, imp.totalRounds)} / {imp.totalRounds}
          </h2>
        </div>
        <PhasePill phase={imp.phase} />
      </header>

      {busy && <p className="text-sm text-muted-foreground animate-pulse">{busy}</p>}

      {imp.phase === "briefing" && (
        <Panel title="Getting ready">
          <p className="text-muted-foreground">
            Everyone writes a witty answer on their phone. AI secretly adds its own. Then we hunt
            for the machine answer.
          </p>
        </Panel>
      )}

      {imp.phase === "answering" && imp.question && (
        <Panel title="Writing answers">
          <p className="font-display text-2xl sm:text-3xl leading-snug">{imp.question}</p>
          {imp.answerEndsAt && (
            <div className="mt-4 font-display text-4xl tabular-nums">
              {formatClock(Math.max(0, imp.answerEndsAt - now))}
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            Answered {Object.keys(imp.answers ?? {}).length} of {state.players.length}
          </p>
        </Panel>
      )}

      {imp.phase === "voting" && imp.question && imp.shuffled && (
        <Panel title="Where's the bot?">
          <p className="text-sm text-muted-foreground">{imp.question}</p>
          {imp.voteEndsAt && (
            <div className="mt-2 font-display text-3xl tabular-nums">
              {formatClock(Math.max(0, imp.voteEndsAt - now))}
            </div>
          )}
          <div className="mt-4 grid sm:grid-cols-2 gap-2">
            {imp.shuffled.map((answer, i) => (
              <div
                key={answer.id}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="text-xs text-muted-foreground mr-2">#{i + 1}</span>
                <span className="font-medium">{answer.text}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Voted {Object.keys(imp.votes ?? {}).length} of {state.players.length}
          </p>
        </Panel>
      )}

      {imp.phase === "reveal" && lastResult && (
        <Panel title="Reveal">
          <p className="text-sm text-muted-foreground">{lastResult.question}</p>
          <div className="mt-3 space-y-2">
            {lastResult.answers.map((answer) => {
              const isAi = answer.id === lastResult.aiAnswerId;
              const author = state.players.find((p) => p.id === answer.playerId);
              const voteCount = Object.values(lastResult.votes).filter(
                (id) => id === answer.id,
              ).length;
              return (
                <div
                  key={answer.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 ${
                    isAi
                      ? "border-[var(--color-park-bright)]/50 bg-[var(--color-park-bright)]/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-medium">{answer.text}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {isAi ? "🤖 BOT" : (author?.name ?? "anonymous")}
                    </span>
                  </div>
                  {voteCount > 0 && (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs tabular-nums">
                      {voteCount} 🗳
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Caught the bot: {lastResult.correctVoterIds.length} of{" "}
            {Object.keys(lastResult.votes).length}
          </p>
        </Panel>
      )}

      {imp.phase === "results" && (
        <Panel title="Bot hunt results">
          <BotHunterRanking state={state} imp={imp} />
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
                impostor: undefined,
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

function BotHunterRanking({ state, imp }: { state: RoomState; imp: ImpostorState }) {
  const results = imp.roundResults ?? [];
  const tally = new Map<string, { caught: number; fooled: number }>();
  for (const player of state.players) tally.set(player.id, { caught: 0, fooled: 0 });
  for (const round of results) {
    for (const voterId of round.correctVoterIds) {
      const entry = tally.get(voterId);
      if (entry) entry.caught += 1;
    }
    const authorByAnswer = new Map(
      round.answers.filter((a) => a.playerId).map((a) => [a.id, a.playerId!] as const),
    );
    for (const answerId of Object.values(round.votes)) {
      const authorId = authorByAnswer.get(answerId);
      if (!authorId) continue;
      const entry = tally.get(authorId);
      if (entry) entry.fooled += 1;
    }
  }
  const ranking = [...tally.entries()]
    .map(([playerId, stats]) => ({ playerId, ...stats }))
    .filter((e) => e.caught > 0 || e.fooled > 0)
    .sort((a, b) => b.caught - a.caught || b.fooled - a.fooled);

  if (ranking.length === 0) {
    return <p className="text-sm text-muted-foreground">The bot stayed uncaught. Concerning.</p>;
  }

  return (
    <div className="space-y-2">
      {ranking.map((entry, i) => {
        const player = state.players.find((p) => p.id === entry.playerId);
        const team = state.teams.find((t) => t.id === player?.teamId);
        const c = team ? teamColorClasses(team.color) : teamColorClasses("green");
        return (
          <div
            key={entry.playerId}
            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${c.chip}`}
          >
            <span>
              {i + 1}. {player?.name ?? "?"} {i === 0 && "🕵️"}
            </span>
            <span className="opacity-80">
              {entry.caught}× caught the bot · {entry.fooled}× passed for the bot
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PhasePill({ phase }: { phase: ImpostorState["phase"] }) {
  const label = {
    briefing: "Start",
    answering: "Writing",
    voting: "Hunting",
    reveal: "Reveal",
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
