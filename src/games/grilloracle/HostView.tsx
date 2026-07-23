import { useEffect, useMemo, useState } from "react";
import { GameRulesChecklist } from "@/components/game-rules-ui";
import {
  ORACLE_DONENESS_LEVELS,
  ORACLE_ITEM_CATEGORIES,
  type OracleDonenessLevel,
  type OracleItemCategory,
} from "./model";
import { createOracleHostFallback } from "@/lib/oracle-host-client";
import { formatClock } from "@/lib/team-style";
import { friendlyHostActionError } from "@/lib/host-action-errors";
import type { RoomState } from "@/lib/types";

const ITEM_LABELS: Record<OracleItemCategory, { en: string; ru: string }> = {
  vegetable: { en: "Vegetable", ru: "Овощ" },
  meat: { en: "Meat", ru: "Мясо" },
  bread: { en: "Bread", ru: "Хлеб" },
  drink: { en: "Drink / glass", ru: "Напиток / бокал" },
  mystery: { en: "Mystery evidence", ru: "Неопознанная улика" },
};

const DONENESS_LABELS: Record<OracleDonenessLevel, { en: string; ru: string }> = {
  raw: { en: "Raw / untouched", ru: "Сырое / нетронутое" },
  golden: { en: "Golden / neat", ru: "Золотистое / аккуратное" },
  charred: { en: "Charred", ru: "Обугленное" },
  incinerated: { en: "Incinerated", ru: "Археология" },
};

export function GrillOracleHost({
  roomId,
  state,
}: {
  roomId: string;
  code: string;
  state: RoomState;
}) {
  const oracle = state.grilloracle!;
  const locale = state.party?.uiLocale ?? "en";
  const [now, setNow] = useState(() => Date.now());
  const [localCompleted, setLocalCompleted] = useState<string[]>([]);
  const completedIds = useMemo(
    () => new Set([...oracle.submittedPlayerIds, ...localCompleted]),
    [localCompleted, oracle.submittedPlayerIds],
  );
  const participants = oracle.participantIds.flatMap((playerId) => {
    const player = state.players.find((candidate) => candidate.id === playerId);
    return player ? [player] : [];
  });
  const missing = participants.filter((player) => !completedIds.has(player.id));
  const [targetPlayerId, setTargetPlayerId] = useState(missing[0]?.id ?? "");
  const [itemCategory, setItemCategory] = useState<OracleItemCategory>(
    state.party?.actId === "bar" ? "drink" : "mystery",
  );
  const [doneness, setDoneness] = useState<OracleDonenessLevel>("charred");
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalCompleted([]);
    setFallbackError(null);
  }, [oracle.roundId]);

  useEffect(() => {
    if (!missing.some((player) => player.id === targetPlayerId)) {
      setTargetPlayerId(missing[0]?.id ?? "");
    }
  }, [missing, targetPlayerId]);

  const remaining = Math.max(0, (oracle.captureEndsAt ?? now) - now);
  return (
    <section className="agh-oracle-host" data-phase={oracle.phase}>
      <header className="agh-oracle-host-head">
        <div className="agh-oracle-host-copy">
          <span>
            {locale === "ru" ? "Гриль-Оракул / сбор улик" : "Grill Oracle / evidence capture"}
          </span>
          <h2>{locale === "ru" ? "Судьба коптится" : "Fate is smoking"}</h2>
          <p>
            {locale === "ru"
              ? "Каждый снимает одну реальную улику. Пророчество видит только владелец; пульт показывает лишь готовность."
              : "Each player captures one real object. Only its owner sees the prophecy; this desk shows readiness, never the content."}
          </p>
        </div>
        <div className="agh-oracle-host-clock">
          <time>{formatClock(remaining)}</time>
          <span>
            {completedIds.size}/{participants.length} {locale === "ru" ? "готово" : "ready"}
          </span>
        </div>
      </header>

      <div className="agh-oracle-host-ledger">
        <div className="agh-oracle-host-ledger-head">
          <strong>{locale === "ru" ? "Журнал улик" : "Evidence ledger"}</strong>
          <span>{locale === "ru" ? "Приватный текст скрыт" : "Private text hidden"}</span>
        </div>
        <ol>
          {participants.map((player, index) => {
            const done = completedIds.has(player.id);
            return (
              <li key={player.id} className={done ? "is-recorded" : "is-waiting"}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{player.name}</strong>
                <b>{done ? (locale === "ru" ? "ЗАПИСАНО" : "RECORDED") : "···"}</b>
              </li>
            );
          })}
        </ol>
      </div>

      {oracle.phase === "capturing" && missing.length > 0 && (
        <section className="agh-oracle-fallback">
          <header>
            <strong>{locale === "ru" ? "Камера подвела?" : "Camera failed?"}</strong>
            <span>{locale === "ru" ? "Ручное чтение" : "Manual reading"}</span>
          </header>
          <p>
            {locale === "ru"
              ? "Выбери свидетеля, улику и степень трагедии. Сервер выдаст приватное пророчество с тремя проверяемыми пунктами."
              : "Choose the witness, evidence and degree of tragedy. The server issues a private prophecy with three verifiable predictions."}
          </p>
          <div className="agh-oracle-fallback-fields">
            <label>
              <span>{locale === "ru" ? "Свидетель" : "Witness"}</span>
              <select
                value={targetPlayerId}
                onChange={(event) => setTargetPlayerId(event.target.value)}
              >
                {missing.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{locale === "ru" ? "Улика" : "Evidence"}</span>
              <select
                value={itemCategory}
                onChange={(event) => setItemCategory(event.target.value as OracleItemCategory)}
              >
                {ORACLE_ITEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {ITEM_LABELS[category][locale]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{locale === "ru" ? "Состояние" : "Condition"}</span>
              <select
                value={doneness}
                onChange={(event) => setDoneness(event.target.value as OracleDonenessLevel)}
              >
                {ORACLE_DONENESS_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {DONENESS_LABELS[level][locale]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={!targetPlayerId || fallbackBusy}
            onClick={() => {
              const fallbackPlayerId = targetPlayerId;
              setFallbackBusy(true);
              setFallbackError(null);
              void createOracleHostFallback({
                roomId,
                playerId: fallbackPlayerId,
                roundId: oracle.roundId,
                itemCategory,
                doneness,
              })
                .then(() =>
                  setLocalCompleted((current) => [...new Set([...current, fallbackPlayerId])]),
                )
                .catch((error) =>
                  setFallbackError(friendlyHostActionError(error, "manual Oracle reading", "save")),
                )
                .finally(() => setFallbackBusy(false));
            }}
          >
            <span>
              {fallbackBusy
                ? locale === "ru"
                  ? "Гадаем..."
                  : "Reading..."
                : locale === "ru"
                  ? "Выдать приватное пророчество"
                  : "Issue private prophecy"}
            </span>
            <b aria-hidden="true">↗</b>
          </button>
          {fallbackError && <p className="agh-oracle-error">{fallbackError}</p>}
        </section>
      )}

      {oracle.phase === "results" && (
        <div className="agh-oracle-host-complete">
          <span>{locale === "ru" ? "Улики собраны" : "Evidence collected"}</span>
          <strong>
            {locale === "ru"
              ? "Следующий акт опечатает показания."
              : "The next act seals the testimony."}
          </strong>
          <p>
            {locale === "ru"
              ? "Ведущий всё ещё не видит ни одного текста."
              : "The host still cannot see a single line."}
          </p>
        </div>
      )}

      <div className="agh-oracle-rules is-host">
        <GameRulesChecklist gameId="grilloracle" />
      </div>
    </section>
  );
}
