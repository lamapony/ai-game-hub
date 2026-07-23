import { z } from "zod";
import { FIELD_REPORT_SCHEMA_VERSION, fieldReportPhysicalReliabilityPassed } from "./field-report";
import { parseObservedProviderCost, type ObservedProviderCost } from "./field-report-cost";
import { QUICK_START_LAUNCH_SIGNALS } from "./quick-start-launch-coach";
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS } from "./room-capacity";

export { parseObservedProviderCost } from "./field-report-cost";

export const FIELD_REPORT_REQUIRED_SETTINGS = ["park", "bar", "home", "festival"] as const;
export const FIELD_REPORT_REQUIRED_DURATIONS = [120, 180, 240] as const;
export const FIELD_REPORT_BUDGET_PRESETS = [60, 120, 240] as const;

const fieldReportSchema = z
  .object({
    schemaVersion: z.literal(FIELD_REPORT_SCHEMA_VERSION),
    generatedAt: z.string().datetime(),
    event: z
      .object({
        roomCode: z.string().min(2).max(8),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        label: z.string(),
        status: z.enum(["lobby", "playing", "finished"]),
        outcome: z.enum(["pending", "pass", "fail"]),
        runKind: z.enum(["unclassified", "physical", "automated"]),
        hostDevice: z.string(),
        networkNotes: z.string(),
      })
      .passthrough(),
    program: z
      .object({
        setting: z.enum(FIELD_REPORT_REQUIRED_SETTINGS).nullable(),
        expectedPlayers: z.number().int().nullable(),
        joinedPlayers: z.number().int(),
        promisedDurationMinutes: z.number().int().nullable(),
        storySeedConfigured: z.boolean(),
        routeDurationMinutes: z.number().int().nullable(),
        configuredAt: z.string().datetime().nullable(),
        rosterReadyAt: z.string().datetime().nullable(),
        startedAt: z.string().datetime().nullable(),
        finishedAt: z.string().datetime().nullable(),
        rosterReadySeconds: z.number().nonnegative().nullable(),
        launchSeconds: z.number().nonnegative().nullable(),
        launchedWithinTwoMinutes: z.boolean().nullable(),
        actualDurationMinutes: z.number().nonnegative().nullable(),
        plannedStepCount: z.number().int().nonnegative(),
        completedStepCount: z.number().int().nonnegative(),
        activeStepId: z.string().nullable(),
        finaleGenerated: z.boolean(),
        finaleEvidenceCount: z.number().int().nonnegative(),
      })
      .passthrough(),
    devices: z.object({
      total: z.number().int().nonnegative(),
      checked: z.number().int().nonnegative(),
      ready: z.number().int().nonnegative(),
      blocked: z.number().int().nonnegative(),
    }),
    backend: z.object({
      status: z.enum(["checking", "ready", "degraded", "error", "unknown"]),
      checks: z.record(z.boolean()),
    }),
    ai: z
      .object({
        limitCredits: z.number().int().positive(),
        usedCredits: z.number().int().nonnegative(),
        providerRequests: z.number().int().nonnegative(),
        failedOperations: z.number().int().nonnegative(),
        blockedOperations: z.number().int().nonnegative(),
        manualFallbackActivations: z.number().int().nonnegative(),
        estimatedProviderCost: z.string(),
        preparedLaunchNotes: z.string(),
      })
      .passthrough(),
    scoring: z
      .object({
        ledgerAvailable: z.boolean(),
        ledgerEventCount: z.number().int().nonnegative().nullable(),
        listedEventCount: z.number().int().nonnegative(),
        uniqueListedEventCount: z.number().int().nonnegative(),
        duplicateListedEventIds: z.boolean(),
        eventListTruncated: z.boolean(),
        ledgerTotalPoints: z.number().nullable(),
        publicTeamScoreTotal: z.number(),
        ledgerToPublicDifference: z.number().nullable(),
      })
      .passthrough(),
    observations: z.object({
      failureNotes: z.string(),
      sqlStateEdits: z.enum(["unknown", "none", "performed"]),
      secretIncident: z.enum(["unknown", "none", "suspected"]),
      hostHandoff: z.enum(["unknown", "verified", "failed"]).default("unknown"),
      hostExperience: z.enum(["unknown", "first-time", "returning"]),
      hostAutonomy: z.enum(["unknown", "independent", "prompted"]),
      launchSignalResult: z.enum(["unknown", "followed", "misunderstood"]),
      launchSignalsObserved: z.array(z.enum(QUICK_START_LAUNCH_SIGNALS)).max(6),
      storyCallbackInGame: z.enum(["unknown", "observed", "not-observed", "not-tested"]),
      storyCallbackInFinale: z.enum(["unknown", "observed", "not-observed", "not-tested"]),
      storySafety: z.enum(["unknown", "safe", "concern", "not-tested"]),
      physicalReliability: z
        .object({
          hostNetworkSwitch: z.enum(["not-tested", "passed", "failed"]),
          backupTakeover: z.enum(["not-tested", "passed", "failed"]),
          playerBackgroundResume: z.enum(["not-tested", "passed", "failed"]),
          hostRefreshRecovery: z.enum(["not-tested", "passed", "failed"]),
          lateJoinAcrossActs: z.enum(["not-tested", "passed", "failed"]),
          teamSwitchIntegrity: z.enum(["not-tested", "passed", "failed"]),
          mediaPermissionRecovery: z.enum(["not-tested", "passed", "failed"]),
        })
        .strict(),
      pacingReviewed: z.boolean(),
    }),
    privacy: z.object({
      containsPlayerNames: z.boolean(),
      containsPrivateAssignments: z.boolean(),
      containsTranscriptsOrMedia: z.boolean(),
      containsScoreReasonsOrRubrics: z.boolean(),
      reviewUserEnteredNotesBeforeSharing: z.boolean(),
    }),
  })
  .passthrough();

