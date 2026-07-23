import { getExperienceRoute } from "@/experiences/catalog";
import { normalizeAiRuntimeState, type AiUsageKind, type AiUsageStatus } from "./ai-budget";
import { summarizePlayerDeviceChecks } from "./device-readiness";
import {
  QUICK_START_LAUNCH_SIGNALS,
  type QuickStartLaunchSignal,
} from "./quick-start-launch-coach";
import type { ScoreEventView, ScoreLedgerSummary } from "./score-events";
import type { RoomState } from "./types";

export const FIELD_REPORT_SCHEMA_VERSION = 5 as const;

export type FieldReportOutcome = "pending" | "pass" | "fail";
export type FieldReportRunKind = "unclassified" | "physical" | "automated";
export type FieldReportSqlStateEdits = "unknown" | "none" | "performed";
export type FieldReportSecretIncident = "unknown" | "none" | "suspected";
export type FieldReportHostHandoff = "unknown" | "verified" | "failed";
export type FieldReportHostExperience = "unknown" | "first-time" | "returning";
export type FieldReportHostAutonomy = "unknown" | "independent" | "prompted";
export type FieldReportLaunchSignalResult = "unknown" | "followed" | "misunderstood";
export type FieldReportStoryCallback = "unknown" | "observed" | "not-observed" | "not-tested";
export type FieldReportStorySafety = "unknown" | "safe" | "concern" | "not-tested";
export type FieldReportReliabilityResult = "not-tested" | "passed" | "failed";

export const FIELD_REPORT_PHYSICAL_RELIABILITY_KEYS = [
  "hostNetworkSwitch",
  "backupTakeover",
  "playerBackgroundResume",
  "hostRefreshRecovery",
  "lateJoinAcrossActs",
  "teamSwitchIntegrity",
  "mediaPermissionRecovery",
] as const;

export type FieldReportPhysicalReliability = Record<
  (typeof FIELD_REPORT_PHYSICAL_RELIABILITY_KEYS)[number],
  FieldReportReliabilityResult
>;

export function buildEmptyFieldReportPhysicalReliability(): FieldReportPhysicalReliability {
  return Object.fromEntries(
    FIELD_REPORT_PHYSICAL_RELIABILITY_KEYS.map((key) => [key, "not-tested"]),
  ) as FieldReportPhysicalReliability;
}

export function normalizeFieldReportPhysicalReliability(
  value: Partial<FieldReportPhysicalReliability> | null | undefined,
): FieldReportPhysicalReliability {
  return Object.fromEntries(
    FIELD_REPORT_PHYSICAL_RELIABILITY_KEYS.map((key) => {
      const result = value?.[key];
      return [key, result === "passed" || result === "failed" ? result : "not-tested"];
    }),
  ) as FieldReportPhysicalReliability;
}

export function fieldReportPhysicalReliabilityPassed(value: FieldReportPhysicalReliability) {
  return FIELD_REPORT_PHYSICAL_RELIABILITY_KEYS.every((key) => value[key] === "passed");
}

export function normalizeFieldReportLaunchSignals(value: unknown): QuickStartLaunchSignal[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(QUICK_START_LAUNCH_SIGNALS);
  return [
    ...new Set(value.filter((signal): signal is QuickStartLaunchSignal => allowed.has(signal))),
  ];
}

export function mergeFieldReportLaunchSignals(
  current: readonly QuickStartLaunchSignal[],
  incoming: readonly QuickStartLaunchSignal[],
): QuickStartLaunchSignal[] {
  return normalizeFieldReportLaunchSignals([...current, ...incoming]);
}

export type FieldReportObservations = {
  eventDate: string;
  eventLabel: string;
  hostDevice: string;
  networkNotes: string;
  estimatedProviderCost: string;
  preparedLaunchNotes: string;
  failureNotes: string;
  outcome: FieldReportOutcome;
  runKind: FieldReportRunKind;
  sqlStateEdits: FieldReportSqlStateEdits;
  secretIncident: FieldReportSecretIncident;
  hostHandoff: FieldReportHostHandoff;
  hostExperience: FieldReportHostExperience;
  hostAutonomy: FieldReportHostAutonomy;
  launchSignalResult: FieldReportLaunchSignalResult;
  launchSignalsObserved: QuickStartLaunchSignal[];
  storyCallbackInGame: FieldReportStoryCallback;
  storyCallbackInFinale: FieldReportStoryCallback;
  storySafety: FieldReportStorySafety;
  physicalReliability: FieldReportPhysicalReliability;
  pacingReviewed: boolean;
};

