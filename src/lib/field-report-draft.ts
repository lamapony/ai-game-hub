import {
  mergeFieldReportLaunchSignals,
  type FieldReportObservations,
  type FieldReportPhysicalReliability,
} from "./field-report";
import { parseObservedProviderCost } from "./field-report-cost";

function fieldReportValueChanged(left: unknown, right: unknown) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export function mergeFieldReportDraftObservations(
  existing: FieldReportObservations,
  incoming: FieldReportObservations,
  base?: FieldReportObservations,
): FieldReportObservations {
  if (!base) {
    return {
      ...incoming,
      launchSignalsObserved: mergeFieldReportLaunchSignals(
        existing.launchSignalsObserved,
        incoming.launchSignalsObserved,
      ),
    };
  }

  const merged: FieldReportObservations = {
    ...existing,
    physicalReliability: { ...existing.physicalReliability },
    launchSignalsObserved: mergeFieldReportLaunchSignals(
      existing.launchSignalsObserved,
      incoming.launchSignalsObserved,
    ),
  };
  for (const key of Object.keys(incoming) as Array<keyof FieldReportObservations>) {
    if (key === "launchSignalsObserved" || key === "physicalReliability") continue;
    if (fieldReportValueChanged(incoming[key], base[key])) {
      Object.assign(merged, { [key]: incoming[key] });
    }
  }
  for (const key of Object.keys(incoming.physicalReliability) as Array<
    keyof FieldReportPhysicalReliability
  >) {
    if (incoming.physicalReliability[key] !== base.physicalReliability[key]) {
      merged.physicalReliability[key] = incoming.physicalReliability[key];
    }
  }
  return merged;
}

export function nextFieldReportDraftUpdatedAt(currentUpdatedAt: number, now: number) {
  return Math.max(now, currentUpdatedAt + 1);
}

export type FieldReportPassCheck = {
  id: string;
  title: string;
  passed: boolean;
  action: string;
};

export type FieldReportPassReadiness = {
  complete: boolean;
  passedCount: number;
  totalCount: number;
  nextAction: string | null;
  checks: FieldReportPassCheck[];
};

function validEventDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function check(id: string, title: string, passed: boolean, action: string): FieldReportPassCheck {
  return { id, title, passed, action };
}

export function buildFieldReportPassReadiness({
  observations,
  storySeedConfigured,
}: {
  observations: FieldReportObservations;
  storySeedConfigured: boolean;
}): FieldReportPassReadiness {
  const checks = [
    check(
      "event-date",
      "Event date",
      validEventDate(observations.eventDate),
      "Choose the event date.",
    ),
    check(
      "event-location",
      "Venue or location",
      observations.eventLabel.trim().length > 0,
      "Name the venue or location.",
    ),
    check(
      "host-device",
      "Host device",
      observations.hostDevice.trim().length > 0,
      "Record the host device, OS and browser.",
    ),
    check(
      "physical",
      "Physical evidence",
      observations.runKind === "physical",
      "Choose Physical phones.",
    ),
    check(
      "outcome",
      "PASS outcome",
      observations.outcome === "pass",
      "Choose PASS only if this run passed.",
    ),
    check(
      "no-repair",
      "No live repair",
      observations.sqlStateEdits === "none",
      "Confirm that no SQL or state edit was used.",
    ),
    check(
      "secrets",
      "No secret incident",
      observations.secretIncident === "none",
      "Classify secret exposure for this run.",
    ),
    check(
      "handoff",
      "Backup host",
      observations.hostHandoff === "verified",
      "Verify the trusted backup host device.",
    ),
    check(
      "host-network-switch",
      "Host network switch",
      observations.physicalReliability.hostNetworkSwitch === "passed",
      "Switch the host from Wi-Fi to mobile data, Resync, and confirm the same live room.",
    ),
    check(
      "backup-takeover",
      "Backup takeover",
      observations.physicalReliability.backupTakeover === "passed",
      "Power off the primary host and confirm the trusted backup retains the live state.",
    ),
    check(
      "player-background-resume",
      "Player background and resume",
      observations.physicalReliability.playerBackgroundResume === "passed",
      "Background a player for two minutes and confirm the same identity and live phase return.",
    ),
    check(
      "host-refresh-recovery",
      "Host refresh recovery",
      observations.physicalReliability.hostRefreshRecovery === "passed",
      "Refresh the host in the lobby and an active game, then confirm control and state return.",
    ),
    check(
      "late-join-across-acts",
      "Late join across acts",
      observations.physicalReliability.lateJoinAcrossActs === "passed",
      "Late-join a phone in every live act and confirm existing secrets stay unchanged.",
    ),
    check(
      "team-switch-integrity",
      "Team-switch integrity",
      observations.physicalReliability.teamSwitchIntegrity === "passed",
      "Switch a team in the lobby and confirm the player identity and score ledger stay intact.",
    ),
    check(
      "media-permission-recovery",
      "Media permission recovery",
      observations.physicalReliability.mediaPermissionRecovery === "passed",
      "Deny then allow camera and microphone, and confirm retry or safe phase skip works.",
    ),
    check(
      "pacing",
      "Pacing reviewed",
      observations.pacingReviewed,
      "Confirm the route pacing review.",
    ),
    check(
      "host-experience",
      "Host experience classified",
      observations.hostExperience !== "unknown",
      "Classify the host as first-time or returning.",
    ),
    check(
      "host-autonomy",
      "Independent host",
      observations.hostAutonomy === "independent",
      "Confirm whether the host needed runbook or human prompting.",
    ),
    check(
      "launch-sequence",
      "Launch sequence captured",
      observations.launchSignalsObserved.includes("INVITE.") &&
        observations.launchSignalsObserved.includes("START."),
      "This run lacks automatic INVITE. and START. evidence; keep it pending or mark it FAIL.",
    ),
    check(
      "launch-signal",
      "Launch signal followed",
      observations.launchSignalResult === "followed",
      "Classify whether the visible launch signal was followed without prompting.",
    ),
    check(
      "story-seed",
      "Tonight's thread configured",
      storySeedConfigured,
      "Use one public Tonight's thread for this run.",
    ),
    check(
      "game-callback",
      "Game callback",
      observations.storyCallbackInGame === "observed",
      "Classify the in-game Tonight's-thread callback.",
    ),
    check(
      "finale-callback",
      "Finale callback",
      observations.storyCallbackInFinale === "observed",
      "Classify the finale Tonight's-thread callback.",
    ),
    check(
      "story-safety",
      "Story safety",
      observations.storySafety === "safe",
      "Confirm that the thread caused no instruction following or safety weakening.",
    ),
    check(
      "provider-cost",
      "Provider cost",
      parseObservedProviderCost(observations.estimatedProviderCost) !== null,
      "Enter a positive provider cost with DKK, EUR or USD.",
    ),
    check(
      "prepared-launch",
      "Prepared launch measured",
      observations.preparedLaunchNotes.trim().length > 0,
      "Record the prepared launch wait before and after preparation.",
    ),
  ];
  const passedCount = checks.filter((item) => item.passed).length;
  return {
    complete: passedCount === checks.length,
    passedCount,
    totalCount: checks.length,
    nextAction: checks.find((item) => !item.passed)?.action ?? null,
    checks,
  };
}
