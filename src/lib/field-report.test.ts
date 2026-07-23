import { describe, expect, test } from "bun:test";
import { buildQuickStartRoomState } from "./quick-start";
import type { ScoreEventView, ScoreLedgerSummary } from "./score-events";
import {
  buildEmptyFieldReportPhysicalReliability,
  buildFieldReport,
  formatFieldReportMarkdown,
  mergeFieldReportLaunchSignals,
  normalizeFieldReportLaunchSignals,
} from "./field-report";

const PASSED_PHYSICAL_RELIABILITY = {
  hostNetworkSwitch: "passed",
  backupTakeover: "passed",
  playerBackgroundResume: "passed",
  hostRefreshRecovery: "passed",
  lateJoinAcrossActs: "passed",
  teamSwitchIntegrity: "passed",
  mediaPermissionRecovery: "passed",
} as const;

const PRIVATE_SENTINELS = [
  "PRIVATE_HOST_NAME",
  "PRIVATE_PLAYER_NAME",
  "PRIVATE_PLAYER_ID",
  "PRIVATE_TEAM_NAME",
  "PRIVATE_TEAM_ID",
  "PRIVATE_USAGE_KEY",
  "PRIVATE_OPERATION",
  "PRIVATE_CACHE_KEY",
  "PRIVATE_SCORE_REASON",
  "PRIVATE_RUBRIC",
  "PRIVATE_EVIDENCE_DETAIL",
  "PRIVATE_MEDIA_URL",
  "PRIVATE_STORY_SEED",
];

