import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRoom, updateRoomState, getOrCreatePlayer, genId } from "@/lib/room";
import { playerStorageKey } from "@/lib/event-profile";
import { teamColorClasses } from "@/lib/team-style";
import { playersOnTeam } from "@/lib/teams";

const SoundscapePlayer = lazy(() =>
  import("@/games/soundscape/PlayerView").then((module) => ({
    default: module.SoundscapePlayer,
  })),
);
const ChallengePlayer = lazy(() =>
  import("@/games/challenge/PlayerView").then((module) => ({
    default: module.ChallengePlayer,
  })),
);
const PhotoHuntPlayer = lazy(() =>
  import("@/games/phototunt/PlayerView").then((module) => ({
    default: module.PhotoHuntPlayer,
  })),
);
const TrackGuessPlayer = lazy(() =>
  import("@/games/trackguess/PlayerView").then((module) => ({
    default: module.TrackGuessPlayer,
  })),
);

export const Route = createFileRoute("/play/$code")({
  component: PlayPage,
});

function PlayPage() {
  const { code } = Route.useParams();
  const { room, loading, error } = useRoom(code);
  const [me, setMe] = useState<{ id: string; name: string; teamId: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(playerStorageKey(code));
    if (stored) setMe(JSON.parse(stored));
  }, [code]);

  if (loading)
    return (
      <PlayShell>
        <div className="text-white/70">Загружаем…</div>
      </PlayShell>
    );
  if (error || !room)
    return (
      <PlayShell>
        <div className="w-full max-w-sm rounded-3xl bg-black/45 backdrop-blur p-6 border border-white/10 text-center">
          <div className="text-4xl">🤷</div>
          <h2 className="font-display text-2xl text-white mt-2">
            Комната <span className="font-mono">{code}</span> не найдена
          </h2>
          <p className="text-sm text-white/70 mt-2">
            Проверь у ведущего код на экране — там 4 буквы.
          </p>
          <Link
            to="/"
            className="inline-block mt-5 rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-medium py-3 px-5"
          >
            ← На главную
          </Link>
        </div>
      </PlayShell>
    );

  if (!me) {
    return <JoinForm code={code} room={room} onJoined={(p) => setMe(p)} />;
  }

  return <PlayerScreen code={code} room={room} me={me} onTeamChange={setMe} />;
}

