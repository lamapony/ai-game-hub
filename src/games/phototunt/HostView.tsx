// Photo Hunt host orchestration: AI invents a task, players upload one photo each within a timer,
// AI ranks all photos, host awards points to teams and speaks the verdict.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { postHostArtifact } from "@/lib/host-artifact-client";
import { updateRoomState, genId } from "@/lib/room";
import { generatePhotoTask, judgePhotos } from "@/lib/ai/phototunt.functions";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import type { PhotoHuntState, RoomState, Team, PhotoHuntResultEntry } from "@/lib/types";

const HUNT_MS = 60_000;
const POINTS_BY_RANK = [0, 5, 3, 2, 1]; // rank 1 → 5pts, 2 → 3, 3 → 2, others → 1

type PhotoRow = {
  id: string;
  room_id: string;
  round_id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  photo_url: string;
  rank: number | null;
  ai_comment: string | null;
  points: number | null;
};

export function PhotoHuntHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const ph = state.phototunt!;
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const judgedRef = useRef<string | null>(null);
  const taskSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Load + subscribe to this round's photos
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("photos")
        .select("*")
        .eq("room_id", roomId)
        .eq("round_id", ph.roundId)
        .order("created_at", { ascending: true });
      if (!cancelled) setPhotos((data as PhotoRow[]) ?? []);
    }
    load();
    const sub = supabase
      .channel(`photos:${roomId}:${ph.roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "photos", filter: `room_id=eq.${roomId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
  }, [roomId, ph.roundId]);

  const update = (patch: Partial<PhotoHuntState>) =>
    updateRoomState(roomId, { ...state, phototunt: { ...ph, ...patch } });

  // Briefing → auto-generate task
  useEffect(() => {
    if (state.paused) return;
    if (ph.phase === "briefing" && !ph.task && !busy) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, ph.phase, ph.task]);

  async function generate() {
    setBusy("Дух парка придумывает охоту…");
    try {
      const r = await generatePhotoTask({ data: { pastTasks: ph.pastTasks ?? [] } });
      // speak intro + task once
      if (taskSpokenRef.current !== ph.roundId) {
        taskSpokenRef.current = ph.roundId;
        speak(`${r.intro} ${r.task}`);
      }
      await update({ task: r.task, intro: r.intro, aiFallback: r.fallback });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  function startHunt() {
    update({
      phase: "hunting",
      huntEndsAt: Date.now() + HUNT_MS,
      hunterIds: state.players.map((player) => player.id),
    });
  }

  function latestPhotoPerPlayer(rows: PhotoRow[]) {
    const map = new Map<string, PhotoRow>();
    for (const row of rows) map.set(row.player_id, row);
    return [...map.values()];
  }

  // Auto-end hunt when timer runs out OR every hunter submitted
  useEffect(() => {
    if (state.paused) return;
    if (ph.phase !== "hunting") return;
    const hunterIds = ph.hunterIds ?? state.players.map((player) => player.id);
    const submittedIds = new Set(photos.map((photo) => photo.player_id));
    const allDone = hunterIds.length > 0 && hunterIds.every((id) => submittedIds.has(id));
    const timeUp = ph.huntEndsAt && now >= ph.huntEndsAt;
    const uniquePhotos = latestPhotoPerPlayer(photos);
    if (allDone || timeUp) {
      if (uniquePhotos.length === 0) {
        // Nothing to judge → straight to results with empty list.
        update({ phase: "results", results: [] });
      } else if (judgedRef.current !== ph.roundId) {
        judgedRef.current = ph.roundId;
        runJudgement(uniquePhotos);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.paused,
    ph.phase,
    ph.huntEndsAt,
    ph.hunterIds,
    now,
    photos.length,
    state.players.length,
  ]);

  useEffect(() => {
    if (!state.paused) return;
    audioRef.current?.pause();
  }, [state.paused]);

  async function runJudgement(judgingPhotos: PhotoRow[]) {
    setBusy("AI рассматривает фотографии…");
    try {
      await update({ phase: "judging" });
      const r = await judgePhotos({
        data: {
          task: ph.task ?? "",
          photos: judgingPhotos.map((p) => ({
            playerId: p.player_id,
            playerName: p.player_name,
            url: p.photo_url,
          })),
        },
      });

      const byPlayer = new Map(r.ranking.map((e) => [e.playerId, e]));
      const results: PhotoHuntResultEntry[] = judgingPhotos
        .map((p) => {
          const judged = byPlayer.get(p.player_id);
          const rank = judged?.rank ?? 99;
          const points = POINTS_BY_RANK[rank] ?? 1;
          return {
            playerId: p.player_id,
            playerName: p.player_name,
            teamId: p.team_id,
            photoUrl: p.photo_url,
            rank,
            points,
            comment: judged?.comment ?? "—",
          };
        })
        .sort((a, b) => a.rank - b.rank);

      await postHostArtifact(roomId, {
        action: "photo-results",
        results: results
          .map((res) => {
            const row = judgingPhotos.find((p) => p.player_id === res.playerId);
            return row
              ? { id: row.id, rank: res.rank, comment: res.comment, points: res.points }
              : null;
          })
          .filter((row): row is { id: string; rank: number; comment: string; points: number } =>
            Boolean(row),
          ),
      });

      // Award points per team
      const teamDelta = new Map<string, number>();
      results.forEach((res) => {
        teamDelta.set(res.teamId, (teamDelta.get(res.teamId) ?? 0) + res.points);
      });
      const teams: Team[] = state.teams.map((t) =>
        teamDelta.has(t.id) ? { ...t, score: t.score + (teamDelta.get(t.id) ?? 0) } : t,
      );

      await updateRoomState(roomId, {
        ...state,
        teams,
        phototunt: {
          ...ph,
          phase: "results",
          results,
          aiFallback: ph.aiFallback || r.fallback,
          pastTasks: [...(ph.pastTasks ?? []), ph.task ?? ""].filter(Boolean),
        },
      });
      speak(r.verdict);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  function speak(text: string) {
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = `/api/speak?text=${encodeURIComponent(text)}`;
      audioRef.current.play().catch(() => {});
    } catch {
      /* */
    }
  }

  function nextRound() {
    updateRoomState(roomId, {
      ...state,
      phototunt: {
        phase: "briefing",
        roundId: genId("ph"),
        aiFallback: undefined,
        pastTasks: [...(ph.pastTasks ?? []), ph.task ?? ""].filter(Boolean),
      },
    });
  }

  function backToHub() {
    updateRoomState(roomId, { ...state, currentGame: null, phototunt: undefined, status: "lobby" });
  }

  const remaining = ph.phase === "hunting" ? Math.max(0, (ph.huntEndsAt ?? now) - now) : 0;
  const hunterIds = ph.hunterIds ?? state.players.map((player) => player.id);
  const submittedIds = new Set(photos.map((photo) => photo.player_id));
  const submitted = hunterIds.filter((id) => submittedIds.has(id)).length;
  const totalPlayers = hunterIds.length;
  const displayPhotos = latestPhotoPerPlayer(photos);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl park-gradient p-6 text-white">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">Фотоохота</div>
            <h2 className="font-display text-3xl mt-1">{phaseTitle(ph.phase)}</h2>
          </div>
          {busy && <div className="text-xs text-white/80 animate-pulse">{busy}</div>}
        </div>
      </div>

      {ph.phase === "briefing" && (
        <Panel>
          {ph.aiFallback && <AiFallbackNotice />}
          {!ph.task ? (
            <div className="font-display text-2xl">Дух парка диктует задание…</div>
          ) : (
            <>
              <div className="text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
                Задание
              </div>
              <p className="font-display text-3xl mt-1 leading-tight">«{ph.task}»</p>
              <p className="mt-4 text-sm text-white/70">
                У каждого игрока на телефоне появится задание. Когда все готовы — жми старт, у них
                будет {Math.round(HUNT_MS / 1000)} секунд.
              </p>
              <button
                onClick={startHunt}
                className="mt-5 w-full rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-display text-xl py-4"
              >
                🏃 Поехали! ({Math.round(HUNT_MS / 1000)} сек)
              </button>
              <button
                onClick={generate}
                className="mt-2 w-full rounded-2xl bg-white/5 text-white/70 text-sm py-2"
              >
                ↻ Другое задание
              </button>
            </>
          )}
        </Panel>
      )}

      {ph.phase === "hunting" && (
        <Panel>
          <div className="flex items-baseline justify-between">
            <div className="font-display text-2xl">Все охотятся</div>
            <div className="font-display text-5xl tabular-num text-[var(--color-park-bright)]">
              {formatClock(remaining)}
            </div>
          </div>
          <p className="mt-3 text-white/80">«{ph.task}»</p>
          <div className="mt-4 flex items-baseline justify-between">
            <div className="text-sm text-white/60">Прислали кадр</div>
            <div className="font-display text-2xl tabular-num">
              {submitted} / {totalPlayers}
            </div>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[var(--color-park-bright)] transition-all"
              style={{ width: `${totalPlayers ? (submitted / totalPlayers) * 100 : 0}%` }}
            />
          </div>
          {displayPhotos.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {displayPhotos.map((p) => (
                <div
                  key={p.id}
                  className="aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/10"
                >
                  <img
                    src={p.photo_url}
                    alt={p.player_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {ph.phase === "judging" && (
        <Panel>
          <div className="font-display text-2xl">
            AI сравнивает {displayPhotos.length}{" "}
            {displayPhotos.length === 1 ? "фотографию" : "фотографий"}…
          </div>
          <p className="mt-3 text-white/65 text-sm">Дух парка щурится и придумывает гадости.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {displayPhotos.map((p) => (
              <div
                key={p.id}
                className="aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/10 animate-pulse"
              >
                <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </Panel>
      )}

      {ph.phase === "results" && ph.results && (
        <Panel>
          {ph.aiFallback && <AiFallbackNotice />}
          <div className="text-xs uppercase tracking-widest text-white/60">Вердикт духа парка</div>
          <div className="font-display text-2xl mt-1">«{ph.task}»</div>
          {ph.results.length === 0 ? (
            <p className="mt-4 text-white/70">Никто не прислал ни одного фото. Грустно.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {ph.results.map((r) => {
                const team = state.teams.find((t) => t.id === r.teamId);
                const c = team ? teamColorClasses(team.color) : null;
                const medal =
                  r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `${r.rank}.`;
                return (
                  <li
                    key={r.playerId}
                    className="rounded-2xl bg-background/50 border p-3 flex gap-3"
                  >
                    <img
                      src={r.photoUrl}
                      alt=""
                      className="size-24 rounded-xl object-cover bg-black/30 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-display text-xl">
                          {medal} {r.playerName}
                        </div>
                        <div className={`text-xs rounded-full px-2 py-0.5 border ${c?.chip ?? ""}`}>
                          +{r.points} {team?.name}
                        </div>
                      </div>
                      <p className="text-sm text-white/85 mt-1 leading-snug">«{r.comment}»</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={nextRound}
              className="flex-1 min-w-[180px] rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-medium px-5 py-3"
            >
              Следующая охота →
            </button>
            <button onClick={backToHub} className="rounded-2xl bg-white/10 text-white px-5 py-3">
              В меню игр
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function phaseTitle(p: PhotoHuntState["phase"]) {
  return { briefing: "Задание", hunting: "Охота", judging: "AI судит", results: "Победители" }[p];
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl bg-card border p-6 text-white">{children}</div>;
}

function AiFallbackNotice() {
  return (
    <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      AI-провайдер не ответил стабильно, поэтому раунд продолжен в аварийном режиме.
    </div>
  );
}
