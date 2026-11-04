import { useEffect, useState } from "react";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { postPlayerAction } from "@/lib/player-action-client";
import { formatClock, teamColorClasses } from "@/lib/team-style";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import { eventProfile } from "@/lib/event-profile";
import { useLocalDraft } from "@/lib/use-local-draft";
import type { RoomState } from "@/lib/types";
import { whoAmongIsLastLash } from "./scoring";

export function WhoAmongPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const wa = state.whoamong!;
  const [now, setNow] = useState(Date.now());
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [sendingExhibit, setSendingExhibit] = useState(false);
  const [sendingPlea, setSendingPlea] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exhibitDraft, setExhibitDraft, clearExhibit] = useLocalDraft(
    `${eventProfile.storagePrefix}:draft:${roomId}:${me.id}:whoamong:${wa.roundId}:${wa.roundNumber}:exhibit`,
  );
  const [pleaDraft, setPleaDraft, clearPlea] = useLocalDraft(
    `${eventProfile.storagePrefix}:draft:${roomId}:${me.id}:whoamong:${wa.roundId}:${wa.roundNumber}:plea`,
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const myVote = wa.votes?.[me.id];
  const myExhibit = wa.exhibits?.[me.id];
  const myPlea = wa.pleas?.[me.id];
  const lastResult = wa.roundResults?.[wa.roundResults.length - 1];
  const lastLash = whoAmongIsLastLash(wa);
  const accused = wa.provisionalStarIds ?? [];
  const iAmAccused = accused.includes(me.id);

  useEffect(() => {
    setPendingTargetId(null);
    setSendingExhibit(false);
    setSendingPlea(false);
    setActionError(null);
  }, [wa.phase, wa.roundNumber]);

  async function vote(targetId: string) {
    if (pendingTargetId) return;
    setPendingTargetId(targetId);
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "whoamong-vote",
        playerId: me.id,
        targetPlayerId: targetId,
      });
    } catch (error) {
      setActionError(friendlyPlayerActionError(error, "vote"));
    } finally {
      setPendingTargetId(null);
    }
  }

  async function submitExhibit() {
    const text = exhibitDraft.trim();
    if (!text || sendingExhibit) return;
    setSendingExhibit(true);
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "whoamong-exhibit",
        playerId: me.id,
        answer: text,
      });
      clearExhibit();
    } catch (error) {
      setActionError(friendlyPlayerActionError(error, "exhibit"));
    } finally {
      setSendingExhibit(false);
    }
  }

  async function submitPlea() {
    const text = pleaDraft.trim();
    if (!text || sendingPlea) return;
    setSendingPlea(true);
    setActionError(null);
    try {
      await postPlayerAction(roomId, {
        action: "whoamong-plea",
        playerId: me.id,
        answer: text,
      });
      clearPlea();
    } catch (error) {
      setActionError(friendlyPlayerActionError(error, "plea"));
    } finally {
      setSendingPlea(false);
    }
  }

  if (wa.phase === "briefing") {
    return (
      <Card>
        <Pill>Get ready to vote</Pill>
        <H>Who Among Us?</H>
        <P>
          A charge hits the big screen. Secretly pick who fits — yourself counts — and file a
          one-line exhibit. The accused get a short plea. Last round is Last Lash: double points.
        </P>
        <GameRulesChecklist gameId="whoamong" />
      </Card>
    );
  }

  if (wa.phase === "voting" && wa.prompt) {
    const remaining = Math.max(0, (wa.voteEndsAt ?? now) - now);
    return (
      <div className="space-y-3">
        <Card compact>
          <Pill>
            {lastLash ? "Last Lash" : `Round ${wa.roundNumber}`} · {formatClock(remaining)}
          </Pill>
          <H className="text-left">{wa.prompt}</H>
          {myVote && (
            <P className="text-[var(--color-park-bright)]">
              Vote locked in — tap to change your mind
            </P>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-2">
          {state.players.map((player) => {
            const team = state.teams.find((t) => t.id === player.teamId);
            const c = team ? teamColorClasses(team.color) : teamColorClasses("green");
            const selected = myVote === player.id;
            const label = player.id === me.id ? `${player.name} (you)` : player.name;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => void vote(player.id)}
                disabled={!!pendingTargetId}
                className={`rounded-2xl border px-3 py-4 text-left transition ${
                  selected
                    ? `${c.chip} ring-2 ${c.ring}`
                    : "border-white/15 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${c.chip}`}
                >
                  {team?.name ?? "?"}
                </span>
                <div className="font-display text-lg mt-2">{label}</div>
                {pendingTargetId === player.id && (
                  <div className="mt-1 text-xs text-white/60">Sending…</div>
                )}
              </button>
            );
          })}
        </div>
        <Card compact>
          <Pill>Exhibit</Pill>
          {myExhibit ? (
            <P className="text-[var(--color-park-bright)]">Filed: “{myExhibit}”</P>
          ) : (
            <P>One line. Why them. The host will read it aloud.</P>
          )}
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitExhibit();
            }}
          >
            <input
              value={exhibitDraft}
              onChange={(e) => setExhibitDraft(e.target.value)}
              maxLength={80}
              placeholder="because they flipped the zucchini like it owed them money"
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none focus:bg-white/15"
            />
            <button
              type="submit"
              disabled={sendingExhibit || !exhibitDraft.trim()}
              className="rounded-2xl bg-[var(--color-park-bright)] px-4 py-3 font-medium text-[oklch(0.16_0.05_160)] disabled:opacity-50"
            >
              {sendingExhibit ? "Filing…" : myExhibit ? "Rewrite exhibit" : "File exhibit"}
            </button>
          </form>
        </Card>
        {actionError && <ActionError>{actionError}</ActionError>}
      </div>
    );
  }

  if (wa.phase === "plea") {
    const remaining = Math.max(0, (wa.pleaEndsAt ?? now) - now);
    if (iAmAccused) {
      return (
        <Card compact>
          <Pill>You are on the docket · {formatClock(remaining)}</Pill>
          <H className="text-left">{wa.prompt}</H>
          <P>Confess or deny. Eighteen seconds. The room is watching.</P>
          {myPlea && <P className="text-[var(--color-park-bright)]">Plea filed: “{myPlea}”</P>}
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPlea();
            }}
          >
            <input
              value={pleaDraft}
              onChange={(e) => setPleaDraft(e.target.value)}
              maxLength={140}
              placeholder="I accept the tongs. I deny the crime."
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none focus:bg-white/15"
            />
            <button
              type="submit"
              disabled={sendingPlea || !pleaDraft.trim()}
              className="rounded-2xl bg-[var(--color-park-bright)] px-4 py-3 font-medium text-[oklch(0.16_0.05_160)] disabled:opacity-50"
            >
              {sendingPlea ? "Sending…" : myPlea ? "Rewrite plea" : "File plea"}
            </button>
          </form>
          {actionError && <ActionError>{actionError}</ActionError>}
        </Card>
      );
    }

    const names = accused
      .map((id) => state.players.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(" and ");
    return (
      <Card>
        <Pill>The accused are testifying · {formatClock(remaining)}</Pill>
        <H className="text-left text-xl">{wa.prompt}</H>
        <P>
          {names || "Someone"} must confess or deny. Enjoy the silence. It is doing more work than
          they are.
        </P>
      </Card>
    );
  }

  if (wa.phase === "reveal" && lastResult) {
    const isStar = lastResult.starIds.includes(me.id);
    const hitStar = lastResult.correctVoterIds.includes(me.id);
    const myFiledExhibit = lastResult.exhibits?.[me.id];
    const filedPlea = lastResult.pleas?.[me.id];
    const lash = lastResult.lastLash;
    return (
      <Card>
        <Pill>
          {isStar ? "👑 Round star" : hitStar ? "Nailed it!" : "The docket"}
          {lash ? " · Last Lash" : ""}
        </Pill>
        <H className="text-left text-xl">{lastResult.prompt}</H>
        <div
          className={`mt-3 rounded-2xl px-4 py-3 text-center ${
            isStar
              ? "bg-[var(--color-park-bright)]/20 text-[var(--color-park-bright)]"
              : hitStar
                ? "bg-[var(--color-park-bright)]/15 text-[var(--color-park-bright)]"
                : "bg-white/10 text-white/80"
          }`}
        >
          {isStar
            ? lash
              ? "You're the Last Lash star. +6 to team."
              : "You're the round star! +3 to team"
            : hitStar
              ? lash
                ? "+4 to team — you read the room."
                : "+2 to team!"
              : myVote
                ? "Missed the star — next time!"
                : "You didn't vote in time"}
        </div>
        {filedPlea && <P className="mt-3">Your plea: “{filedPlea}”</P>}
        {myFiledExhibit && <P className="mt-2">Your exhibit: “{myFiledExhibit}”</P>}
      </Card>
    );
  }

  if (wa.phase === "results") {
    const starCount = (wa.roundResults ?? []).filter((r) => r.starIds.includes(me.id)).length;
    const votesReceived = (wa.roundResults ?? []).reduce(
      (sum, r) => sum + (r.voteCounts[me.id] ?? 0),
      0,
    );
    return (
      <Card>
        <Pill>Final</Pill>
        <H>Your stats</H>
        <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm">
          <div>Round stars: {starCount}</div>
          <div className="mt-1">Votes for you: {votesReceived}</div>
        </div>
        <P className="mt-3">Full leaderboard — on the host screen.</P>
      </Card>
    );
  }

  return (
    <Card>
      <H>Hang tight…</H>
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
    <p className="rounded-2xl border border-red-300/20 bg-red-500/15 px-4 py-3 text-center text-sm text-red-100">
      {children}
    </p>
  );
}
