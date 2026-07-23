import { useEffect, useMemo, useState } from "react";
import {
  SMOKE_SCREEN_MISSION_KIND,
  SMOKE_SCREEN_RESULT_KIND,
  SMOKE_SCREEN_REVEAL_KIND,
  smokeScreenMissionRecordSchema,
  smokeScreenResultRecordSchema,
  smokeScreenRevealRecordSchema,
  type SmokeScreenMissionRecord,
  type SmokeScreenResultRecord,
  type SmokeScreenRevealRecord,
} from "./model";
import {
  listSmokeScreenRecordsForPlayer,
  submitSmokeScreenVoteClient,
} from "@/lib/smokescreen-client";
import type { StoredPlayer } from "@/lib/player-action-client";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import type { PartyRecordView } from "@/lib/party-records";
import type { RoomState } from "@/lib/types";

type RevealedMission = SmokeScreenRevealRecord & { recordId: string };

function parseRecords(records: PartyRecordView[]) {
  let mission: SmokeScreenMissionRecord | undefined;
  let result: SmokeScreenResultRecord | undefined;
  const reveals: RevealedMission[] = [];
  records.forEach((record) => {
    if (record.kind === SMOKE_SCREEN_MISSION_KIND) {
      const parsed = smokeScreenMissionRecordSchema.safeParse(record.payload);
      if (parsed.success) mission = parsed.data;
    }
    if (record.kind === SMOKE_SCREEN_REVEAL_KIND) {
      const parsed = smokeScreenRevealRecordSchema.safeParse(record.payload);
      if (parsed.success) reveals.push({ ...parsed.data, recordId: record.id });
    }
    if (record.kind === SMOKE_SCREEN_RESULT_KIND) {
      const parsed = smokeScreenResultRecordSchema.safeParse(record.payload);
      if (parsed.success) result = parsed.data;
    }
  });
  return { mission, reveals, result };
}

export function SmokeScreenBackgroundPlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const smoke = state.smokescreen!;
  const locale = state.party?.uiLocale ?? "en";
  const [records, setRecords] = useState<PartyRecordView[]>([]);
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(smoke.submittedVoterIds.includes(me.id));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubmitted(smoke.submittedVoterIds.includes(me.id));
  }, [me.id, smoke.submittedVoterIds]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listSmokeScreenRecordsForPlayer({ roomId, runId: smoke.runId, playerId: me.id })
      .then(({ records: loaded }) => {
        if (!cancelled) setRecords(loaded);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyPlayerActionError(loadError, "sealed mission", "load"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me.id, roomId, smoke.runId, smoke.status]);

  const parsed = useMemo(() => parseRecords(records), [records]);
  const participants = smoke.participantIds.flatMap((playerId) => {
    const player = state.players.find((candidate) => candidate.id === playerId);
    return player ? [player] : [];
  });
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

  if (!smoke.participantIds.includes(me.id)) return null;

  async function submitVote() {
    if (parsed.reveals.some((reveal) => !guesses[reveal.missionId])) {
      setError(
        locale === "ru"
          ? "Назначь подозреваемого каждой миссии. Да, даже своей: хороший детектив сомневается во всём."
          : "Assign a suspect to every mission. Yes, even your own; a proper detective doubts everything.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitSmokeScreenVoteClient({
        roomId,
        runId: smoke.runId,
        playerId: me.id,
        guesses: parsed.reveals.map((reveal) => ({
          missionId: reveal.missionId,
          ownerPlayerId: guesses[reveal.missionId]!,
        })),
      });
      setSubmitted(true);
    } catch (voteError) {
      setError(friendlyPlayerActionError(voteError, "Smoke Screen vote"));
    } finally {
      setBusy(false);
    }
  }

  if (smoke.status === "assigning") {
    return (
      <SmokeFile compact state="assigning">
        <SmokeLabel>
          {locale === "ru" ? "Дымовая завеса / только тебе" : "Smoke Screen / eyes only"}
        </SmokeLabel>
        <strong className="agh-smoke-file-heading">
          {locale === "ru" ? "Открываем досье" : "Opening your file"}
        </strong>
        <p className="agh-smoke-file-note">
          {locale === "ru" ? "AI готовит личную миссию." : "AI is preparing your private mission."}
        </p>
        <RedactionBars />
      </SmokeFile>
    );
  }

  if (smoke.status === "sealed") {
    return (
      <SmokeFile compact state="sealed">
        <SmokeLabel>{locale === "ru" ? "Полевое дело закрыто" : "Fieldwork closed"}</SmokeLabel>
        <strong className="agh-smoke-file-heading">
          {locale === "ru" ? "Имя скрыто" : "Name withheld"}
        </strong>
        <p className="agh-smoke-file-note">
          {locale === "ru"
            ? "Сервер спрятал миссию. Позже она вернётся без твоего имени. Готовь алиби."
            : "The server has hidden the mission. It returns later without your name. Prepare an alibi."}
        </p>
        <RedactionBars />
      </SmokeFile>
    );
  }

  if (smoke.status === "active") {
    return (
      <div className="agh-smoke-stack">
        <details open={!state.currentGame} className="agh-smoke-file agh-smoke-secret">
          <summary className="agh-smoke-secret-summary">
            <SmokeLabel>
              {locale === "ru" ? "Фоновая миссия / только тебе" : "Background mission / eyes only"}
            </SmokeLabel>
            <div>
              <strong>
                {parsed.mission
                  ? `${locale === "ru" ? "Уровень" : "Tier"} ${parsed.mission.mission.tier} / +${parsed.mission.mission.tier * 5}`
                  : locale === "ru"
                    ? "Поднимаем досье"
                    : "Recovering your file"}
              </strong>
              <span className="agh-smoke-summary-state" aria-hidden="true">
                <i>{locale === "ru" ? "Открыть" : "Open file"}</i>
                <b>{locale === "ru" ? "Скрыть" : "Hide file"}</b>
              </span>
            </div>
          </summary>
          {loading || !parsed.mission ? (
            <p className="agh-smoke-file-note agh-smoke-secret-loading">
              {locale === "ru"
                ? "Секрет ещё едет по защищённой линии."
                : "The secret is still on the secure line."}
            </p>
          ) : (
            <div className="agh-smoke-secret-body">
              <header>
                <h2>{locale === "ru" ? "Веди себя обычно." : "Act normal."}</h2>
                <p>
                  {locale === "ru"
                    ? "Телефон сейчас работает как конверт. Прочитай и вернись к людям."
                    : "Your phone is the envelope. Read once, then get back to the people."}
                </p>
              </header>
              <section className="agh-smoke-assignment">
                <span>
                  {locale === "ru" ? "Твоя миссия" : "Your mission"} / +
                  {parsed.mission.mission.tier * 5}{" "}
                  {locale === "ru" ? "за чистую работу" : "if clean"}
                </span>
                <strong>{parsed.mission.mission.text}</strong>
              </section>
              <section className="agh-smoke-exposure">
                <span>{locale === "ru" ? "Что может тебя выдать" : "What may expose you"}</span>
                <p>{parsed.mission.mission.detection_hint}</p>
                <RedactionBars />
              </section>
              <button
                type="button"
                className="agh-smoke-secret-close"
                onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
              >
                <span>
                  {locale === "ru" ? "Скрыть и вернуться к людям" : "Hide + return to people"}
                </span>
                <b aria-hidden="true">↗</b>
              </button>
              <small className="agh-smoke-secret-privacy">
                {locale === "ru"
                  ? "Ведущий видит только прогресс. Эту миссию пока не видит никто."
                  : "The host sees progress only. Nobody else can see this mission yet."}
              </small>
            </div>
          )}
        </details>
      </div>
    );
  }

  if (smoke.status === "revealed") {
    return (
      <SmokeFile state="revealed">
        <SmokeLabel>
          {locale === "ru" ? "Анонимный список улик" : "Anonymous evidence list"}
        </SmokeLabel>
        <h2 className="agh-smoke-file-title">
          {submitted
            ? locale === "ru"
              ? "Бюллетень принят."
              : "Ballot filed."
            : locale === "ru"
              ? "Кто это делал?"
              : "Who did this?"}
        </h2>
        {submitted ? (
          <div className="agh-smoke-ballot-wait">
            <p>
              {locale === "ru"
                ? "Сервер запечатал твои догадки. Ждём, пока ведущий зафиксирует реальность."
                : "The server sealed your guesses. Wait for the host to lock what really happened."}
            </p>
            <RedactionBars />
          </div>
        ) : loading ? (
          <p className="agh-smoke-file-note">
            {locale === "ru" ? "Развешиваем улики." : "Pinning up the evidence."}
          </p>
        ) : (
          <div className="agh-smoke-ballot">
            {parsed.reveals.map((reveal, index) => (
              <label key={reveal.recordId}>
                <span className="agh-smoke-ballot-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="agh-smoke-ballot-copy">
                  <strong>{reveal.mission.text}</strong>
                  <small>
                    {locale === "ru" ? "Уровень" : "Tier"} {reveal.mission.tier} /{" "}
                    {reveal.mission.tier * 5}
                  </small>
                </span>
                <select
                  value={guesses[reveal.missionId] ?? ""}
                  aria-label={
                    locale === "ru"
                      ? `Подозреваемый по делу ${index + 1}`
                      : `Suspect for file ${index + 1}`
                  }
                  onChange={(event) =>
                    setGuesses((current) => ({
                      ...current,
                      [reveal.missionId]: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {locale === "ru" ? "Выбрать подозреваемого" : "Choose suspect"}
                  </option>
                  {participants.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button
              type="button"
              disabled={busy || parsed.reveals.length === 0}
              onClick={() => void submitVote()}
              className="agh-smoke-ballot-submit"
            >
              <span>
                {busy
                  ? locale === "ru"
                    ? "Запечатываем"
                    : "Sealing ballot"
                  : locale === "ru"
                    ? "Сдать бюллетень"
                    : "File ballot"}
              </span>
              <b aria-hidden="true">↗</b>
            </button>
          </div>
        )}
        {error && <p className="agh-smoke-error">{error}</p>}
      </SmokeFile>
    );
  }

  const myResult = result?.results.find((entry) => entry.ownerPlayerId === me.id);
  const detectivePoints =
    (result?.results.filter((entry) => entry.correctDetectiveIds.includes(me.id)).length ?? 0) * 2;
  return (
    <SmokeFile state="results">
      <SmokeLabel>{locale === "ru" ? "Завеса сорвана" : "Smoke Screen exposed"}</SmokeLabel>
      <h2 className="agh-smoke-file-title">
        {myResult?.caught
          ? locale === "ru"
            ? "Тебя вычислили."
            : "You were identified."
          : locale === "ru"
            ? "Алиби выдержало."
            : "Your alibi held."}
      </h2>
      <p className="agh-smoke-player-recap">{result?.recap}</p>
      <div className="agh-smoke-player-score">
        <span>
          {locale === "ru" ? "Миссия" : "Mission"} <strong>+{myResult?.ownerPoints ?? 0}</strong>
        </span>
        <span>
          {locale === "ru" ? "Детектив" : "Detective"} <strong>+{detectivePoints}</strong>
        </span>
      </div>
      <ol className="agh-smoke-player-results">
        {result?.results.map((entry, index) => {
          const owner = state.players.find((player) => player.id === entry.ownerPlayerId);
          const reveal = parsed.reveals.find(
            (candidate) => candidate.missionId === entry.missionId,
          );
          return (
            <li key={entry.missionId}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>
                <strong>{owner?.name ?? (locale === "ru" ? "Неизвестно" : "Unknown")}</strong>
                <small>{reveal?.mission.text}</small>
              </span>
              <em>
                {entry.caught
                  ? locale === "ru"
                    ? "Вычислен"
                    : "Caught"
                  : locale === "ru"
                    ? "Чисто"
                    : "Clean"}
              </em>
            </li>
          );
        })}
      </ol>
    </SmokeFile>
  );
}

function SmokeFile({
  children,
  compact = false,
  state,
}: {
  children: React.ReactNode;
  compact?: boolean;
  state: "assigning" | "sealed" | "revealed" | "results";
}) {
  return (
    <div className="agh-smoke-stack">
      <section className={`agh-smoke-file${compact ? " is-compact" : ""}`} data-state={state}>
        {children}
      </section>
    </div>
  );
}

function SmokeLabel({ children }: { children: React.ReactNode }) {
  return <div className="agh-smoke-label">{children}</div>;
}

function RedactionBars() {
  return (
    <div className="agh-smoke-inline-redactions" aria-hidden="true">
      <i />
      <i />
    </div>
  );
}
