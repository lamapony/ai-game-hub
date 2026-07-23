import { describe, expect, test } from "bun:test";
import type { FieldReportObservations } from "./field-report";
import { buildFieldReportPassReadiness } from "./field-report-draft";

function completeObservations(): FieldReportObservations {
  return {
    eventDate: "2026-07-17",
    eventLabel: "Nørrebro park",
    hostDevice: "iPhone 15 · Safari",
    networkNotes: "5G",
    estimatedProviderCost: "2.40 DKK",
    preparedLaunchNotes: "4.2s cold / 0.4s prepared",
    failureNotes: "",
    outcome: "pass",
    runKind: "physical",
    sqlStateEdits: "none",
    secretIncident: "none",
    hostHandoff: "verified",
    hostExperience: "first-time",
    hostAutonomy: "independent",
    launchSignalResult: "followed",
    launchSignalsObserved: ["INVITE.", "START."],
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
  };
}

describe("field report PASS readiness", () => {
  test("accepts a complete physical run without storing story text", () => {
    const readiness = buildFieldReportPassReadiness({
      observations: completeObservations(),
      storySeedConfigured: true,
    });

    expect(readiness.complete).toBe(true);
    expect(readiness.passedCount).toBe(26);
    expect(readiness.totalCount).toBe(26);
    expect(readiness.nextAction).toBeNull();
  });

  test("points to the first missing action in form order", () => {
    const observations = completeObservations();
    observations.eventDate = "";
    observations.hostDevice = "";

    const readiness = buildFieldReportPassReadiness({
      observations,
      storySeedConfigured: true,
    });

    expect(readiness.complete).toBe(false);
    expect(readiness.passedCount).toBe(24);
    expect(readiness.nextAction).toBe("Choose the event date.");
  });

  test("rejects prompted hosting, missing story evidence and ambiguous cost", () => {
    const observations = completeObservations();
    observations.hostAutonomy = "prompted";
    observations.storyCallbackInFinale = "not-observed";
    observations.storySafety = "concern";
    observations.estimatedProviderCost = "2.40";

    const readiness = buildFieldReportPassReadiness({
      observations,
      storySeedConfigured: false,
    });
    const failed = readiness.checks.filter((item) => !item.passed).map((item) => item.id);

    expect(failed).toEqual([
      "host-autonomy",
      "story-seed",
      "finale-callback",
      "story-safety",
      "provider-cost",
    ]);
  });

  test("requires every physical recovery drill for PASS", () => {
    const observations = completeObservations();
    observations.physicalReliability.hostNetworkSwitch = "failed";
    observations.physicalReliability.mediaPermissionRecovery = "not-tested";

    const readiness = buildFieldReportPassReadiness({
      observations,
      storySeedConfigured: true,
    });
    const failed = readiness.checks.filter((item) => !item.passed).map((item) => item.id);

    expect(failed).toEqual(["host-network-switch", "media-permission-recovery"]);
    expect(readiness.nextAction).toContain("Switch the host from Wi-Fi to mobile data");
  });

  test("asks for the visible launch signal result", () => {
    const observations = completeObservations();
    observations.launchSignalResult = "unknown";

    const readiness = buildFieldReportPassReadiness({
      observations,
      storySeedConfigured: true,
    });

    expect(readiness.nextAction).toBe(
      "Classify whether the visible launch signal was followed without prompting.",
    );
  });

  test("requires automatic INVITE and START evidence before a physical PASS", () => {
    const observations = completeObservations();
    observations.launchSignalsObserved = ["CHECK.", "START."];

    const readiness = buildFieldReportPassReadiness({
      observations,
      storySeedConfigured: true,
    });

    expect(readiness.checks.find((item) => item.id === "launch-sequence")?.passed).toBe(false);
    expect(readiness.nextAction).toContain("lacks automatic INVITE. and START. evidence");
  });
});
