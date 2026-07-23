import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildEmptyFieldReportPhysicalReliability,
  buildFieldReport,
  formatFieldReportMarkdown,
  mergeFieldReportLaunchSignals,
  type FieldReportObservations,
  type FieldReportPhysicalReliability,
  type FieldReportReleaseHealth,
} from "@/lib/field-report";
import type { QuickStartLaunchSignal } from "@/lib/quick-start-launch-coach";
import {
  loadFieldReportDraftClient,
  saveFieldReportDraftClient,
} from "@/lib/field-report-draft-client";
import {
  buildFieldReportPassReadiness,
  mergeFieldReportDraftObservations,
} from "@/lib/field-report-draft";
import {
  getHostScoreLedgerSummaryClient,
  listHostScoreEventsClient,
} from "@/lib/score-events-client";
import type { ScoreEventView, ScoreLedgerSummary } from "@/lib/score-events";
import type { RoomState } from "@/lib/types";

const EMPTY_OBSERVATIONS: FieldReportObservations = {
  eventDate: "",
  eventLabel: "",
  hostDevice: "",
  networkNotes: "",
  estimatedProviderCost: "",
  preparedLaunchNotes: "",
  failureNotes: "",
  outcome: "pending",
  runKind: "unclassified",
  sqlStateEdits: "unknown",
  secretIncident: "unknown",
  hostHandoff: "unknown",
  hostExperience: "unknown",
  hostAutonomy: "unknown",
  launchSignalResult: "unknown",
  launchSignalsObserved: [],
  storyCallbackInGame: "unknown",
  storyCallbackInFinale: "unknown",
  storySafety: "unknown",
  physicalReliability: buildEmptyFieldReportPhysicalReliability(),
  pacingReviewed: false,
};

const PHYSICAL_RELIABILITY_DRILLS = [
  {
    key: "hostNetworkSwitch",
    title: "Host network switch",
    detail: "Wi-Fi off, mobile data on, Resync; same players, scores and secrets.",
  },
  {
    key: "backupTakeover",
    title: "Backup takeover",
    detail: "Primary host powered off; trusted backup kept live control and state.",
  },
  {
    key: "playerBackgroundResume",
    title: "Player background and resume",
    detail: "After 2+ minutes away, the same identity, team and phase returned.",
  },
  {
    key: "hostRefreshRecovery",
    title: "Host refresh recovery",
    detail: "Authorization and state returned after refresh in lobby and live play.",
  },
  {
    key: "lateJoinAcrossActs",
    title: "Late join across acts",
    detail: "A late phone joined every act without changing existing secrets.",
  },
  {
    key: "teamSwitchIntegrity",
    title: "Team-switch integrity",
    detail: "Lobby team switch kept player identity and the score ledger intact.",
  },
  {
    key: "mediaPermissionRecovery",
    title: "Camera and microphone recovery",
    detail: "Deny, then allow: retry or safe phase skip worked without a new player.",
  },
] as const satisfies ReadonlyArray<{
  key: keyof FieldReportPhysicalReliability;
  title: string;
  detail: string;
}>;

type DraftStatus = "local" | "loading" | "recovered" | "saving" | "saved" | "error";

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
    );
  }
  return value;
}

function serializeObservations(observations: FieldReportObservations) {
  return JSON.stringify(canonicalJsonValue(observations));
}

const DRAFT_STATUS_COPY: Record<DraftStatus, string> = {
  local: "Classic room: this draft stays on this device.",
  loading: "Loading the private draft…",
  recovered: "Private draft recovered on this host device.",
  saving: "Saving the private draft…",
  saved: "Private draft saved.",
  error: "Draft sync failed. The form still works here; the next edit will retry.",
};

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function FieldReportLaunchSignalSequence({
  signals,
}: {
  signals: readonly QuickStartLaunchSignal[];
}) {
  return (
    <p
      data-testid="field-report-launch-signal-sequence"
      data-signals={signals.join("|")}
      className="px-1 text-xs leading-relaxed text-white/75"
    >
      {signals.length > 0
        ? `Observed automatically: ${signals.join(" then ")}`
        : "No launch signal captured on this host yet."}
    </p>
  );
}

