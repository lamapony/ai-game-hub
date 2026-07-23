// Challenge host orchestration: pick operator, generate task, listen for video, run judge, speak verdict.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { postHostArtifact } from "@/lib/host-artifact-client";
import { updateRoomState, genId, hostPromptAuth } from "@/lib/room";
import { CHALLENGE_BRIEFING_MS } from "@/lib/host-controls";
import { generateChallengeTask, judgeChallenge } from "@/lib/ai/challenge.functions";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import { speechUrl } from "@/lib/speech-client";
import type { ChallengeState, RoomState, Team } from "@/lib/types";

const RECORDING_MS = 25_000; // 20s record + buffer

type ChallengeRow = {
  id: string;
  round_id: string;
  task: string;
  operator_id: string;
  operator_name: string;
  video_url: string | null;
  transcript: string | null;
  score: number | null;
  ai_feedback: string | null;
  created_at: string;
};

export function ChallengeHost({
  roomId,
  code,
  state,
  onBackToHub,
}: {
  roomId: string;
  code: string;
  state: RoomState;
  onBackToHub: () => void | Promise<void>;
}) {
  const ch = state.challenge!;
  const [history, setHistory] = useState<ChallengeRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenForRef = useRef<string | null>(null);
  const judgedForRef = useRef<string | null>(null);
  const generatingRoundRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Load past challenges for this room.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("challenges")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false });
      if (!cancelled) setHistory((data as ChallengeRow[]) ?? []);
    })();
    const sub = supabase
      .channel(`challenges:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges", filter: `room_id=eq.${roomId}` },
        () => {
          supabase
            .from("challenges")
            .select("*")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              setHistory((data as ChallengeRow[]) ?? []);
            });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
  }, [roomId]);

  // Listen for the operator's "judge" broadcast (carries video frames out-of-band).
  useEffect(() => {
    const channel = supabase
      .channel(`judge:${roomId}`)
      .on("broadcast", { event: "judge" }, async (msg) => {
        const p = msg.payload as {
          roundId: string;
          operatorId?: string;
          frames: string[];
          transcript: string;
          videoUrl: string;
          operatorName: string;
          task: string;
        };
        if (p.roundId !== ch.roundId) return;
        if (!ch.operatorId || p.operatorId !== ch.operatorId) return;
        if (ch.task && p.task !== ch.task) return;
        if (judgedForRef.current === p.roundId) return;
        judgedForRef.current = p.roundId;
        await runJudgement(p);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, ch.roundId]);

  const update = (patch: Partial<ChallengeState>) =>
    updateRoomState(
      roomId,
      { ...state, challenge: { ...ch, ...patch } },
      { gameId: "challenge", roundId: ch.roundId },
    );

  // Auto-generate task on briefing entry
  useEffect(() => {
    if (state.paused) return;
    if (ch.phase === "briefing" && !ch.task && !busy) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, ch.phase, ch.task]);

  async function generate() {
    if (!ch.operatorName) return;
    const roundId = ch.roundId;
    if (generatingRoundRef.current === roundId) return;
    generatingRoundRef.current = roundId;
    setBusy("Generating task…");
    try {
      const r = await generateChallengeTask({
        data: {
          ...hostPromptAuth(roomId, code),
          operatorName: ch.operatorName,
          pastTasks: history.map((h) => h.task),
        },
      });
      const written = await update({
        task: r.task,
        aiFallback: r.fallback,
        briefingEndsAt: Date.now() + CHALLENGE_BRIEFING_MS,
      });
      if (!written) return;
      // speak intro + task via slot 1 only while this round is still active
      speak(`${r.intro} ${r.task}`);
      // Recording starts when the operator taps "Open camera" on their phone.
    } catch (e) {
      console.error(e);
    } finally {
      if (generatingRoundRef.current === roundId) generatingRoundRef.current = null;
      setBusy(null);
    }
  }

  // Auto-start recording if operator doesn't tap "Open camera"
  useEffect(() => {
    if (state.paused) return;
    if (ch.phase !== "briefing" || !ch.task || !ch.briefingEndsAt) return;
    if (now < ch.briefingEndsAt) return;
    void update({
      phase: "recording",
      briefingEndsAt: undefined,
      recordingEndsAt: Date.now() + RECORDING_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, ch.phase, ch.task, ch.briefingEndsAt, now]);

  // Auto-end recording (timeout safety; operator usually uploads earlier)
  useEffect(() => {
    if (state.paused) return;
    if (ch.phase !== "recording" || !ch.recordingEndsAt) return;
    if (now < ch.recordingEndsAt + 30_000) return; // grace for upload
    if (judgedForRef.current === ch.roundId) return;
    // No upload? Skip to results with score 0.
    update({
      phase: "results",
      result: {
        score: 0,
        feedback: "Nobody filmed anything. The park spirit is disappointed.",
        videoUrl: "",
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, now, ch.phase, ch.recordingEndsAt]);

  useEffect(() => {
    if (!state.paused) return;
    audioRef.current?.pause();
  }, [state.paused]);

  async function runJudgement(p: {
    roundId: string;
    frames: string[];
    transcript: string;
    videoUrl: string;
    operatorName: string;
    task: string;
  }) {
    setBusy("AI is watching the video…");
    try {
      await update({ phase: "judging" });
      const r = await judgeChallenge({
        data: {
          ...hostPromptAuth(roomId, code),
          task: p.task,
          transcript: p.transcript,
          frames: p.frames,
          operatorName: p.operatorName,
        },
      });
      await postHostArtifact(roomId, {
        action: "challenge-result",
        roundId: p.roundId,
        score: r.score,
        feedback: r.feedback,
      });
      // add points to operator's team
      const operator = state.players.find((pl) => pl.id === ch.operatorId);
      const teams: Team[] = state.teams.map((t) =>
        operator && t.id === operator.teamId ? { ...t, score: t.score + r.score } : t,
      );
      const written = await updateRoomState(
        roomId,
        {
          ...state,
          teams,
          challenge: {
            ...ch,
            phase: "results",
            result: {
              score: r.score,
              feedback: r.feedback,
              videoUrl: p.videoUrl,
              breakdown: r.breakdown,
            },
            aiFallback: ch.aiFallback || r.fallback,
            pastOperatorIds: [...(ch.pastOperatorIds ?? []), ch.operatorId ?? ""].filter(Boolean),
          },
        },
        { gameId: "challenge", roundId: ch.roundId },
      );
      if (!written) return;
      if (spokenForRef.current !== p.roundId) {
        spokenForRef.current = p.roundId;
        speak(r.verdict);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  function speak(text: string) {
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = speechUrl(text, roomId);
      audioRef.current.play().catch(() => {});
    } catch {
      /* */
    }
  }

  function nextRound() {
    const pastIds = new Set([...(ch.pastOperatorIds ?? []), ch.operatorId ?? ""]);
    const pool = state.players.filter((p) => !pastIds.has(p.id));
    const candidates = pool.length > 0 ? pool : state.players;
    const nextOp = candidates[Math.floor(Math.random() * candidates.length)];
    if (!nextOp) return;
    updateRoomState(
      roomId,
      {
        ...state,
        challenge: {
          phase: "briefing",
          roundId: genId("ch"),
          operatorId: nextOp.id,
          operatorName: nextOp.name,
          aiFallback: undefined,
          pastOperatorIds: [...(ch.pastOperatorIds ?? []), ch.operatorId ?? ""].filter(Boolean),
        },
      },
      { gameId: "challenge", roundId: ch.roundId },
    );
  }

  function backToHub() {
    void onBackToHub();
  }

  const operator = state.players.find((p) => p.id === ch.operatorId);
  const operatorTeam = operator ? state.teams.find((t) => t.id === operator.teamId) : null;
  const remaining =
    ch.phase === "recording"
      ? Math.max(0, (ch.recordingEndsAt ?? now) - now)
      : ch.phase === "briefing" && ch.briefingEndsAt
        ? Math.max(0, ch.briefingEndsAt - now)
        : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl park-gradient p-6 text-white">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
              Park Spirit Challenge
            </div>
            <h2 className="font-display text-3xl mt-1">{phaseTitle(ch.phase)}</h2>
          </div>
          {busy && <div className="text-xs text-white/80 animate-pulse">{busy}</div>}
        </div>
        {ch.operatorName && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
            🎥 Operator: <strong>{ch.operatorName}</strong>
            {operatorTeam && <span className="opacity-70">· {operatorTeam.name}</span>}
          </div>
        )}
      </div>

      {ch.phase === "briefing" && (
        <Panel>
          {ch.aiFallback && <AiFallbackNotice />}
          <div className="font-display text-2xl">The park spirit is setting the task…</div>
          {ch.task && <p className="mt-3 text-lg text-white">«{ch.task}»</p>}
          {ch.task && (
            <p className="mt-4 text-sm text-[var(--color-park-bright)]">
              📱 Hand the phone to operator <strong>{ch.operatorName}</strong> — they tap &quot;Open
              camera&quot; and you&apos;re off.
              {ch.briefingEndsAt && (
                <span className="block mt-2 font-display text-2xl tabular-nums">
                  {formatClock(remaining)}
                </span>
              )}
            </p>
          )}
        </Panel>
      )}

      {ch.phase === "recording" && (
        <Panel>
          <div className="flex items-baseline justify-between">
            <div className="font-display text-2xl">Filming in progress</div>
            <div className="font-display text-5xl tabular-num text-[var(--color-park-bright)]">
              {formatClock(remaining)}
            </div>
          </div>
          <p className="mt-3 text-white/80">«{ch.task}»</p>
          <p className="mt-2 text-sm text-white/55">
            When {ch.operatorName} hits &quot;Stop&quot; — the video goes to the judge.
          </p>
        </Panel>
      )}

      {ch.phase === "judging" && (
        <Panel>
          <div className="font-display text-2xl">AI is breaking down the scene…</div>
          <p className="mt-3 text-white/65 text-sm">
            Transcribing speech and scanning frames. About 10 seconds.
          </p>
          <div className="mt-4 inline-flex gap-1.5">
            <span className="size-2 rounded-full bg-white/70 animate-pulse" />
            <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:150ms]" />
            <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:300ms]" />
          </div>
        </Panel>
      )}

      {ch.phase === "results" && ch.result && (
        <Panel>
          {ch.aiFallback && <AiFallbackNotice />}
          <div className="flex items-baseline justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/60">Verdict</div>
              <div className="font-display text-7xl tabular-num text-[var(--color-park-bright)]">
                {ch.result.score}
                <span className="text-white/40 text-3xl">/10</span>
              </div>
            </div>
            {operatorTeam && (
              <div className="text-right">
                <div className="text-xs text-white/60">+{ch.result.score} to team</div>
                <div className="font-display text-lg">{operatorTeam.name}</div>
              </div>
            )}
          </div>
          <p className="mt-4 text-white text-lg leading-snug">«{ch.result.feedback}»</p>
          {ch.result.breakdown && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/75">
              <ScoreChip label="Scene" value={ch.result.breakdown.performance} />
              <ScoreChip label="Creative" value={ch.result.breakdown.creativity} />
              <ScoreChip label="Energy" value={ch.result.breakdown.energy} />
              <ScoreChip label="Environment" value={ch.result.breakdown.environment} bonus />
            </div>
          )}
          {ch.result.videoUrl && (
            <video
              src={ch.result.videoUrl}
              controls
              className="mt-4 w-full rounded-2xl bg-black aspect-video"
            />
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={nextRound}
              className="flex-1 min-w-[180px] rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] font-medium px-5 py-3"
            >
              Next round →
            </button>
            <button onClick={backToHub} className="rounded-2xl bg-white/10 text-white px-5 py-3">
              Back to games
            </button>
          </div>
        </Panel>
      )}

      {history.filter((h) => h.score !== null).length > 0 && <Gallery history={history} />}
    </div>
  );
}

function phaseTitle(p: ChallengeState["phase"]) {
  return { briefing: "Task", recording: "Filming", judging: "AI judging", results: "Verdict" }[p];
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl bg-card border p-6 text-white">{children}</div>;
}

function AiFallbackNotice() {
  return (
    <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      The AI provider didn&apos;t respond reliably, so this round continued in fallback mode.
    </div>
  );
}

function ScoreChip({
  label,
  value,
  bonus = false,
}: {
  label: string;
  value: number;
  bonus?: boolean;
}) {
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1">
      {label} {bonus ? "+" : ""}
      {value}
    </span>
  );
}

function Gallery({ history }: { history: ChallengeRow[] }) {
  const scored = history.filter((h) => h.score !== null);
  return (
    <div className="rounded-3xl bg-card border p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Evening gallery ({scored.length})
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {scored.map((h) => (
          <div key={h.id} className="rounded-2xl bg-background/50 border overflow-hidden">
            {h.video_url && (
              <video
                src={h.video_url}
                controls
                preload="metadata"
                className="w-full aspect-video bg-black"
              />
            )}
            <div className="p-3">
              <div className="flex items-baseline justify-between">
                <div className="text-xs text-muted-foreground">{h.operator_name}</div>
                <div className="font-display text-2xl tabular-num text-[var(--color-park-bright)]">
                  {h.score}/10
                </div>
              </div>
              <div className="text-sm mt-1 line-clamp-2">«{h.task}»</div>
              {h.ai_feedback && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {h.ai_feedback}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

void teamColorClasses;
