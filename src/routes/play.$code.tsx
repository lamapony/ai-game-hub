import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRoom, getOrCreatePlayer, readStoredPlayer } from "@/lib/room";
import { normalizePlayerName, playerNameValidationMessage } from "@/lib/player-name";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { postPlayerAction, type StoredPlayer } from "@/lib/player-action-client";
import {
  computeTeamStandings,
  formatRussianPlace,
  formatRussianPoints,
  getWinningStandings,
} from "@/lib/host-controls";
import { teamColorClasses } from "@/lib/team-style";
import { playersOnTeam } from "@/lib/teams";
import { GameRulesBrowser } from "@/components/game-rules-ui";
import { ActivePlayerGameView } from "@/games/player-view-registry";

export const Route = createFileRoute("/play/$code")({
  component: PlayPage,
});

function PlayPage() {
  const { code } = Route.useParams();
  const { room, loading, error, setRoom } = useRoom(code);
  const [me, setMe] = useState<StoredPlayer | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredPlayer(code);
    if (stored) setMe(getOrCreatePlayer(code, stored.name, stored.teamId));
  }, [code]);

  if (loading)
    return (
      <PlayShell>
        <div className="text-white/70">Loading…</div>
      </PlayShell>
    );
  if (error || !room)
    return (
      <PlayShell>
        <div className="w-full max-w-sm rounded-3xl bg-black/45 backdrop-blur p-6 border border-white/10 text-center">
          <div className="text-4xl">🤷</div>
          <h2 className="font-display text-2xl text-white mt-2">
            Room <span className="font-mono">{code}</span> not found
          </h2>
          <p className="text-sm text-white/70 mt-2">Check the 4-letter code on the host screen.</p>
          <Link
            to="/"
            className="inline-block mt-5 rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-medium py-3 px-5"
          >
            ← Home
          </Link>
        </div>
      </PlayShell>
    );

  if (!me) {
    return (
      <JoinForm
        code={code}
        room={room}
        onJoined={(player, state) => {
          setRoom({ ...room, state });
          setMe(player);
        }}
      />
    );
  }

  return (
    <PlayerScreen
      code={code}
      room={room}
      me={me}
      onTeamChange={setMe}
      onRoomState={(state) => setRoom({ ...room, state })}
    />
  );
}

