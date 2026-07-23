import { describe, expect, test } from "bun:test";
import { mergeHostSubmittedState } from "./host-auth.server";
import { emptyRoomState, type RoomState } from "./types";

function baseState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    ...emptyRoomState("Host"),
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    ...overrides,
  };
}

describe("mergeHostSubmittedState", () => {
  test("preserves players who joined after the host snapshot was rendered", () => {
    const submitted = baseState({
      status: "playing",
      currentGame: "trackguess",
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
      trackguess: {
        phase: "briefing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: [],
      },
    });
    const current = baseState({
      players: [
        { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1, secretHash: "hash-p1" },
        { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2, secretHash: "hash-p2" },
      ],
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.currentGame).toBe("trackguess");
    expect(merged.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(merged.players.find((player) => player.id === "p1")?.secretHash).toBe("hash-p1");
    expect(merged.players.find((player) => player.id === "p2")?.secretHash).toBe("hash-p2");
  });

  test("preserves a newer server-authoritative device check during a stale host write", () => {
    const submitted = baseState({
      players: [
        {
          id: "p1",
          name: "Ada",
          teamId: "forest",
          joinedAt: 1,
          secretHash: "hash-p1",
          deviceCheck: { camera: "denied", microphone: "denied", checkedAt: 100 },
        },
      ],
    });
    const current = baseState({
      players: [
        {
          id: "p1",
          name: "Ada",
          teamId: "forest",
          joinedAt: 1,
          secretHash: "hash-p1",
          deviceCheck: { camera: "ready", microphone: "ready", checkedAt: 200 },
        },
      ],
    });

    expect(mergeHostSubmittedState(current, submitted).players[0]?.deviceCheck).toEqual(
      current.players[0]?.deviceCheck,
    );
  });

  test("keeps newer speaker heartbeats from the current room state", () => {
    const submitted = baseState({
      speakerSlots: {
        1: { connected: true, name: "Main Stage", lastSeenAt: 100 },
        2: { connected: true, name: "Oak Spirit", lastSeenAt: 100 },
      },
    });
    const current = baseState({
      speakerSlots: {
        1: { connected: true, name: "Main Stage", lastSeenAt: 110 },
        2: { connected: true, name: "Oak Spirit", lastSeenAt: 200 },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.speakerSlots[1]?.lastSeenAt).toBe(110);
    expect(merged.speakerSlots[2]?.lastSeenAt).toBe(200);
  });

  test("preserves server command receipts during legacy full-state writes", () => {
    const submitted = baseState({ recentHostCommandIds: ["cmd_00000001"] });
    const current = baseState({
      recentHostCommandIds: ["cmd_00000001", "cmd_00000002"],
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.recentHostCommandIds).toEqual(["cmd_00000001", "cmd_00000002"]);
  });

  test("preserves server-owned field timing and AI telemetry during a stale full-state write", () => {
    const submitted = baseState({
      status: "playing",
      quickStart: {
        venue: "park",
        targetDurationMinutes: 120,
        expectedPlayers: 8,
        configuredAt: 100,
      },
      party: { ...emptyRoomState().party!, aiMode: "auto" },
      aiRuntime: {
        limitCredits: 120,
        usedCredits: 0,
        inputTokens: 0,
        outputTokens: 0,
        providerRequests: 0,
        failedOperations: 0,
        blockedOperations: 0,
        manualFallbackActivations: 0,
        manualFallbackTotalMs: 0,
        recentUsage: [],
      },
    });
    const current = baseState({
      status: "finished",
      quickStart: {
        venue: "park",
        targetDurationMinutes: 120,
        expectedPlayers: 8,
        configuredAt: 100,
        startedAt: 200,
        finishedAt: 7_200_200,
      },
      party: { ...emptyRoomState().party!, aiMode: "manual" },
      aiRuntime: {
        limitCredits: 120,
        usedCredits: 19,
        inputTokens: 500,
        outputTokens: 120,
        providerRequests: 4,
        failedOperations: 1,
        blockedOperations: 2,
        manualFallbackActivations: 1,
        manualFallbackTotalMs: 60_000,
        recentUsage: [],
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.status).toBe("finished");
    expect(merged.party?.aiMode).toBe("manual");
    expect(merged.quickStart).toBe(current.quickStart);
    expect(merged.aiRuntime).toBe(current.aiRuntime);
  });

  test("preserves a server-started route cue during a stale full-state write", () => {
    const submitted = baseState({
      runOfShow: {
        experienceId: "house-party",
        contingency: "normal",
        completedStepIds: [],
      },
    });
    const current = baseState({
      runOfShow: {
        experienceId: "house-party",
        contingency: "normal",
        completedStepIds: ["home-arrival-180"],
        activeStepId: "home-snack-reset-180",
        activeStepStartedAt: 2_000,
      },
    });

    expect(mergeHostSubmittedState(current, submitted).runOfShow).toEqual(current.runOfShow);
  });

  test("preserves a server-authored finale during a stale full-state write", () => {
    const submitted = baseState({ status: "finished" });
    const current = baseState({
      status: "finished",
      finale: {
        evidenceVersion: 1,
        evidenceCapturedAt: 1_000,
        evidence: [],
        narrative: {
          version: 1,
          headline: "Server finale",
          opening: "The room kept the receipts.",
          callbacks: [],
          closingToast: "To the witnesses.",
        },
        generatedAt: 2_000,
        usedFallback: false,
      },
    });

    expect(mergeHostSubmittedState(current, submitted).finale).toEqual(current.finale);
  });

  test("preserves server-authoritative Oracle memory during stale full-state writes", () => {
    const submitted = baseState();
    const current = baseState({
      oracleMemory: {
        runId: "oracle_1",
        participantIds: ["p1"],
        submittedPlayerIds: ["p1"],
        verifiedPlayerIds: [],
        status: "sealed",
      },
    });

    expect(mergeHostSubmittedState(current, submitted).oracleMemory).toEqual(current.oracleMemory);
  });

  test("preserves a background Smoke Screen run during stale foreground writes", () => {
    const submitted = baseState({
      currentGame: "challenge",
      challenge: { phase: "briefing", roundId: "challenge_1" },
    });
    const current = baseState({
      smokescreen: {
        runId: "smoke_1",
        status: "revealed",
        participantIds: ["p1", "p2", "p3"],
        assignedPlayerIds: ["p1", "p2", "p3"],
        submittedVoterIds: ["p1"],
        startedAt: 1,
        revealedAt: 2,
      },
    });

    expect(mergeHostSubmittedState(current, submitted).smokescreen).toEqual(current.smokescreen);
  });

  test("preserves a live Contraband case during stale foreground writes", () => {
    const submitted = baseState({
      currentGame: "toastsyndicate",
    });
    const current = baseState({
      contraband: {
        runId: "contraband_1",
        status: "review",
        participantIds: ["p1", "p2", "p3"],
        assignedPlayerIds: ["p1", "p2", "p3"],
        resolvedPlayerIds: [],
        startedAt: 1,
        endsAt: 100,
        activeAccusation: {
          accusationId: "case_1",
          accuserPlayerId: "p1",
          accusedPlayerId: "p2",
          createdAt: 2,
        },
      },
    });

    expect(mergeHostSubmittedState(current, submitted).contraband).toEqual(current.contraband);
  });

  test("preserves a live Tongs testimony during stale foreground writes", () => {
    const submitted = baseState({ currentGame: "grilloracle" });
    const current = baseState({
      tongsoftruth: {
        runId: "tongs_1",
        status: "recording",
        participantIds: ["p1", "p2", "p3"],
        speakerOrder: ["p1", "p2", "p3"],
        roundNumber: 1,
        totalRounds: 3,
        currentRoundId: "tongs_1_r1",
        speakerPlayerId: "p1",
        speakerName: "One",
        level: 1,
        question: "Which plan burned first?",
        recordingEndsAt: 100,
        roundResults: [],
      },
    });

    expect(mergeHostSubmittedState(current, submitted).tongsoftruth).toEqual(current.tongsoftruth);
  });

  test("preserves server-authoritative Cross progress during a stale host pause write", () => {
    const cross = {
      runId: "cross_1",
      status: "capturing" as const,
      participantIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
      pairOrder: [
        {
          pairId: "cross_1_p1",
          playerAId: "p1",
          playerAName: "One",
          playerBId: "p2",
          playerBName: "Two",
        },
      ],
      pairNumber: 1,
      totalPairs: 1,
      currentPairId: "cross_1_p1",
      submittedPlayerIds: ["p1"],
      predictionVoterIds: ["p3"],
      pairResults: [],
      recordingEndsAt: 20_000,
    };
    const current = baseState({ currentGame: "crossexamination", crossexamination: cross });
    const submitted = baseState({
      currentGame: "crossexamination",
      paused: { startedAt: 10_000 },
      crossexamination: {
        ...cross,
        status: "briefing",
        submittedPlayerIds: [],
        predictionVoterIds: [],
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);
    expect(merged.paused?.startedAt).toBe(10_000);
    expect(merged.crossexamination).toEqual(cross);
  });

  test("preserves same-round votes from current state when host submitted a stale snapshot", () => {
    const submitted = baseState({
      currentGame: "trackguess",
      paused: { startedAt: 5000 },
      trackguess: {
        phase: "guessing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real" },
      },
    });
    const current = baseState({
      currentGame: "trackguess",
      trackguess: {
        phase: "guessing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real", p2: "ai" },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.paused?.startedAt).toBe(5000);
    expect(merged.trackguess?.guesses).toEqual({ p1: "real", p2: "ai" });
  });

  test("preserves server-authoritative Toast progress during a stale host pause write", () => {
    const toast = {
      phase: "catching" as const,
      sessionId: "toast_1",
      roundId: "toast_1_r1",
      roundNumber: 1,
      totalRounds: 6,
      speakerPlayerId: "p1",
      speakerName: "Ada",
      genre: "Noir",
      recordingSubmitted: true,
      submittedListenerIds: ["p2"],
      roundResults: [],
    };
    const current = baseState({ currentGame: "toastsyndicate", toastsyndicate: toast });
    const submitted = baseState({
      currentGame: "toastsyndicate",
      paused: { startedAt: 10_000 },
      toastsyndicate: {
        ...toast,
        phase: "recording",
        recordingSubmitted: false,
        submittedListenerIds: [],
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);
    expect(merged.paused?.startedAt).toBe(10_000);
    expect(merged.toastsyndicate).toEqual(toast);
  });

  test("preserves server-authoritative Still Life progress during a stale host pause write", () => {
    const stilllife = {
      phase: "voting" as const,
      sessionId: "still_1",
      roundId: "still_1_r1",
      roundNumber: 1,
      totalRounds: 2,
      activeTeamIds: ["forest", "lake"],
      headline: "The last cucumber leaves",
      submittedTeamIds: ["forest", "lake"],
      submittedVoterIds: ["p1"],
      roundResults: [],
    };
    const current = baseState({ currentGame: "stilllife", stilllife });
    const submitted = baseState({
      currentGame: "stilllife",
      paused: { startedAt: 10_000 },
      stilllife: {
        ...stilllife,
        phase: "building",
        submittedTeamIds: ["forest"],
        submittedVoterIds: [],
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);
    expect(merged.paused?.startedAt).toBe(10_000);
    expect(merged.stilllife).toEqual(stilllife);
  });

  test("preserves anonymous Sommelier progress during a stale host write", () => {
    const sommelier = {
      phase: "voting" as const,
      sessionId: "somm_1",
      participantIds: ["p1", "p2"],
      submittedPlayerIds: ["p1", "p2"],
      currentEntryId: "entry_1",
      currentProfile: {
        drink_guess: "Lager",
        tasting_notes: "Monday",
        owner_profile: "A sufficiently long private portrait that remains anonymous until reveal.",
        pretentiousness: 2,
        pairing_advice: "Fries",
      },
      roundNumber: 1,
      totalRounds: 2,
      submittedVoterIds: ["p2"],
      roundResults: [],
    };
    const current = baseState({ currentGame: "sommelier", sommelier });
    const submitted = baseState({
      currentGame: "sommelier",
      paused: { startedAt: 10_000 },
      sommelier: { ...sommelier, phase: "capture", submittedVoterIds: [] },
    });

    const merged = mergeHostSubmittedState(current, submitted);
    expect(merged.paused?.startedAt).toBe(10_000);
    expect(merged.sommelier).toEqual(sommelier);
  });

  test("preserves same-round Oracle completion written by the player-owned endpoint", () => {
    const oracle = {
      phase: "capturing" as const,
      roundId: "oracle_1",
      participantIds: ["p1", "p2"],
      submittedPlayerIds: ["p1"],
      captureEndsAt: 10_000,
    };
    const submitted = baseState({
      currentGame: "grilloracle",
      grilloracle: oracle,
    });
    const current = baseState({
      currentGame: "grilloracle",
      grilloracle: { ...oracle, submittedPlayerIds: ["p1", "p2"] },
    });

    expect(mergeHostSubmittedState(current, submitted).grilloracle?.submittedPlayerIds).toEqual([
      "p1",
      "p2",
    ]);
  });

  test("does not reopen a completed Oracle round from a stale host screen", () => {
    const submitted = baseState({
      currentGame: "grilloracle",
      grilloracle: {
        phase: "capturing",
        roundId: "oracle_1",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: ["p1"],
        captureEndsAt: 50_000,
      },
    });
    const current = baseState({
      currentGame: "grilloracle",
      grilloracle: {
        phase: "results",
        roundId: "oracle_1",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: ["p1", "p2"],
        captureEndsAt: 12_000,
      },
    });

    const merged = mergeHostSubmittedState(current, submitted).grilloracle;
    expect(merged?.phase).toBe("results");
    expect(merged?.submittedPlayerIds).toEqual(["p1", "p2"]);
    expect(merged?.captureEndsAt).toBe(12_000);
  });

  test("does not merge player votes across a host phase transition", () => {
    const submitted = baseState({
      currentGame: "trackguess",
      trackguess: {
        phase: "reveal",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real" },
        revealEndsAt: 9000,
      },
    });
    const current = baseState({
      currentGame: "trackguess",
      trackguess: {
        phase: "guessing",
        roundId: "tg_1",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: ["track_1"],
        guesses: { p1: "real", p2: "ai" },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.trackguess?.phase).toBe("reveal");
    expect(merged.trackguess?.guesses).toEqual({ p1: "real" });
  });

  test("preserves same-round Spectrum Court clue and appeals from current state", () => {
    const submitted = baseState({
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "appeal",
        roundId: "sc_1",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: ["spicy"],
        guesses: { p1: 40 },
      },
    });
    const current = baseState({
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "appeal",
        roundId: "sc_1",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: ["spicy"],
        clue: "quiet chaos",
        cluePlayerId: "p3",
        guesses: { p1: 40, p2: 64 },
        appeals: { p2: { direction: "higher" } },
      },
    });

    const merged = mergeHostSubmittedState(current, submitted);

    expect(merged.spectrumcourt?.clue).toBe("quiet chaos");
    expect(merged.spectrumcourt?.cluePlayerId).toBe("p3");
    expect(merged.spectrumcourt?.guesses).toEqual({ p1: 40, p2: 64 });
    expect(merged.spectrumcourt?.appeals).toEqual({ p2: { direction: "higher" } });
  });
});
