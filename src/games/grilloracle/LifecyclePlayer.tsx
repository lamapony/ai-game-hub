import { useEffect, useState } from "react";
import { listOracleRecordsForPlayer } from "@/lib/oracle-client";
import type { StoredPlayer } from "@/lib/player-action-client";
import type { RoomState } from "@/lib/types";
import {
  ORACLE_RECORD_KIND,
  ORACLE_VERDICT_RECORD_KIND,
  oracleRecordPayloadSchema,
  oracleVerdictRecordPayloadSchema,
  type OracleRecordPayload,
  type OracleVerdictRecordPayload,
} from "./model";

export function GrillOracleLifecyclePlayer({
  roomId,
  state,
  me,
}: {
  roomId: string;
  state: RoomState;
  me: StoredPlayer;
}) {
  const memory = state.oracleMemory!;
  const locale = state.party?.uiLocale ?? "en";
  const [prophecy, setProphecy] = useState<OracleRecordPayload | null>(null);
  const [verdict, setVerdict] = useState<OracleVerdictRecordPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProphecy(null);
    setVerdict(null);
    void listOracleRecordsForPlayer({
      roomId,
      playerId: me.id,
      roundId: memory.runId,
    })
      .then(({ records }) => {
        if (cancelled) return;
        const prophecyRecord = records.find(
          (record) => record.kind === ORACLE_RECORD_KIND && record.ownerPlayerId === me.id,
        );
        const verdictRecord = records.find(
          (record) => record.kind === ORACLE_VERDICT_RECORD_KIND && record.ownerPlayerId === me.id,
        );
        const parsedProphecy = oracleRecordPayloadSchema.safeParse(prophecyRecord?.payload);
        const parsedVerdict = oracleVerdictRecordPayloadSchema.safeParse(verdictRecord?.payload);
        if (parsedProphecy.success) setProphecy(parsedProphecy.data);
        if (parsedVerdict.success) setVerdict(parsedVerdict.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me.id, memory.runId, memory.status, roomId]);

  if (!memory.submittedPlayerIds.includes(me.id)) {
    return (
      <MemoryCard>
        <MemoryLabel>{locale === "ru" ? "Архив Оракула" : "Oracle archive"}</MemoryLabel>
        <MemoryHeading>
          {locale === "ru" ? "Твоего пророчества в архиве нет" : "No prophecy was filed for you"}
        </MemoryHeading>
      </MemoryCard>
    );
  }

  if (memory.status === "sealed") {
    return (
      <MemoryCard state="sealed">
        <div className="agh-oracle-seal-mark" aria-hidden="true">
          {locale === "ru" ? "ОПЕЧАТАНО" : "SEALED"}
        </div>
        <MemoryLabel>{locale === "ru" ? "Показания опечатаны" : "Testimony sealed"}</MemoryLabel>
        <MemoryHeading>
          {locale === "ru" ? "Даже ты теперь не подсмотришь" : "Not even you get to peek now"}
        </MemoryHeading>
        <p className="agh-oracle-memory-note">
          {locale === "ru"
            ? "Текст скрыт сервером, а не просто CSS. Печать сломает ведущий в bar-акте, всем залом."
            : "The server hides the text; this is not a CSS trick. The host breaks the seal in the bar act with the whole room."}
        </p>
      </MemoryCard>
    );
  }

  if (loading || !prophecy) {
    return (
      <MemoryCard>
        <MemoryLabel>{locale === "ru" ? "Архив Оракула" : "Oracle archive"}</MemoryLabel>
        <MemoryHeading>
          {locale === "ru"
            ? "Поднимаем показания из пепла..."
            : "Recovering testimony from the ash..."}
        </MemoryHeading>
      </MemoryCard>
    );
  }

  const reading = prophecy.reading;
  return (
    <MemoryCard state={verdict ? "verified" : "revealed"}>
      <MemoryLabel>
        {memory.status === "collecting" || memory.status === "ready"
          ? locale === "ru"
            ? "Последний взгляд до печати"
            : "Last look before sealing"
          : locale === "ru"
            ? "Печать сломана"
            : "Seal broken"}
      </MemoryLabel>
      <MemoryHeading>{reading.item_guess}</MemoryHeading>
      <p className="agh-oracle-memory-prophecy">{reading.prophecy}</p>
      <ol className="agh-oracle-memory-predictions">
        {reading.predictions.map((prediction, index) => {
          const result = verdict?.results[index];
          return (
            <li key={prediction} data-result={result === undefined ? "pending" : String(result)}>
              <span>{result === true ? "YES" : result === false ? "NO" : `0${index + 1}`}</span>
              <strong>{prediction}</strong>
            </li>
          );
        })}
      </ol>
      {verdict && (
        <div className="agh-oracle-memory-verdict">
          <span>{locale === "ru" ? "Вердикт зала" : "Room verdict"}</span>
          <p>{verdict.decision.verdict}</p>
          <b>
            +{verdict.decision.oracle_points} {locale === "ru" ? "Оракулу" : "Oracle"} / +
            {verdict.decision.skeptic_points} {locale === "ru" ? "скептикам" : "skeptics"}
          </b>
        </div>
      )}
    </MemoryCard>
  );
}

function MemoryCard({
  children,
  state = "idle",
}: {
  children: React.ReactNode;
  state?: "idle" | "sealed" | "revealed" | "verified";
}) {
  return (
    <article className="agh-oracle-memory-card" data-state={state}>
      {children}
    </article>
  );
}

function MemoryLabel({ children }: { children: React.ReactNode }) {
  return <div className="agh-oracle-memory-label">{children}</div>;
}

function MemoryHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="agh-oracle-memory-heading">{children}</h2>;
}
