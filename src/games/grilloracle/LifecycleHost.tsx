import { useEffect, useMemo, useRef, useState } from "react";
import {
  ORACLE_RECORD_KIND,
  ORACLE_VERDICT_RECORD_KIND,
  oracleRecordPayloadSchema,
  oracleVerdictRecordPayloadSchema,
  type OraclePredictionResults,
  type OracleRecordPayload,
  type OracleVerdictRecordPayload,
} from "./model";
import {
  listOracleRecordsForHost,
  revealOracleRunClient,
  sealOracleRunClient,
  verifyOraclePredictionsClient,
} from "@/lib/oracle-lifecycle-client";
import type { PartyRecordView } from "@/lib/party-records";
import type { GrillOracleMemoryStatus, RoomState } from "@/lib/types";
import { friendlyHostActionError } from "@/lib/host-action-errors";

const STATUS_ORDER: Record<GrillOracleMemoryStatus, number> = {
  collecting: 0,
  ready: 1,
  sealed: 2,
  revealed: 3,
  verified: 4,
};

type RevealedOracle = {
  playerId: string;
  playerName: string;
  prophecy: OracleRecordPayload;
  verdict?: OracleVerdictRecordPayload;
};

function revealedOracles(state: RoomState, records: PartyRecordView[]): RevealedOracle[] {
  const verdicts = new Map<string, OracleVerdictRecordPayload>();
  records.forEach((record) => {
    if (record.kind !== ORACLE_VERDICT_RECORD_KIND || !record.ownerPlayerId) return;
    const parsed = oracleVerdictRecordPayloadSchema.safeParse(record.payload);
    if (parsed.success) verdicts.set(record.ownerPlayerId, parsed.data);
  });
  return records.flatMap((record) => {
    if (record.kind !== ORACLE_RECORD_KIND || !record.ownerPlayerId) return [];
    const parsed = oracleRecordPayloadSchema.safeParse(record.payload);
    if (!parsed.success) return [];
    const playerName =
      state.players.find((player) => player.id === record.ownerPlayerId)?.name ?? "Unknown witness";
    return [
      {
        playerId: record.ownerPlayerId,
        playerName,
        prophecy: parsed.data,
        verdict: verdicts.get(record.ownerPlayerId),
      },
    ];
  });
}

