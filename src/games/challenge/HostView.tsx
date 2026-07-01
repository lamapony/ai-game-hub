// Challenge host orchestration: pick operator, generate task, listen for video, run judge, speak verdict.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateRoomState, genId } from "@/lib/room";
import { generateChallengeTask, judgeChallenge } from "@/lib/ai/challenge.functions";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import type { ChallengeState, RoomState, Team } from "@/lib/types";

const RECORDING_MS = 25_000; // 20s record + buffer
const BRIEFING_MS = 6_000;

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

export function ChallengeHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const ch = state.challenge!;
  const [history, setHistory] = useState<ChallengeRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenForRef = useRef<string | null>(null);
  const judgedForRef = useRef<string | null>(null);

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
          frames: string[];
          transcript: string;
          videoUrl: string;
          operatorName: string;
          task: string;
        };
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
    updateRoomState(roomId, { ...state, challenge: { ...ch, ...patch } });

  // Auto-generate task on briefing entry
  useEffect(() => {
    if (ch.phase === "briefing" && !ch.task && !busy) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch.phase, ch.task]);

  async function generate() {
    if (!ch.operatorName) return;
    setBusy("Генерируем задание…");
    try {
      const r = await generateChallengeTask({
        data: {
          operatorName: ch.operatorName,
          pastTasks: history.map((h) => h.task),
        },
      });
      // speak intro + task via slot 1
      speak(`${r.intro} ${r.task}`);
      await update({ task: r.task });
      // Recording starts when the operator taps "Открыть камеру" on their phone.
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }
  void BRIEFING_MS;

  // Auto-end recording (timeout safety; operator usually uploads earlier)
  useEffect(() => {
    if (ch.phase !== "recording" || !ch.recordingEndsAt) return;
    if (now < ch.recordingEndsAt + 30_000) return; // grace for upload
    if (judgedForRef.current === ch.roundId) return;
    // No upload? Skip to results with score 0.
    update({
      phase: "results",
      result: { score: 0, feedback: "Никто ничего не снял. Дух парка разочарован.", videoUrl: "" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, ch.phase, ch.recordingEndsAt]);

  async function runJudgement(p: {
    roundId: string;
    frames: string[];
    transcript: string;
    videoUrl: string;
    operatorName: string;
    task: string;
  }) {
    setBusy("AI смотрит видео…");
    try {
      await update({ phase: "judging" });
      const r = await judgeChallenge({
        data: {
          task: p.task,
          transcript: p.transcript,
          frames: p.frames,
          operatorName: p.operatorName,
        },
      });
      // persist score/feedback on the row
      await supabase
        .from("challenges")
        .update({ score: r.score, ai_feedback: r.feedback })
        .eq("room_id", roomId)
        .eq("round_id", p.roundId);
      // add points to operator's team
      const operator = state.players.find((pl) => pl.id === ch.operatorId);
      const teams: Team[] = state.teams.map((t) =>
        operator && t.id === operator.teamId ? { ...t, score: t.score + r.score } : t,
      );
      await updateRoomState(roomId, {
        ...state,
        teams,
        challenge: {
          ...ch,
          phase: "results",
          result: { score: r.score, feedback: r.feedback, videoUrl: p.videoUrl },
          pastOperatorIds: [...(ch.pastOperatorIds ?? []), p.operatorName],
        },
      });
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
      audioRef.current.src = `/api/speak?text=${encodeURIComponent(text)}`;
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
    updateRoomState(roomId, {
      ...state,
      challenge: {
        phase: "briefing",
        roundId: genId("ch"),
        operatorId: nextOp.id,
        operatorName: nextOp.name,
        pastOperatorIds: [...(ch.pastOperatorIds ?? []), ch.operatorId ?? ""].filter(Boolean),
      },
    });
  }

  function backToHub() {
    updateRoomState(roomId, { ...state, currentGame: null, challenge: undefined, status: "lobby" });
  }

  const operator = state.players.find((p) => p.id === ch.operatorId);
  const operatorTeam = operator ? state.teams.find((t) => t.id === operator.teamId) : null;
  const remaining = ch.phase === "recording" ? Math.max(0, (ch.recordingEndsAt ?? now) - now) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl park-gradient p-6 text-white">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
              Челлендж духа парка
            </div>
            <h2 className="font-display text-3xl mt-1">{phaseTitle(ch.phase)}</h2>
          </div>
          {busy && <div className="text-xs text-white/80 animate-pulse">{busy}</div>}
        </div>
        {ch.operatorName && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
            🎥 Оператор: <strong>{ch.operatorName}</strong>
            {operatorTeam && <span className="opacity-70">· {operatorTeam.name}</span>}
          </div>
        )}
      </div>

      {ch.phase === "briefing" && (
        <Panel>
          <div className="font-display text-2xl">Дух парка диктует задание…</div>
          {ch.task && <p className="mt-3 text-lg text-white">«{ch.task}»</p>}
          {ch.task && (
            <p className="mt-4 text-sm text-[var(--color-park-bright)]">
              📱 Передай телефон оператору <strong>{ch.operatorName}</strong> — он жмёт «Открыть
              камеру», и поехали.
            </p>
          )}
        </Panel>
      )}

      {ch.phase === "recording" && (
        <Panel>
          <div className="flex items-baseline justify-between">
            <div className="font-display text-2xl">Идёт съёмка</div>
            <div className="font-display text-5xl tabular-num text-[var(--color-park-bright)]">
              {formatClock(remaining)}
            </div>
          </div>
          <p className="mt-3 text-white/80">«{ch.task}»</p>
          <p className="mt-2 text-sm text-white/55">
            Когда {ch.operatorName} нажмёт «Стоп» — видео полетит судье.
          </p>
        </Panel>
      )}

      {ch.phase === "judging" && (
        <Panel>
          <div className="font-display text-2xl">AI разбирает сценку…</div>
          <p className="mt-3 text-white/65 text-sm">Распознаём речь и кадры. Секунд 10.</p>
          <div className="mt-4 inline-flex gap-1.5">
            <span className="size-2 rounded-full bg-white/70 animate-pulse" />
            <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:150ms]" />
            <span className="size-2 rounded-full bg-white/70 animate-pulse [animation-delay:300ms]" />
          </div>
        </Panel>
      )}

      {ch.phase === "results" && ch.result && (
        <Panel>
          <div className="flex items-baseline justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/60">Вердикт</div>
              <div className="font-display text-7xl tabular-num text-[var(--color-park-bright)]">
                {ch.result.score}
                <span className="text-white/40 text-3xl">/10</span>
              </div>
            </div>
            {operatorTeam && (
              <div className="text-right">
                <div className="text-xs text-white/60">+{ch.result.score} команде</div>
                <div className="font-display text-lg">{operatorTeam.name}</div>
              </div>
            )}
          </div>
          <p className="mt-4 text-white text-lg leading-snug">«{ch.result.feedback}»</p>
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
              Следующий раунд →
            </button>
            <button onClick={backToHub} className="rounded-2xl bg-white/10 text-white px-5 py-3">
              В меню игр
            </button>
          </div>
        </Panel>
      )}

      {history.filter((h) => h.score !== null).length > 0 && <Gallery history={history} />}
    </div>
  );
}

function phaseTitle(p: ChallengeState["phase"]) {
  return { briefing: "Задание", recording: "Снимаем", judging: "AI судит", results: "Вердикт" }[p];
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl bg-card border p-6 text-white">{children}</div>;
}

function Gallery({ history }: { history: ChallengeRow[] }) {
  const scored = history.filter((h) => h.score !== null);
  return (
    <div className="rounded-3xl bg-card border p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Галерея вечера ({scored.length})
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
