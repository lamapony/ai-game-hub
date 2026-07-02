// Soundscape host orchestration: drives phases, listens to submissions and votes,
// runs AI composition, and plays slot-1 cues itself.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateRoomState, genId } from "@/lib/room";
import { SOUND_RECORDING_MS, SOUND_TOPICS_MS } from "@/lib/host-controls";
import { generateTopics, composeMix, judgeMix } from "@/lib/ai/soundscape.functions";
import type { RoomState, SoundscapeMix, SoundscapeState, Team } from "@/lib/types";
import { Orchestra } from "./Orchestra";
import { teamColorClasses, formatClock } from "@/lib/team-style";

const RECORDING_MS = SOUND_RECORDING_MS;
const VOTING_MS = 30_000;
const PLAYBACK_TOTAL_MS = 65_000;

type SubmissionRow = {
  id: string;
  team_id: string;
  player_id: string;
  player_name: string;
  audio_url: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  round_id: string;
};

type VoteRow = {
  id: string;
  target_team_id: string;
  voter_player_id: string;
  category: string;
  round_id: string;
};

export function SoundscapeHost({
  roomId,
  code,
  state,
}: {
  roomId: string;
  code: string;
  state: RoomState;
}) {
  const snd = state.soundscape!;
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [mixNotice, setMixNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Load submissions + votes for this round and subscribe
  useEffect(() => {
    if (!snd.roundId) return;
    let cancelled = false;
    (async () => {
      const [{ data: subs }, { data: vs }] = await Promise.all([
        supabase.from("submissions").select("*").eq("room_id", roomId).eq("round_id", snd.roundId),
        supabase.from("votes").select("*").eq("room_id", roomId).eq("round_id", snd.roundId),
      ]);
      if (cancelled) return;
      setSubmissions((subs as SubmissionRow[]) ?? []);
      setVotes((vs as VoteRow[]) ?? []);
    })();

    const ch = supabase
      .channel(`snd:${snd.roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions", filter: `room_id=eq.${roomId}` },
        (p) => {
          const row = p.new as SubmissionRow;
          if (row.round_id === snd.roundId) setSubmissions((s) => [...s, row]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes", filter: `room_id=eq.${roomId}` },
        (p) => {
          const row = p.new as VoteRow;
          if (row.round_id === snd.roundId) setVotes((s) => [...s, row]);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [roomId, snd.roundId]);

  const update = (patch: Partial<SoundscapeState>) =>
    updateRoomState(roomId, { ...state, soundscape: { ...snd, ...patch } });

  const teamsWithClips = useMemo(() => {
    const map: Record<string, SubmissionRow[]> = {};
    for (const s of submissions) (map[s.team_id] ??= []).push(s);
    return map;
  }, [submissions]);

  // ===== PHASE: topics =====
  async function pickTopRatedTopic() {
    const counts: Record<string, number> = {};
    Object.values(snd.topicVotes ?? {}).forEach((t) => {
      counts[t] = (counts[t] ?? 0) + 1;
    });
    const winner =
      (snd.topics ?? [])
        .map((t) => [t, counts[t] ?? 0] as const)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? snd.topics?.[0];
    if (!winner) return;
    await update({
      phase: "recording",
      topic: winner,
      topicsEndsAt: undefined,
      recordingEndsAt: Date.now() + RECORDING_MS,
    });
  }

  async function triggerTopics() {
    setBusy("topics");
    try {
      const result = await generateTopics({ data: {} });
      await update({
        phase: "topics",
        topics: result.topics,
        topicVotes: {},
        aiFallback: result.fallback,
        topicsEndsAt: Date.now() + SOUND_TOPICS_MS,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (state.paused) return;
    if (snd.phase === "topics" && !snd.topics) triggerTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, snd.phase]);

  // Auto-lock theme when topics timer expires
  useEffect(() => {
    if (state.paused) return;
    if (snd.phase !== "topics" || !snd.topics?.length || !snd.topicsEndsAt) return;
    if (now < snd.topicsEndsAt) return;
    void pickTopRatedTopic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, snd.phase, snd.topics, snd.topicsEndsAt, now]);

  // Auto-end recording
  useEffect(() => {
    if (state.paused) return;
    if (snd.phase !== "recording" || !snd.recordingEndsAt) return;
    if (now >= snd.recordingEndsAt) startMixing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, now, snd.phase, snd.recordingEndsAt]);

  async function startMixing() {
    setBusy("mixing");
    setMixNotice(null);
    try {
      const mixes: Record<string, SoundscapeMix> = {};
      for (const team of state.teams) {
        const clips = (teamsWithClips[team.id] ?? []).filter((c) => c.audio_url);
        if (clips.length === 0) continue;
        try {
          const mix = await composeMix({
            data: {
              teamName: team.name,
              topic: snd.topic ?? "",
              clips: clips.map((c) => ({
                url: c.audio_url!,
                transcript: c.transcript ?? "",
                durationMs: (c.duration_seconds ?? 5) * 1000,
                playerName: c.player_name,
              })),
            },
          });
          mixes[team.id] = { ...mix, teamId: team.id };
        } catch (mixError) {
          console.error(mixError);
          mixes[team.id] = naiveLocalMix(team.id, team.name, clips);
        }
      }
      const teamOrder = state.teams.filter((t) => mixes[t.id]);
      if (teamOrder.length === 0) {
        await update({ phase: "idle" });
        setMixNotice("Ни одна команда не прислала звуки — можно записать ещё раз.");
        return;
      }
      await update({
        phase: "playback",
        mixes,
        playback: { teamId: teamOrder[0].id, startAt: Date.now() + 3000 },
      });
    } catch (e) {
      console.error(e);
      setMixNotice("Сведение не удалось — попробуйте записать звуки ещё раз.");
      await update({
        phase: "recording",
        recordingEndsAt: Date.now() + RECORDING_MS,
        mixes: undefined,
        playback: undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  function restartRecording() {
    setMixNotice(null);
    void update({
      phase: "recording",
      recordingEndsAt: Date.now() + RECORDING_MS,
      mixes: undefined,
      playback: undefined,
    });
  }

  function backToHub() {
    updateRoomState(roomId, {
      ...state,
      currentGame: null,
      soundscape: undefined,
      status: "lobby",
    });
  }

  // Advance through playback teams
  useEffect(() => {
    if (state.paused) return;
    if (snd.phase !== "playback" || !snd.playback || !snd.mixes) return;
    const tEnd = snd.playback.startAt + PLAYBACK_TOTAL_MS;
    if (now < tEnd) return;
    const order = state.teams.filter((t) => snd.mixes![t.id]);
    const idx = order.findIndex((t) => t.id === snd.playback!.teamId);
    const next = order[idx + 1];
    if (next) {
      update({ playback: { teamId: next.id, startAt: Date.now() + 2500 } });
    } else {
      update({ phase: "voting", voteOpenAt: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, now, snd.phase, snd.playback?.teamId, snd.playback?.startAt]);

  // End voting after timer
  useEffect(() => {
    if (state.paused) return;
    if (snd.phase !== "voting" || !snd.voteOpenAt) return;
    if (now < snd.voteOpenAt + VOTING_MS) return;
    finishVoting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, now, snd.phase, snd.voteOpenAt]);

  async function finishVoting() {
    setBusy("scoring");
    try {
      // Tally votes: 5 points per vote, capped at 30 per category per team
      const perTeam: Record<string, number> = {};
      const breakdown: Record<string, Record<string, number>> = {};
      for (const v of votes) {
        perTeam[v.target_team_id] = (perTeam[v.target_team_id] ?? 0) + 5;
        (breakdown[v.target_team_id] ??= {})[v.category] =
          ((breakdown[v.target_team_id] ??= {})[v.category] ?? 0) + 1;
      }
      // AI bonus + feedback per team
      const updatedMixes = { ...(snd.mixes ?? {}) };
      for (const team of state.teams) {
        const mix = updatedMixes[team.id];
        if (!mix) continue;
        const clips = teamsWithClips[team.id] ?? [];
        try {
          const { feedback, bonus, fallback } = await judgeMix({
            data: {
              teamName: team.name,
              topic: snd.topic ?? "",
              clipsSummary:
                clips.map((c) => c.transcript || "(non-verbal)").join(" | ") || "no recordings",
            },
          });
          updatedMixes[team.id] = {
            ...mix,
            feedback,
            bonusPoints: bonus,
            aiFallback: mix.aiFallback || fallback,
          };
          perTeam[team.id] = (perTeam[team.id] ?? 0) + bonus;
        } catch {
          /* keep going */
        }
      }
      // Apply scores
      const newTeams: Team[] = state.teams.map((t) => ({
        ...t,
        score: t.score + (perTeam[t.id] ?? 0),
      }));
      await updateRoomState(roomId, {
        ...state,
        teams: newTeams,
        soundscape: { ...snd, phase: "results", mixes: updatedMixes },
      });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  // Host plays slot 1
  const intro =
    snd.phase === "playback" && snd.playback && snd.mixes?.[snd.playback.teamId]
      ? { text: snd.mixes[snd.playback.teamId].intro, slot: 1 }
      : null;
  const activeMix =
    snd.phase === "playback" && snd.playback ? snd.mixes?.[snd.playback.teamId] : null;

  return (
    <div className="space-y-4">
      <Orchestra
        slot={1}
        mix={state.paused ? null : activeMix}
        startAt={state.paused ? null : (snd.playback?.startAt ?? null)}
        intro={state.paused ? null : intro}
      />

      <div className="rounded-3xl park-gradient p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
              Soundscape Battle
            </div>
            <h2 className="font-display text-3xl mt-1">{phaseTitle(snd.phase)}</h2>
          </div>
          {busy && <div className="text-xs text-white/80 animate-pulse">{busy}…</div>}
        </div>
        {snd.topic && (
          <div className="mt-2 text-white/85">
            Theme: <span className="font-medium">"{snd.topic}"</span>
          </div>
        )}
      </div>

      {snd.phase === "topics" && <TopicsPanel snd={snd} now={now} onPick={pickTopRatedTopic} />}
      {snd.phase === "recording" && (
        <RecordingPanel
          snd={snd}
          state={state}
          subs={submissions}
          now={now}
          notice={mixNotice}
          onEnd={startMixing}
        />
      )}
      {snd.phase === "idle" && (
        <IdleRecoveryPanel notice={mixNotice} onRetry={restartRecording} onHub={backToHub} />
      )}
      {snd.phase === "mixing" && (
        <div className="rounded-3xl bg-card p-8 border text-center">
          <div className="font-display text-2xl">Composing the symphony…</div>
          <p className="text-muted-foreground text-sm mt-2">
            AI is mapping every clip across the park.
          </p>
        </div>
      )}
      {snd.phase === "playback" && snd.playback && (
        <PlaybackPanel state={state} snd={snd} now={now} />
      )}
      {snd.phase === "voting" && <VotingPanel state={state} snd={snd} votes={votes} now={now} />}
      {snd.phase === "results" && (
        <ResultsPanel
          state={state}
          snd={snd}
          onClose={() =>
            updateRoomState(roomId, {
              ...state,
              currentGame: null,
              soundscape: undefined,
              status: "lobby",
            })
          }
        />
      )}
    </div>
  );
}

function phaseTitle(p: SoundscapeState["phase"]) {
  return {
    idle: "Пауза",
    topics: "Pick a theme",
    recording: "Recording the park",
    mixing: "Composing",
    playback: "Listen",
    voting: "Vote",
    results: "Results",
  }[p];
}

function TopicsPanel({
  snd,
  now,
  onPick,
}: {
  snd: SoundscapeState;
  now: number;
  onPick: () => void;
}) {
  const counts: Record<string, number> = {};
  Object.values(snd.topicVotes ?? {}).forEach((t) => {
    counts[t] = (counts[t] ?? 0) + 1;
  });
  const total = Object.keys(snd.topicVotes ?? {}).length;
  const remaining = snd.topicsEndsAt ? Math.max(0, snd.topicsEndsAt - now) : null;
  return (
    <div className="rounded-3xl bg-card p-6 border space-y-4">
      {snd.aiFallback && <AiFallbackNotice />}
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Игроки голосуют с телефонов. Голосов: {total}.
        </p>
        {remaining != null && (
          <div className="font-display text-3xl tabular-nums">{formatClock(remaining)}</div>
        )}
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {(snd.topics ?? []).map((t) => (
          <div key={t} className="rounded-2xl border bg-background p-4">
            <div className="font-display text-lg">{t}</div>
            <div className="mt-2 text-xs text-muted-foreground tabular-num">
              {counts[t] ?? 0} votes
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onPick}
        className="rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.18_0.05_160)] px-5 py-2.5 font-medium"
      >
        Зафиксировать тему и начать запись →
      </button>
    </div>
  );
}

function RecordingPanel({
  snd,
  state,
  subs,
  now,
  notice,
  onEnd,
}: {
  snd: SoundscapeState;
  state: RoomState;
  subs: SubmissionRow[];
  now: number;
  notice: string | null;
  onEnd: () => void;
}) {
  const remaining = (snd.recordingEndsAt ?? now) - now;
  const per: Record<string, number> = {};
  for (const s of subs) per[s.team_id] = (per[s.team_id] ?? 0) + 1;
  return (
    <div className="rounded-3xl bg-card p-6 border">
      {notice && (
        <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {notice}
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <div className="font-display text-5xl tabular-num">{formatClock(remaining)}</div>
        <button
          onClick={onEnd}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          end now
        </button>
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        Teams have 3 minutes to capture sounds across the park. Each clip ≤ 15 seconds. Every player
        can record.
      </p>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {state.teams.map((t) => {
          const c = teamColorClasses(t.color);
          return (
            <div key={t.id} className={`rounded-2xl border ${c.chip} p-3`}>
              <div className="text-xs">{t.name}</div>
              <div className="font-display text-3xl tabular-num">{per[t.id] ?? 0}</div>
              <div className="text-[10px] opacity-70 uppercase tracking-wide">clips</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IdleRecoveryPanel({
  notice,
  onRetry,
  onHub,
}: {
  notice: string | null;
  onRetry: () => void;
  onHub: () => void;
}) {
  return (
    <div className="rounded-3xl bg-card p-6 border space-y-4 text-center">
      <div className="font-display text-2xl">Звуков не хватило</div>
      <p className="text-muted-foreground text-sm">
        {notice ?? "Ни одна команда не прислала клипы. Можно попробовать ещё раз."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={onRetry}
          className="rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.18_0.05_160)] px-5 py-2.5 font-medium"
        >
          Записать ещё раз
        </button>
        <button onClick={onHub} className="rounded-2xl border bg-background px-5 py-2.5 text-sm">
          В hub
        </button>
      </div>
    </div>
  );
}

function naiveLocalMix(teamId: string, teamName: string, clips: SubmissionRow[]): SoundscapeMix {
  return {
    teamId,
    intro: `Команда ${teamName} — парк слушает без AI.`,
    cues: clips.map((clip, index) => ({
      atMs: index * 6000,
      slot: 2 + (index % 4),
      type: "audio" as const,
      url: clip.audio_url!,
      durationMs: (clip.duration_seconds ?? 5) * 1000,
    })),
    totalMs: 60000,
    aiFallback: true,
  };
}

function PlaybackPanel({
  state,
  snd,
  now,
}: {
  state: RoomState;
  snd: SoundscapeState;
  now: number;
}) {
  const team = state.teams.find((t) => t.id === snd.playback!.teamId);
  const mix = snd.mixes?.[snd.playback!.teamId];
  const c = team ? teamColorClasses(team.color) : null;
  const elapsed = Math.max(0, now - snd.playback!.startAt);
  const pct = Math.min(100, (elapsed / PLAYBACK_TOTAL_MS) * 100);
  return (
    <div className="rounded-3xl bg-card p-6 border">
      {mix?.aiFallback && <AiFallbackNotice />}
      <div
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs ${c?.chip ?? ""}`}
      >
        Now playing
      </div>
      <h3 className="font-display text-4xl mt-2">{team?.name}</h3>
      <div className="text-sm text-muted-foreground mt-1">
        across all 5 speakers — listen for movement in the park.
      </div>
      <div className="mt-5 relative h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`absolute inset-y-0 left-0 ${c?.bg ?? ""}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((slot) => (
          <div key={slot} className="rounded-xl bg-background border p-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              slot {slot}
            </div>
            <div className="text-xs mt-0.5 truncate">
              {state.speakerSlots?.[slot]?.name ?? `Speaker ${slot}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VotingPanel({
  state,
  snd,
  votes,
  now,
}: {
  state: RoomState;
  snd: SoundscapeState;
  votes: VoteRow[];
  now: number;
}) {
  const remaining = Math.max(0, (snd.voteOpenAt ?? now) + VOTING_MS - now);
  const counts: Record<string, number> = {};
  for (const v of votes) counts[v.target_team_id] = (counts[v.target_team_id] ?? 0) + 1;
  return (
    <div className="rounded-3xl bg-card p-6 border">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-2xl">Vote on your phones</h3>
        <div className="font-display text-3xl tabular-num">{formatClock(remaining)}</div>
      </div>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {state.teams.map((t) => {
          const c = teamColorClasses(t.color);
          return (
            <div key={t.id} className={`rounded-2xl border ${c.chip} p-3`}>
              <div className="text-xs">{t.name}</div>
              <div className="font-display text-3xl tabular-num">{counts[t.id] ?? 0}</div>
              <div className="text-[10px] opacity-70 uppercase tracking-wide">votes</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultsPanel({
  state,
  snd,
  onClose,
}: {
  state: RoomState;
  snd: SoundscapeState;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      {state.teams
        .filter((t) => snd.mixes?.[t.id])
        .sort((a, b) => (snd.mixes![b.id].bonusPoints ?? 0) - (snd.mixes![a.id].bonusPoints ?? 0))
        .map((t) => {
          const m = snd.mixes![t.id];
          const c = teamColorClasses(t.color);
          return (
            <div key={t.id} className={`rounded-3xl border bg-card p-5 ${c.ring}`}>
              {m.aiFallback && <AiFallbackNotice />}
              <div className="flex items-baseline justify-between">
                <div className={`font-display text-xl ${c.text}`}>{t.name}</div>
                <div className="font-display text-3xl tabular-num">+{m.bonusPoints ?? 0}</div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">"{m.feedback ?? "—"}"</p>
            </div>
          );
        })}
      <button
        onClick={onClose}
        className="w-full rounded-2xl border bg-card py-3 text-sm hover:bg-accent"
      >
        Back to lobby
      </button>
    </div>
  );
}

function AiFallbackNotice() {
  return (
    <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      AI provider did not respond reliably, so this part continued in fallback mode.
    </div>
  );
}
