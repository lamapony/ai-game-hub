import { useEffect, useState } from "react";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { postPlayerAction } from "@/lib/player-action-client";
import { formatClock } from "@/lib/team-style";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import { eventProfile } from "@/lib/event-profile";
import { useLocalDraft } from "@/lib/use-local-draft";
import type { RoomState } from "@/lib/types";

export function ImpostorPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const imp = state.impostor!;
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft, clearDraft] = useLocalDraft(
    `${eventProfile.storagePrefix}:draft:${roomId}:${me.id}:impostor:${imp.roundId}:answer`,
  );
  const [sending, setSending] = useState(false);
  const [pendingAnswerId, setPendingAnswerId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const myAnswer = imp.answers?.[me.id];
  const myVote = imp.votes?.[me.id];
  const lastResult = imp.roundResults?.[imp.roundResults.length - 1];

  useEffect(() => {
    setSending(false);
    setPendingAnswerId(null);
    setActionError(null);
  }, [imp.phase, imp.roundId]);

  async function submitAnswer() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "impostor-answer",
        playerId: me.id,
        answer: text,
      });
      clearDraft();
    } catch (e) {
      console.error(e);
      setActionError(friendlyPlayerActionError(e, "answer"));
    } finally {
      setSending(false);
    }
  }

  async function vote(answerId: string) {
    if (pendingAnswerId) return;
    setPendingAnswerId(answerId);
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "impostor-vote",
        playerId: me.id,
        answerId,
      });
    } catch (e) {
      console.error(e);
      setActionError(friendlyPlayerActionError(e, "vote"));
    } finally {
      setPendingAnswerId(null);
    }
  }

  if (imp.phase === "briefing") {
    return (
      <Card>
        <Pill>Get ready to write</Pill>
        <H>Who's the Bot?</H>
        <P>
          A question will appear on screen. Write a funny answer — AI secretly adds its own. Spot
          the machine answer: +3 if you're right; +1 per vote if people mistake your answer for the
          bot's.
        </P>
        <GameRulesChecklist gameId="impostor" />
      </Card>
    );
  }

  if (imp.phase === "answering" && imp.question) {
    const remaining = Math.max(0, (imp.answerEndsAt ?? now) - now);
    return (
      <Card compact>
        <Pill>
          Round {imp.roundNumber} · {formatClock(remaining)}
        </Pill>
        <H className="text-left">{imp.question}</H>
        {myAnswer ? (
          <>
            <div className="mt-3 rounded-2xl bg-[var(--color-park-bright)]/15 px-4 py-3 text-sm text-[var(--color-park-bright)]">
              Answer saved: "{myAnswer}"
            </div>
            <P>You can rewrite until time runs out.</P>
          </>
        ) : (
          <P>Write like you text — too polished gives the bot away.</P>
        )}
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitAnswer();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={140}
            placeholder="Your answer…"
            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none focus:bg-white/15"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded-2xl bg-[var(--color-park-bright)] px-4 py-3 font-medium text-[oklch(0.16_0.05_160)] disabled:opacity-50"
          >
            {sending ? "Sending…" : myAnswer ? "Rewrite" : "Submit"}
          </button>
        </form>
        {actionError && <ActionError>{actionError}</ActionError>}
      </Card>
    );
  }

  if (imp.phase === "voting" && imp.shuffled) {
    const remaining = Math.max(0, (imp.voteEndsAt ?? now) - now);
    return (
      <div className="space-y-3">
        <Card compact>
          <Pill>Hunting the bot · {formatClock(remaining)}</Pill>
          <H className="text-left text-xl">{imp.question}</H>
          {myVote && (
            <P className="text-[var(--color-park-bright)]">Vote saved — you can change your mind</P>
          )}
        </Card>
        <div className="space-y-2">
          {imp.shuffled.map((answer, i) => {
            const mine = answer.playerId === me.id;
            const selected = myVote === answer.id;
            return (
              <button
                key={answer.id}
                type="button"
                disabled={mine || !!pendingAnswerId}
                onClick={() => void vote(answer.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-[var(--color-park-bright)]/60 bg-[var(--color-park-bright)]/15 ring-2 ring-[var(--color-park-bright)]/50"
                    : mine
                      ? "border-white/10 bg-white/5 opacity-50"
                      : "border-white/15 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="text-xs text-white/50 mr-2">#{i + 1}</span>
                <span className="text-white">{answer.text}</span>
                {mine && <span className="ml-2 text-xs text-white/50">(yours)</span>}
                {pendingAnswerId === answer.id && (
                  <span className="ml-2 text-xs text-white/50">sending…</span>
                )}
              </button>
            );
          })}
        </div>
        {actionError && <ActionError>{actionError}</ActionError>}
      </div>
    );
  }

  if (imp.phase === "reveal" && lastResult) {
    const caught = lastResult.correctVoterIds.includes(me.id);
    const myFoolVotes = (() => {
      const myAnswerId = lastResult.answers.find((a) => a.playerId === me.id)?.id;
      if (!myAnswerId) return 0;
      return Object.values(lastResult.votes).filter((id) => id === myAnswerId).length;
    })();
    return (
      <Card>
        <Pill>{caught ? "🕵️ Got them!" : "Reveal"}</Pill>
        <H className="text-left text-xl">{lastResult.question}</H>
        <div
          className={`mt-3 rounded-2xl px-4 py-3 text-center ${
            caught
              ? "bg-[var(--color-park-bright)]/20 text-[var(--color-park-bright)]"
              : "bg-white/10 text-white/80"
          }`}
        >
          {caught
            ? "You caught the bot! +3 to your team"
            : myVote
              ? "That was a human. The bot slipped away."
              : "You didn't vote"}
        </div>
        {myFoolVotes > 0 && (
          <div className="mt-2 rounded-2xl bg-white/10 px-4 py-3 text-center text-sm text-white/80">
            People mistook your answer for the bot {myFoolVotes} time{myFoolVotes === 1 ? "" : "s"}{" "}
            — +{myFoolVotes} to your team. Talent.
          </div>
        )}
      </Card>
    );
  }

  if (imp.phase === "results") {
    const results = imp.roundResults ?? [];
    const caughtCount = results.filter((r) => r.correctVoterIds.includes(me.id)).length;
    const fooledCount = results.reduce((sum, r) => {
      const myAnswerId = r.answers.find((a) => a.playerId === me.id)?.id;
      if (!myAnswerId) return sum;
      return sum + Object.values(r.votes).filter((id) => id === myAnswerId).length;
    }, 0);
    return (
      <Card>
        <Pill>Final</Pill>
        <H>Your stats</H>
        <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm">
          <div>
            Caught the bot: {caughtCount} time{caughtCount === 1 ? "" : "s"}
          </div>
          <div className="mt-1">
            Passed for the bot: {fooledCount} vote{fooledCount === 1 ? "" : "s"}
          </div>
        </div>
        <P className="mt-3">Full hunter ranking — on the host screen.</P>
      </Card>
    );
  }

  return (
    <Card>
      <H>Hold on…</H>
      <P>The bot is thinking. Or pretending to think.</P>
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

function H({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-display text-2xl mt-2 ${className ?? ""}`}>{children}</div>;
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-white/65 text-sm mt-2 leading-relaxed ${className ?? ""}`}>{children}</p>
  );
}

function ActionError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/15 px-4 py-3 text-center text-sm text-red-100">
      {children}
    </p>
  );
}