function JoinForm({
  code,
  room,
  onJoined,
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  onJoined: (player: StoredPlayer, state: import("@/lib/types").RoomState) => void;
}) {
  const state = room.state;
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function joinTeam(teamId: string) {
    if (submitting || !teamId) return;
    const validation = playerNameValidationMessage(name);
    if (validation) {
      setNameTouched(true);
      setJoinError(validation);
      return;
    }
    setJoiningTeamId(teamId);
    setSubmitting(true);
    setJoinError(null);
    const finalName = normalizePlayerName(name);
    const player = getOrCreatePlayer(code, finalName, teamId);
    try {
      const result = await postPlayerAction(room.id, {
        action: "join",
        playerId: player.id,
        name: player.name,
        teamId,
      });
      onJoined({ ...player, ...result.player, secret: player.secret }, result.state);
    } catch (e) {
      console.error(e);
      setJoinError(e instanceof Error ? e.message : "Could not join. Try again.");
    } finally {
      setSubmitting(false);
      setJoiningTeamId(null);
    }
  }

  const teamGridClass =
    state.teams.length <= 2
      ? "grid-cols-1"
      : state.teams.length <= 4
        ? "grid-cols-2"
        : "grid-cols-1";
  const nameError = playerNameValidationMessage(name);
  const visibleNameError = nameTouched ? nameError : null;

  return (
    <PlayShell>
      <div className="w-full max-w-md rounded-3xl bg-black/40 backdrop-blur p-6 border border-white/10">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          Room {code}
        </div>
        <h1 className="font-display text-3xl text-white mt-2">Join the game</h1>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setJoinError(null);
          }}
          onBlur={() => setNameTouched(true)}
          placeholder="Your name"
          maxLength={32}
          autoComplete="name"
          required
          aria-invalid={!!visibleNameError}
          className={`mt-4 w-full bg-white/10 text-white placeholder-white/40 rounded-2xl px-4 py-3 outline-none focus:bg-white/15 ${
            visibleNameError
              ? "ring-2 ring-red-300/70"
              : "focus:ring-2 focus:ring-[var(--color-park-bright)]/50"
          }`}
        />
        <p
          className={`mt-2 text-xs ${
            joinError || visibleNameError ? "text-red-200" : "text-white/55"
          }`}
        >
          {joinError ?? visibleNameError ?? "Required. Use the name your friends will recognize."}
        </p>
        <div className="mt-5">
          <div className="text-xs uppercase tracking-widest text-white/60 mb-2">
            Choose your team
          </div>
          {state.teams.length === 0 ? (
            <p className="text-sm text-white/60">
              The host has not created teams yet — ask them to add one.
            </p>
          ) : (
            <div className={`grid ${teamGridClass} gap-2`}>
              {state.teams.map((t) => {
                const c = teamColorClasses(t.color);
                const members = playersOnTeam(state, t.id);
                const joining = joiningTeamId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void joinTeam(t.id)}
                    disabled={submitting}
                    className={`rounded-2xl border p-4 text-left min-h-[5.5rem] transition ${c.chip} ${joining ? "ring-2 ring-white/90 scale-[0.98]" : "hover:ring-2 hover:ring-white/40 active:scale-[0.98]"} disabled:opacity-60`}
                  >
                    <div className="font-display text-xl">{t.name}</div>
                    <div className="text-xs mt-2 leading-relaxed opacity-80">
                      {members.length === 0
                        ? "Empty — be first to join"
                        : `${members.length} on team · ${members.map((m) => m.name).join(", ")}`}
                    </div>
                    {joining && <div className="text-xs mt-2 font-medium opacity-90">Joining…</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PlayShell>
  );
}

function PlayerScreen({
  code,
  room,
  me,
  onTeamChange,
  onRoomState,
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  me: StoredPlayer;
  onTeamChange: (p: StoredPlayer) => void;
  onRoomState: (state: import("@/lib/types").RoomState) => void;
}) {
  const state = room.state;
  const team = state.teams.find((t) => t.id === me.teamId);
  const c = team ? teamColorClasses(team.color) : null;
  const isWinner =
    state.status === "finished" &&
    getWinningStandings(computeTeamStandings(state)).some(
      (standing) => standing.team.id === me.teamId,
    );

  // ensure player exists in state list (handles room state lost after reset)
  useEffect(() => {
    const statePlayer = state.players.find((p) => p.id === me.id);
    if (statePlayer?.secretHash) return;
    postPlayerAction(room.id, {
      action: "ensure-player",
      playerId: me.id,
      name: me.name,
      teamId: me.teamId,
    })
      .then((result) => onRoomState(result.state))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, me.id]);

  return (
    <PlayShell celebratory={isWinner}>
      <div className="w-full max-w-md">
        <div
          className={`rounded-3xl border ${c?.chip ?? ""} p-4 mb-4 flex items-center justify-between`}
        >
          <div>
            <div className="text-xs uppercase tracking-widest opacity-70">
              {team?.name ?? "Team"}
            </div>
            <div className="font-display text-2xl">{me.name}</div>
            {state.currentGame && team && (
              <div className="text-xs mt-1 opacity-80">
                Your team: {formatRussianPoints(team.score)}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest opacity-70">Room</div>
            <div className="font-mono">{code}</div>
          </div>
        </div>

        <Suspense fallback={<PlayerGameLoading />}>
          {state.status === "finished" ? (
            <PlayerFinale state={state} me={me} />
          ) : state.paused ? (
            <PausedPanel />
          ) : (
            <ActivePlayerGameView
              roomId={room.id}
              state={state}
              me={me}
              fallback={
                <WaitingPanel
                  room={room}
                  me={me}
                  code={code}
                  onTeamChange={onTeamChange}
                  onRoomState={onRoomState}
                />
              }
            />
          )}
        </Suspense>
      </div>
    </PlayShell>
  );
}

function PlayerGameLoading() {
  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur p-8 border border-white/10 text-center text-white">
      <div className="font-display text-2xl">Preparing round…</div>
      <p className="text-white/60 text-sm mt-2">The screen will appear in a few seconds.</p>
    </div>
  );
}

function PausedPanel() {
  return (
    <div className="rounded-3xl bg-black/45 backdrop-blur p-8 border border-white/10 text-center text-white">
      <div className="text-xs uppercase tracking-[0.25em] text-[var(--color-park-bright)]">
        Paused
      </div>
      <div className="font-display text-3xl mt-2">Waiting for the host</div>
      <p className="text-white/60 text-sm mt-2">
        The round is paused. When the host resumes, this screen will update.
      </p>
    </div>
  );
}

function WaitingPanel({
  room,
  me,
  code,
  onTeamChange,
  onRoomState,
}: {
  room: { id: string; state: import("@/lib/types").RoomState };
  me: StoredPlayer;
  code: string;
  onTeamChange: (p: StoredPlayer) => void;
  onRoomState: (state: import("@/lib/types").RoomState) => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const state = room.state;

  async function switchTeam(teamId: string) {
    if (switching || teamId === me.teamId) return;
    setSwitching(true);
    setSwitchError(null);
    const player = getOrCreatePlayer(code, me.name, teamId);
    try {
      const result = await postPlayerAction(room.id, {
        action: "switch-team",
        playerId: me.id,
        name: player.name,
        teamId,
      });
      onRoomState(result.state);
      onTeamChange({ ...me, ...result.player, teamId, secret: me.secret });
    } catch (e) {
      console.error(e);
      setSwitchError(friendlyPlayerActionError(e, "team switch"));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur p-6 border border-white/10 text-center text-white">
      <div className="font-display text-2xl">Waiting for the host…</div>
      <GameRulesBrowser />
      <div className="mt-6 inline-flex gap-1.5">
        <span className="size-2 rounded-full bg-white/70 animate-pulse" />
        <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:150ms]" />
        <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:300ms]" />
      </div>

      <div className="mt-6 text-left">
        <TeamStandingsList state={state} highlightTeamId={me.teamId} compact />
      </div>

      <div className="mt-6 text-left">
        <div className="text-xs uppercase tracking-widest text-white/50 mb-2">Switch team</div>
        <div className="grid grid-cols-2 gap-2">
          {state.teams.map((t) => {
            const c = teamColorClasses(t.color);
            const active = me.teamId === t.id;
            const members = playersOnTeam(state, t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={switching || active}
                onClick={() => void switchTeam(t.id)}
                className={`rounded-2xl border p-3 text-left text-sm ${c.chip} ${active ? "ring-2 ring-white/80" : "opacity-80 hover:opacity-100"} disabled:cursor-default`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] mt-1 opacity-70">
                  {members.length === 0 ? "empty" : `${members.length} players`}
                </div>
              </button>
            );
          })}
        </div>
        {switchError && (
          <p className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/15 px-4 py-3 text-center text-sm text-red-100">
            {switchError}
          </p>
        )}
      </div>
    </div>
  );
}

function TeamStandingsList({
  state,
  highlightTeamId,
  compact,
}: {
  state: import("@/lib/types").RoomState;
  highlightTeamId?: string;
  compact?: boolean;
}) {
  const standings = computeTeamStandings(state);
  const hasScores = standings.some((standing) => standing.team.score > 0);
  if (!hasScores) return null;

  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-white/50 mb-2">Team scores</div>
      <div className="space-y-1.5">
        {standings.map((standing) => {
          const c = teamColorClasses(standing.team.color);
          const active = highlightTeamId === standing.team.id;
          return (
            <div
              key={standing.team.id}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${c.chip} ${active ? "ring-2 ring-white/70" : compact ? "opacity-90" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs tabular-nums opacity-70 w-4">{standing.place}</span>
                <span className="font-medium truncate">{standing.team.name}</span>
              </div>
              <span className="font-display text-lg tabular-nums shrink-0">
                {standing.team.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerFinale({
  state,
  me,
}: {
  state: import("@/lib/types").RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const standings = computeTeamStandings(state);
  const winners = getWinningStandings(standings);
  const myStanding = standings.find((standing) => standing.team.id === me.teamId);
  const isWinner = winners.some((standing) => standing.team.id === me.teamId);
  const winnerNames = winners.map((standing) => standing.team.name).join(" and ");

  return (
    <div
      className={`rounded-3xl backdrop-blur p-6 border text-center text-white ${
        isWinner
          ? "bg-gradient-to-b from-[var(--color-park-bright)]/25 to-black/40 border-[var(--color-park-bright)]/40"
          : "bg-black/40 border-white/10"
      }`}
    >
      <div className="text-4xl">{isWinner ? "🏆" : "🎉"}</div>
      <div className="text-xs uppercase tracking-[0.25em] text-[var(--color-park-bright)] mt-3">
        Party finale
      </div>
      {myStanding && (
        <div className="font-display text-2xl mt-3">
          You placed {formatRussianPlace(myStanding.place)}
        </div>
      )}
      <p className="text-white/70 text-sm mt-2">
        {winners.length === 1 ? `Team ${winnerNames} won!` : `Tie: ${winnerNames}!`}
      </p>
      {isWinner && (
        <p className="text-[var(--color-park-bright)] text-sm mt-2 font-medium">
          You are on the winning team — legend status. 🎊
        </p>
      )}

      <div className="mt-6 text-left">
        <TeamStandingsList state={state} highlightTeamId={me.teamId} />
      </div>

      <p className="text-white/50 text-xs mt-6">Waiting for the host's next move…</p>
    </div>
  );
}

function PlayShell({ children, celebratory }: { children: ReactNode; celebratory?: boolean }) {
  return (
    <main
      className={`min-h-dvh flex items-start sm:items-center justify-center px-4 py-6 park-gradient ${
        celebratory
          ? "[background-image:linear-gradient(160deg,oklch(0.35_0.12_145),oklch(0.22_0.08_160))]"
          : ""
      }`}
    >
      {children}
    </main>
  );
}
