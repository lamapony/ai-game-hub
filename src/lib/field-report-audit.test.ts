import { describe, expect, test } from "bun:test";
import {
  auditFieldReports,
  formatFieldReportAudit,
  parseObservedProviderCost,
} from "./field-report-audit";

const ISO_BASE = Date.parse("2026-07-17T16:00:00.000Z");

function iso(minutes: number) {
  return new Date(ISO_BASE + minutes * 60_000).toISOString();
}

function physicalReport({
  index,
  setting,
  duration,
  eventLabel,
  limitCredits,
  usedCredits,
}: {
  index: number;
  setting: "park" | "bar" | "home" | "festival";
  duration: 120 | 180 | 240;
  eventLabel: string;
  limitCredits: 60 | 120 | 240;
  usedCredits: number;
}) {
  return {
    schemaVersion: 5,
    generatedAt: iso(index * 300 + duration + 2),
    event: {
      roomCode: `R${index}A${index}`,
      date: eventLabel.startsWith("Friday") ? "2026-07-17" : "2026-07-18",
      label: eventLabel,
      status: "finished",
      outcome: "pass",
      runKind: "physical",
      hostDevice: "iPhone 15 · Safari",
      networkNotes: "Venue Wi-Fi plus 5G fallback",
    },
    program: {
      setting,
      expectedPlayers: 8,
      joinedPlayers: 8,
      promisedDurationMinutes: duration,
      storySeedConfigured: true,
      routeDurationMinutes: duration,
      configuredAt: iso(index * 300),
      rosterReadyAt: iso(index * 300 + 1),
      startedAt: iso(index * 300 + 1.5),
      finishedAt: iso(index * 300 + 1.5 + duration),
      rosterReadySeconds: 60,
      launchSeconds: 90,
      launchedWithinTwoMinutes: true,
      actualDurationMinutes: duration,
      plannedStepCount: 6,
      completedStepCount: 6,
      activeStepId: null,
      finaleGenerated: true,
      finaleEvidenceCount: 5,
    },
    devices: { total: 8, checked: 8, ready: 8, blocked: 0 },
    backend: {
      status: "ready",
      checks: { privateMemory: true, scoreLedger: true, storage: true, ai: true },
    },
    ai: {
      limitCredits,
      usedCredits,
      providerRequests: 4,
      failedOperations: 0,
      blockedOperations: 0,
      manualFallbackActivations: 0,
      estimatedProviderCost: `${(usedCredits * 0.02).toFixed(2)} DKK`,
      preparedLaunchNotes: "First AI result: 4.2s cold / 0.4s prewarmed",
    },
    scoring: {
      ledgerAvailable: true,
      ledgerEventCount: 5,
      listedEventCount: 5,
      uniqueListedEventCount: 5,
      duplicateListedEventIds: false,
      eventListTruncated: false,
      ledgerTotalPoints: 25,
      publicTeamScoreTotal: 25,
      ledgerToPublicDifference: 0,
    },
    observations: {
      failureNotes: "",
      sqlStateEdits: "none",
      secretIncident: "none",
      hostHandoff: "verified",
      hostExperience: index === 1 ? "first-time" : "returning",
      hostAutonomy: "independent",
      launchSignalResult: "followed",
      launchSignalsObserved: ["CHECK.", "INVITE.", "START."],
      storyCallbackInGame: "observed",
      storyCallbackInFinale: "observed",
      storySafety: "safe",
      physicalReliability: {
        hostNetworkSwitch: "passed",
        backupTakeover: "passed",
        playerBackgroundResume: "passed",
        hostRefreshRecovery: "passed",
        lateJoinAcrossActs: "passed",
        teamSwitchIntegrity: "passed",
        mediaPermissionRecovery: "passed",
      },
      pacingReviewed: true,
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

function passingReports() {
  return [
    physicalReport({
      index: 1,
      setting: "park",
      duration: 120,
      eventLabel: "Friday · Nørrebro",
      limitCredits: 60,
      usedCredits: 50,
    }),
    physicalReport({
      index: 2,
      setting: "bar",
      duration: 180,
      eventLabel: "Friday · Nørrebro",
      limitCredits: 120,
      usedCredits: 90,
    }),
    physicalReport({
      index: 3,
      setting: "home",
      duration: 240,
      eventLabel: "Saturday · Frederiksberg",
      limitCredits: 240,
      usedCredits: 110,
    }),
    physicalReport({
      index: 4,
      setting: "festival",
      duration: 120,
      eventLabel: "Saturday · Frederiksberg",
      limitCredits: 120,
      usedCredits: 100,
    }),
  ];
}

describe("field report release audit", () => {
  test("accepts four physical reports and calibrates 60/120/240 provider cost", () => {
    const audit = auditFieldReports(passingReports());

    expect(audit.status).toBe("pass");
    expect(audit.checks.every((check) => check.passed)).toBe(true);
    expect(audit.calibration?.currency).toBe("DKK");
    expect(audit.calibration?.sampleCount).toBe(4);
    expect(audit.calibration?.medianCostPerCredit).toBe(0.02);
    expect(audit.calibration?.maximumCostPerCredit).toBe(0.02);
    expect(audit.calibration?.peakObservedCredits).toBe(110);
    expect(audit.calibration?.headroomTargetCredits).toBe(132);
    expect(audit.calibration?.recommendedPreset).toBe(240);
    expect(audit.calibration?.withinPresetRange).toBe(true);
    expect(audit.calibration?.presetEstimates).toEqual([
      { credits: 60, medianCost: 1.2, conservativeCost: 1.2 },
      { credits: 120, medianCost: 2.4, conservativeCost: 2.4 },
      { credits: 240, medianCost: 4.8, conservativeCost: 4.8 },
    ]);
    expect(audit.checks.find((check) => check.id === "host-autonomy")?.detail).toContain(
      "launch signal without prompting",
    );
    expect(formatFieldReportAudit(audit)).toContain("Field report release gate: PASS");
  });

  test("rejects automation, duplicate rooms, missing coverage and broken evidence", () => {
    const reports = passingReports();
    reports[0]!.event.runKind = "automated";
    reports[0]!.scoring.duplicateListedEventIds = true;
    reports[1]!.event.roomCode = reports[0]!.event.roomCode;
    reports[1]!.event.date = reports[0]!.event.date;
    reports[2]!.event.date = reports[0]!.event.date;
    reports[3]!.event.date = reports[0]!.event.date;
    reports[1]!.privacy.containsPlayerNames = true;
    reports[2]!.program.setting = "bar";
    reports[2]!.observations.secretIncident = "suspected";
    reports[2]!.observations.hostHandoff = "failed";
    reports[2]!.observations.hostAutonomy = "prompted";
    reports[2]!.observations.launchSignalsObserved = ["START."];
    reports[3]!.observations.storyCallbackInFinale = "not-observed";
    reports[3]!.observations.storySafety = "concern";
    reports[3]!.observations.physicalReliability.backupTakeover = "failed";
    reports[3]!.program.launchSeconds = 121;
    reports[3]!.program.launchedWithinTwoMinutes = false;
    reports[3]!.devices.blocked = 2;

    const audit = auditFieldReports(reports);
    const failed = audit.checks.filter((check) => !check.passed).map((check) => check.id);

    expect(audit.status).toBe("fail");
    for (const checkId of [
      "unique-runs",
      "two-evenings",
      "physical-pass",
      "settings",
      "two-minute-launch",
      "physical-devices",
      "ledger",
      "privacy",
      "human-declarations",
      "launch-signal-evidence",
      "host-autonomy",
      "story-continuity",
      "physical-reliability",
    ]) {
      expect(failed).toContain(checkId);
    }
  });

  test("rejects mixed currencies and usage that cannot fit 20% headroom", () => {
    const mixedCurrency = passingReports();
    mixedCurrency[0]!.ai.estimatedProviderCost = "1.00 USD";
    const mixedAudit = auditFieldReports(mixedCurrency);

    expect(mixedAudit.calibration).toBeNull();
    expect(mixedAudit.checks.find((check) => check.id === "budget-calibration")?.passed).toBe(
      false,
    );

    const noHeadroom = passingReports();
    noHeadroom[2]!.ai.usedCredits = 240;
    noHeadroom[2]!.ai.estimatedProviderCost = "4.80 DKK";
    const headroomAudit = auditFieldReports(noHeadroom);

    expect(headroomAudit.calibration?.headroomTargetCredits).toBe(288);
    expect(headroomAudit.calibration?.withinPresetRange).toBe(false);
    expect(headroomAudit.checks.find((check) => check.id === "budget-calibration")?.passed).toBe(
      false,
    );
  });

  test("rejects an old or malformed report before evaluating the release gate", () => {
    const report = passingReports()[0]!;
    report.schemaVersion = 2;

    const audit = auditFieldReports([report]);

    expect(audit.status).toBe("fail");
    expect(audit.checks).toHaveLength(1);
    expect(audit.checks[0]?.id).toBe("schema");
    expect(audit.checks[0]?.passed).toBe(false);
    expect(audit.invalidReports[0]?.issues.join(" ")).toContain("schemaVersion");
  });

  test("rejects schema v5 without structured physical recovery evidence", () => {
    const report = passingReports()[0]!;
    const observations = { ...report.observations } as Record<string, unknown>;
    delete observations.physicalReliability;

    const audit = auditFieldReports([{ ...report, observations }]);

    expect(audit.status).toBe("fail");
    expect(audit.checks).toHaveLength(1);
    expect(audit.invalidReports[0]?.issues.join(" ")).toContain("observations.physicalReliability");
  });

  test("parses explicit positive costs without guessing the currency", () => {
    expect(parseObservedProviderCost("2.40 DKK")).toEqual({ amount: 2.4, currency: "DKK" });
    expect(parseObservedProviderCost("DKK 2,40")).toEqual({ amount: 2.4, currency: "DKK" });
    expect(parseObservedProviderCost("$1.25")).toEqual({ amount: 1.25, currency: "USD" });
    expect(parseObservedProviderCost("€ 0.80")).toEqual({ amount: 0.8, currency: "EUR" });
    expect(parseObservedProviderCost("free")).toBeNull();
    expect(parseObservedProviderCost("0 DKK")).toBeNull();
    expect(parseObservedProviderCost("2.40")).toBeNull();
  });
});