export function FieldReportPanel({
  roomId,
  roomCode,
  state,
  releaseHealth,
  launchSignal,
}: {
  roomId: string;
  roomCode: string;
  state: RoomState;
  releaseHealth: FieldReportReleaseHealth;
  launchSignal?: QuickStartLaunchSignal;
}) {
  const [observations, setObservations] = useState(EMPTY_OBSERVATIONS);
  const [exporting, setExporting] = useState<"json" | "markdown" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const configuredAt = state.quickStart?.configuredAt;
  const [draftReady, setDraftReady] = useState(configuredAt === undefined);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(
    configuredAt === undefined ? "local" : "loading",
  );
  const observationsRef = useRef(observations);
  const lastSavedObservationsRef = useRef(observations);
  const lastSavedSnapshotRef = useRef(serializeObservations(observations));
  const queuedSnapshotsRef = useRef(new Set<string>());
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const loadSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const launchSignalBufferRef = useRef<QuickStartLaunchSignal[]>([]);
  const passReadiness = buildFieldReportPassReadiness({
    observations,
    storySeedConfigured: Boolean(state.quickStart?.storySeed),
  });

  useEffect(() => {
    observationsRef.current = observations;
  }, [observations]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const queueDraftSave = useCallback(
    (nextObservations: FieldReportObservations) => {
      if (configuredAt === undefined) return;
      const snapshot = serializeObservations(nextObservations);
      if (snapshot === lastSavedSnapshotRef.current || queuedSnapshotsRef.current.has(snapshot)) {
        return;
      }
      const baseObservations = lastSavedObservationsRef.current;
      queuedSnapshotsRef.current.add(snapshot);
      if (mountedRef.current) setDraftStatus("saving");
      saveChainRef.current = saveChainRef.current.then(async () => {
        try {
          const result = await saveFieldReportDraftClient(
            roomId,
            configuredAt,
            nextObservations,
            baseObservations,
          );
          const savedSnapshot = serializeObservations(result.draft.observations);
          lastSavedObservationsRef.current = result.draft.observations;
          lastSavedSnapshotRef.current = savedSnapshot;
          if (mountedRef.current) {
            const current = observationsRef.current;
            const merged = mergeFieldReportDraftObservations(
              result.draft.observations,
              current,
              nextObservations,
            );
            if (serializeObservations(merged) !== serializeObservations(current)) {
              observationsRef.current = merged;
              setObservations(merged);
            }
            if (serializeObservations(merged) === savedSnapshot) setDraftStatus("saved");
          }
        } catch {
          if (mountedRef.current && serializeObservations(observationsRef.current) === snapshot) {
            setDraftStatus("error");
          }
        } finally {
          queuedSnapshotsRef.current.delete(snapshot);
        }
      });
    },
    [configuredAt, roomId],
  );

  const loadLatestDraft = useCallback(
    async (announceLoading: boolean) => {
      if (configuredAt === undefined) return;
      const before = serializeObservations(observationsRef.current);
      if (!announceLoading && before !== lastSavedSnapshotRef.current) {
        queueDraftSave(observationsRef.current);
        return;
      }
      const sequence = ++loadSequenceRef.current;
      if (announceLoading) setDraftStatus("loading");
      try {
        const result = await loadFieldReportDraftClient(roomId, configuredAt);
        if (!mountedRef.current || sequence !== loadSequenceRef.current) return;
        if (serializeObservations(observationsRef.current) !== before) return;

        if (result.draft) {
          const recovered = result.draft.observations;
          const recoveredSnapshot = serializeObservations(recovered);
          lastSavedObservationsRef.current = recovered;
          lastSavedSnapshotRef.current = recoveredSnapshot;
          if (recoveredSnapshot !== before) setObservations(recovered);
          setDraftStatus(recoveredSnapshot === before ? "saved" : "recovered");
        } else {
          lastSavedObservationsRef.current = observationsRef.current;
          lastSavedSnapshotRef.current = before;
          setDraftStatus("saved");
        }
        setDraftReady(true);
      } catch {
        if (!mountedRef.current || sequence !== loadSequenceRef.current) return;
        setDraftReady(true);
        setDraftStatus("error");
      }
    },
    [configuredAt, queueDraftSave, roomId],
  );

  useEffect(() => {
    if (configuredAt === undefined) {
      setDraftReady(true);
      setDraftStatus("local");
      return;
    }
    setDraftReady(false);
    void loadLatestDraft(true);
  }, [configuredAt, loadLatestDraft]);

  useEffect(() => {
    if (launchSignal) {
      launchSignalBufferRef.current = mergeFieldReportLaunchSignals(launchSignalBufferRef.current, [
        launchSignal,
      ]);
    }
    if (!draftReady || launchSignalBufferRef.current.length === 0) return;
    setObservations((current) => {
      const launchSignalsObserved = mergeFieldReportLaunchSignals(
        current.launchSignalsObserved,
        launchSignalBufferRef.current,
      );
      return launchSignalsObserved.length === current.launchSignalsObserved.length
        ? current
        : { ...current, launchSignalsObserved };
    });
  }, [draftReady, launchSignal]);

  useEffect(() => {
    if (!draftReady || configuredAt === undefined) return;
    const snapshot = serializeObservations(observations);
    if (snapshot === lastSavedSnapshotRef.current) return;
    const timer = window.setTimeout(() => queueDraftSave(observations), 750);
    return () => window.clearTimeout(timer);
  }, [configuredAt, draftReady, observations, queueDraftSave]);

  useEffect(() => {
    if (configuredAt === undefined) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadLatestDraft(false);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [configuredAt, loadLatestDraft]);

  const update = <K extends keyof FieldReportObservations>(
    key: K,
    value: FieldReportObservations[K],
  ) => setObservations((current) => ({ ...current, [key]: value }));

  const updateReliability = <K extends keyof FieldReportPhysicalReliability>(
    key: K,
    value: FieldReportPhysicalReliability[K],
  ) =>
    setObservations((current) => ({
      ...current,
      physicalReliability: { ...current.physicalReliability, [key]: value },
    }));

  const exportReport = async (format: "json" | "markdown") => {
    setMessage(null);
    if (observations.outcome === "pass" && !passReadiness.complete) {
      setMessage(`PASS report incomplete. Next: ${passReadiness.nextAction}`);
      return;
    }
    setExporting(format);
    const [summaryResult, eventsResult] = await Promise.allSettled([
      getHostScoreLedgerSummaryClient(roomId),
      listHostScoreEventsClient(roomId, 250),
    ]);
    const summary: ScoreLedgerSummary | undefined =
      summaryResult.status === "fulfilled" ? summaryResult.value.summary : undefined;
    const events: ScoreEventView[] =
      eventsResult.status === "fulfilled" ? eventsResult.value.events : [];
    const report = buildFieldReport({
      roomCode,
      state,
      releaseHealth,
      scoreSummary: summary,
      scoreEvents: events,
      observations,
    });
    const suffix = `${roomCode.toLowerCase()}-${report.generatedAt.slice(0, 10)}`;
    if (format === "json") {
      downloadText(
        `ai-game-hub-field-${suffix}.json`,
        `${JSON.stringify(report, null, 2)}\n`,
        "application/json;charset=utf-8",
      );
    } else {
      downloadText(
        `ai-game-hub-field-${suffix}.md`,
        formatFieldReportMarkdown(report),
        "text/markdown;charset=utf-8",
      );
    }
    setMessage(
      summary && eventsResult.status === "fulfilled"
        ? "Report exported with ledger evidence."
        : "Report exported, but ledger detail was unavailable. Keep it marked as incomplete.",
    );
    setExporting(null);
  };

  return (
    <details
      data-testid="field-report-panel"
      className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs"
    >
      <summary className="cursor-pointer font-medium text-white/80">Field-test report</summary>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Export server timestamps, device counts, AI usage and score integrity. Automatic fields omit
        names, private assignments, transcripts, media and score reasons.
      </p>

      <p
        data-testid="field-report-draft-status"
        data-state={draftStatus}
        className={`mt-2 text-[11px] leading-relaxed ${
          draftStatus === "error" ? "text-amber-100/80" : "text-white/60"
        }`}
        aria-live="polite"
      >
        {DRAFT_STATUS_COPY[draftStatus]}
      </p>

      <fieldset disabled={!draftReady} className="contents">
        <div
          data-testid="field-report-pass-readiness"
          data-complete={passReadiness.complete ? "true" : "false"}
          data-passed-count={passReadiness.passedCount}
          data-total-count={passReadiness.totalCount}
          className={`mt-3 rounded-xl border p-3 ${
            passReadiness.complete
              ? "border-emerald-200/25 bg-emerald-300/8"
              : "border-amber-200/20 bg-amber-300/8"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
            Physical PASS evidence
          </div>
          <div className="mt-1 font-medium">
            {passReadiness.passedCount}/{passReadiness.totalCount} declarations ready
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground" aria-live="polite">
            {passReadiness.complete
              ? "Human evidence is complete. Automatic timing, backend and ledger checks still run in the verifier."
              : `Next: ${passReadiness.nextAction} FAIL or pending reports can still be downloaded.`}
          </p>
        </div>

        <div className="mt-3 space-y-2">
          <label className="block text-[11px] text-white/55">
            Event date
            <input
              type="date"
              aria-label="Event date"
              value={observations.eventDate}
              onChange={(event) => update("eventDate", event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white"
            />
          </label>
          <input
            value={observations.eventLabel}
            onChange={(event) => update("eventLabel", event.target.value)}
            placeholder="Venue / location"
            maxLength={500}
            className="w-full rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white placeholder:text-white/30"
          />
          <input
            value={observations.hostDevice}
            onChange={(event) => update("hostDevice", event.target.value)}
            placeholder="Host device · OS · browser"
            maxLength={500}
            className="w-full rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white placeholder:text-white/30"
          />
          <input
            value={observations.networkNotes}
            onChange={(event) => update("networkNotes", event.target.value)}
            placeholder="Wi-Fi / mobile / speaker notes"
            maxLength={500}
            className="w-full rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white placeholder:text-white/30"
          />
          <input
            value={observations.estimatedProviderCost}
            onChange={(event) => update("estimatedProviderCost", event.target.value)}
            placeholder="Observed provider cost, e.g. 2.40 DKK"
            maxLength={120}
            className="w-full rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white placeholder:text-white/30"
          />
          <input
            value={observations.preparedLaunchNotes}
            onChange={(event) => update("preparedLaunchNotes", event.target.value)}
            placeholder="Prepared launch wait before / after"
            maxLength={500}
            className="w-full rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white placeholder:text-white/30"
          />
          <textarea
            value={observations.failureNotes}
            onChange={(event) => update("failureNotes", event.target.value)}
            placeholder="Failures, timestamps and recovery; never paste secrets"
            maxLength={1_000}
            rows={3}
            className="w-full resize-y rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white placeholder:text-white/30"
          />
          <select
            aria-label="Report outcome"
            value={observations.outcome}
            onChange={(event) =>
              update("outcome", event.target.value as FieldReportObservations["outcome"])
            }
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
          >
            <option value="pending">Outcome: pending</option>
            <option value="pass">Outcome: pass</option>
            <option value="fail">Outcome: fail</option>
          </select>
          <select
            aria-label="Run evidence"
            value={observations.runKind}
            onChange={(event) =>
              update("runKind", event.target.value as FieldReportObservations["runKind"])
            }
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
          >
            <option value="unclassified">Evidence: choose physical or automated</option>
            <option value="physical">Evidence: physical phones</option>
            <option value="automated">Evidence: automated browser run</option>
          </select>
          <select
            aria-label="SQL or state edits"
            value={observations.sqlStateEdits}
            onChange={(event) =>
              update(
                "sqlStateEdits",
                event.target.value as FieldReportObservations["sqlStateEdits"],
              )
            }
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
          >
            <option value="unknown">SQL/state edits: choose</option>
            <option value="none">SQL/state edits: none</option>
            <option value="performed">SQL/state edits: performed</option>
          </select>
          <select
            aria-label="Secret exposure"
            value={observations.secretIncident}
            onChange={(event) =>
              update(
                "secretIncident",
                event.target.value as FieldReportObservations["secretIncident"],
              )
            }
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
          >
            <option value="unknown">Secret exposure: choose</option>
            <option value="none">Secret exposure: none observed</option>
            <option value="suspected">Secret exposure: suspected / confirmed</option>
          </select>
          <select
            aria-label="Backup host handoff"
            value={observations.hostHandoff}
            onChange={(event) =>
              update("hostHandoff", event.target.value as FieldReportObservations["hostHandoff"])
            }
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
          >
            <option value="unknown">Backup host handoff: choose</option>
            <option value="verified">Backup host handoff: verified</option>
            <option value="failed">Backup host handoff: failed / unavailable</option>
          </select>
          <fieldset className="rounded-xl bg-black/10 p-3">
            <legend className="px-1 text-[12px] font-medium text-white/80">
              Real-device recovery drills
            </legend>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Mark passed only after the exact fault was triggered on physical devices. These
              statuses contain no participant data.
            </p>
            <div className="space-y-2">
              {PHYSICAL_RELIABILITY_DRILLS.map((drill) => (
                <label
                  key={drill.key}
                  className="grid gap-2 rounded-lg bg-black/15 p-2.5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-white/75">{drill.title}</span>
                    <span className="mt-0.5 block leading-relaxed text-white/45">
                      {drill.detail}
                    </span>
                  </span>
                  <select
                    aria-label={drill.title}
                    data-testid={`field-report-reliability-${drill.key}`}
                    value={observations.physicalReliability[drill.key]}
                    onChange={(event) =>
                      updateReliability(
                        drill.key,
                        event.target.value as FieldReportPhysicalReliability[typeof drill.key],
                      )
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white"
                  >
                    <option value="not-tested">Not tested</option>
                    <option value="passed">Passed on devices</option>
                    <option value="failed">Failed / incomplete</option>
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
              Host autonomy
            </div>
            <div className="space-y-2">
              <FieldReportLaunchSignalSequence signals={observations.launchSignalsObserved} />
              <select
                aria-label="Host experience"
                value={observations.hostExperience}
                onChange={(event) =>
                  update(
                    "hostExperience",
                    event.target.value as FieldReportObservations["hostExperience"],
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                <option value="unknown">Host experience: choose</option>
                <option value="first-time">Host experience: first time using AI Game Hub</option>
                <option value="returning">Host experience: returning</option>
              </select>
              <select
                aria-label="Host autonomy"
                value={observations.hostAutonomy}
                onChange={(event) =>
                  update(
                    "hostAutonomy",
                    event.target.value as FieldReportObservations["hostAutonomy"],
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                <option value="unknown">Host autonomy: choose</option>
                <option value="independent">Host autonomy: no runbook or human prompting</option>
                <option value="prompted">Host autonomy: needed human prompting</option>
              </select>
              <select
                aria-label="Launch signal result"
                value={observations.launchSignalResult}
                onChange={(event) =>
                  update(
                    "launchSignalResult",
                    event.target.value as FieldReportObservations["launchSignalResult"],
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                <option value="unknown">Launch signal: choose</option>
                <option value="followed">Launch signal: followed without prompting</option>
                <option value="misunderstood">Launch signal: misunderstood or ignored</option>
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
              Connected story
            </div>
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              Record only whether the public Tonight&apos;s thread returned. The report never
              exports its text.
            </p>
            <div className="space-y-2">
              <select
                aria-label="Story callback in game"
                value={observations.storyCallbackInGame}
                onChange={(event) =>
                  update(
                    "storyCallbackInGame",
                    event.target.value as FieldReportObservations["storyCallbackInGame"],
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                <option value="unknown">Game callback: choose</option>
                <option value="observed">Game callback: naturally observed</option>
                <option value="not-observed">Game callback: not observed</option>
                <option value="not-tested">Game callback: not tested</option>
              </select>
              <select
                aria-label="Story callback in finale"
                value={observations.storyCallbackInFinale}
                onChange={(event) =>
                  update(
                    "storyCallbackInFinale",
                    event.target.value as FieldReportObservations["storyCallbackInFinale"],
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                <option value="unknown">Finale callback: choose</option>
                <option value="observed">Finale callback: naturally observed</option>
                <option value="not-observed">Finale callback: not observed</option>
                <option value="not-tested">Finale callback: not tested</option>
              </select>
              <select
                aria-label="Story seed safety"
                value={observations.storySafety}
                onChange={(event) =>
                  update(
                    "storySafety",
                    event.target.value as FieldReportObservations["storySafety"],
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                <option value="unknown">Story safety: choose</option>
                <option value="safe">Story safety: no instruction following or weakening</option>
                <option value="concern">Story safety: concern observed</option>
                <option value="not-tested">Story safety: not tested</option>
              </select>
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-white/75">
            <input
              type="checkbox"
              checked={observations.pacingReviewed}
              onChange={(event) => update("pacingReviewed", event.target.checked)}
              className="mt-0.5"
            />
            <span>2/3/4-hour pacing reviewed for this run</span>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void exportReport("markdown")}
            disabled={exporting !== null || !draftReady}
            className="rounded-xl bg-white/10 px-3 py-2 text-white disabled:opacity-35"
          >
            {exporting === "markdown" ? "Exporting…" : "Download .md"}
          </button>
          <button
            type="button"
            onClick={() => void exportReport("json")}
            disabled={exporting !== null || !draftReady}
            className="rounded-xl bg-white/10 px-3 py-2 text-white disabled:opacity-35"
          >
            {exporting === "json" ? "Exporting…" : "Download .json"}
          </button>
        </div>
      </fieldset>
      {message && <p className="mt-2 text-[11px] leading-relaxed text-white/55">{message}</p>}
    </details>
  );
}
