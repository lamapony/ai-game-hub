import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import {
  launchGrillOracleState,
  launchSmokeScreenState,
  launchChallengeState,
  launchPhotoHuntState,
  launchSoundscapeState,
  launchSpectrumCourtState,
  launchToastSyndicateState,
  launchTrackGuessState,
  launchWhoAmongState,
  markGrillOracleVerifiedState,
  markGrillOracleSubmittedState,
  markSmokeScreenAssignedState,
  markSmokeScreenVotedState,
  finalizeSmokeScreenState,
  transitionSmokeScreenState,
  transitionGrillOracleMemoryState,
  assignToastSyndicateState,
  startToastRecordingState,
  markToastRecordingSubmittedState,
  markToastListenerSubmittedState,
  finalizeToastSyndicateState,
  nextToastSyndicateRoundState,
  launchStillLifeState,
  prepareStillLifeRoundState,
  markStillLifeTeamSubmittedState,
  beginStillLifeJudgingState,
  openStillLifeVotingState,
  markStillLifeVotedState,
  finalizeStillLifeState,
  nextStillLifeRoundState,
  launchSommelierState,
  markSommelierSubmittedState,
  beginSommelierAnalysisState,
  openSommelierVotingState,
  markSommelierVotedState,
  revealSommelierEntryState,
  openSommelierCrowdFavoriteState,
  finalizeSommelierState,
  launchContrabandState,
  markContrabandAssignedState,
  openContrabandAccusationState,
  disputeContrabandAccusationState,
  reviewContrabandAccusationState,
  resolveContrabandAccusationState,
  finalizeContrabandState,
} from "./game-state";
import type { RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "lobby",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 4 },
      { id: "lake", name: "Lake", color: "blue", score: 7 },
    ],
    players: [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
    ],
    currentGame: null,
    speakerSlots: {
      1: { connected: true, name: "Main Stage" },
      2: { connected: false, name: "Oak Spirit" },
      3: { connected: false, name: "The Wind" },
      4: { connected: false, name: "Squirrel Gossip" },
      5: { connected: false, name: "Forest Echo" },
    },
    ...overrides,
  };
}

