import { useEffect, useState } from "react";
import { Recorder } from "@/games/soundscape/Recorder";
import type { StoredPlayer } from "@/lib/player-action-client";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { uploadPlayerMedia } from "@/lib/player-upload-client";
import {
  accuseContrabandClient,
  getContrabandAssignmentClient,
  respondContrabandClient,
  submitContrabandAudioClient,
} from "@/lib/contraband-client";
import type { ContrabandAssignmentRecord } from "./model";
import type { ContrabandState, RoomState } from "@/lib/types";

function clock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function playerName(state: RoomState, id: string) {
  return state.players.find((player) => player.id === id)?.name ?? "Unknown player";
}

export function ContrabandBackgroundPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const publicRun = state.contraband!;
  const locale = state.party?.uiLocale ?? "en";
  const [run, setRun] = useState<ContrabandState>(publicRun);
  const [assignment, setAssignment] = useState<ContrabandAssignmentRecord | null>(null);
  const [accusedPlayerId, setAccusedPlayerId] = useState("");
  const [suspectedQuote, setSuspectedQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setRun(publicRun), [publicRun]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void getContrabandAssignmentClient({ roomId, runId: run.runId, playerId: me.id })
      .then((result) => {
        if (!cancelled) setAssignment(result.assignment);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyPlayerActionError(loadError, "Contraband cargo", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [me.id, roomId, run.runId, run.status]);

  const accusation = run.activeAccusation;
  const amAccused = accusation?.accusedPlayerId === me.id;
  const amAccuser = accusation?.accuserPlayerId === me.id;
  const resolved = run.resolvedPlayerIds.includes(me.id);
  const urgent = Boolean(amAccused || amAccuser);
  const remaining = run.endsAt ? run.endsAt - now : 0;
  const targets = run.participantIds.flatMap((id) => {
    const player = state.players.find((candidate) => candidate.id === id);
    return player && player.id !== me.id && !run.resolvedPlayerIds.includes(player.id)
      ? [player]
      : [];
  });

  async function accuse() {
    if (!accusedPlayerId || suspectedQuote.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const result = await accuseContrabandClient({
        roomId,
        runId: run.runId,
        playerId: me.id,
        accusedPlayerId,
        suspectedQuote: suspectedQuote.trim(),
      });
      setRun(result.run);
      setSuspectedQuote("");
    } catch (actionError) {
      setError(friendlyPlayerActionError(actionError, "Contraband accusation"));
    } finally {
      setBusy(false);
    }
  }

  async function respond(response: "confess" | "dispute") {
    if (!accusation) return;
    setBusy(true);
    setError(null);
    try {
      const result = await respondContrabandClient({
        roomId,
        runId: run.runId,
        playerId: me.id,
        accusationId: accusation.accusationId,
        response,
      });
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyPlayerActionError(actionError, "Contraband response"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadContext(blob: Blob, durationMs: number) {
    if (!accusation) return;
    setError(null);
    const storagePath = await uploadPlayerMedia(
      roomId,
      {
        action: "contraband-audio",
        playerId: me.id,
        roundId: run.runId,
        mimeType: blob.type,
      },
      blob,
    );
    const result = await submitContrabandAudioClient({
      roomId,
      runId: run.runId,
      playerId: me.id,
      accusationId: accusation.accusationId,
      storagePath,
      durationSeconds: durationMs / 1000,
    });
    setRun(result.run);
  }

  return (
    <details
      open={urgent || run.status === "results"}
      className="mb-4 rounded-3xl border border-cyan-200/25 bg-cyan-950/45 p-4 text-white backdrop-blur"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.23em] text-cyan-200/70">
              🛃 Contraband
            </div>
            <div className="mt-1 text-sm text-white/75">
              {run.status === "assigning"
                ? locale === "ru"
                  ? "Таможня печатает груз…"
                  : "Customs is printing cargo…"
                : run.status === "results"
                  ? locale === "ru"
                    ? "Груз раскрыт"
                    : "Cargo revealed"
                  : `${clock(remaining)}${resolved ? " · ✓" : ""}`}
            </div>
          </div>
          {urgent && (
            <span className="rounded-full bg-red-300 px-3 py-1 text-xs font-bold text-red-950">
              LIVE
            </span>
          )}
        </div>
      </summary>

      {error && <p className="mt-3 rounded-xl bg-red-950/70 p-3 text-sm text-red-100">{error}</p>}

      {run.status !== "results" && assignment && !resolved && (
        <div className="mt-4 rounded-2xl border border-cyan-100/20 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">
            {locale === "ru" ? "Только для тебя" : "For your eyes only"}
          </div>
          <div className="mt-2 font-display text-2xl leading-tight">“{assignment.phrase}”</div>
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            {locale === "ru"
              ? "Вплети фразу в настоящий разговор до таймера. Не показывай экран."
              : "Weave it into real conversation before the timer. Do not show this screen."}
          </p>
        </div>
      )}

      {accusation ? (
        <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4">
          <div className="font-display text-xl">
            {playerName(state, accusation.accuserPlayerId)} →{" "}
            {playerName(state, accusation.accusedPlayerId)}
          </div>
          {amAccused && run.status === "awaiting-response" && (
            <>
              <p className="mt-2 text-sm text-white/70">
                {locale === "ru"
                  ? "Тебя остановили. Признай груз или потребуй арбитраж."
                  : "You were stopped. Confess the cargo or demand arbitration."}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={busy}
                  onClick={() => void respond("confess")}
                  className="rounded-xl bg-red-300 px-3 py-3 text-sm font-bold text-red-950 disabled:opacity-50"
                >
                  {locale === "ru" ? "Признаться" : "Confess"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void respond("dispute")}
                  className="rounded-xl bg-cyan-200 px-3 py-3 text-sm font-bold text-cyan-950 disabled:opacity-50"
                >
                  {locale === "ru" ? "Спорить" : "Dispute"}
                </button>
              </div>
            </>
          )}
          {amAccused && run.status === "awaiting-audio" && (
            <div className="mt-3">
              <p className="mb-3 text-sm text-white/70">
                {locale === "ru"
                  ? "Повтори 1–2 предложения вокруг фразы. 8–25 секунд; AI оценивает только органичность текста, не ложь."
                  : "Repeat 1–2 sentences around the phrase. 8–25 seconds; AI judges only textual fit, never deception."}
              </p>
              <Recorder minMs={8_000} maxMs={25_000} onComplete={uploadContext} />
            </div>
          )}
          {(run.status === "review" || (!amAccused && !amAccuser)) && (
            <p className="mt-2 text-sm text-white/65">
              {run.status === "review"
                ? locale === "ru"
                  ? "Ведущий выносит ручной вердикт."
                  : "The host is making a manual ruling."
                : locale === "ru"
                  ? "Граница временно закрыта: один вызов уже разбирают."
                  : "The border is briefly closed while one call is heard."}
            </p>
          )}
          {amAccuser && (
            <p className="mt-2 text-sm text-white/65">
              {locale === "ru"
                ? "Твой вызов принят. Не раскрывай детали раньше вердикта."
                : "Your call is live. Keep the details sealed until the verdict."}
            </p>
          )}
        </div>
      ) : run.status === "active" && !resolved ? (
        <div className="mt-4 rounded-2xl border border-white/15 bg-black/20 p-4">
          <div className="text-sm font-semibold">
            {locale === "ru" ? "Услышал подозрительную фразу?" : "Heard suspicious cargo?"}
          </div>
          <select
            value={accusedPlayerId}
            onChange={(event) => setAccusedPlayerId(event.target.value)}
            className="mt-3 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-sm"
          >
            <option value="">{locale === "ru" ? "Кого остановить…" : "Who do you stop…"}</option>
            {targets.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <input
            value={suspectedQuote}
            onChange={(event) => setSuspectedQuote(event.target.value)}
            maxLength={240}
            placeholder={locale === "ru" ? "Что именно прозвучало?" : "What exactly did you hear?"}
            className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm placeholder:text-white/35"
          />
          <button
            disabled={busy || !accusedPlayerId || suspectedQuote.trim().length < 2}
            onClick={() => void accuse()}
            className="mt-2 w-full rounded-xl bg-red-300 px-4 py-3 font-bold text-red-950 disabled:opacity-40"
          >
            {locale === "ru" ? "КОНТРАБАНДА!" : "CONTRABAND!"}
          </button>
          <p className="mt-2 text-[11px] text-white/45">
            {locale === "ru"
              ? "Максимум 3 вызова. Ложный вызов: −2."
              : "Maximum 3 calls. False call: −2."}
          </p>
        </div>
      ) : null}

      {!accusation && run.status !== "results" && run.lastResolution && (
        <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-3 text-sm">
          <div className="font-semibold">
            {playerName(state, run.lastResolution.accuserPlayerId)} →{" "}
            {playerName(state, run.lastResolution.accusedPlayerId)}
          </div>
          <div className="mt-1 text-cyan-100">
            {run.lastResolution.outcome === "caught"
              ? locale === "ru"
                ? "Груз пойман · ловцу +5"
                : "Cargo caught · catcher +5"
              : run.lastResolution.outcome === "clean"
                ? locale === "ru"
                  ? "Прошёл чисто · контрабандисту +10"
                  : "Cleared customs · smuggler +10"
                : locale === "ru"
                  ? "Ложный вызов · обвинителю −2"
                  : "False call · accuser −2"}
          </div>
        </div>
      )}

      {run.status === "results" && run.results && (
        <div className="mt-4 space-y-2">
          {run.results.map((entry) => (
            <div
              key={entry.playerId}
              className={`rounded-2xl p-3 text-sm ${entry.playerId === me.id ? "bg-cyan-200/15 ring-1 ring-cyan-100/30" : "bg-black/20"}`}
            >
              <div className="font-semibold">
                {entry.playerName} · +{entry.points}
              </div>
              <div className="mt-1 text-white/70">“{entry.phrase}”</div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
