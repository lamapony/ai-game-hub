import { useEffect, useState } from "react";
import { postPlayerAction } from "@/lib/player-action-client";
import { formatClock, teamColorClasses } from "@/lib/team-style";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import type { RoomState } from "@/lib/types";

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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const myVote = wa.votes?.[me.id];
  const lastResult = wa.roundResults?.[wa.roundResults.length - 1];

  async function vote(targetId: string) {
    await postPlayerAction(roomId, {
      action: "whoamong-vote",
      playerId: me.id,
      targetPlayerId: targetId,
    });
  }

  if (wa.phase === "briefing") {
    return (
      <Card>
        <Pill>Готовься голосовать</Pill>
        <H>Кто из нас?</H>
        <P>
          На экране — острый вопрос. Тайно выбираешь игрока, который подходит лучше всех — можно и
          себя. {wa.totalRounds} раундов: звезда +3 команде, угадал звезду +2.
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
            Раунд {wa.roundNumber} · {formatClock(remaining)}
          </Pill>
          <H className="text-left">{wa.prompt}</H>
          {myVote && (
            <P className="text-[var(--color-park-bright)]">Голос принят — можно передумать</P>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-2">
          {state.players.map((player) => {
            const team = state.teams.find((t) => t.id === player.teamId);
            const c = team ? teamColorClasses(team.color) : teamColorClasses("green");
            const selected = myVote === player.id;
            const label = player.id === me.id ? `${player.name} (ты)` : player.name;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => void vote(player.id)}
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
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (wa.phase === "reveal" && lastResult) {
    const isStar = lastResult.starIds.includes(me.id);
    const hitStar = lastResult.correctVoterIds.includes(me.id);
    return (
      <Card>
        <Pill>{isStar ? "👑 Звезда раунда" : hitStar ? "Попал!" : "Итог раунда"}</Pill>
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
            ? "Ты — звезда раунда! +3 команде"
            : hitStar
              ? "+2 команде!"
              : myVote
                ? "Не угадал звезду — в следующий раз!"
                : "Ты не успел проголосовать"}
        </div>
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
        <Pill>Финал</Pill>
        <H>Твоя статистика</H>
        <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm">
          <div>Звёзд раунда: {starCount}</div>
          <div className="mt-1">Голосов за тебя: {votesReceived}</div>
        </div>
        <P className="mt-3">Полный рейтинг — на экране ведущего.</P>
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

function H({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-display text-2xl mt-2 ${className ?? ""}`}>{children}</div>;
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-white/65 text-sm mt-2 leading-relaxed ${className ?? ""}`}>{children}</p>
  );
}
