import { useEffect, useMemo, useState } from "react";
import { TapeReel } from "@/components/tape-reel";
import type { CrossEvidenceCandidate, CrossManualFinding, CrossTestimonyRecord } from "./model";
import {
  getCrossExaminationCaseClient,
  manualCrossExaminationVerdictClient,
  nextCrossExaminationClient,
  openCrossExaminationClient,
  prepareCrossExaminationClient,
  skipCrossExaminationClient,
} from "@/lib/crossexamination-client";
import type {
  CrossExaminationPair,
  CrossExaminationState,
  CrossQuestionCategory,
  RoomState,
} from "@/lib/types";
import { friendlyHostActionError } from "@/lib/host-action-errors";

const CATEGORY_LABELS: Record<CrossQuestionCategory, { en: string; ru: string }> = {
  order: { en: "event order", ru: "порядок событий" },
  object: { en: "real object", ru: "реальный предмет" },
  person: { en: "who did it", ru: "кто это сделал" },
  detail: { en: "small detail", ru: "мелкая деталь" },
};

const FINDING_LABELS: Array<{ id: CrossManualFinding; en: string; ru: string }> = [
  { id: "consistent", en: "consistent · 0", ru: "совпало · 0" },
  { id: "minor", en: "minor mismatch · 1", ru: "мелочь · 1" },
  { id: "memory-gap", en: "memory gap · 2", ru: "не помнит · 2" },
  { id: "conflict", en: "direct conflict · 3", ru: "противоречие · 3" },
];

type ManualFindingState = {
  questionId: string;
  finding: CrossManualFinding;
  versionA: string;
  versionB: string;
};

function currentPair(run: CrossExaminationState): CrossExaminationPair {
  return run.pairOrder[run.pairNumber - 1]!;
}

function secondsLeft(endsAt: number | undefined, now: number) {
  return Math.max(0, Math.ceil(((endsAt ?? now) - now) / 1000));
}

