import { useEffect, useState } from "react";
import type { ContrabandArbitrationRecord, ContrabandAssignmentRecord } from "./model";
import {
  assignContrabandClient,
  finalizeContrabandClient,
  getContrabandCaseClient,
  resolveContrabandClient,
} from "@/lib/contraband-client";
import type { ContrabandState, RoomState } from "@/lib/types";
import { friendlyHostActionError } from "@/lib/host-action-errors";

type HostCase = {
  accusation: {
    accusationId: string;
    accuserPlayerId: string;
    accusedPlayerId: string;
    suspectedQuote: string;
  };
  assignment: ContrabandAssignmentRecord;
  arbitration: ContrabandArbitrationRecord | null;
};

function playerName(state: RoomState, id: string) {
  return state.players.find((player) => player.id === id)?.name ?? "Unknown player";
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ContrabandBackgroundHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const publicRun = state.contraband;
  const locale = state.party?.uiLocale ?? "en";
  const [run, setRun] = useState<ContrabandState | undefined>(publicRun);
  const [caseFile, setCaseFile] = useState<HostCase | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setRun(publicRun), [publicRun]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!run || run.status !== "assigning") return;
    let cancelled = false;
    setBusy("assign");
    void assignContrabandClient(roomId, run.runId)
      .then(({ run: assigned }) => {
        if (!cancelled) setRun(assigned);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyHostActionError(loadError, "Contraband deal", "load"));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, run]);
  useEffect(() => {
    if (!run?.activeAccusation) {
      setCaseFile(null);
      return;
    }
    let cancelled = false;
    void getContrabandCaseClient(roomId, run.runId)
      .then((result) => {
        if (!cancelled) setCaseFile(result.case);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyHostActionError(loadError, "Contraband case", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, run]);

  if (!run) return null;
  const accusation = run.activeAccusation;
  const urgent = Boolean(accusation);
  const remaining = run.endsAt ? run.endsAt - now : 0;

  async function resolve(outcome: "caught" | "clean" | "false-accusation") {
    if (!accusation) return;
    setBusy(outcome);
    setError(null);
    try {
      const result = await resolveContrabandClient({
        roomId,
        runId: run!.runId,
        accusationId: accusation.accusationId,
        outcome,
      });
      setRun(result.run);
      setCaseFile(null);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Contraband verdict", "complete"));
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    setBusy("finish");
    setError(null);
    try {
      const result = await finalizeContrabandClient(roomId, run!.runId);
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Contraband reveal", "complete"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <details
      open={urgent || run.status === "results"}
      className="mt-4 rounded-3xl border border-cyan-200/25 bg-cyan-950/35 p-4 text-white"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">
              🛃 {locale === "ru" ? "Фоновая Контрабанда" : "Contraband background"}
            </div>
            <div className="mt-1 text-sm text-white/80">
              {run.status === "assigning"
                ? locale === "ru"
                  ? "Печатаем секретные фразы…"
                  : "Printing secret phrases…"
                : run.status === "results"
                  ? locale === "ru"
                    ? "Граница закрыта — груз раскрыт"
                    : "Border closed — cargo revealed"
                  : `${clock(remaining)} · ${run.resolvedPlayerIds.length}/${run.participantIds.length}`}
            </div>
          </div>
          {urgent && (
            <span className="rounded-full bg-red-400 px-3 py-1 text-xs font-bold text-red-950">
              LIVE
            </span>
          )}
        </div>
      </summary>

      {error && <p className="mt-3 rounded-xl bg-red-950/60 p-3 text-sm text-red-100">{error}</p>}
      {accusation && (
        <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4">
          <div className="font-display text-xl">
            {playerName(state, accusation.accuserPlayerId)} →{" "}
            {playerName(state, accusation.accusedPlayerId)}
          </div>
          <p className="mt-1 text-sm text-white/65">
            {run.status === "awaiting-response"
              ? locale === "ru"
                ? "Ждём: признание или спор."
                : "Waiting for a confession or dispute."
              : run.status === "awaiting-audio"
                ? locale === "ru"
                  ? "Обвиняемый записывает 8–25 секунд контекста."
                  : "The accused is recording 8–25 seconds of context."
                : locale === "ru"
                  ? "AI недоступен или транскрипт пуст — решает ведущий."
                  : "AI unavailable or transcript empty — host decides."}
          </p>
          {caseFile && (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="text-white/50">Claim:</span> “{caseFile.accusation.suspectedQuote}”
              </p>
              <p>
                <span className="text-white/50">Secret cargo:</span> “{caseFile.assignment.phrase}”
              </p>
              {caseFile.arbitration && (
                <>
                  <p>
                    <span className="text-white/50">Transcript:</span> “
                    {caseFile.arbitration.transcript || "—"}”
                  </p>
                  {caseFile.arbitration.aiVerdict && (
                    <p>
                      <span className="text-white/50">AI suggestion:</span>{" "}
                      {caseFile.arbitration.aiVerdict.organic_score}/10 ·{" "}
                      {caseFile.arbitration.aiVerdict.verdict}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={!!busy}
              onClick={() => void resolve("caught")}
              className="rounded-xl bg-red-300 px-3 py-2 text-xs font-bold text-red-950 disabled:opacity-50"
            >
              {locale === "ru" ? "Палево · ловцу +5" : "Caught · catcher +5"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => void resolve("clean")}
              className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-bold text-emerald-950 disabled:opacity-50"
            >
              {locale === "ru" ? "Чисто · контрабандисту +10" : "Clean · smuggler +10"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => void resolve("false-accusation")}
              className="rounded-xl border border-white/25 px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              {locale === "ru" ? "Ложный вызов · −2" : "False call · −2"}
            </button>
          </div>
        </div>
      )}

      {!accusation && run.status !== "results" && run.lastResolution && (
        <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm">
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

      {run.status === "results" && run.results ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {run.results.map((entry) => (
            <div key={entry.playerId} className="rounded-2xl bg-black/25 p-3 text-sm">
              <div className="font-semibold">
                {entry.playerName} · +{entry.points}
              </div>
              <div className="mt-1 text-white/70">“{entry.phrase}”</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-cyan-200/65">
                {entry.outcome}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          disabled={!!busy || !!accusation || run.status === "assigning"}
          onClick={() => void finish()}
          className="mt-4 rounded-xl border border-white/25 px-4 py-2 text-sm disabled:opacity-40"
        >
          {remaining <= 0
            ? locale === "ru"
              ? "Закрыть границу и выдать джекпоты"
              : "Close border and award jackpots"
            : locale === "ru"
              ? "Закрыть границу досрочно"
              : "Close border early"}
        </button>
      )}
    </details>
  );
}