type AuditableFieldReport = z.infer<typeof fieldReportSchema>;

export type FieldReportAuditCheck = {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
};

export type FieldReportBudgetCalibration = {
  currency: ObservedProviderCost["currency"];
  sampleCount: number;
  medianCostPerCredit: number;
  maximumCostPerCredit: number;
  peakObservedCredits: number;
  headroomTargetCredits: number;
  recommendedPreset: (typeof FIELD_REPORT_BUDGET_PRESETS)[number];
  withinPresetRange: boolean;
  presetEstimates: Array<{
    credits: (typeof FIELD_REPORT_BUDGET_PRESETS)[number];
    medianCost: number;
    conservativeCost: number;
  }>;
};

export type FieldReportAudit = {
  status: "pass" | "fail";
  reportCount: number;
  checks: FieldReportAuditCheck[];
  warnings: string[];
  calibration: FieldReportBudgetCalibration | null;
  invalidReports: Array<{ index: number; issues: string[] }>;
};

function round(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function auditCheck(
  id: string,
  title: string,
  passed: boolean,
  detail: string,
): FieldReportAuditCheck {
  return { id, title, passed, detail };
}

function setEquals<T>(actual: Set<T>, expected: readonly T[]) {
  return actual.size === expected.length && expected.every((value) => actual.has(value));
}

function buildCalibration(reports: AuditableFieldReport[]): FieldReportBudgetCalibration | null {
  const samples = reports.flatMap((report) => {
    const cost = parseObservedProviderCost(report.ai.estimatedProviderCost);
    return cost && report.ai.usedCredits > 0 ? [{ cost, credits: report.ai.usedCredits }] : [];
  });
  if (samples.length < 2) return null;
  const currencies = new Set(samples.map((sample) => sample.cost.currency));
  if (currencies.size !== 1) return null;
  const costsPerCredit = samples.map((sample) => sample.cost.amount / sample.credits);
  const medianCostPerCredit = median(costsPerCredit);
  const maximumCostPerCredit = Math.max(...costsPerCredit);
  const peakObservedCredits = Math.max(...samples.map((sample) => sample.credits));
  const headroomTargetCredits = Math.ceil(peakObservedCredits * 1.2);
  const recommendedPreset =
    FIELD_REPORT_BUDGET_PRESETS.find((preset) => preset >= headroomTargetCredits) ?? 240;
  return {
    currency: samples[0]!.cost.currency,
    sampleCount: samples.length,
    medianCostPerCredit: round(medianCostPerCredit),
    maximumCostPerCredit: round(maximumCostPerCredit),
    peakObservedCredits,
    headroomTargetCredits,
    recommendedPreset,
    withinPresetRange: headroomTargetCredits <= 240,
    presetEstimates: FIELD_REPORT_BUDGET_PRESETS.map((credits) => ({
      credits,
      medianCost: round(credits * medianCostPerCredit, 2),
      conservativeCost: round(credits * maximumCostPerCredit, 2),
    })),
  };
}

export function auditFieldReports(values: unknown[]): FieldReportAudit {
  const parsed = values.map((value) => fieldReportSchema.safeParse(value));
  const invalidReports = parsed.flatMap((result, index) =>
    result.success
      ? []
      : [
          {
            index,
            issues: result.error.issues.map(
              (issue) => `${issue.path.join(".") || "report"}: ${issue.message}`,
            ),
          },
        ],
  );
  const reports = parsed.flatMap((result) => (result.success ? [result.data] : []));
  const checks: FieldReportAuditCheck[] = [
    auditCheck(
      "schema",
      `Schema v${FIELD_REPORT_SCHEMA_VERSION}`,
      invalidReports.length === 0 && reports.length === values.length,
      invalidReports.length
        ? `${invalidReports.length} report(s) are invalid or from an older schema.`
        : `${reports.length} report(s) parsed as schema v${FIELD_REPORT_SCHEMA_VERSION}.`,
    ),
  ];
  if (invalidReports.length > 0 || reports.length !== values.length) {
    return {
      status: "fail",
      reportCount: values.length,
      checks,
      warnings: [],
      calibration: null,
      invalidReports,
    };
  }

  const roomCodes = new Set(reports.map((report) => report.event.roomCode));
  const eventDates = new Set(reports.map((report) => report.event.date));
  const settings = new Set(reports.map((report) => report.program.setting).filter(Boolean));
  const durations = new Set(
    reports.map((report) => report.program.promisedDurationMinutes).filter(Boolean),
  );
  const physicalPass = reports.every(
    (report) =>
      report.event.runKind === "physical" &&
      report.event.outcome === "pass" &&
      report.event.status === "finished",
  );
  const launchPass = reports.every(
    (report) =>
      report.program.rosterReadySeconds !== null &&
      report.program.rosterReadySeconds <= 120 &&
      report.program.launchSeconds !== null &&
      report.program.launchSeconds <= 120 &&
      report.program.launchedWithinTwoMinutes === true,
  );
  const participantPass = reports.every(
    (report) =>
      report.program.joinedPlayers >= MIN_ROOM_PLAYERS &&
      report.program.joinedPlayers <= MAX_ROOM_PLAYERS &&
      report.program.expectedPlayers !== null &&
      report.program.expectedPlayers >= MIN_ROOM_PLAYERS &&
      report.program.expectedPlayers <= MAX_ROOM_PLAYERS &&
      report.devices.total === report.program.joinedPlayers &&
      report.devices.checked <= report.devices.total &&
      report.devices.ready <= report.devices.checked &&
      report.devices.blocked === report.devices.checked - report.devices.ready &&
      report.devices.checked >= MIN_ROOM_PLAYERS &&
      report.devices.ready >= MIN_ROOM_PLAYERS,
  );
  const routePass = reports.every((report) => {
    const promised = report.program.promisedDurationMinutes;
    const actual = report.program.actualDurationMinutes;
    return (
      promised !== null &&
      FIELD_REPORT_REQUIRED_DURATIONS.includes(promised as 120 | 180 | 240) &&
      report.program.routeDurationMinutes === promised &&
      actual !== null &&
      Math.abs(actual - promised) <= promised * 0.15 &&
      report.program.configuredAt !== null &&
      report.program.startedAt !== null &&
      report.program.finishedAt !== null &&
      report.program.completedStepCount > 0 &&
      report.program.activeStepId === null &&
      report.program.finaleGenerated &&
      report.program.finaleEvidenceCount > 0
    );
  });
  const backendPass = reports.every((report) => {
    const backendChecks = Object.values(report.backend.checks);
    return (
      report.backend.status === "ready" && backendChecks.length >= 4 && backendChecks.every(Boolean)
    );
  });
  const ledgerPass = reports.every(
    (report) =>
      report.scoring.ledgerAvailable &&
      report.scoring.ledgerEventCount !== null &&
      report.scoring.ledgerEventCount === report.scoring.listedEventCount &&
      report.scoring.listedEventCount === report.scoring.uniqueListedEventCount &&
      !report.scoring.duplicateListedEventIds &&
      !report.scoring.eventListTruncated &&
      report.scoring.ledgerTotalPoints === report.scoring.publicTeamScoreTotal &&
      report.scoring.ledgerToPublicDifference === 0,
  );
  const privacyPass = reports.every(
    (report) =>
      !report.privacy.containsPlayerNames &&
      !report.privacy.containsPrivateAssignments &&
      !report.privacy.containsTranscriptsOrMedia &&
      !report.privacy.containsScoreReasonsOrRubrics &&
      report.privacy.reviewUserEnteredNotesBeforeSharing,
  );
  const declarationsPass = reports.every(
    (report) =>
      report.event.label.trim().length > 0 &&
      report.event.hostDevice.trim().length > 0 &&
      report.observations.sqlStateEdits === "none" &&
      report.observations.secretIncident === "none" &&
      report.observations.hostHandoff === "verified" &&
      report.observations.pacingReviewed &&
      report.ai.preparedLaunchNotes.trim().length > 0 &&
      ((report.ai.failedOperations === 0 &&
        report.ai.blockedOperations === 0 &&
        report.ai.manualFallbackActivations === 0) ||
        report.observations.failureNotes.trim().length > 0),
  );
  const launchSignalEvidencePass = reports.every(
    (report) =>
      report.observations.launchSignalsObserved.includes("INVITE.") &&
      report.observations.launchSignalsObserved.includes("START."),
  );
  const hostAutonomyPass =
    reports.every(
      (report) =>
        report.observations.hostExperience !== "unknown" &&
        report.observations.hostAutonomy === "independent" &&
        report.observations.launchSignalResult === "followed",
    ) && reports.some((report) => report.observations.hostExperience === "first-time");
  const storyContinuityPass = reports.every(
    (report) =>
      report.program.storySeedConfigured &&
      report.observations.storyCallbackInGame === "observed" &&
      report.observations.storyCallbackInFinale === "observed" &&
      report.observations.storySafety === "safe",
  );
  const physicalReliabilityPass = reports.every((report) =>
    fieldReportPhysicalReliabilityPassed(report.observations.physicalReliability),
  );
  const calibration = buildCalibration(reports);
  const budgetPresets = new Set(reports.map((report) => report.ai.limitCredits));
  const calibrationPass =
    calibration !== null &&
    calibration.sampleCount === reports.length &&
    calibration.withinPresetRange &&
    budgetPresets.size >= 2 &&
    reports.every(
      (report) =>
        FIELD_REPORT_BUDGET_PRESETS.includes(report.ai.limitCredits as 60 | 120 | 240) &&
        report.ai.usedCredits > 0 &&
        report.ai.usedCredits <= report.ai.limitCredits,
    );

  checks.push(
    auditCheck(
      "report-count",
      "Four physical settings",
      reports.length >= 4,
      `${reports.length} report(s); at least four are required.`,
    ),
    auditCheck(
      "unique-runs",
      "Unique rooms",
      roomCodes.size === reports.length,
      `${roomCodes.size}/${reports.length} unique room codes.`,
    ),
    auditCheck(
      "two-evenings",
      "Two distinct evenings",
      eventDates.size >= 2,
      `${eventDates.size} distinct structured event dates.`,
    ),
    auditCheck(
      "physical-pass",
      "Physical PASS finales",
      physicalPass,
      physicalPass
        ? "Every report is a completed physical-phone PASS."
        : "Every report must be marked physical, PASS and finished.",
    ),
    auditCheck(
      "settings",
      "Park, bar, home and festival",
      setEquals(settings, FIELD_REPORT_REQUIRED_SETTINGS),
      `Covered: ${[...settings].sort().join(", ") || "none"}.`,
    ),
    auditCheck(
      "durations",
      "120, 180 and 240 minutes",
      setEquals(durations, FIELD_REPORT_REQUIRED_DURATIONS),
      `Covered: ${[...durations].sort((a, b) => Number(a) - Number(b)).join(", ") || "none"}.`,
    ),
    auditCheck(
      "two-minute-launch",
      "Roster and first cue within two minutes",
      launchPass,
      launchPass
        ? "Every room reached eight players and its first live cue within 120 seconds."
        : "A roster or first live cue is missing or exceeded 120 seconds.",
    ),
    auditCheck(
      "physical-devices",
      "8–30 participants with eight ready phones",
      participantPass,
      participantPass
        ? "Every report has 8–30 participants and at least eight ready device checks."
        : "Participant, expected-crowd or device-check evidence is incomplete.",
    ),
    auditCheck(
      "route-finale",
      "Paced route and connected finale",
      routePass,
      routePass
        ? "Every route matches its promise, finished within ±15% and has grounded finale evidence."
        : "A route/timestamp/pacing/finale evidence requirement is incomplete.",
    ),
    auditCheck(
      "backend",
      "Live backend ready",
      backendPass,
      backendPass
        ? "Every report has four or more passing backend checks."
        : "A backend report is degraded, incomplete or unchecked.",
    ),
    auditCheck(
      "ledger",
      "No lost or duplicated score",
      ledgerPass,
      ledgerPass
        ? "Ledger list is complete, unique and reconciled to the public team total."
        : "Ledger events are missing, duplicated, truncated or do not reconcile.",
    ),
    auditCheck(
      "privacy",
      "Privacy boundary",
      privacyPass,
      privacyPass
        ? "Automatic reports declare every sensitive category absent."
        : "A report does not satisfy the automatic privacy contract.",
    ),
    auditCheck(
      "human-declarations",
      "Verified host handoff and no live repair",
      declarationsPass,
      declarationsPass
        ? "Backup host, no-repair/no-secret declarations, pacing and prepared launch are complete."
        : "A host handoff, declaration, prepared-launch measurement or failure note is incomplete.",
    ),
    auditCheck(
      "launch-signal-evidence",
      "Automatic launch-signal sequence",
      launchSignalEvidencePass,
      launchSignalEvidencePass
        ? "Every host captured INVITE. and START. automatically."
        : "Every report must automatically capture both INVITE. and START. on the host device.",
    ),
    auditCheck(
      "host-autonomy",
      "First-time host autonomy",
      hostAutonomyPass,
      hostAutonomyPass
        ? "Every host followed the launch signal without prompting; at least one was a first-time host."
        : "Classify every host, require independent launch-signal use in every run and include a first-time host.",
    ),
    auditCheck(
      "story-continuity",
      "Tonight's thread in game and finale",
      storyContinuityPass,
      storyContinuityPass
        ? "Every run observed a safe public story callback in both a game and the finale."
        : "Every run needs a public thread, game callback, finale callback and safe instruction boundary.",
    ),
    auditCheck(
      "physical-reliability",
      "Physical recovery drills",
      physicalReliabilityPass,
      physicalReliabilityPass
        ? "Every run passed all seven real-device recovery drills."
        : "Every run must pass network switch, backup takeover, resume, refresh, late-join, team-switch and media-permission drills.",
    ),
    auditCheck(
      "budget-calibration",
      "Provider-cost calibration",
      calibrationPass,
      calibrationPass
        ? `${calibration!.sampleCount} same-currency samples support preset ${calibration!.recommendedPreset}.`
        : "Need cost for every run, one currency, at least two caps and 20% headroom within 240.",
    ),
  );

  const warnings: string[] = [];
  const totalFailures = reports.reduce(
    (total, report) => total + report.ai.failedOperations + report.ai.blockedOperations,
    0,
  );
  const manualFallbacks = reports.reduce(
    (total, report) => total + report.ai.manualFallbackActivations,
    0,
  );
  if (totalFailures > 0) warnings.push(`${totalFailures} AI operation(s) failed or were blocked.`);
  if (manualFallbacks > 0)
    warnings.push(`Manual fallback was activated ${manualFallbacks} time(s).`);
  const optionalSteps = reports.filter(
    (report) => report.program.completedStepCount < report.program.plannedStepCount,
  ).length;
  if (optionalSteps > 0) {
    warnings.push(`${optionalSteps} report(s) did not complete every optional route step.`);
  }

  return {
    status: checks.every((check) => check.passed) ? "pass" : "fail",
    reportCount: reports.length,
    checks,
    warnings,
    calibration,
    invalidReports,
  };
}

function formatMoney(value: number, currency: string) {
  return `${value.toFixed(2)} ${currency}`;
}

export function formatFieldReportAudit(audit: FieldReportAudit) {
  const lines = [
    `Field report release gate: ${audit.status.toUpperCase()}`,
    `Reports: ${audit.reportCount}`,
    "",
    ...audit.checks.map(
      (check) => `${check.passed ? "PASS" : "FAIL"} ${check.title} — ${check.detail}`,
    ),
  ];
  if (audit.calibration) {
    lines.push(
      "",
      `Budget recommendation: ${audit.calibration.recommendedPreset} credits (${audit.calibration.headroomTargetCredits} target with 20% headroom)`,
      `Observed cost/credit: median ${audit.calibration.medianCostPerCredit.toFixed(4)}, max ${audit.calibration.maximumCostPerCredit.toFixed(4)} ${audit.calibration.currency}`,
      ...audit.calibration.presetEstimates.map(
        (estimate) =>
          `${estimate.credits} credits: median ${formatMoney(estimate.medianCost, audit.calibration!.currency)}, conservative ${formatMoney(estimate.conservativeCost, audit.calibration!.currency)}`,
      ),
    );
  }
  if (audit.warnings.length) lines.push("", ...audit.warnings.map((warning) => `WARN ${warning}`));
  for (const invalid of audit.invalidReports) {
    lines.push(
      "",
      `Invalid report #${invalid.index + 1}:`,
      ...invalid.issues.map((issue) => `- ${issue}`),
    );
  }
  return `${lines.join("\n")}\n`;
}
