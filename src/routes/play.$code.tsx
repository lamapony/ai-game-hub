import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRoom, updateRoomState, getOrCreatePlayer, genId } from "@/lib/room";
import { playerStorageKey } from "@/lib/event-profile";
import { teamColorClasses } from "@/lib/team-style";

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

  return <PlayerScreen code={code} room={room} me={me} />;
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
  const r = room as { id: string; code: string; state: import("@/lib/types").RoomState };
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(r.state.teams[0]?.id ?? "forest");
  const [submitting, setSubmitting] = useState(false);

  async function join() {
    if (!name.trim()) return;
    setSubmitting(true);
    const player = getOrCreatePlayer(code, name.trim(), teamId);
    const players = [
      ...r.state.players.filter((p) => p.id !== player.id),
      { ...player, joinedAt: Date.now() },
    ];
    try {
      await updateRoomState(r.id, { ...r.state, players });
      onJoined(player);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PlayShell>
      <div className="w-full max-w-sm rounded-3xl bg-black/40 backdrop-blur p-6 border border-white/10">
        <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
          Комната {code}
        </div>
        <h1 className="font-display text-3xl text-white mt-2">Заходи в игру</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Твоё имя"
          className="mt-4 w-full bg-white/10 text-white placeholder-white/40 rounded-2xl px-4 py-3 outline-none focus:bg-white/15"
        />
        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-white/60 mb-2">Выбери команду</div>
          <div className="grid grid-cols-2 gap-2">
            {r.state.teams.map((t) => {
              const c = teamColorClasses(t.color);
              const active = teamId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTeamId(t.id)}
                  className={`rounded-2xl border p-3 text-left ${c.chip} ${active ? "ring-2 ring-white/80" : "opacity-70"}`}
                >
                  <div className="font-medium">{t.name}</div>
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={join}
          disabled={submitting || !name.trim()}
          className="mt-5 w-full rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.18_0.05_160)] font-medium py-3 disabled:opacity-50"
        >
          {submitting ? "Заходим…" : "В парк →"}
        </button>
      </div>
    </PlayShell>
  );
}

function PlayerScreen({
  code,
  room,
  me,
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  me: { id: string; name: string; teamId: string };
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
          ) : (
            <WaitingPanel />
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

function WaitingPanel() {
  return (
    <div className="rounded-3xl bg-black/40 backdrop-blur p-8 border border-white/10 text-center text-white">
      <div className="font-display text-2xl">Ждём ведущего…</div>
      <p className="text-white/60 text-sm mt-2">
        Когда стартует раунд, инструкции появятся прямо здесь.
      </p>
      <div className="mt-6 inline-flex gap-1.5">
        <span className="size-2 rounded-full bg-white/70 animate-pulse" />
        <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:150ms]" />
        <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:300ms]" />
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
