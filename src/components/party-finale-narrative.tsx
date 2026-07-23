import { useEffect, useRef, useState } from "react";
import { TapeReel } from "@/components/tape-reel";
import { generateFinaleNarrativeClient } from "@/lib/finale-narrative-client";
import type { FinaleNarrative } from "@/lib/finale-narrative";
import type { RoomState } from "@/lib/types";

export function PartyFinaleNarrative({
  roomId,
  state,
  canGenerate = false,
}: {
  roomId?: string;
  state: RoomState;
  canGenerate?: boolean;
}) {
  const [localNarrative, setLocalNarrative] = useState<FinaleNarrative>();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [retryToken, setRetryToken] = useState(0);
  const requestedRef = useRef("");
  const narrative = state.finale?.narrative ?? localNarrative;
  const russian = state.party?.uiLocale === "ru";
  const requestKey = `${roomId ?? ""}:${state.finale?.evidenceCapturedAt ?? 0}:${retryToken}`;

  useEffect(() => {
    if (!canGenerate || !roomId || narrative || state.status !== "finished") return;
    if (requestedRef.current === requestKey) return;
    requestedRef.current = requestKey;
    setStatus("loading");
    generateFinaleNarrativeClient(roomId)
      .then((result) => {
        setLocalNarrative(result.narrative);
        setStatus("idle");
      })
      .catch(() => setStatus("error"));
  }, [canGenerate, narrative, requestKey, roomId, state.status]);

  if (!narrative) {
    return (
      <section
        data-testid="party-finale-narrative-pending"
        className="agh-finale-narrative agh-finale-narrative-pending"
      >
        <TapeReel />
        <div>
          <strong>{russian ? "СОБИРАЕМ ПОСЛЕДНЮЮ ЛЕНТУ" : "ASSEMBLING THE LAST REEL"}</strong>
          <p>
            {status === "error"
              ? russian
                ? "Эпилог не запечатан. Улики целы, можно повторить."
                : "The epilogue was not sealed. The evidence is safe; try again."
              : russian
                ? "ИИ связывает публичные моменты вечера в один финал…"
                : "AI is connecting the evening's public moments into one finale…"}
          </p>
        </div>
        {status === "error" && canGenerate && (
          <button type="button" onClick={() => setRetryToken((value) => value + 1)}>
            {russian ? "Повторить эпилог" : "Retry epilogue"}
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      data-testid="party-finale-narrative"
      data-callback-count={narrative.callbacks.length}
      className="agh-finale-narrative"
    >
      <header>
        <span>{russian ? "ДЕЛО ВЕЧЕРА · ПОСЛЕДНЯЯ ЛЕНТА" : "TONIGHT'S CASE FILE · LAST REEL"}</span>
        <h3>{narrative.headline}</h3>
        <p>{narrative.opening}</p>
      </header>
      <div className="agh-finale-narrative-body">
        <div className="agh-finale-master-reel">
          <TapeReel label={russian ? "МАСТЕР · ВЕЧЕР" : "MASTER · TONIGHT"} />
        </div>
        {narrative.callbacks.length > 0 && (
          <div className="agh-finale-transcript">
            <div className="agh-finale-transcript-head">
              <span>{russian ? "СЕКЦИЯ" : "CUT"}</span>
              <span>{russian ? "ЧТО НОЧЬ СОХРАНИЛА" : "WHAT THE NIGHT KEPT"}</span>
              <span>{russian ? "ИСТОЧНИК" : "SOURCE"}</span>
            </div>
            {narrative.callbacks.map((callback, index) => (
              <article
                key={callback.evidenceId}
                data-testid="party-finale-callback"
                data-evidence-id={callback.evidenceId}
              >
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div>
                  <strong>{callback.title}</strong>
                  <p>{callback.payoff}</p>
                </div>
                <span>{callback.evidenceId.split(":")[0]}</span>
              </article>
            ))}
          </div>
        )}
      </div>
      <footer>
        <span>{russian ? "ФИНАЛЬНЫЙ ТОСТ" : "FINAL TOAST"}</span>
        <p>{narrative.closingToast}</p>
      </footer>
    </section>
  );
}