describe("field-test report", () => {
  test("keeps a bounded first-seen launch-signal sequence", () => {
    expect(
      normalizeFieldReportLaunchSignals(["CHECK.", "INVITE.", "CHECK.", "not-a-signal", "START."]),
    ).toEqual(["CHECK.", "INVITE.", "START."]);
    expect(mergeFieldReportLaunchSignals(["INVITE.", "START."], ["CHECK.", "START."])).toEqual([
      "INVITE.",
      "START.",
      "CHECK.",
    ]);
  });

  test("exports durable launch, duration, device, AI and score evidence", () => {
    const state = buildQuickStartRoomState(
      "PRIVATE_HOST_NAME",
      {
        venue: "park",
        targetDurationMinutes: 120,
        expectedPlayers: 8,
        storySeed: "PRIVATE_STORY_SEED",
      },
      1_000,
    );
    state.status = "finished";
    state.quickStart = { ...state.quickStart!, startedAt: 31_000, finishedAt: 7_231_000 };
    state.runOfShow!.completedStepIds = ["park-arrival-120", "park-soundscape-120"];
    state.players = Array.from({ length: 8 }, (_, index) => ({
      id: index === 0 ? "PRIVATE_PLAYER_ID" : `player-${index}`,
      name: index === 0 ? "PRIVATE_PLAYER_NAME" : `Player ${index}`,
      teamId: index === 0 ? "PRIVATE_TEAM_ID" : index % 2 ? "lake" : "forest",
      joinedAt: index === 7 ? 21_000 : 1_000 + index,
      deviceCheck: {
        camera: index === 7 ? ("denied" as const) : ("ready" as const),
        microphone: "ready" as const,
        checkedAt: 2_000 + index,
      },
    }));
    state.teams[0]!.name = "PRIVATE_TEAM_NAME";
    state.teams[0]!.score = 12;
    state.party = { ...state.party!, aiMode: "manual" };
    state.aiRuntime = {
      limitCredits: 120,
      usedCredits: 9,
      inputTokens: 400,
      outputTokens: 100,
      providerRequests: 3,
      failedOperations: 1,
      blockedOperations: 2,
      manualFallbackActivations: 1,
      manualFallbackTotalMs: 60_000,
      manualFallbackStartedAt: 7_171_000,
      recentUsage: [
        {
          key: "PRIVATE_USAGE_KEY",
          kind: "vision",
          operation: "PRIVATE_OPERATION",
          credits: 9,
          status: "succeeded",
          createdAt: 2_000,
          inputTokens: 400,
          outputTokens: 100,
          providerRequests: 3,
        },
      ],
      prepared: {
        smokescreen: {
          cacheKey: "PRIVATE_CACHE_KEY",
          gameId: "smokescreen",
          targetActId: "grill",
          participantCount: 8,
          preparedAt: 4_000,
          usedFallback: false,
        },
      },
    };
    state.finale = {
      evidenceVersion: 1,
      evidenceCapturedAt: 7_231_000,
      evidence: [
        {
          id: "challenge:1",
          gameId: "challenge",
          title: "Public title",
          detail: "PRIVATE_EVIDENCE_DETAIL https://example.invalid/PRIVATE_MEDIA_URL",
        },
      ],
      narrative: {
        version: 1,
        headline: "A private finale should not be copied into diagnostics",
        opening: "Opening",
        callbacks: [],
        closingToast: "Closing",
      },
    };

    const scoreSummary: ScoreLedgerSummary = {
      eventCount: 1,
      totalPoints: 12,
      teamTotals: [
        {
          id: "PRIVATE_TEAM_ID",
          total: 12,
          eventCount: 1,
          byAct: { grill: 12 },
          bySource: { deterministic: 12 },
        },
      ],
      playerTotals: [
        {
          id: "PRIVATE_PLAYER_ID",
          total: 12,
          eventCount: 1,
          byAct: { grill: 12 },
          bySource: { deterministic: 12 },
        },
      ],
      byAct: { grill: 12 },
      bySource: { deterministic: 12 },
    };
    const scoreEvents: ScoreEventView[] = [
      {
        id: "score-event-1",
        runId: "run-1",
        gameId: "challenge",
        actId: "grill",
        teamId: "PRIVATE_TEAM_ID",
        playerId: "PRIVATE_PLAYER_ID",
        points: 12,
        reason: "PRIVATE_SCORE_REASON",
        source: "deterministic",
        rubric: { secret: "PRIVATE_RUBRIC" },
        createdAt: new Date(3_000).toISOString(),
      },
    ];

    const report = buildFieldReport({
      roomCode: "AB12",
      state,
      generatedAt: 7_291_000,
      releaseHealth: {
        status: "ready",
        checks: { privateMemory: true, scoreLedger: true, storage: true, ai: true },
      },
      scoreSummary,
      scoreEvents,
      observations: {
        eventDate: "2026-07-17",
        eventLabel: "2026-07-17 · Test park",
        hostDevice: "iPhone · Safari",
        runKind: "physical",
        sqlStateEdits: "none",
        secretIncident: "none",
        hostHandoff: "verified",
        hostExperience: "first-time",
        hostAutonomy: "independent",
        launchSignalResult: "followed",
        launchSignalsObserved: ["CHECK.", "INVITE.", "START."],
        storyCallbackInGame: "observed",
        storyCallbackInFinale: "observed",
        storySafety: "safe",
        physicalReliability: PASSED_PHYSICAL_RELIABILITY,
        pacingReviewed: true,
        estimatedProviderCost: "2.40 DKK",
        preparedLaunchNotes: "4.2s before / 0.3s after",
        outcome: "pass",
      },
    });

    expect(report.schemaVersion).toBe(5);
    expect(report.program.rosterReadySeconds).toBe(20);
    expect(report.program.launchSeconds).toBe(30);
    expect(report.program.launchedWithinTwoMinutes).toBe(true);
    expect(report.program.storySeedConfigured).toBe(true);
    expect(report.program.actualDurationMinutes).toBe(120);
    expect(report.program.completedStepCount).toBe(2);
    expect(report.devices).toEqual({ total: 8, checked: 8, ready: 7, blocked: 1 });
    expect(report.ai.manualFallbackMinutes).toBe(3);
    expect(report.ai.recentCountByKind.vision).toBe(1);
    expect(report.ai.preparedDecksReadyAtExport).toBe(1);
    expect(report.scoring.duplicateListedEventIds).toBe(false);
    expect(report.scoring.ledgerToPublicDifference).toBe(0);
    expect(report.scoring.listedEventCountByGame).toEqual({ challenge: 1 });
    expect(report.event.outcome).toBe("pass");
    expect(report.event.date).toBe("2026-07-17");
    expect(report.event.runKind).toBe("physical");
    expect(report.observations).toEqual({
      failureNotes: "",
      sqlStateEdits: "none",
      secretIncident: "none",
      hostHandoff: "verified",
      hostExperience: "first-time",
      hostAutonomy: "independent",
      launchSignalResult: "followed",
      launchSignalsObserved: ["CHECK.", "INVITE.", "START."],
      storyCallbackInGame: "observed",
      storyCallbackInFinale: "observed",
      storySafety: "safe",
      physicalReliability: PASSED_PHYSICAL_RELIABILITY,
      pacingReviewed: true,
    });

    const serialized = JSON.stringify(report);
    const markdown = formatFieldReportMarkdown(report);
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized.includes(sentinel)).toBe(false);
      expect(markdown.includes(sentinel)).toBe(false);
    }
    expect(markdown).toContain("Room to 8-player roster: 20 seconds");
    expect(markdown).toContain("Event date: 2026-07-17");
    expect(markdown).toContain("Room to first live cue: 30 seconds");
    expect(markdown).toContain("Estimated provider cost: 2.40 DKK");
    expect(markdown).toContain("Host experience / autonomy: first-time / independent");
    expect(markdown).toContain("Launch signals observed: CHECK. then INVITE. then START.");
    expect(markdown).toContain("Launch signal result: followed");
    expect(markdown).toContain("Tonight's thread callback in game / finale: observed / observed");
    expect(markdown).toContain("Host network switch: passed");
  });

  test("exports an explicitly incomplete score section when the ledger cannot be read", () => {
    const state = buildQuickStartRoomState(
      "Host",
      { venue: "home", targetDurationMinutes: 180, expectedPlayers: 12 },
      1_000,
    );
    const report = buildFieldReport({ roomCode: "home-1", state, generatedAt: 2_000 });

    expect(report.scoring.ledgerAvailable).toBe(false);
    expect(report.scoring.ledgerEventCount).toBeNull();
    expect(report.program.rosterReadySeconds).toBeNull();
    expect(report.program.launchSeconds).toBeNull();
    expect(report.event.roomCode).toBe("HOME1");
    expect(report.event.runKind).toBe("unclassified");
    expect(report.event.date).toBe("");
    expect(report.program.storySeedConfigured).toBe(false);
    expect(report.observations.sqlStateEdits).toBe("unknown");
    expect(report.observations.hostHandoff).toBe("unknown");
    expect(report.observations.hostExperience).toBe("unknown");
    expect(report.observations.storySafety).toBe("unknown");
    expect(report.observations.physicalReliability).toEqual(
      buildEmptyFieldReportPhysicalReliability(),
    );
    expect(formatFieldReportMarkdown(report)).toContain("Outcome: PENDING");
  });
});