describe("game state launch helpers", () => {
  test("launchSoundscape starts topics and clears previous game state", () => {
    const state = roomState({
      paused: { startedAt: 100 },
      currentGame: "challenge",
      challenge: { phase: "briefing", roundId: "old-ch" },
      phototunt: { phase: "briefing", roundId: "old-ph" },
      spectrumcourt: {
        phase: "clue",
        roundId: "old-sc",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
      },
    });

    const result = launchSoundscapeState(state, "snd_1");

    expect(result.status).toBe("playing");
    expect(result.currentGame).toBe("soundscape");
    expect(result.paused).toBeUndefined();
    expect(result.soundscape?.phase).toBe("topics");
    expect(result.soundscape?.roundId).toBe("snd_1");
    expect(result.challenge).toBeUndefined();
    expect(result.phototunt).toBeUndefined();
    expect(result.spectrumcourt).toBeUndefined();
    expect(result.teams[0]?.score).toBe(4);
  });

  test("launchChallenge picks a deterministic operator and clears other games", () => {
    const state = roomState({
      currentGame: "soundscape",
      soundscape: { phase: "recording", roundId: "old-snd" },
      phototunt: { phase: "hunting", roundId: "old-ph" },
    });

    const result = launchChallengeState(state, "ch_1", 0.75);

    expect(result?.status).toBe("playing");
    expect(result?.currentGame).toBe("challenge");
    expect(result?.challenge?.phase).toBe("briefing");
    expect(result?.challenge?.roundId).toBe("ch_1");
    expect(result?.challenge?.operatorId).toBe("p2");
    expect(result?.challenge?.operatorName).toBe("Two");
    expect(result?.challenge?.pastOperatorIds?.length).toBe(0);
    expect(result?.soundscape).toBeUndefined();
    expect(result?.phototunt).toBeUndefined();
  });

  test("launchChallenge refuses to start with fewer than two players", () => {
    const state = roomState({
      players: [{ id: "p1", name: "One", teamId: "forest", joinedAt: 1 }],
    });

    expect(launchChallengeState(state, "ch_1")).toBeNull();
  });

  test("launchPhotoHunt starts briefing only when at least one player joined", () => {
    const withPlayer = launchPhotoHuntState(roomState(), "ph_1");
    const withoutPlayers = launchPhotoHuntState(roomState({ players: [] }), "ph_2");

    expect(withPlayer?.status).toBe("playing");
    expect(withPlayer?.currentGame).toBe("phototunt");
    expect(withPlayer?.phototunt?.phase).toBe("briefing");
    expect(withPlayer?.phototunt?.roundId).toBe("ph_1");
    expect(withPlayer?.phototunt?.pastTasks?.length).toBe(0);
    expect(withoutPlayers).toBeNull();
  });

  test("Grill Oracle snapshots participants and only exposes submission progress", () => {
    const launched = launchGrillOracleState(roomState(), "oracle_1", 1_000);

    expect(launched?.currentGame).toBe("grilloracle");
    expect(launched?.grilloracle).toEqual({
      phase: "capturing",
      roundId: "oracle_1",
      participantIds: ["p1", "p2"],
      submittedPlayerIds: [],
      captureEndsAt: 901_000,
    });
    expect(launched?.oracleMemory).toEqual({
      runId: "oracle_1",
      participantIds: ["p1", "p2"],
      submittedPlayerIds: [],
      verifiedPlayerIds: [],
      status: "collecting",
    });
    expect(launchGrillOracleState(roomState({ players: [] }), "oracle_2", 1_000)).toBeNull();
  });

  test("Grill Oracle submission is idempotent and closes after every participant", () => {
    const launched = launchGrillOracleState(roomState(), "oracle_1", 1_000)!;
    const first = markGrillOracleSubmittedState(launched, "oracle_1", "p1")!;
    const replay = markGrillOracleSubmittedState(first, "oracle_1", "p1");
    const complete = markGrillOracleSubmittedState(first, "oracle_1", "p2")!;

    expect(first.grilloracle?.submittedPlayerIds).toEqual(["p1"]);
    expect(first.oracleMemory?.status).toBe("collecting");
    expect(replay).toBe(first);
    expect(complete.grilloracle?.phase).toBe("results");
    expect(complete.grilloracle?.submittedPlayerIds).toEqual(["p1", "p2"]);
    expect(complete.oracleMemory?.status).toBe("ready");
    expect(markGrillOracleSubmittedState(first, "wrong", "p2")).toBeNull();
    expect(markGrillOracleSubmittedState(first, "oracle_1", "outsider")).toBeNull();
  });

  test("Grill Oracle memory moves monotonically through seal, reveal and verification", () => {
    const launched = launchGrillOracleState(roomState(), "oracle_1", 1_000)!;
    const captured = markGrillOracleSubmittedState(
      markGrillOracleSubmittedState(launched, "oracle_1", "p1")!,
      "oracle_1",
      "p2",
    )!;
    const sealed = transitionGrillOracleMemoryState(captured, {
      runId: "oracle_1",
      status: "sealed",
    })!;
    const revealed = transitionGrillOracleMemoryState(sealed, {
      runId: "oracle_1",
      status: "revealed",
    })!;
    const oneVerified = markGrillOracleVerifiedState(revealed, "oracle_1", "p1")!;
    const allVerified = markGrillOracleVerifiedState(oneVerified, "oracle_1", "p2")!;

    expect(sealed.oracleMemory?.status).toBe("sealed");
    expect(revealed.oracleMemory?.status).toBe("revealed");
    expect(oneVerified.oracleMemory?.status).toBe("revealed");
    expect(oneVerified.oracleMemory?.verifiedPlayerIds).toEqual(["p1"]);
    expect(allVerified.oracleMemory?.status).toBe("verified");
    expect(allVerified.oracleMemory?.verifiedPlayerIds).toEqual(["p1", "p2"]);
    expect(
      transitionGrillOracleMemoryState(allVerified, {
        runId: "oracle_1",
        status: "sealed",
      }),
    ).toBe(allVerified);
    expect(markGrillOracleVerifiedState(sealed, "oracle_1", "p1")).toBeNull();
  });

  test("Smoke Screen starts beside a foreground game and keeps only public progress", () => {
    const foreground = launchChallengeState(
      roomState({
        players: [
          ...roomState().players,
          { id: "p3", name: "Three", teamId: "forest", joinedAt: 3 },
        ],
      }),
      "ch_1",
      0,
    )!;
    const launched = launchSmokeScreenState(foreground, "smoke_1", 1_000)!;

    expect(launched.currentGame).toBe("challenge");
    expect(launched.challenge?.roundId).toBe("ch_1");
    expect(launched.smokescreen).toEqual({
      runId: "smoke_1",
      status: "assigning",
      participantIds: ["p1", "p2", "p3"],
      assignedPlayerIds: [],
      submittedVoterIds: [],
      startedAt: 1_000,
    });
    expect(JSON.stringify(launched.smokescreen).includes("mission")).toBe(false);
    expect(launchSmokeScreenState(roomState({ players: [] }), "smoke_2", 1_000)).toBeNull();
  });

  test("Smoke Screen lifecycle is monotonic and records only voter ids before results", () => {
    const withThree = roomState({
      party: contextForExperience("smoke-neon-norrebro", "normal"),
      players: [...roomState().players, { id: "p3", name: "Three", teamId: "forest", joinedAt: 3 }],
    });
    const launched = launchSmokeScreenState(withThree, "smoke_1", 1_000)!;
    const active = markSmokeScreenAssignedState(launched, "smoke_1", ["p1", "p2", "p3"])!;
    const sealed = transitionSmokeScreenState(active, {
      runId: "smoke_1",
      status: "sealed",
    })!;
    const revealed = transitionSmokeScreenState(sealed, {
      runId: "smoke_1",
      status: "revealed",
      now: 2_000,
    })!;
    const voted = markSmokeScreenVotedState(revealed, "smoke_1", "p1")!;
    const replay = markSmokeScreenVotedState(voted, "smoke_1", "p1");
    const finished = finalizeSmokeScreenState(voted, {
      runId: "smoke_1",
      results: [
        {
          missionId: "m1",
          ownerPlayerId: "p1",
          tier: 1,
          completed: true,
          caught: false,
          correctDetectiveIds: [],
          ownerPoints: 5,
        },
      ],
      recap: "The smoke cleared.",
      aiFallback: false,
      now: 3_000,
    })!;

    expect(active.smokescreen?.status).toBe("active");
    expect(sealed.smokescreen?.status).toBe("sealed");
    expect(revealed.smokescreen?.revealedAt).toBe(2_000);
    expect(voted.smokescreen?.submittedVoterIds).toEqual(["p1"]);
    expect(replay).toBe(voted);
    expect(finished.smokescreen?.status).toBe("results");
    expect(finished.smokescreen?.completedAt).toBe(3_000);
    expect(finished.finale?.evidence.at(-1)?.gameId).toBe("smokescreen");
    expect(finished.party?.storyEvidence?.at(-1)?.gameId).toBe("smokescreen");
    expect(
      finalizeSmokeScreenState(finished, {
        runId: "smoke_1",
        results: [],
        recap: "Ignored retry payload.",
        aiFallback: true,
        now: 4_000,
      }),
    ).toBe(finished);
    expect(transitionSmokeScreenState(finished, { runId: "smoke_1", status: "sealed" })).toBe(
      finished,
    );
  });

  test("Contraband runs beside foreground games without exposing phrases or context", () => {
    const withThree = roomState({
      players: [...roomState().players, { id: "p3", name: "Three", teamId: "forest", joinedAt: 3 }],
    });
    const foreground = launchChallengeState(withThree, "challenge_1", 0)!;
    const launched = launchContrabandState(foreground, "contraband_1", 1_000)!;
    const active = markContrabandAssignedState(
      launched,
      "contraband_1",
      ["p1", "p2", "p3"],
      2_000,
    )!;
    const accused = openContrabandAccusationState(active, {
      runId: "contraband_1",
      accusationId: "case_1",
      accuserPlayerId: "p1",
      accusedPlayerId: "p2",
      now: 3_000,
    })!;
    const recording = disputeContrabandAccusationState(accused, "contraband_1", "case_1", 4_000)!;
    const review = reviewContrabandAccusationState(recording, "contraband_1", "case_1")!;
    const resolved = resolveContrabandAccusationState(review, {
      runId: "contraband_1",
      accusationId: "case_1",
      outcome: "false-accusation",
    })!;

    expect(launched.currentGame).toBe("challenge");
    expect(active.contraband?.endsAt).toBe(2_000 + 30 * 60_000);
    expect(recording.contraband?.activeAccusation?.audioEndsAt).toBe(94_000);
    expect(resolved.contraband?.resolvedPlayerIds).toEqual([]);
    expect(resolved.contraband?.status).toBe("active");
    expect(/phrase|quote|transcript|storage/i.test(JSON.stringify(accused.contraband))).toBe(false);
  });

  test("Contraband resolves real cargo once and reveals phrases only in results", () => {
    const withThree = roomState({
      party: contextForExperience("smoke-neon-norrebro", "normal"),
      players: [...roomState().players, { id: "p3", name: "Three", teamId: "forest", joinedAt: 3 }],
    });
    const active = markContrabandAssignedState(
      launchContrabandState(withThree, "contraband_1", 1_000)!,
      "contraband_1",
      ["p1", "p2", "p3"],
      2_000,
    )!;
    const accused = openContrabandAccusationState(active, {
      runId: "contraband_1",
      accusationId: "case_1",
      accuserPlayerId: "p1",
      accusedPlayerId: "p2",
      now: 3_000,
    })!;
    const resolved = resolveContrabandAccusationState(accused, {
      runId: "contraband_1",
      accusationId: "case_1",
      outcome: "caught",
    })!;
    const results = [
      {
        playerId: "p1",
        playerName: "One",
        phrase: "The spoon decided",
        outcome: "survived" as const,
        points: 10,
      },
      {
        playerId: "p2",
        playerName: "Two",
        phrase: "I trust ducks",
        outcome: "caught" as const,
        points: 0,
      },
      {
        playerId: "p3",
        playerName: "Three",
        phrase: "The olives formed a coalition",
        outcome: "survived" as const,
        points: 10,
      },
    ];
    const finished = finalizeContrabandState(resolved, {
      runId: "contraband_1",
      results,
      now: 9_000,
    })!;

    expect(resolved.contraband?.resolvedPlayerIds).toEqual(["p2"]);
    expect(finished.contraband?.status).toBe("results");
    expect(finished.contraband?.results).toEqual(results);
    expect(finished.finale?.evidence.at(-1)?.gameId).toBe("contraband");
    expect(finished.party?.storyEvidence?.at(-1)?.gameId).toBe("contraband");
    expect(
      finalizeContrabandState(finished, {
        runId: "contraband_1",
        results: [],
        now: 10_000,
      }),
    ).toBe(finished);
  });

  test("Toast Syndicate keeps contraband out of public state and advances six rounds", () => {
    const withThree = roomState({
      players: [...roomState().players, { id: "p3", name: "Three", teamId: "forest", joinedAt: 3 }],
    });
    const launched = launchToastSyndicateState(withThree, "toast_1", 0)!;
    expect(launched.currentGame).toBe("toastsyndicate");
    expect(launched.toastsyndicate?.roundId).toBe("toast_1_r1");
    expect(launched.toastsyndicate?.totalRounds).toBe(6);
    expect(JSON.stringify(launched.toastsyndicate).includes("words")).toBe(false);

    const assigned = assignToastSyndicateState(launched, {
      roundId: "toast_1_r1",
      genre: "Нуар",
      genreInstructions: "Говори как детектив.",
      aiFallback: false,
      now: 1_000,
    })!;
    const recording = startToastRecordingState(assigned, "toast_1_r1", 2_000)!;
    const catching = markToastRecordingSubmittedState(recording, "toast_1_r1", 3_000)!;
    const voted = markToastListenerSubmittedState(catching, "toast_1_r1", "p2")!;
    const result = {
      roundId: "toast_1_r1",
      speakerPlayerId: "p1",
      genre: "Нуар",
      transcript: "Тост",
      genreScore: 7,
      words: [],
      speakerPoints: 7,
      listenerPoints: {},
      comment: "Принято.",
    };
    const finished = finalizeToastSyndicateState(voted, "toast_1_r1", result)!;
    const next = nextToastSyndicateRoundState(finished, "toast_1_r1", 0)!;

    expect(recording.toastsyndicate?.phase).toBe("recording");
    expect(catching.toastsyndicate?.phase).toBe("catching");
    expect(voted.toastsyndicate?.submittedListenerIds).toEqual(["p2"]);
    expect(finished.toastsyndicate?.phase).toBe("results");
    expect(next.toastsyndicate?.roundId).toBe("toast_1_r2");
    expect(next.toastsyndicate?.speakerPlayerId === "p1").toBe(false);
  });

  test("Still Life snapshots active teams and advances a two-lot public lifecycle", () => {
    const launched = launchStillLifeState(roomState(), "still_1")!;
    expect(launched.currentGame).toBe("stilllife");
    expect(launched.stilllife?.activeTeamIds).toEqual(["forest", "lake"]);
    expect(launched.stilllife?.roundId).toBe("still_1_r1");
    expect(
      launchStillLifeState(roomState({ players: [roomState().players[0]!] }), "one"),
    ).toBeNull();

    const building = prepareStillLifeRoundState(launched, {
      roundId: "still_1_r1",
      headline: "Последний огурец покидает лодку",
      aiFallback: false,
      now: 1_000,
    })!;
    const forest = markStillLifeTeamSubmittedState(building, "still_1_r1", "forest")!;
    const replay = markStillLifeTeamSubmittedState(forest, "still_1_r1", "forest");
    const complete = markStillLifeTeamSubmittedState(forest, "still_1_r1", "lake")!;
    const judging = beginStillLifeJudgingState(complete, "still_1_r1")!;
    const judgments = [
      {
        teamId: "forest",
        teamName: "Forest",
        compositionScore: 8,
        dramaScore: 9,
        materialScore: 5,
        points: 22,
        catalogTitle: "Огурец. Исход. Фольга",
        auctionPriceDkk: 1_240_750,
        critique: "Наклон принят.",
        audienceVotes: 0,
        aiFallback: false,
        manualOverride: false,
      },
      {
        teamId: "lake",
        teamName: "Lake",
        compositionScore: 7,
        dramaScore: 9,
        materialScore: 5,
        points: 21,
        catalogTitle: "Лодка не отвечает",
        auctionPriceDkk: 900_000,
        critique: "Фольга молчит.",
        audienceVotes: 0,
        aiFallback: false,
        manualOverride: false,
      },
    ];
    const voting = openStillLifeVotingState(judging, {
      roundId: "still_1_r1",
      judgments,
      now: 2_000,
    })!;
    const voted = markStillLifeVotedState(voting, "still_1_r1", "p1")!;
    const result = {
      roundId: "still_1_r1",
      headline: building.stilllife!.headline!,
      entries: judgments,
      winningTeamIds: ["forest"],
    };
    const finished = finalizeStillLifeState(voted, "still_1_r1", result)!;
    const next = nextStillLifeRoundState(finished, "still_1_r1")!;

    expect(building.stilllife?.phase).toBe("building");
    expect(building.stilllife?.buildingEndsAt).toBe(301_000);
    expect(replay).toBe(forest);
    expect(voting.stilllife?.phase).toBe("voting");
    expect(voted.stilllife?.submittedVoterIds).toEqual(["p1"]);
    expect(finished.stilllife?.result?.winningTeamIds).toEqual(["forest"]);
    expect(next.stilllife?.roundId).toBe("still_1_r2");
    expect(next.stilllife?.roundResults).toHaveLength(1);
  });

  test("Sommelier keeps owners private until reveal and ends with one crowd favorite", () => {
    const threePlayers = roomState({
      players: [...roomState().players, { id: "p3", name: "Three", teamId: "forest", joinedAt: 3 }],
    });
    const launched = launchSommelierState(threePlayers, "somm_1", 0, 1_000)!;
    const p1 = markSommelierSubmittedState(launched, "somm_1", "p1")!;
    const p2 = markSommelierSubmittedState(p1, "somm_1", "p2")!;
    const analyzing = beginSommelierAnalysisState(p2, "somm_1")!;
    const profile = {
      drink_guess: "A lager refusing glassware",
      tasting_notes: "Notes of Monday and respectable carbonation",
      owner_profile:
        "This person has one excellent thread saved as research. Messages arrive six hours late. The confidence is immediate and the evidence is taking the bus.",
      pretentiousness: 2,
      pairing_advice: "Pairs with a story from 2019",
    };
    const voting = openSommelierVotingState(analyzing, {
      sessionId: "somm_1",
      entryId: "entry_1",
      profile,
      aiFallback: false,
      roundNumber: 1,
      totalRounds: 2,
      now: 2_000,
    })!;
    const voted = markSommelierVotedState(voting, {
      sessionId: "somm_1",
      entryId: "entry_1",
      playerId: "p2",
    })!;
    const roundResult = {
      entryId: "entry_1",
      ownerPlayerId: "p1",
      ownerPlayerName: "One",
      ownerTeamId: "forest",
      profile,
      correctGuesserIds: ["p2"],
      ballotCount: 1,
      ownerPoints: 0,
      guesserPoints: { p2: 3 },
      aiFallback: false,
    };
    const revealed = revealSommelierEntryState(voted, "somm_1", roundResult)!;
    const secondVoting = openSommelierVotingState(revealed, {
      sessionId: "somm_1",
      entryId: "entry_2",
      profile,
      aiFallback: true,
      roundNumber: 2,
      totalRounds: 2,
      now: 4_000,
    })!;
    const secondResult = { ...roundResult, entryId: "entry_2", correctGuesserIds: [] };
    const secondReveal = revealSommelierEntryState(secondVoting, "somm_1", secondResult)!;
    const favorite = openSommelierCrowdFavoriteState(secondReveal, "somm_1", "entry_2")!;
    const finished = finalizeSommelierState(favorite, {
      sessionId: "somm_1",
      entryId: "entry_1",
      ownerPlayerId: "p1",
    })!;

    expect(launched.sommelier?.captureEndsAt).toBe(241_000);
    expect(analyzing.sommelier?.phase).toBe("analyzing");
    expect(voting.sommelier?.currentProfile).toEqual(profile);
    expect("ownerPlayerId" in voting.sommelier!.currentProfile!).toBe(false);
    expect(voted.sommelier?.submittedVoterIds).toEqual(["p2"]);
    expect(revealed.sommelier?.result?.ownerPlayerId).toBe("p1");
    expect(favorite.sommelier?.phase).toBe("crowd-favorite");
    expect(finished.sommelier?.crowdFavoriteOwnerId).toBe("p1");
    expect(launchSommelierState(roomState(), "too_small")).toBeNull();
  });

  test("launchTrackGuess starts briefing with five rounds", () => {
    const withPlayer = launchTrackGuessState(roomState(), "tg_1");
    const withoutPlayers = launchTrackGuessState(roomState({ players: [] }), "tg_2");

    expect(withPlayer?.currentGame).toBe("trackguess");
    expect(withPlayer?.trackguess?.phase).toBe("briefing");
    expect(withPlayer?.trackguess?.totalRounds).toBe(5);
    expect(withoutPlayers).toBeNull();
  });

  test("launchSpectrumCourt starts only with at least two active teams", () => {
    const withTeams = launchSpectrumCourtState(roomState(), "sc_1");
    const oneActiveTeam = launchSpectrumCourtState(
      roomState({
        players: [
          { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
          { id: "p2", name: "Two", teamId: "forest", joinedAt: 2 },
        ],
      }),
      "sc_2",
    );

    expect(withTeams?.currentGame).toBe("spectrumcourt");
    expect(withTeams?.spectrumcourt?.phase).toBe("briefing");
    expect(withTeams?.spectrumcourt?.totalRounds).toBe(4);
    expect(oneActiveTeam).toBeNull();
  });

  test("launchWhoAmong starts only with at least three players", () => {
    const withThree = launchWhoAmongState(
      roomState({
        players: [
          { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
          { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
          { id: "p3", name: "Three", teamId: "forest", joinedAt: 3 },
        ],
      }),
      "wa_1",
    );
    const withTwo = launchWhoAmongState(
      roomState({
        players: [
          { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
          { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
        ],
      }),
      "wa_2",
    );

    expect(withThree?.currentGame).toBe("whoamong");
    expect(withThree?.whoamong?.phase).toBe("briefing");
    expect(withThree?.whoamong?.totalRounds).toBe(5);
    expect(withTwo).toBeNull();
  });
});