export function GrillOracleLifecycleHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const memory = state.oracleMemory;
  const locale = state.party?.uiLocale ?? "en";
  const [localStatus, setLocalStatus] = useState<GrillOracleMemoryStatus>(
    memory?.status ?? "collecting",
  );
  const [records, setRecords] = useState<PartyRecordView[]>([]);
  const [resultsByPlayer, setResultsByPlayer] = useState<Record<string, OraclePredictionResults>>(
    {},
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previousRunId = useRef(memory?.runId);

  useEffect(() => {
    const runChanged = previousRunId.current !== memory?.runId;
    previousRunId.current = memory?.runId;
    if (runChanged) {
      setRecords([]);
      setResultsByPlayer({});
      setError(null);
      setLocalStatus(memory?.status ?? "collecting");
      return;
    }
    if (memory) {
      setLocalStatus((current) =>
        STATUS_ORDER[memory.status] > STATUS_ORDER[current] ? memory.status : current,
      );
    }
  }, [memory]);

  useEffect(() => {
    if (!memory || STATUS_ORDER[localStatus] < STATUS_ORDER.revealed) return;
    let cancelled = false;
    void listOracleRecordsForHost({ roomId, runId: memory.runId })
      .then(({ records: loaded }) => {
        if (!cancelled) setRecords(loaded);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyHostActionError(loadError, "Oracle memory", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [localStatus, memory, roomId]);

  const oracles = useMemo(() => revealedOracles(state, records), [records, state]);
  if (!memory) return null;
  const runId = memory.runId;
  const missingCount = Math.max(0, memory.participantIds.length - memory.submittedPlayerIds.length);
  const canReveal = state.party?.actId === "bar" || state.party?.actId === "finale";

  async function seal() {
    const allowIncomplete =
      missingCount === 0 ||
      window.confirm(
        locale === "ru"
          ? `Не хватает ${missingCount} пророчеств. Опечатать только готовые?`
          : `${missingCount} prophecies are missing. Seal only the completed records?`,
      );
    if (!allowIncomplete) return;
    setBusy("seal");
    setError(null);
    try {
      const result = await sealOracleRunClient({
        roomId,
        runId,
        allowIncomplete: missingCount > 0,
      });
      setLocalStatus(result.memory.status);
    } catch (sealError) {
      setError(friendlyHostActionError(sealError, "Oracle memory", "save"));
    } finally {
      setBusy(null);
    }
  }

  async function reveal() {
    setBusy("reveal");
    setError(null);
    try {
      const result = await revealOracleRunClient({ roomId, runId });
      setLocalStatus(result.memory.status);
      const loaded = await listOracleRecordsForHost({ roomId, runId });
      setRecords(loaded.records);
    } catch (revealError) {
      setError(friendlyHostActionError(revealError, "Oracle reveal", "complete"));
    } finally {
      setBusy(null);
    }
  }

  async function verify(oracle: RevealedOracle) {
    const results = resultsByPlayer[oracle.playerId] ?? [false, false, false];
    setBusy(`verify:${oracle.playerId}`);
    setError(null);
    try {
      const verified = await verifyOraclePredictionsClient({
        roomId,
        runId,
        playerId: oracle.playerId,
        results,
      });
      setLocalStatus(verified.memory.status);
      setRecords((current) => [
        ...current.filter(
          (record) =>
            !(
              record.kind === ORACLE_VERDICT_RECORD_KIND && record.ownerPlayerId === oracle.playerId
            ),
        ),
        {
          id: `local:${oracle.playerId}`,
          runId,
          gameId: "grilloracle",
          actId: state.party?.actId ?? "bar",
          ownerPlayerId: oracle.playerId,
          kind: ORACLE_VERDICT_RECORD_KIND,
          visibility: "revealed",
          createdAt: new Date().toISOString(),
          revealedAt: new Date().toISOString(),
          payloadRedacted: false,
          payload: verified.verdict,
        },
      ]);
    } catch (verifyError) {
      setError(friendlyHostActionError(verifyError, "Oracle verification", "complete"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="agh-oracle-memory-host" data-status={localStatus}>
      <header>
        <div className="agh-oracle-memory-host-copy">
          <span>
            {locale === "ru"
              ? "Сквозная улика / Гриль-Оракул"
              : "Cross-act evidence / Grill Oracle"}
          </span>
          <h3>
            {localStatus === "collecting" || localStatus === "ready"
              ? locale === "ru"
                ? "Опечатать показания"
                : "Seal the testimony"
              : localStatus === "sealed"
                ? locale === "ru"
                  ? "Показания опечатаны"
                  : "Testimony sealed"
                : locale === "ru"
                  ? "Час расплаты"
                  : "The reckoning"}
          </h3>
          <p>
            {memory.submittedPlayerIds.length}/{memory.participantIds.length}{" "}
            {locale === "ru" ? "пророчеств записано" : "prophecies recorded"}
            {missingCount > 0
              ? locale === "ru"
                ? ` / ${missingCount} не хватает`
                : ` / ${missingCount} missing`
              : ""}
          </p>
        </div>
        {(localStatus === "collecting" || localStatus === "ready") && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void seal()}
            className="agh-oracle-memory-action"
          >
            <span>
              {busy === "seal"
                ? locale === "ru"
                  ? "Ставим печать..."
                  : "Sealing..."
                : locale === "ru"
                  ? "Опечатать"
                  : "Seal records"}
            </span>
            <b aria-hidden="true">↗</b>
          </button>
        )}
        {localStatus === "sealed" && canReveal && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void reveal()}
            className="agh-oracle-memory-action"
          >
            <span>
              {busy === "reveal"
                ? locale === "ru"
                  ? "Ломаем печать..."
                  : "Breaking seal..."
                : locale === "ru"
                  ? "Вскрыть в баре"
                  : "Break the seal"}
            </span>
            <b aria-hidden="true">↗</b>
          </button>
        )}
      </header>

      {localStatus === "sealed" && !canReveal && (
        <div className="agh-oracle-memory-locked">
          <strong>{locale === "ru" ? "ПЕЧАТЬ ЦЕЛА" : "SEAL INTACT"}</strong>
          <p>
            {locale === "ru"
              ? "Тексты скрыты у игроков и ведущего. Вскрытие станет доступно в bar-акте."
              : "The text is hidden from players and host. Reveal unlocks in the bar act."}
          </p>
        </div>
      )}

      {STATUS_ORDER[localStatus] >= STATUS_ORDER.revealed && (
        <div className="agh-oracle-verification-list">
          <div className="agh-oracle-verification-head">
            <strong>{locale === "ru" ? "Проверка залом" : "Room verification"}</strong>
            <span>
              {oracles.length} {locale === "ru" ? "показаний" : "testimonies"}
            </span>
          </div>
          {oracles.map((oracle) => (
            <OracleVerificationCard
              key={oracle.playerId}
              oracle={oracle}
              locale={locale}
              results={resultsByPlayer[oracle.playerId] ?? [false, false, false]}
              disabled={busy !== null}
              onToggle={(index) =>
                setResultsByPlayer((current) => {
                  const next = [...(current[oracle.playerId] ?? [false, false, false])] as [
                    boolean,
                    boolean,
                    boolean,
                  ];
                  next[index] = !next[index];
                  return { ...current, [oracle.playerId]: next };
                })
              }
              onVerify={() => void verify(oracle)}
            />
          ))}
          {oracles.length === 0 && (
            <p className="agh-oracle-memory-empty">
              {locale === "ru" ? "Вскрываем архив..." : "Opening the archive..."}
            </p>
          )}
        </div>
      )}
      {error && <p className="agh-oracle-error">{error}</p>}
    </section>
  );
}

function OracleVerificationCard({
  oracle,
  locale,
  results,
  disabled,
  onToggle,
  onVerify,
}: {
  oracle: RevealedOracle;
  locale: "en" | "ru";
  results: OraclePredictionResults;
  disabled: boolean;
  onToggle: (index: 0 | 1 | 2) => void;
  onVerify: () => void;
}) {
  const reading = oracle.prophecy.reading;
  return (
    <article className="agh-oracle-verification">
      <header>
        <strong>{oracle.playerName}</strong>
        <span>{oracle.verdict ? (locale === "ru" ? "ПРОВЕРЕНО" : "VERIFIED") : "03 CLAIMS"}</span>
      </header>
      <p className="agh-oracle-verification-prophecy">{reading.prophecy}</p>
      <div className="agh-oracle-verification-claims">
        {reading.predictions.map((prediction, index) => {
          const fixedIndex = index as 0 | 1 | 2;
          const fulfilled = oracle.verdict?.results[fixedIndex] ?? results[fixedIndex];
          return (
            <button
              key={prediction}
              type="button"
              disabled={Boolean(oracle.verdict) || disabled}
              onClick={() => onToggle(fixedIndex)}
              className={fulfilled ? "is-fulfilled" : "is-unfulfilled"}
              aria-pressed={fulfilled}
            >
              <span>{fulfilled ? "YES" : "NO"}</span>
              <strong>{prediction}</strong>
            </button>
          );
        })}
      </div>
      {oracle.verdict ? (
        <div className="agh-oracle-verification-verdict">
          <span>{locale === "ru" ? "Вердикт" : "Verdict"}</span>
          <p>{oracle.verdict.decision.verdict}</p>
          <b>
            +{oracle.verdict.decision.oracle_points} Oracle / +
            {oracle.verdict.decision.skeptic_points} {locale === "ru" ? "скептикам" : "skeptics"}
          </b>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onVerify}
          className="agh-oracle-verification-lock"
        >
          <span>{locale === "ru" ? "Зафиксировать 3 исхода" : "Lock all 3 outcomes"}</span>
          <b aria-hidden="true">↗</b>
        </button>
      )}
    </article>
  );
}