export function CrossExaminationHost({
  roomId,
  state,
}: {
  roomId: string;
  code: string;
  state: RoomState;
}) {
  const publicRun = state.crossexamination!;
  const locale = state.party?.uiLocale ?? "en";
  const [run, setRun] = useState<CrossExaminationState>(publicRun);
  const [candidates, setCandidates] = useState<CrossEvidenceCandidate[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [manualFactsText, setManualFactsText] = useState("");
  const [testimonyA, setTestimonyA] = useState<CrossTestimonyRecord | null>(null);
  const [testimonyB, setTestimonyB] = useState<CrossTestimonyRecord | null>(null);
  const [manualFindings, setManualFindings] = useState<ManualFindingState[]>([]);
  const [manualVerdict, setManualVerdict] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setRun(publicRun), [publicRun]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!["curation", "review"].includes(run.status)) return;
    let cancelled = false;
    setError(null);
    void getCrossExaminationCaseClient(roomId, run.runId)
      .then((result) => {
        if (cancelled) return;
        setRun(result.run);
        setCandidates(result.candidates);
        setTestimonyA(result.testimonyA);
        setTestimonyB(result.testimonyB);
      })
      .catch((loadError) => {
        if (!cancelled) setError(friendlyHostActionError(loadError, "case file", "load"));
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, run.currentPairId, run.runId, run.status]);

  useEffect(() => {
    if (run.status !== "review" || !run.questions) return;
    const questions = run.questions;
    setManualFindings((current) =>
      current.length === 4 &&
      current.every((finding) => questions.some((q) => q.questionId === finding.questionId))
        ? current
        : questions.map((question) => ({
            questionId: question.questionId,
            finding: "consistent",
            versionA: "",
            versionB: "",
          })),
    );
  }, [run.currentPairId, run.questions, run.status]);

  const pair = currentPair(run);
  const manualFacts = useMemo(
    () =>
      manualFactsText
        .split("\n")
        .map((fact) => fact.trim())
        .filter(Boolean)
        .slice(0, 8),
    [manualFactsText],
  );
  const approvedCount = candidates.length - excluded.size + manualFacts.length;

  function toggleCandidate(recordId: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const result = await prepareCrossExaminationClient({
        roomId,
        runId: run.runId,
        excludedRecordIds: [...excluded],
        manualFacts,
      });
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "evidence approval", "complete"));
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const result = await openCrossExaminationClient(roomId, run.runId, run.currentPairId);
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "testimony capture", "complete"));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (
      !window.confirm(
        run.status === "curation"
          ? locale === "ru"
            ? "Закрыть весь допрос? Титулы и финальный пьедестал всё равно останутся доступны."
            : "Dismiss the whole investigation? Titles and the final podium will remain available."
          : locale === "ru"
            ? "Закрыть эту пару без очков?"
            : "Dismiss this pair with no points?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await skipCrossExaminationClient(roomId, run.runId, run.currentPairId);
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "pair dismissal", "complete"));
    } finally {
      setBusy(false);
    }
  }

  async function manualResolve() {
    setBusy(true);
    setError(null);
    try {
      const result = await manualCrossExaminationVerdictClient({
        roomId,
        runId: run.runId,
        pairId: run.currentPairId,
        findings: manualFindings,
        verdict: manualVerdict.trim(),
      });
      setRun(result.run);
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "manual verdict", "complete"));
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setBusy(true);
    setError(null);
    try {
      const result = await nextCrossExaminationClient(roomId, run.runId, run.currentPairId);
      setRun(result.run);
      setTestimonyA(null);
      setTestimonyB(null);
      setManualFindings([]);
      setManualVerdict("");
    } catch (actionError) {
      setError(friendlyHostActionError(actionError, "next pair", "load"));
    } finally {
      setBusy(false);
    }
  }

  const manualReady =
    manualVerdict.trim().length > 0 &&
    manualFindings.length === 4 &&
    manualFindings.every((finding) => finding.versionA.trim() && finding.versionB.trim());
  const revealedResult = run.status === "reveal" ? run.result : undefined;
  const contradictionCount =
    revealedResult?.findings.filter((finding) => finding.severity > 0).length ?? 0;
  const phaseLabel =
    {
      curation: locale === "ru" ? "ОТБОР УЛИК" : "EVIDENCE CUT",
      briefing: locale === "ru" ? "ИНСТРУКТАЖ" : "BRIEFING",
      capturing: locale === "ru" ? "ИДЁТ ЗАПИСЬ" : "TAPE ROLLING",
      comparing: locale === "ru" ? "СВЕРКА" : "COMPARING",
      review: locale === "ru" ? "РУЧНАЯ СКЛЕЙКА" : "MANUAL SPLICE",
      reveal: locale === "ru" ? "ВЕРДИКТ" : "REVEAL LOCKED",
      results: locale === "ru" ? "АРХИВ ГОТОВ" : "ARCHIVE COMPLETE",
    }[run.status] ?? run.status;

  return (
    <section className="agh-cross agh-cross-host" data-cross-phase={run.status}>
      <header className="agh-cross-header">
        <div className="agh-cross-lockup">
          <i />
          <strong>{locale === "ru" ? "ПЕРЕКРЁСТНЫЙ ДОПРОС" : "CROSS EXAMINATION"}</strong>
        </div>
        <span>
          {locale === "ru" ? "ФИНАЛЬНОЕ ДЕЛО · ПАРА" : "FINAL CASE · PAIR"} {run.pairNumber} /{" "}
          {run.totalPairs}
        </span>
        <b>{phaseLabel}</b>
      </header>

      <div className="agh-cross-signal">
        <div className="agh-cross-signal-copy">
          <h2>
            <span>
              {run.status === "results"
                ? locale === "ru"
                  ? "ДЕЛО"
                  : "THE CASE"
                : locale === "ru"
                  ? "ДВЕ ВЕРСИИ."
                  : "TWO STORIES."}
            </span>
            <span>
              {run.status === "results"
                ? locale === "ru"
                  ? "ЗАКРЫТО."
                  : "IS CLOSED."
                : locale === "ru"
                  ? "ОДНА СКЛЕЙКА."
                  : "ONE CUT."}
            </span>
          </h2>
          <p>
            {run.status === "results"
              ? locale === "ru"
                ? "Публичные выводы сохранены. Полные записи остались закрытыми."
                : "Public findings are archived. Full recordings stayed private."
              : `${pair.playerAName} × ${pair.playerBName}. ${locale === "ru" ? "Два независимых показания, четыре общих вопроса." : "Two independent statements, four shared questions."}`}
          </p>
        </div>
        <div className="agh-cross-machine">
          <TapeReel />
          <div className="agh-cross-splice">
            <strong>
              {run.status === "capturing"
                ? `REC ${secondsLeft(run.recordingEndsAt, now)}s`
                : revealedResult
                  ? `${String(contradictionCount).padStart(2, "0")} ${locale === "ru" ? "РАСХОЖД." : "CONTRADICTIONS"}`
                  : locale === "ru"
                    ? "ЖДЁМ СКЛЕЙКУ"
                    : "AWAITING SPLICE"}
            </strong>
            <i />
            <span>
              {run.submittedPlayerIds.length}/2 {locale === "ru" ? "ПОКАЗАНИЯ" : "STATEMENTS"}
            </span>
          </div>
          <TapeReel />
        </div>
      </div>

      {error && <p className="agh-cross-error">{error}</p>}

      {run.status === "curation" && (
        <div className="agh-cross-section agh-cross-curation">
          <div className="agh-cross-note is-private">
            <div className="font-semibold text-amber-100">
              {locale === "ru" ? "Закрытая редактура улик" : "Private evidence edit"}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-white/65">
              {locale === "ru"
                ? "Только ты видишь эти выдержки. Сними галочку с личного или неприятного эпизода: исключённый текст не попадёт ни в prompt, ни на общий экран."
                : "Only you can see these excerpts. Untick anything personal or uncomfortable: excluded text reaches neither the prompt nor the public screen."}
            </p>
          </div>

          <div className="agh-cross-source-list">
            {candidates.length === 0 ? (
              <p className="agh-cross-empty">
                {locale === "ru"
                  ? "Записей пока нет. Добавь минимум две реальные наблюдаемые детали вечера ниже."
                  : "No records yet. Add at least two real observable moments from tonight below."}
              </p>
            ) : (
              candidates.map((candidate) => (
                <label key={candidate.recordId} className="agh-cross-source-row">
                  <input
                    type="checkbox"
                    checked={!excluded.has(candidate.recordId)}
                    onChange={() => toggleCandidate(candidate.recordId)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{candidate.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-white/55">
                      {candidate.excerpt}
                    </span>
                    <span className="mt-2 block text-[10px] uppercase tracking-wider text-white/35">
                      {candidate.actId} · {candidate.kind}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>

          <label className="agh-cross-field">
            <span className="font-semibold">
              {locale === "ru"
                ? "Наблюдения ведущего · по одному на строку"
                : "Host observations · one per line"}
            </span>
            <textarea
              value={manualFactsText}
              onChange={(event) => setManualFactsText(event.target.value)}
              maxLength={2_400}
              placeholder={
                locale === "ru"
                  ? "Ветер унёс фольгу сразу после первого тоста…\nДима спас кабачок щипцами для сосисок…"
                  : "The wind took the foil right after the first toast…\nDima rescued the zucchini with the sausage tongs…"
              }
              className="agh-cross-textarea"
            />
          </label>

          <div className="agh-cross-actions">
            <button
              type="button"
              disabled={busy || approvedCount < 2}
              onClick={() => void prepare()}
              className="agh-cross-primary"
            >
              {locale === "ru"
                ? `Утвердить ${approvedCount} источн. и написать вопросы`
                : `Approve ${approvedCount} sources and draft questions`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void skip()}
              className="agh-cross-secondary"
            >
              {locale === "ru" ? "Пропустить допрос" : "Skip the investigation"}
            </button>
          </div>
        </div>
      )}

      {run.status === "briefing" && run.questions && (
        <div className="agh-cross-section agh-cross-briefing">
          <p className="agh-cross-note">
            {locale === "ru"
              ? "Посади подельников порознь. Они видят одинаковые вопросы, но не слышат ответы друг друга. Зал до reveal выбирает категорию будущего расхождения."
              : "Separate the accomplices. They see the same questions but cannot hear each other. The room predicts a contradiction category before reveal."}
          </p>
          <ol className="agh-cross-question-list">
            {run.questions.map((question, index) => (
              <li key={question.questionId} className="agh-cross-question-row">
                <div className="agh-cross-question-meta">
                  0{index + 1} · {CATEGORY_LABELS[question.category][locale]}
                </div>
                <div className="agh-cross-question-text">{question.text}</div>
              </li>
            ))}
          </ol>
          <div className="agh-cross-source-count">
            {run.selectedSourceCount}{" "}
            {locale === "ru" ? "утверждённых источников" : "host-approved sources"}
            {run.questionsAiFallback
              ? ` · ${locale === "ru" ? "локальные вопросы" : "local questions"}`
              : ""}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void open()}
            className="agh-cross-primary"
          >
            {locale === "ru" ? "Открыть два приватных микрофона" : "Open two private microphones"}
          </button>
        </div>
      )}

      {run.status === "capturing" && (
        <div className="agh-cross-section agh-cross-capture-grid">
          {[pair.playerAId, pair.playerBId].map((playerId) => {
            const name = playerId === pair.playerAId ? pair.playerAName : pair.playerBName;
            const submitted = run.submittedPlayerIds.includes(playerId);
            return (
              <div key={playerId} className="agh-cross-witness" data-sealed={submitted}>
                <div className="agh-cross-mic-mark" />
                <div className="mt-2 font-display text-2xl">{name}</div>
                <div className="mt-1 text-xs text-white/50">
                  {submitted
                    ? locale === "ru"
                      ? "показание опечатано"
                      : "statement sealed"
                    : locale === "ru"
                      ? "отвечает отдельно"
                      : "answering separately"}
                </div>
              </div>
            );
          })}
          <div className="agh-cross-audience-count">
            {locale === "ru" ? "Прогнозов зала" : "Audience predictions"}:{" "}
            {run.predictionVoterIds.length}
          </div>
        </div>
      )}

      {run.status === "comparing" && (
        <p className="agh-cross-note agh-cross-comparing">
          {locale === "ru"
            ? "Оба показания опечатаны. Следователь сверяет только транскрипты и готовит короткие публичные версии…"
            : "Both statements are sealed. The investigator is comparing transcripts and drafting short public versions…"}
        </p>
      )}

      {run.status === "review" && run.questions && (
        <div className="agh-cross-section agh-cross-review">
          <div className="agh-cross-note is-private">
            <div className="font-semibold text-amber-100">
              {locale === "ru"
                ? "Ручная сверка — AI воздержался"
                : "Manual comparison — AI abstained"}
            </div>
            <p className="mt-1 text-xs text-white/55">
              {locale === "ru"
                ? "Полные показания видишь только ты. Для общего экрана напиши по одной короткой нейтральной версии."
                : "Only you can see the full statements. Write one short neutral version per witness for the public screen."}
            </p>
            <details className="agh-cross-transcript">
              <summary className="cursor-pointer font-semibold">
                {pair.playerAName} · host-only transcript
              </summary>
              <p className="mt-2 whitespace-pre-wrap">
                {testimonyA?.transcript || "Transcript unavailable"}
              </p>
            </details>
            <details className="agh-cross-transcript">
              <summary className="cursor-pointer font-semibold">
                {pair.playerBName} · host-only transcript
              </summary>
              <p className="mt-2 whitespace-pre-wrap">
                {testimonyB?.transcript || "Transcript unavailable"}
              </p>
            </details>
          </div>

          {run.questions.map((question, index) => {
            const finding = manualFindings.find(
              (entry) => entry.questionId === question.questionId,
            );
            if (!finding) return null;
            return (
              <div key={question.questionId} className="agh-cross-review-row">
                <div className="font-semibold">
                  {index + 1}. {question.text}
                </div>
                <select
                  value={finding.finding}
                  onChange={(event) =>
                    setManualFindings((current) =>
                      current.map((entry) =>
                        entry.questionId === question.questionId
                          ? { ...entry, finding: event.target.value as CrossManualFinding }
                          : entry,
                      ),
                    )
                  }
                  className="agh-cross-select"
                >
                  {FINDING_LABELS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option[locale]}
                    </option>
                  ))}
                </select>
                <div className="agh-cross-version-pair">
                  <input
                    value={finding.versionA}
                    maxLength={300}
                    onChange={(event) =>
                      setManualFindings((current) =>
                        current.map((entry) =>
                          entry.questionId === question.questionId
                            ? { ...entry, versionA: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder={`${pair.playerAName}: ${locale === "ru" ? "короткая версия" : "short version"}`}
                    className="agh-cross-input"
                  />
                  <input
                    value={finding.versionB}
                    maxLength={300}
                    onChange={(event) =>
                      setManualFindings((current) =>
                        current.map((entry) =>
                          entry.questionId === question.questionId
                            ? { ...entry, versionB: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder={`${pair.playerBName}: ${locale === "ru" ? "короткая версия" : "short version"}`}
                    className="agh-cross-input"
                  />
                </div>
              </div>
            );
          })}

          <textarea
            value={manualVerdict}
            onChange={(event) => setManualVerdict(event.target.value)}
            maxLength={1_200}
            placeholder={
              locale === "ru"
                ? "Нуар-вердикт без диагноза и унижения…"
                : "Noir verdict without diagnosis or humiliation…"
            }
            className="agh-cross-textarea"
          />
          <button
            type="button"
            disabled={busy || !manualReady}
            onClick={() => void manualResolve()}
            className="agh-cross-primary"
          >
            {locale === "ru" ? "Зафиксировать ручной вердикт" : "Lock manual verdict"}
          </button>
        </div>
      )}

      {revealedResult && (
        <div className="agh-cross-section agh-cross-reveal">
          <div className="agh-cross-reveal-verdict">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-lime-100/55">
                  {locale === "ru" ? "Прочность алиби" : "Alibi strength"}{" "}
                  {revealedResult.alibiStrength}/10
                </div>
                <div className="agh-cross-points">{revealedResult.pairPoints} pts</div>
              </div>
              {revealedResult.environmentBonus === 5 && (
                <span className="rounded-full bg-lime-200 px-3 py-1 text-xs font-bold text-lime-950">
                  {locale === "ru" ? "РЕАЛЬНАЯ УЛИКА +5" : "REAL EVIDENCE +5"}
                </span>
              )}
            </div>
            <p className="mt-4 text-base leading-relaxed text-white/85">{revealedResult.verdict}</p>
          </div>
          <div className="agh-cross-finding-list">
            {revealedResult.findings.map((finding) => (
              <div key={finding.questionId} className="agh-cross-finding-row">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold">{finding.question}</div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs">
                    −{finding.severity}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-white/60 sm:grid-cols-2">
                  <p>
                    <strong className="text-white/80">{revealedResult.playerAName}:</strong>{" "}
                    {finding.versionA}
                  </p>
                  <p>
                    <strong className="text-white/80">{revealedResult.playerBName}:</strong>{" "}
                    {finding.versionB}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-white/50">
            {locale === "ru" ? "Точных прогнозов зала" : "Correct audience predictions"}:{" "}
            {revealedResult.correctVoterIds.length}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void next()}
            className="agh-cross-primary"
          >
            {run.pairNumber >= run.totalPairs
              ? locale === "ru"
                ? "Закрыть дело и перейти к титулам"
                : "Close the case and continue to titles"
              : locale === "ru"
                ? "Вызвать следующую пару →"
                : "Call the next pair →"}
          </button>
        </div>
      )}

      {run.status === "results" && (
        <div className="agh-cross-section agh-cross-results">
          <p className="agh-cross-note">
            {locale === "ru"
              ? "Все публичные выводы зафиксированы; полные аудио и транскрипты остались закрыты. Финальный пьедестал доступен даже если допрос был пропущен."
              : "All public findings are locked; full audio and transcripts remain private. The final podium is available even if the investigation was skipped."}
          </p>
          <div className="agh-cross-results-list">
            {run.pairResults.map((result) => (
              <div key={result.pairId} className="agh-cross-result-row">
                <div className="font-semibold">
                  {result.playerAName} × {result.playerBName}
                </div>
                <div className="mt-1 text-sm text-fuchsia-100">
                  {result.pairPoints} pts · {result.alibiStrength}/10
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {["briefing", "capturing", "comparing", "review"].includes(run.status) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void skip()}
          className="agh-cross-dismiss"
        >
          {locale === "ru" ? "Закрыть эту пару без очков" : "Dismiss this pair with no points"}
        </button>
      )}
    </section>
  );
}