function JoinForm({
  code,
  room,
  onJoined,
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  onJoined: (p: { id: string; name: string; teamId: string }) => void;
}) {
  const state = room.state;
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);

  async function joinTeam(teamId: string) {
    if (submitting || !teamId) return;
    setJoiningTeamId(teamId);
    setSubmitting(true);
    const finalName = name.trim() || `Игрок ${state.players.length + 1}`;
    const player = getOrCreatePlayer(code, finalName, teamId);
    const players = [
      ...state.players.filter((p) => p.id !== player.id),
      { ...player, joinedAt: Date.now() },
    ];
    try {
      await updateRoomState(room.id, { ...state, players });
      onJoined(player);
    } catch (e) {
      console.error(e);
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

  return (
    <PlayShell>
      <div className="w-full max-w-md rounded-3xl bg-black/40 backdrop-blur p-6 border border-white/10">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          Комната {code}
        </div>
        <h1 className="font-display text-3xl text-white mt-2">Заходи в игру</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Твоё имя (можно пропустить)"
          className="mt-4 w-full bg-white/10 text-white placeholder-white/40 rounded-2xl px-4 py-3 outline-none focus:bg-white/15"
        />
        <div className="mt-5">
          <div className="text-xs uppercase tracking-widest text-white/60 mb-2">
            Нажми на свою команду
          </div>
          {state.teams.length === 0 ? (
            <p className="text-sm text-white/60">
              Ведущий ещё не создал команды — попроси добавить.
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
                        ? "Пусто — заходи первым"
                        : `${members.length} в команде · ${members.map((m) => m.name).join(", ")}`}
                    </div>
                    {joining && <div className="text-xs mt-2 font-medium opacity-90">Заходим…</div>}
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
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  me: { id: string; name: string; teamId: string };
  onTeamChange: (p: { id: string; name: string; teamId: string }) => void;
}) {
  const state = room.state;
  const team = state.teams.find((t) => t.id === me.teamId);
  const c = team ? teamColorClasses(team.color) : null;

  // ensure player exists in state list (handles room state lost after reset)
  useEffect(() => {
    if (state.players.find((p) => p.id === me.id)) return;
    updateRoomState(room.id, {
      ...state,
      players: [...state.players, { ...me, joinedAt: Date.now() }],
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, me.id]);

  return (
    <PlayShell>
      <div className="w-full max-w-md">
        <div
          className={`rounded-3xl border ${c?.chip ?? ""} p-4 mb-4 flex items-center justify-between`}
        >
          <div>
            <div className="text-xs uppercase tracking-widest opacity-70">
              {team?.name ?? "Team"}
            </div>
            <div className="font-display text-2xl">{me.name}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest opacity-70">Комната</div>
            <div className="font-mono">{code}</div>
          </div>
        </div>

        <Suspense fallback={<PlayerGameLoading />}>
          {state.paused ? (
            <PausedPanel />
          ) : state.currentGame === "soundscape" && state.soundscape ? (
            <SoundscapePlayer roomId={room.id} state={state} me={me} />
          ) : state.currentGame === "challenge" && state.challenge ? (
            <ChallengePlayer roomId={room.id} state={state} me={me} />
          ) : state.currentGame === "phototunt" && state.phototunt ? (
            <PhotoHuntPlayer roomId={room.id} state={state} me={me} />
          ) : state.currentGame === "trackguess" && state.trackguess ? (
            <TrackGuessPlayer roomId={room.id} state={state} me={me} />
          ) : (
            <WaitingPanel room={room} me={me} code={code} onTeamChange={onTeamChange} />
          )}
        </Suspense>
      </div>
    </PlayShell>
  );
}

function PlayerGameLoading() {
  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur p-8 border border-white/10 text-center text-white">
      <div className="font-display text-2xl">Готовим раунд…</div>
      <p className="text-white/60 text-sm mt-2">Экран появится через пару секунд.</p>
    </div>
  );
}

function PausedPanel() {
  return (
    <div className="rounded-3xl bg-black/45 backdrop-blur p-8 border border-white/10 text-center text-white">
      <div className="text-xs uppercase tracking-[0.25em] text-[var(--color-park-bright)]">
        Пауза
      </div>
      <div className="font-display text-3xl mt-2">Ждём ведущего</div>
      <p className="text-white/60 text-sm mt-2">
        Раунд остановлен. Когда ведущий продолжит, экран обновится сам.
      </p>
    </div>
  );
}

function WaitingPanel({
  room,
  me,
  code,
  onTeamChange,
}: {
  room: { id: string; state: import("@/lib/types").RoomState };
  me: { id: string; name: string; teamId: string };
  code: string;
  onTeamChange: (p: { id: string; name: string; teamId: string }) => void;
}) {
  const [switching, setSwitching] = useState(false);
  const state = room.state;

  async function switchTeam(teamId: string) {
    if (switching || teamId === me.teamId) return;
    setSwitching(true);
    const player = getOrCreatePlayer(code, me.name, teamId);
    const players = state.players.map((p) =>
      p.id === me.id ? { ...p, teamId, name: player.name } : p,
    );
    try {
      await updateRoomState(room.id, { ...state, players });
      onTeamChange({ ...me, teamId });
    } catch (e) {
      console.error(e);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur p-6 border border-white/10 text-center text-white">
      <div className="font-display text-2xl">Ждём ведущего…</div>
      <p className="text-white/60 text-sm mt-2">
        Когда стартует раунд, инструкции появятся прямо здесь.
      </p>
      <div className="mt-6 inline-flex gap-1.5">
        <span className="size-2 rounded-full bg-white/70 animate-pulse" />
        <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:150ms]" />
        <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:300ms]" />
      </div>

      <div className="mt-6 text-left">
        <div className="text-xs uppercase tracking-widest text-white/50 mb-2">Сменить команду</div>
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
                  {members.length === 0 ? "пусто" : `${members.length} игроков`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh park-gradient flex items-start sm:items-center justify-center px-4 py-6">
      {children}
    </main>
  );
}

void genId;
