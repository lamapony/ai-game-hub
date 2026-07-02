import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Mic, Send, Volume2 } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRoom, getOrCreatePlayer } from "@/lib/room";
import { playerStorageKey } from "@/lib/event-profile";
import { postPlayerAction, type StoredPlayer } from "@/lib/player-action-client";
import { teamColorClasses } from "@/lib/team-style";
import { playersOnTeam } from "@/lib/teams";
import type { RoomState } from "@/lib/types";

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
const SpectrumCourtPlayer = lazy(() =>
  import("@/games/spectrumcourt/PlayerView").then((module) => ({
    default: module.SpectrumCourtPlayer,
  })),
);

export const Route = createFileRoute("/play/$code")({
  component: PlayPage,
});

function PlayPage() {
  const { code } = Route.useParams();
  const { room, loading, error, setRoom } = useRoom(code);
  const [me, setMe] = useState<StoredPlayer | null>(null);

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
  onJoined: (player: StoredPlayer, state: RoomState) => void;
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
    try {
      const result = await postPlayerAction(code, {
        action: "join",
        playerId: player.id,
        name: player.name,
        teamId,
      });
      onJoined(result.player ?? player, result.state);
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
  onRoomState,
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  me: StoredPlayer;
  onTeamChange: (p: StoredPlayer) => void;
  onRoomState: (state: RoomState) => void;
}) {
  const state = room.state;
  const team = state.teams.find((t) => t.id === me.teamId);
  const c = team ? teamColorClasses(team.color) : null;

  // ensure player exists in state list (handles room state lost after reset)
  useEffect(() => {
    if (state.players.find((p) => p.id === me.id)) return;
    postPlayerAction(code, {
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

        <HostMomentBanner code={code} state={state} me={me} onRoomState={onRoomState} />

        <Suspense fallback={<PlayerGameLoading />}>
          {state.paused ? (
            <PausedPanel />
          ) : state.currentGame === "soundscape" && state.soundscape ? (
            <SoundscapePlayer code={code} roomId={room.id} state={state} me={me} />
          ) : state.currentGame === "challenge" && state.challenge ? (
            <ChallengePlayer code={code} roomId={room.id} state={state} me={me} />
          ) : state.currentGame === "phototunt" && state.phototunt ? (
            <PhotoHuntPlayer roomId={room.id} state={state} me={me} />
          ) : state.currentGame === "trackguess" && state.trackguess ? (
            <TrackGuessPlayer code={code} state={state} me={me} />
          ) : state.currentGame === "spectrumcourt" && state.spectrumcourt ? (
            <SpectrumCourtPlayer code={code} state={state} me={me} />
          ) : (
            <WaitingPanel
              room={room}
              me={me}
              code={code}
              onTeamChange={onTeamChange}
              onRoomState={onRoomState}
            />
          )}
        </Suspense>
      </div>
    </PlayShell>
  );
}

function HostMomentBanner({
  code,
  state,
  me,
  onRoomState,
}: {
  code: string;
  state: import("@/lib/types").RoomState;
  me: StoredPlayer;
  onRoomState: (state: RoomState) => void;
}) {
  const moment = state.eventDirector?.playerMoment;
  const [sentMomentId, setSentMomentId] = useState<string | null>(null);
  if (!moment) return null;
  if (moment.expiresAt && moment.expiresAt < Date.now()) return null;

  async function react(option: string) {
    if (!moment || sentMomentId === moment.id) return;
    setSentMomentId(moment.id);
    await postPlayerAction(code, {
      action: "audience-response",
      playerId: me.id,
      option,
    })
      .then((result) => onRoomState(result.state))
      .catch(() => {
        setSentMomentId(null);
      });
  }

  const tone =
    moment.mode === "react"
      ? "border-[var(--color-park-bright)]/40 bg-[var(--color-park-bright)]/10"
      : moment.mode === "listen"
        ? "border-white/15 bg-white/10"
        : "border-white/10 bg-black/20";

  return (
    <div className={`mb-4 rounded-2xl border p-3 text-white ${tone}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/55">
        {moment.mode === "react" ? "Room reaction" : moment.mode === "listen" ? "Listen" : "Wait"}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-white/85">{moment.prompt}</p>
      {moment.mode === "react" && moment.options?.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {moment.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={sentMomentId === moment.id}
              onClick={() => void react(option)}
              className="rounded-xl bg-white/10 px-2 py-2 text-xs text-white hover:bg-white/15 disabled:opacity-50"
            >
              {sentMomentId === moment.id ? "sent" : option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
  onRoomState,
}: {
  room: { id: string; state: import("@/lib/types").RoomState };
  me: StoredPlayer;
  code: string;
  onTeamChange: (p: StoredPlayer) => void;
  onRoomState: (state: RoomState) => void;
}) {
  const [switching, setSwitching] = useState(false);
  const state = room.state;

  async function switchTeam(teamId: string) {
    if (switching || teamId === me.teamId) return;
    setSwitching(true);
    const player = getOrCreatePlayer(code, me.name, teamId);
    try {
      const result = await postPlayerAction(code, {
        action: "switch-team",
        playerId: me.id,
        name: player.name,
        teamId,
      });
      onRoomState(result.state);
      onTeamChange(result.player ?? { ...me, teamId });
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

      <SpiritConcierge room={room} me={me} code={code} />

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

type SpiritPreset = "how-to-play" | "round-count" | "what-now" | "custom";

type SpiritApiResponse = {
  answer: string;
  source: "xai" | "openai" | "fallback";
  provider: "xai" | "openai" | "none";
  fallback: boolean;
  remaining: number;
  resetAt: number;
};

const QUICK_SPIRIT_QUESTIONS: Array<{ preset: SpiritPreset; label: string; question: string }> = [
  { preset: "how-to-play", label: "How do we play?", question: "How do we play?" },
  { preset: "round-count", label: "How many rounds?", question: "How many rounds are there?" },
  { preset: "what-now", label: "What now?", question: "What should I do right now?" },
];

function SpiritConcierge({
  room,
  me,
  code,
}: {
  room: { id: string; state: import("@/lib/types").RoomState };
  me: { id: string; name: string; teamId: string };
  code: string;
}) {
  const [openUntil, setOpenUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [customQuestion, setCustomQuestion] = useState("");
  const [answer, setAnswer] = useState<SpiritApiResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const isOpen = openUntil > now;
  const secondsLeft = Math.max(0, Math.ceil((openUntil - now) / 1000));

  useEffect(() => {
    if (!openUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [openUntil]);

  function openSpiritWindow() {
    setError(null);
    setOpenUntil(Date.now() + 30_000);
    setNow(Date.now());
  }

  async function playAnswer(text = answer?.answer) {
    if (!text) return;
    const audio = new Audio(`/api/speak?text=${encodeURIComponent(text)}&voice=alloy`);
    await audio.play().catch(() => {});
  }

  async function askSpirit(question: string, preset: SpiritPreset) {
    const clean = question.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/spirit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId: me.id, question: clean, preset }),
      });
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("The spirit is rationing wisdom. Try again in a few minutes.");
        }
        if (response.status === 409) {
          throw new Error("The spirit is listening only in lobby and briefing windows.");
        }
        throw new Error("The spirit declined to materialize.");
      }
      const data = (await response.json()) as SpiritApiResponse;
      setAnswer(data);
      setCustomQuestion("");
      await playAnswer(data.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The spirit is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function askByVoice() {
    if (busy || recording) return;
    openSpiritWindow();
    setRecording(true);
    setError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        void transcribeAndAsk(blob);
      };
      recorder.start();
      window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 7_000);
    } catch {
      setRecording(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError("Microphone permission was denied or unavailable.");
    }
  }

  async function transcribeAndAsk(blob: Blob) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", blob, "spirit-question.webm");
      form.append("filename", "spirit-question.webm");
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await response.json()) as { text?: string };
      const text = data.text?.trim();
      if (!text) throw new Error("I heard atmosphere, not a question.");
      setBusy(false);
      await askSpirit(text, "custom");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not understand the question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 border-t border-white/10 pt-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-park-bright)]">
            Park spirit
          </div>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            One team ambassador, short questions, no private therapy session.
          </p>
        </div>
        <button
          type="button"
          onClick={openSpiritWindow}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Ask 30s
        </button>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/45">
            <span>Window open</span>
            <span>{secondsLeft}s</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {QUICK_SPIRIT_QUESTIONS.map((item) => (
              <button
                key={item.preset}
                type="button"
                disabled={busy || recording}
                onClick={() => void askSpirit(item.question, item.preset)}
                className="min-h-11 rounded-2xl bg-white/10 px-3 py-2 text-left text-sm text-white/90 hover:bg-white/15 disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={customQuestion}
              onChange={(event) => setCustomQuestion(event.target.value)}
              maxLength={180}
              placeholder="Ask one precise question"
              className="min-w-0 flex-1 rounded-2xl bg-white/10 px-3 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:bg-white/15"
            />
            <button
              type="button"
              disabled={busy || recording || !customQuestion.trim()}
              onClick={() => void askSpirit(customQuestion, "custom")}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] disabled:opacity-50"
              aria-label="Send question"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={busy || recording}
              onClick={() => void askByVoice()}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
              aria-label="Ask by voice"
            >
              <Mic
                className={`size-4 ${recording ? "text-[var(--color-park-bright)]" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
          {(busy || recording) && (
            <p className="text-xs text-white/50">
              {recording ? "Listening for seven seconds..." : "Consulting the undergrowth..."}
            </p>
          )}
          {error && <p className="text-xs leading-relaxed text-red-200">{error}</p>}
          {answer && (
            <div className="border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                  {answer.source === "fallback" ? "Fallback spirit" : `${answer.provider} spirit`}
                  {Number.isFinite(answer.remaining) ? ` · ${answer.remaining} left` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => void playAnswer()}
                  className="inline-flex size-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15"
                  aria-label="Replay answer"
                >
                  <Volume2 className="size-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/82">{answer.answer}</p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PlayShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh park-gradient flex items-start sm:items-center justify-center px-4 py-6">
      {children}
    </main>
  );
}