export type FieldReportReleaseHealth = {
  status: "checking" | "ready" | "degraded" | "error" | "unknown";
  checks?: Record<string, boolean>;
};

export type FieldReport = ReturnType<typeof buildFieldReport>;

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

function boundedObservation(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function normalizedEventDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

function isoTimestamp(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? new Date(value).toISOString()
    : null;
}

function rounded(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function increment(target: Record<string, number>, key: string, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function sortedRecord(value: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function routeMetrics(state: RoomState) {
  const party = state.party;
  if (!party) return { plannedStepCount: 0, routeDurationMinutes: null as number | null };
  const steps = getExperienceRoute(party.experienceId, party.contingency).steps;
  return {
    plannedStepCount: steps.length,
    routeDurationMinutes: steps.reduce((total, step) => total + step.durationMinutes, 0),
  };
}

export function buildFieldReport({
  roomCode,
  state,
  generatedAt = Date.now(),
  releaseHealth = { status: "unknown" },
  scoreSummary,
  scoreEvents = [],
  observations = {},
}: {
  roomCode: string;
  state: RoomState;
  generatedAt?: number;
  releaseHealth?: FieldReportReleaseHealth;
  scoreSummary?: ScoreLedgerSummary;
  scoreEvents?: ScoreEventView[];
  observations?: Partial<FieldReportObservations>;
}) {
  const notes: FieldReportObservations = {
    eventDate: normalizedEventDate(observations.eventDate),
    eventLabel: boundedObservation(observations.eventLabel),
    hostDevice: boundedObservation(observations.hostDevice),
    networkNotes: boundedObservation(observations.networkNotes),
    estimatedProviderCost: boundedObservation(observations.estimatedProviderCost, 120),
    preparedLaunchNotes: boundedObservation(observations.preparedLaunchNotes),
    failureNotes: boundedObservation(observations.failureNotes, 1_000),
    outcome:
      observations.outcome === "pass" || observations.outcome === "fail"
        ? observations.outcome
        : EMPTY_OBSERVATIONS.outcome,
    runKind:
      observations.runKind === "physical" || observations.runKind === "automated"
        ? observations.runKind
        : EMPTY_OBSERVATIONS.runKind,
    sqlStateEdits:
      observations.sqlStateEdits === "none" || observations.sqlStateEdits === "performed"
        ? observations.sqlStateEdits
        : EMPTY_OBSERVATIONS.sqlStateEdits,
    secretIncident:
      observations.secretIncident === "none" || observations.secretIncident === "suspected"
        ? observations.secretIncident
        : EMPTY_OBSERVATIONS.secretIncident,
    hostHandoff:
      observations.hostHandoff === "verified" || observations.hostHandoff === "failed"
        ? observations.hostHandoff
        : EMPTY_OBSERVATIONS.hostHandoff,
    hostExperience:
      observations.hostExperience === "first-time" || observations.hostExperience === "returning"
        ? observations.hostExperience
        : EMPTY_OBSERVATIONS.hostExperience,
    hostAutonomy:
      observations.hostAutonomy === "independent" || observations.hostAutonomy === "prompted"
        ? observations.hostAutonomy
        : EMPTY_OBSERVATIONS.hostAutonomy,
    launchSignalResult:
      observations.launchSignalResult === "followed" ||
      observations.launchSignalResult === "misunderstood"
        ? observations.launchSignalResult
        : EMPTY_OBSERVATIONS.launchSignalResult,
    launchSignalsObserved: normalizeFieldReportLaunchSignals(observations.launchSignalsObserved),
    storyCallbackInGame:
      observations.storyCallbackInGame === "observed" ||
      observations.storyCallbackInGame === "not-observed" ||
      observations.storyCallbackInGame === "not-tested"
        ? observations.storyCallbackInGame
        : EMPTY_OBSERVATIONS.storyCallbackInGame,
    storyCallbackInFinale:
      observations.storyCallbackInFinale === "observed" ||
      observations.storyCallbackInFinale === "not-observed" ||
      observations.storyCallbackInFinale === "not-tested"
        ? observations.storyCallbackInFinale
        : EMPTY_OBSERVATIONS.storyCallbackInFinale,
    storySafety:
      observations.storySafety === "safe" ||
      observations.storySafety === "concern" ||
      observations.storySafety === "not-tested"
        ? observations.storySafety
        : EMPTY_OBSERVATIONS.storySafety,
    physicalReliability: normalizeFieldReportPhysicalReliability(observations.physicalReliability),
    pacingReviewed: observations.pacingReviewed === true,
  };
  const setup = state.quickStart;
  const progress = state.runOfShow;
  const route = routeMetrics(state);
  const devices = summarizePlayerDeviceChecks(state.players);
  const ai = normalizeAiRuntimeState(state.aiRuntime);
  const startedAt = setup?.startedAt;
  const finishedAt = setup?.finishedAt;
  const eighthJoinAt = [...state.players]
    .map((player) => player.joinedAt)
    .filter((joinedAt) => Number.isFinite(joinedAt))
    .sort((a, b) => a - b)[7];
  const rosterReadyMs =
    setup && eighthJoinAt !== undefined ? Math.max(0, eighthJoinAt - setup.configuredAt) : null;
  const quickStartMs =
    setup && startedAt !== undefined ? Math.max(0, startedAt - setup.configuredAt) : null;
  const actualDurationMs =
    startedAt !== undefined && finishedAt !== undefined
      ? Math.max(0, finishedAt - startedAt)
      : null;
  const manualFallbackMs =
    ai.manualFallbackTotalMs +
    (ai.manualFallbackStartedAt !== undefined
      ? Math.max(0, generatedAt - ai.manualFallbackStartedAt)
      : 0);
  const aiCountByKind: Record<AiUsageKind, number> = { text: 0, vision: 0, stt: 0, tts: 0 };
  const aiCreditsByKind: Record<AiUsageKind, number> = { text: 0, vision: 0, stt: 0, tts: 0 };
  const aiCountByStatus: Record<AiUsageStatus, number> = {
    reserved: 0,
    succeeded: 0,
    failed: 0,
    blocked: 0,
  };
  for (const receipt of ai.recentUsage) {
    aiCountByKind[receipt.kind] += 1;
    aiCreditsByKind[receipt.kind] += receipt.credits;
    aiCountByStatus[receipt.status] += 1;
  }

  const eventCountByGame: Record<string, number> = {};
  const eventCountBySource: Record<string, number> = {};
  for (const event of scoreEvents) {
    increment(eventCountByGame, event.gameId);
    increment(eventCountBySource, event.source);
  }
  const uniqueListedEventCount = new Set(scoreEvents.map((event) => event.id)).size;
  const publicScoreTotal = state.teams.reduce((total, team) => total + team.score, 0);
  const completedStepIds = [...(progress?.completedStepIds ?? [])];

  return {
    schemaVersion: FIELD_REPORT_SCHEMA_VERSION,
    generatedAt: isoTimestamp(generatedAt)!,
    event: {
      roomCode: roomCode
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8),
      date: notes.eventDate,
      label: notes.eventLabel,
      status: state.status,
      outcome: notes.outcome,
      runKind: notes.runKind,
      hostDevice: notes.hostDevice,
      networkNotes: notes.networkNotes,
    },
    program: {
      setting: setup?.venue ?? state.party?.venue ?? state.venue ?? null,
      experienceId: state.party?.experienceId ?? null,
      contingency: state.party?.contingency ?? null,
      expectedPlayers: setup?.expectedPlayers ?? null,
      joinedPlayers: state.players.length,
      promisedDurationMinutes: setup?.targetDurationMinutes ?? null,
      storySeedConfigured: Boolean(setup?.storySeed),
      routeDurationMinutes: route.routeDurationMinutes,
      configuredAt: isoTimestamp(setup?.configuredAt),
      rosterReadyAt: isoTimestamp(setup ? eighthJoinAt : undefined),
      startedAt: isoTimestamp(startedAt),
      finishedAt: isoTimestamp(finishedAt),
      rosterReadySeconds: rosterReadyMs === null ? null : rounded(rosterReadyMs / 1_000),
      launchSeconds: quickStartMs === null ? null : rounded(quickStartMs / 1_000),
      launchedWithinTwoMinutes: quickStartMs === null ? null : quickStartMs <= 120_000,
      actualDurationMinutes:
        actualDurationMs === null ? null : rounded(actualDurationMs / 60_000, 2),
      plannedStepCount: route.plannedStepCount,
      completedStepCount: completedStepIds.length,
      completedStepIds,
      activeStepId: progress?.activeStepId ?? null,
      finaleGenerated: Boolean(state.finale?.narrative),
      finaleEvidenceCount: state.finale?.evidence.length ?? 0,
    },
    devices,
    backend: {
      status: releaseHealth.status,
      checks: Object.fromEntries(
        Object.entries(releaseHealth.checks ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    ai: {
      modeAtExport: state.party?.aiMode ?? "auto",
      limitCredits: ai.limitCredits,
      usedCredits: ai.usedCredits,
      remainingCredits: Math.max(0, ai.limitCredits - ai.usedCredits),
      providerRequests: ai.providerRequests,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
      failedOperations: ai.failedOperations,
      blockedOperations: ai.blockedOperations,
      manualFallbackActivations: ai.manualFallbackActivations,
      manualFallbackMinutes: rounded(manualFallbackMs / 60_000, 2),
      recentReceiptCount: ai.recentUsage.length,
      recentCountByKind: aiCountByKind,
      recentCreditsByKind: aiCreditsByKind,
      recentCountByStatus: aiCountByStatus,
      preparedDecksReadyAtExport: Object.keys(ai.prepared ?? {}).length,
      estimatedProviderCost: notes.estimatedProviderCost,
      preparedLaunchNotes: notes.preparedLaunchNotes,
    },
    scoring: {
      ledgerAvailable: Boolean(scoreSummary),
      ledgerEventCount: scoreSummary?.eventCount ?? null,
      listedEventCount: scoreEvents.length,
      uniqueListedEventCount,
      duplicateListedEventIds: uniqueListedEventCount !== scoreEvents.length,
      eventListTruncated: Boolean(scoreSummary && scoreSummary.eventCount > scoreEvents.length),
      ledgerTotalPoints: scoreSummary?.totalPoints ?? null,
      publicTeamScoreTotal: publicScoreTotal,
      ledgerToPublicDifference:
        scoreSummary === undefined ? null : publicScoreTotal - scoreSummary.totalPoints,
      teamSubjects: scoreSummary?.teamTotals.length ?? null,
      playerSubjects: scoreSummary?.playerTotals.length ?? null,
      pointsByAct: scoreSummary ? sortedRecord(scoreSummary.byAct) : {},
      pointsBySource: scoreSummary ? sortedRecord(scoreSummary.bySource) : {},
      listedEventCountByGame: sortedRecord(eventCountByGame),
      listedEventCountBySource: sortedRecord(eventCountBySource),
    },
    observations: {
      failureNotes: notes.failureNotes,
      sqlStateEdits: notes.sqlStateEdits,
      secretIncident: notes.secretIncident,
      hostHandoff: notes.hostHandoff,
      hostExperience: notes.hostExperience,
      hostAutonomy: notes.hostAutonomy,
      launchSignalResult: notes.launchSignalResult,
      launchSignalsObserved: notes.launchSignalsObserved,
      storyCallbackInGame: notes.storyCallbackInGame,
      storyCallbackInFinale: notes.storyCallbackInFinale,
      storySafety: notes.storySafety,
      physicalReliability: notes.physicalReliability,
      pacingReviewed: notes.pacingReviewed,
    },
    privacy: {
      containsPlayerNames: false,
      containsPrivateAssignments: false,
      containsTranscriptsOrMedia: false,
      containsScoreReasonsOrRubrics: false,
      reviewUserEnteredNotesBeforeSharing: true,
    },
  };
}

function display(value: string | number | boolean | null) {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function recordLine(value: Record<string, number>) {
  const entries = Object.entries(value);
  return entries.length ? entries.map(([key, amount]) => `${key}: ${amount}`).join(", ") : "—";
}

export function formatFieldReportMarkdown(report: FieldReport) {
  return `# AI Game Hub field report

- Generated: ${report.generatedAt}
- Room code: ${display(report.event.roomCode)}
- Event date: ${display(report.event.date)}
- Event / location: ${display(report.event.label)}
- Outcome: ${report.event.outcome.toUpperCase()}
- Evidence kind: ${report.event.runKind}
- Host device: ${display(report.event.hostDevice)}
- Network: ${display(report.event.networkNotes)}

## Launch and program

- Setting: ${display(report.program.setting)}
- Experience / route: ${display(report.program.experienceId)} / ${display(report.program.contingency)}
- Players joined / expected: ${report.program.joinedPlayers} / ${display(report.program.expectedPlayers)}
- Configured / 8-player roster / started / finished: ${display(report.program.configuredAt)} / ${display(report.program.rosterReadyAt)} / ${display(report.program.startedAt)} / ${display(report.program.finishedAt)}
- Room to 8-player roster: ${display(report.program.rosterReadySeconds)} seconds
- Room to first live cue: ${display(report.program.launchSeconds)} seconds; within two minutes: ${display(report.program.launchedWithinTwoMinutes)}
- Promised / route / actual minutes: ${display(report.program.promisedDurationMinutes)} / ${display(report.program.routeDurationMinutes)} / ${display(report.program.actualDurationMinutes)}
- Public Tonight's thread configured: ${display(report.program.storySeedConfigured)}
- Completed route steps: ${report.program.completedStepCount}/${report.program.plannedStepCount}
- Finale generated / evidence count: ${display(report.program.finaleGenerated)} / ${report.program.finaleEvidenceCount}

## Devices and backend

- Device checks total / checked / ready / blocked: ${report.devices.total} / ${report.devices.checked} / ${report.devices.ready} / ${report.devices.blocked}
- Backend status: ${report.backend.status}
- Backend checks: ${recordLine(
    Object.fromEntries(
      Object.entries(report.backend.checks).map(([key, ready]) => [key, ready ? 1 : 0]),
    ),
  )}

## AI budget

- Credits used / cap / remaining: ${report.ai.usedCredits} / ${report.ai.limitCredits} / ${report.ai.remainingCredits}
- Provider requests: ${report.ai.providerRequests}
- Input / output tokens: ${report.ai.inputTokens} / ${report.ai.outputTokens}
- Failed / blocked operations: ${report.ai.failedOperations} / ${report.ai.blockedOperations}
- Manual fallback activations / minutes: ${report.ai.manualFallbackActivations} / ${report.ai.manualFallbackMinutes}
- Recent operations by kind: ${recordLine(report.ai.recentCountByKind)}
- Recent credits by kind: ${recordLine(report.ai.recentCreditsByKind)}
- Estimated provider cost: ${display(report.ai.estimatedProviderCost)}
- Prepared-deck launch notes: ${display(report.ai.preparedLaunchNotes)}

## Score integrity

- Ledger available: ${display(report.scoring.ledgerAvailable)}
- Ledger / listed / unique events: ${display(report.scoring.ledgerEventCount)} / ${report.scoring.listedEventCount} / ${report.scoring.uniqueListedEventCount}
- Duplicate listed event IDs / list truncated: ${display(report.scoring.duplicateListedEventIds)} / ${display(report.scoring.eventListTruncated)}
- Ledger / public team points / difference: ${display(report.scoring.ledgerTotalPoints)} / ${report.scoring.publicTeamScoreTotal} / ${display(report.scoring.ledgerToPublicDifference)}
- Points by act: ${recordLine(report.scoring.pointsByAct)}
- Points by source: ${recordLine(report.scoring.pointsBySource)}
- Event count by game: ${recordLine(report.scoring.listedEventCountByGame)}

## Failures and observations

- SQL / JSON state edits: ${report.observations.sqlStateEdits}
- Secret exposure incident: ${report.observations.secretIncident}
- Backup host handoff: ${report.observations.hostHandoff}
- Host experience / autonomy: ${report.observations.hostExperience} / ${report.observations.hostAutonomy}
- Launch signals observed: ${report.observations.launchSignalsObserved.join(" then ") || "none captured"}
- Launch signal result: ${report.observations.launchSignalResult}
- Tonight's thread callback in game / finale: ${report.observations.storyCallbackInGame} / ${report.observations.storyCallbackInFinale}
- Story-seed instruction safety: ${report.observations.storySafety}
- Host network switch: ${report.observations.physicalReliability.hostNetworkSwitch}
- Backup takeover after primary host loss: ${report.observations.physicalReliability.backupTakeover}
- Player background / resume: ${report.observations.physicalReliability.playerBackgroundResume}
- Host refresh in lobby and live game: ${report.observations.physicalReliability.hostRefreshRecovery}
- Late join across live acts: ${report.observations.physicalReliability.lateJoinAcrossActs}
- Team-switch identity / ledger integrity: ${report.observations.physicalReliability.teamSwitchIntegrity}
- Camera and microphone permission recovery: ${report.observations.physicalReliability.mediaPermissionRecovery}
- 2/3/4-hour pacing reviewed: ${display(report.observations.pacingReviewed)}
- Failure notes:

${display(report.observations.failureNotes)}

## Privacy boundary

This automatic report excludes player/team names and IDs, private assignments, transcripts,
media paths, score reasons, rubrics and authentication secrets. Review the user-entered notes above
before sharing.
`;
}
