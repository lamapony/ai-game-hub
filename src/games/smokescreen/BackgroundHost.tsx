import { useEffect, useMemo, useState } from "react";
import {
  SMOKE_SCREEN_RESULT_KIND,
  SMOKE_SCREEN_REVEAL_KIND,
  smokeScreenResultRecordSchema,
  smokeScreenRevealRecordSchema,
  type SmokeScreenResultRecord,
  type SmokeScreenRevealRecord,
} from "./model";
import {
  assignSmokeScreenClient,
  finalizeSmokeScreenClient,
  listSmokeScreenRecordsForHost,
  revealSmokeScreenClient,
  sealSmokeScreenClient,
} from "@/lib/smokescreen-client";
import type { PartyRecordView } from "@/lib/party-records";
import type { RoomState, SmokeScreenState } from "@/lib/types";
import { friendlyHostActionError } from "@/lib/host-action-errors";

type RevealedMission = SmokeScreenRevealRecord & { recordId: string };

function parseRecords(records: PartyRecordView[]) {
  const reveals: RevealedMission[] = [];
  let result: SmokeScreenResultRecord | undefined;
  records.forEach((record) => {
    if (record.kind === SMOKE_SCREEN_REVEAL_KIND) {
      const parsed = smokeScreenRevealRecordSchema.safeParse(record.payload);
      if (parsed.success) reveals.push({ ...parsed.data, recordId: record.id });
    }
    if (record.kind === SMOKE_SCREEN_RESULT_KIND) {
      const parsed = smokeScreenResultRecordSchema.safeParse(record.payload);
      if (parsed.success) result = parsed.data;
    }
  });
  return { reveals, result };
}

export function SmokeScreenBackgroundHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const publicSmoke = state.smokescreen;
  const locale = state.party?.uiLocale ?? "en";
  const [smoke, setSmoke] = useState<SmokeScreenState | undefined>(publicSmoke);
  const [records, setRecords] = useState<PartyRecordView[]>([]);
  const [completedMissionIds, setCompletedMissionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const smokeRunId = smoke?.runId;
  const smokeStatus = smoke?.status;

  useEffect(() => {
    if (!publicSmoke) return;
    setSmoke((current) =>
      !current || current.runId !== publicSmoke.runId
        ? publicSmoke
        : { ...current, ...publicSmoke },
    );
  }, [publicSmoke]);

  useEffect(() => {
    if (!smokeRunId || !smokeStatus || !["revealed", "results"].includes(smokeStatus)) return;
    let cancelled = false;
    void listSmokeScreenRecordsForHost({ roomId, runId: smokeRunId })
      .then(({ records: loaded }) => {
        if (!cancelled) setRecords(loaded);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyHostActionError(loadError, "sealed missions", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, smokeRunId, smokeStatus]);

  const parsed = useMemo(() => parseRecords(records), [records]);
  if (!smoke) return null;
  const runId = smoke.runId;
  const missingCount = Math.max(0, smoke.participantIds.length - smoke.assignedPlayerIds.length);
  const canReveal = ["classic", "bar", "finale"].includes(state.party?.actId ?? "");
  const result =
    parsed.result ??
    (smoke.results && smoke.recap
      ? {
          version: 1 as const,
          completedMissionIds: smoke.results
            .filter((entry) => entry.completed)
            .map((entry) => entry.missionId),
          results: smoke.results,
          recap: smoke.recap,
          aiFallback: smoke.aiFallback ?? false,
          completedAt: smoke.completedAt ?? 0,
        }
      : undefined);

  async function run(key: string, action: () => Promise<SmokeScreenState>) {
    setBusy(key);
    setError(null);
    try {
      setSmoke(await action());
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "Smoke Screen step", "complete"));
    } finally {
      setBusy(null);
    }
  }

  function seal() {
    const allowIncomplete =
      missingCount === 0 ||
      window.confirm(
        locale === "ru"
          ? `Не хватает ${missingCount} миссий. Закрыть полевую фазу только с готовыми?`
          : `${missingCount} missions are missing. Close fieldwork with the completed deal?`,
      );
    if (!allowIncomplete) return;
    void run(
      "seal",
      async () =>
        (
          await sealSmokeScreenClient({
            roomId,
            runId,
            allowIncomplete: missingCount > 0,
          })
        ).smoke,
    );
  }

  return (
    <section className="agh-smoke-host" data-status={smoke.status}>
      <header className="agh-smoke-host-header">
        <div className="agh-smoke-host-meta">
          <span>
            {locale === "ru" ? "Дымовая завеса / живое досье" : "Smoke Screen / live file"}
          </span>
          <div>
            <span>
              {smoke.assignedPlayerIds.length}/{smoke.participantIds.length}{" "}
              {locale === "ru" ? "миссий роздано" : "missions dealt"}
              {smoke.status === "revealed"
                ? ` / ${smoke.submittedVoterIds.length}/${smoke.participantIds.length} ${locale === "ru" ? "бюллетеней" : "ballots"}`
                : ""}
            </span>
            <strong>
              {smoke.status === "revealed"
                ? locale === "ru"
                  ? "Вердикт открыт"
                  : "Verdict open"
                : smoke.status === "results"
                  ? locale === "ru"
                    ? "Дело закрыто"
                    : "Case closed"
                  : locale === "ru"
                    ? "В работе"
                    : "In progress"}
            </strong>
          </div>
        </div>

        <div className="agh-smoke-host-title-row">
          <h2>
            {smoke.status === "assigning"
              ? locale === "ru"
                ? "Раздать алиби"
                : "Deal the alibis"
              : smoke.status === "active"
                ? locale === "ru"
                  ? "Веди себя обычно"
                  : "Act normal"
                : smoke.status === "sealed"
                  ? locale === "ru"
                    ? "Полевое дело закрыто"
                    : "Fieldwork closed"
                  : smoke.status === "revealed"
                    ? locale === "ru"
                      ? "Кто это делал?"
                      : "Who did this?"
                    : locale === "ru"
                      ? "Завеса сорвана"
                      : "The screen is down"}
          </h2>
          <div className="agh-smoke-redactions" aria-hidden="true">
            <i />
            <i />
            <span>
              {locale === "ru" ? "Имена скрыты до фиксации" : "Owners withheld until lock"}
            </span>
          </div>
        </div>

        <div className="agh-smoke-host-control">
          {smoke.status === "assigning" && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "assign",
                  async () => (await assignSmokeScreenClient({ roomId, runId: smoke.runId })).smoke,
                )
              }
              className="agh-smoke-action"
            >
              <span>
                {busy === "assign"
                  ? locale === "ru"
                    ? "AI пишет досье"
                    : "AI is writing files"
                  : locale === "ru"
                    ? "Раздать тайно"
                    : "Deal privately"}
              </span>
              <b aria-hidden="true">↗</b>
            </button>
          )}
          {(smoke.status === "active" || smoke.status === "assigning") &&
            state.party?.actId !== "grill" && (
              <button
                type="button"
                disabled={busy !== null || smoke.assignedPlayerIds.length === 0}
                onClick={seal}
                className="agh-smoke-action"
              >
                <span>
                  {busy === "seal"
                    ? locale === "ru"
                      ? "Закрываем дело"
                      : "Sealing fieldwork"
                    : locale === "ru"
                      ? "Закрыть полевую фазу"
                      : "Close fieldwork"}
                </span>
                <b aria-hidden="true">↗</b>
              </button>
            )}
          {smoke.status === "sealed" && canReveal && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "reveal",
                  async () => (await revealSmokeScreenClient({ roomId, runId: smoke.runId })).smoke,
                )
              }
              className="agh-smoke-action"
            >
              <span>
                {busy === "reveal"
                  ? locale === "ru"
                    ? "Снимаем завесу"
                    : "Clearing the smoke"
                  : locale === "ru"
                    ? "Вскрыть анонимно"
                    : "Reveal anonymously"}
              </span>
              <b aria-hidden="true">↗</b>
            </button>
          )}
        </div>
      </header>

      {smoke.status === "active" && (
        <section className="agh-smoke-privacy-note">
          <strong>
            {locale === "ru" ? "Ведущий не видит миссии." : "The host cannot see missions."}
          </strong>
          <p>
            {locale === "ru"
              ? "На экране только прогресс. Тексты и владельцы останутся приватными до анонимного вскрытия позже по маршруту. Любая основная игра может идти параллельно."
              : "This screen shows progress only. Text and owners stay private until the anonymous reveal later in the route. Any foreground game can run in parallel."}
          </p>
          <div className="agh-smoke-privacy-bars" aria-hidden="true">
            <i />
            <i />
          </div>
        </section>
      )}

      {smoke.status === "sealed" && !canReveal && (
        <p className="agh-smoke-sealed-note">
          {locale === "ru"
            ? "Улики закрыты. Анонимное вскрытие откроется на следующем этапе маршрута."
            : "Evidence is closed. The anonymous reveal opens at the route's reveal step."}
        </p>
      )}

      {smoke.status === "revealed" && (
        <div className="agh-smoke-reveal">
          <p className="agh-smoke-reveal-brief">
            {locale === "ru"
              ? "Отметь только то, что зал действительно видел. Сервер раскроет владельцев после фиксации результата."
              : "Mark only what the room actually witnessed. The server reveals owners after the result is locked."}
          </p>
          <div className="agh-smoke-evidence-head" aria-hidden="true">
            <span>{locale === "ru" ? "Дело" : "File"}</span>
            <span>{locale === "ru" ? "Наблюдаемое поведение" : "Observed behaviour"}</span>
            <span>{locale === "ru" ? "Риск" : "Risk"}</span>
            <span>{locale === "ru" ? "Было" : "Happened"}</span>
          </div>
          <div className="agh-smoke-evidence-list">
            {parsed.reveals.map((reveal, index) => {
              const checked = completedMissionIds.includes(reveal.missionId);
              return (
                <label key={reveal.recordId} className={checked ? "is-checked" : undefined}>
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={
                      locale === "ru"
                        ? `Миссия выполнена: ${reveal.mission.text}`
                        : `Mission completed: ${reveal.mission.text}`
                    }
                    onChange={() =>
                      setCompletedMissionIds((current) =>
                        checked
                          ? current.filter((missionId) => missionId !== reveal.missionId)
                          : [...current, reveal.missionId],
                      )
                    }
                  />
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>
                    <strong>{reveal.mission.text}</strong>
                    <small>{reveal.mission.detection_hint}</small>
                  </span>
                  <em>
                    {locale === "ru" ? "Уровень" : "Tier"} {reveal.mission.tier} /{" "}
                    {reveal.mission.tier * 5}
                  </em>
                  <i aria-hidden="true">
                    {checked ? (locale === "ru" ? "Да" : "Yes") : locale === "ru" ? "Нет" : "No"}
                  </i>
                </label>
              );
            })}
          </div>
          <div className="agh-smoke-reveal-lock">
            <p>
              {locale === "ru"
                ? "Имена появятся только после этой фиксации."
                : "Owner names appear only after this lock."}
            </p>
            <button
              type="button"
              disabled={
                busy !== null || parsed.reveals.length === 0 || smoke.submittedVoterIds.length === 0
              }
              onClick={() =>
                void run(
                  "finalize",
                  async () =>
                    (
                      await finalizeSmokeScreenClient({
                        roomId,
                        runId: smoke.runId,
                        completedMissionIds,
                      })
                    ).smoke,
                )
              }
              className="agh-smoke-action"
            >
              <span>
                {busy === "finalize"
                  ? locale === "ru"
                    ? "Фиксируем алиби"
                    : "Locking alibis"
                  : locale === "ru"
                    ? "Зафиксировать вскрытие"
                    : "Lock reveal + scores"}
              </span>
              <b aria-hidden="true">↗</b>
            </button>
          </div>
        </div>
      )}

      {smoke.status === "results" && result && (
        <div className="agh-smoke-results">
          <section className="agh-smoke-recap">
            <span>{locale === "ru" ? "Комментарий следствия" : "Investigator recap"}</span>
            <p>{result.recap}</p>
          </section>
          <div className="agh-smoke-result-head" aria-hidden="true">
            <span>{locale === "ru" ? "Дело" : "File"}</span>
            <span>{locale === "ru" ? "Исполнитель и миссия" : "Owner and mission"}</span>
            <span>{locale === "ru" ? "Исход" : "Outcome"}</span>
            <span>{locale === "ru" ? "Очки" : "Points"}</span>
          </div>
          <ol className="agh-smoke-result-list">
            {result.results.map((entry, index) => {
              const owner = state.players.find((player) => player.id === entry.ownerPlayerId);
              const mission = parsed.reveals.find(
                (candidate) => candidate.missionId === entry.missionId,
              );
              return (
                <li key={entry.missionId}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>
                    <strong>{owner?.name ?? (locale === "ru" ? "Неизвестно" : "Unknown")}</strong>
                    <small>{mission?.mission.text}</small>
                  </span>
                  <em>
                    {entry.completed
                      ? locale === "ru"
                        ? "Выполнено"
                        : "Completed"
                      : locale === "ru"
                        ? "Не выполнено"
                        : "Not completed"}
                    {entry.caught
                      ? locale === "ru"
                        ? " / вычислен"
                        : " / caught"
                      : locale === "ru"
                        ? " / чисто"
                        : " / clean"}
                  </em>
                  <i>+{entry.ownerPoints}</i>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {error && <p className="agh-smoke-error">{error}</p>}
    </section>
  );
}
