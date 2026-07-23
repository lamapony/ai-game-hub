import { describe, expect, test } from "bun:test";
import {
  captureFinaleState,
  capturePartyEvidenceState,
  claimFinaleNarrativeState,
  collectFinaleEvidence,
  completeFinaleNarrativeState,
  FINALE_GENERATION_LEASE_MS,
  type FinaleNarrative,
} from "./finale-narrative";
import {
  finalizeContrabandState,
  finalizeSmokeScreenState,
  nextTongsRoundState,
} from "./game-state";
import { finishPartyState, forceBackToHubState } from "./host-controls";
import { applyHostCommand } from "./host-command";
import { emptyRoomState, type RoomState } from "./types";
import { contextForExperience } from "@/experiences/catalog";
import { GAME_IDS, type GameId } from "@/games/ids";
import { GAME_REGISTRY } from "@/games/registry";

const narrative: FinaleNarrative = {
  version: 1,
  headline: "Smoke met glassware",
  opening: "The venue kept the receipts.",
  callbacks: [
    {
      evidenceId: "toastsyndicate:toast_r1",
      title: "The toast",
      payoff: "The public verdict survived closing time.",
    },
  ],
  closingToast: "To the witnesses.",
};

function evidenceState(): RoomState {
  return {
    ...emptyRoomState("Host"),
    status: "playing",
    players: [
      { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2 },
    ],
    challenge: {
      phase: "results",
      roundId: "challenge_r1",
      operatorName: "Ada",
      result: {
        score: 9,
        feedback: "The fire bucket became a surprisingly credible co-star.",
        videoUrl: "https://private.invalid/DO_NOT_LEAK_VIDEO",
      },
    },
    toastsyndicate: {
      phase: "results",
      sessionId: "toast",
      roundId: "toast_r1",
      roundNumber: 1,
      totalRounds: 1,
      speakerPlayerId: "p1",
      speakerName: "Ada",
      recordingSubmitted: true,
      submittedListenerIds: ["p2"],
      result: undefined,
      roundResults: [
        {
          roundId: "toast_r1",
          speakerPlayerId: "p1",
          genre: "courtroom",
          transcript: "DO_NOT_LEAK_TRANSCRIPT",
          genreScore: 8,
          words: [
            {
              id: "secret_word",
              text: "DO_NOT_LEAK_SECRET_WORD",
              used: true,
              smoothness: 4,
              caughtByPlayerIds: [],
            },
          ],
          speakerPoints: 12,
          listenerPoints: {},
          comment: "Ada turned one glass into Exhibit A and the room accepted jurisdiction.",
        },
      ],
    },
    crossexamination: {
      runId: "cross",
      status: "results",
      participantIds: ["p1", "p2"],
      pairOrder: [],
      pairNumber: 1,
      totalPairs: 1,
      currentPairId: "pair_1",
      submittedPlayerIds: ["p1", "p2"],
      predictionVoterIds: [],
      pairResults: [
        {
          pairId: "pair_1",
          playerAId: "p1",
          playerAName: "Ada",
          playerBId: "p2",
          playerBName: "Bo",
          findings: [],
          alibiStrength: 7,
          environmentBonus: 5,
          pairPoints: 12,
          verdict: "The bar light exposed a technically elegant but emotionally bankrupt alibi.",
          predictionCounts: {},
          correctPredictionCategories: [],
          correctVoterIds: [],
          source: "ai",
        },
      ],
    },
  };
}

function allGameEvidenceState(): RoomState {
  const state = evidenceState();
  state.soundscape = {
    phase: "results",
    roundId: "soundscape_r1",
    topic: "Kitchen static",
    mixes: {
      forest: {
        teamId: "forest",
        intro: "The room tuned in.",
        cues: [
          {
            atMs: 0,
            slot: 1,
            type: "audio",
            url: "https://private.invalid/DO_NOT_LEAK_SOUND",
          },
        ],
        totalMs: 1_000,
      },
    },
  };
  state.phototunt = {
    phase: "results",
    roundId: "photo_r1",
    results: [
      {
        playerId: "p1",
        playerName: "Ada",
        teamId: "forest",
        photoUrl: "https://private.invalid/DO_NOT_LEAK_PHOTO",
        rank: 1,
        points: 10,
        comment: "The serving tray became a satellite dish for bad decisions.",
      },
    ],
  };
  state.trackguess = {
    phase: "results",
    roundId: "track_r1",
    roundNumber: 1,
    totalRounds: 1,
    usedTrackIds: ["track_1"],
    roundResults: [
      {
        trackId: "track_1",
        title: "Midnight Receipt",
        artist: "The Witnesses",
        genre: "disco",
        isAi: true,
        sourceUrl: "https://private.invalid/DO_NOT_LEAK_TRACK_SOURCE",
        artworkUrl: "https://private.invalid/DO_NOT_LEAK_TRACK_ART",
        correctPlayerIds: ["p1"],
      },
    ],
  };
  state.spectrumcourt = {
    phase: "results",
    roundId: "spectrum_r1",
    roundNumber: 1,
    totalRounds: 1,
    usedSpectrumIds: ["spectrum_1"],
    roundResults: [
      {
        spectrumId: "spectrum_1",
        leftLabel: "careful",
        rightLabel: "reckless",
        target: 73,
        clue: "opening a bottle with the tongs",
        clueTeamId: "forest",
        cluePlayerId: "p1",
        teamResults: [],
        clueTeamPoints: 4,
      },
    ],
  };
  state.whoamong = {
    phase: "results",
    roundId: "who_r1",
    roundNumber: 1,
    totalRounds: 1,
    usedPromptIds: ["who_prompt_1"],
    roundResults: [
      {
        promptId: "who_prompt_1",
        prompt: "Who would negotiate with the neighbour first?",
        starIds: ["p2"],
        voteCounts: { p2: 2 },
        correctVoterIds: ["p1"],
      },
    ],
  };
  state.impostor = {
    phase: "results",
    roundId: "impostor_r1",
    roundNumber: 1,
    totalRounds: 1,
    usedQuestionIds: ["question_1"],
    roundResults: [
      {
        questionId: "question_1",
        question: "What did the kitchen hear?",
        answers: [
          { id: "human", playerId: "p1", text: "A pan falling." },
          { id: "ai", text: "A chandelier rehearsing." },
        ],
        aiAnswerId: "ai",
        votes: { p1: "ai" },
        correctVoterIds: ["p1"],
      },
    ],
  };
  state.oracleMemory = {
    runId: "oracle_r1",
    participantIds: ["p1", "p2"],
    submittedPlayerIds: ["p1", "p2"],
    verifiedPlayerIds: ["p1"],
    status: "verified",
  };
  state.smokescreen = {
    runId: "smoke_r1",
    status: "results",
    participantIds: ["p1", "p2"],
    assignedPlayerIds: ["p1", "p2"],
    submittedVoterIds: ["p1", "p2"],
    startedAt: 1,
    recap: "Someone moved the silver tongs three times without admitting it.",
  };
  state.contraband = {
    runId: "contraband_r1",
    status: "results",
    participantIds: ["p1", "p2"],
    assignedPlayerIds: ["p1", "p2"],
    resolvedPlayerIds: ["p1"],
    startedAt: 1,
    results: [
      {
        playerId: "p1",
        playerName: "Ada",
        phrase: "municipal pineapple",
        outcome: "caught",
        points: 3,
      },
    ],
  };
  state.tongsoftruth = {
    runId: "tongs_r1",
    status: "results",
    participantIds: ["p1", "p2"],
    speakerOrder: ["p1", "p2"],
    roundNumber: 1,
    totalRounds: 1,
    currentRoundId: "tongs_round_1",
    speakerPlayerId: "p1",
    speakerName: "Ada",
    level: 2,
    roundResults: [
      {
        roundId: "tongs_round_1",
        speakerPlayerId: "p1",
        speakerName: "Ada",
        level: 2,
        question: "Who trusted the smoke first?",
        honestyScore: 4,
        dodgeDetected: false,
        artistryScore: 3,
        environmentUsed: true,
        points: 12,
        comment: "Ada used the grill smoke as both witness and legal counsel.",
        source: "ai",
      },
    ],
  };
  state.stilllife = {
    phase: "results",
    sessionId: "still_session",
    roundId: "still_r1",
    roundNumber: 1,
    totalRounds: 1,
    activeTeamIds: ["forest", "lake"],
    submittedTeamIds: ["forest", "lake"],
    submittedVoterIds: ["p1", "p2"],
    roundResults: [
      {
        roundId: "still_r1",
        headline: "Build the host's alibi from table debris",
        winningTeamIds: ["forest"],
        entries: [
          {
            teamId: "forest",
            teamName: "Forest",
            compositionScore: 4,
            dramaScore: 4,
            materialScore: 4,
            points: 12,
            catalogTitle: "Untitled Alibi No. 3",
            auctionPriceDkk: 900,
            critique: "The napkin carried the whole conspiracy.",
            audienceVotes: 1,
            aiFallback: false,
            manualOverride: false,
          },
        ],
      },
    ],
  };
  state.sommelier = {
    phase: "results",
    sessionId: "sommelier_session",
    participantIds: ["p1", "p2"],
    submittedPlayerIds: ["p1"],
    roundNumber: 1,
    totalRounds: 1,
    submittedVoterIds: ["p2"],
    roundResults: [
      {
        entryId: "drink_1",
        ownerPlayerId: "p1",
        ownerPlayerName: "Ada",
        ownerTeamId: "forest",
        profile: {
          drink_guess: "tonic",
          tasting_notes: "citrus and procedural anxiety",
          owner_profile: "Ada chose a drink that files a complaint before making small talk.",
          pretentiousness: 7,
          pairing_advice: "Serve with disputed evidence.",
        },
        correctGuesserIds: ["p2"],
        ballotCount: 1,
        ownerPoints: 0,
        guesserPoints: { p2: 3 },
        aiFallback: false,
      },
    ],
  };
  return state;
}

const GAME_EVIDENCE_STATE_KEYS = {
  soundscape: "soundscape",
  challenge: "challenge",
  phototunt: "phototunt",
  trackguess: "trackguess",
  spectrumcourt: "spectrumcourt",
  whoamong: "whoamong",
  impostor: "impostor",
  grilloracle: "oracleMemory",
  smokescreen: "smokescreen",
  toastsyndicate: "toastsyndicate",
  stilllife: "stilllife",
  sommelier: "sommelier",
  contraband: "contraband",
  tongsoftruth: "tongsoftruth",
  crossexamination: "crossexamination",
} as const satisfies Record<GameId, keyof RoomState>;

function singleGameEvidenceState(gameId: GameId): RoomState {
  const source = allGameEvidenceState();
  const key = GAME_EVIDENCE_STATE_KEYS[gameId];
  return Object.assign(emptyRoomState("Host"), {
    status: "playing" as const,
    players: source.players,
    party: contextForExperience("house-party", "normal"),
    [key]: source[key],
  });
}

function completeThroughHostExit(state: RoomState, gameId: GameId, now: number): RoomState {
  if (gameId === "smokescreen") {
    return finalizeSmokeScreenState(state, {
      runId: state.smokescreen!.runId,
      results: [],
      recap: "Ignored retry payload.",
      aiFallback: true,
      now,
    })!;
  }
  if (gameId === "contraband") {
    return finalizeContrabandState(state, {
      runId: state.contraband!.runId,
      results: [],
      now,
    })!;
  }
  if (gameId === "tongsoftruth") {
    return nextTongsRoundState(state, state.tongsoftruth!.runId, now)!;
  }
  expect(GAME_REGISTRY[gameId].format).toBe("foreground");
  return forceBackToHubState({ ...state, currentGame: gameId }, now);
}

describe("finale narrative public evidence", () => {
  test("keeps one bounded public callback adapter for every registered game", () => {
    const evidence = collectFinaleEvidence(allGameEvidenceState());
    const serialized = JSON.stringify(evidence);

    expect(evidence.map((item) => item.gameId).sort()).toEqual([...GAME_IDS].sort());
    expect(new Set(evidence.map((item) => item.id)).size).toBe(GAME_IDS.length);
    expect(evidence).toHaveLength(GAME_IDS.length);
    expect(
      evidence.every(
        (item) =>
          item.id.length <= 80 &&
          item.title.length > 0 &&
          item.title.length <= 100 &&
          item.detail.length > 0 &&
          item.detail.length <= 280,
      ),
    ).toBe(true);
    expect(serialized.includes("DO_NOT_LEAK")).toBe(false);
    expect(serialized.includes("private.invalid")).toBe(false);
  });

  test("localizes deterministic evidence glue by content locale without rewriting public results", () => {
    const englishState = allGameEvidenceState();
    englishState.party = {
      ...contextForExperience("house-party", "normal"),
      uiLocale: "en",
      contentLocale: "en",
    };
    const russianState = allGameEvidenceState();
    russianState.party = {
      ...contextForExperience("house-party", "normal"),
      uiLocale: "en",
      contentLocale: "ru",
    };
    russianState.spectrumcourt!.roundResults![0]!.cluePlayerId = "missing-player";
    const english = collectFinaleEvidence(englishState);
    const russian = collectFinaleEvidence(russianState);
    const byGame = new Map(russian.map((item) => [item.gameId, item]));
    const serialized = JSON.stringify(russian);

    expect(russian.map((item) => item.id)).toEqual(english.map((item) => item.id));
    expect(russian.map((item) => item.gameId).sort()).toEqual([...GAME_IDS].sort());
    expect(byGame.get("soundscape")?.title).toContain("Звуковой баттл");
    expect(byGame.get("soundscape")?.detail).toContain("1 команда превратила эту локацию");
    expect(byGame.get("challenge")?.title).toContain("Испытание: Ada");
    expect(byGame.get("challenge")?.detail).toContain("fire bucket");
    expect(byGame.get("trackguess")?.detail).toContain("1 гость распознал AI-трек");
    expect(byGame.get("spectrumcourt")?.title).toContain("Суд Спектра: Гость");
    expect(byGame.get("spectrumcourt")?.detail).toContain("Подсказку");
    expect(byGame.get("whoamong")?.detail).toContain("ответом комнаты");
    expect(byGame.get("impostor")?.detail).toContain("нашёл синтетический ответ");
    expect(byGame.get("grilloracle")?.detail).toContain("1 пророчество дошло");
    expect(byGame.get("contraband")?.detail).toContain("завершила дело: поймана");
    expect(byGame.get("toastsyndicate")?.detail).toContain("Публичных тостов на таможне: 1");
    expect(byGame.get("stilllife")?.detail).toContain("ответили на задание");
    expect(serialized.includes("A guest")).toBe(false);
    expect(serialized.includes("DO_NOT_LEAK")).toBe(false);
    expect(serialized.includes("private.invalid")).toBe(false);
  });

  test("accumulates all game callbacks through their real host completion paths", () => {
    let accumulated = singleGameEvidenceState(GAME_IDS[0]);

    for (const [index, gameId] of GAME_IDS.entries()) {
      const current = singleGameEvidenceState(gameId);
      current.finale = accumulated.finale;
      current.party = accumulated.party;
      accumulated = completeThroughHostExit(current, gameId, 10_000 + index);
      expect(accumulated.finale?.evidence.at(-1)?.gameId).toBe(gameId);
    }

    expect(accumulated.finale?.evidence.map((item) => item.gameId)).toEqual([...GAME_IDS]);
    expect(accumulated.party?.storyEvidence?.map((item) => item.gameId)).toEqual(
      GAME_IDS.slice(-3),
    );
  });

  test("keeps revealed comments while excluding transcripts, media URLs and secret words", () => {
    const serialized = JSON.stringify(collectFinaleEvidence(evidenceState()));

    expect(serialized).toContain("Exhibit A");
    expect(serialized).toContain("bar light");
    expect(serialized).toContain("fire bucket");
    expect(serialized.includes("DO_NOT_LEAK_TRANSCRIPT")).toBe(false);
    expect(serialized.includes("DO_NOT_LEAK_SECRET_WORD")).toBe(false);
    expect(serialized.includes("DO_NOT_LEAK_VIDEO")).toBe(false);
    expect(serialized.includes("private.invalid")).toBe(false);
  });

  test("condenses the full public Toast Syndicate run into one finale callback", () => {
    const state = evidenceState();
    state.toastsyndicate!.roundResults.push({
      roundId: "toast_r2",
      speakerPlayerId: "p2",
      genre: "IKEA instruction",
      transcript: "SECOND_PRIVATE_TRANSCRIPT",
      genreScore: 10,
      words: [
        {
          id: "second_secret_word",
          text: "SECOND_PRIVATE_WORD",
          used: true,
          smoothness: 5,
          caughtByPlayerIds: [],
        },
      ],
      speakerPoints: 15,
      listenerPoints: {},
      comment: "Bo made furniture assembly sound like a credible reason to raise a glass.",
    });

    const toastEvidence = collectFinaleEvidence(state).find(
      (item) => item.gameId === "toastsyndicate",
    );
    const serialized = JSON.stringify(toastEvidence);

    expect(toastEvidence?.title).toContain("2 declarations cleared");
    expect(toastEvidence?.detail).toContain("Ada, Bo");
    expect(toastEvidence?.detail).toContain("courtroom, IKEA instruction");
    expect(toastEvidence?.detail).toContain("Bo with 15 points");
    expect(serialized.includes("SECOND_PRIVATE_TRANSCRIPT")).toBe(false);
    expect(serialized.includes("SECOND_PRIVATE_WORD")).toBe(false);
  });

  test("captures every public result before finish clears all party game state", () => {
    const finished = finishPartyState(allGameEvidenceState(), 10_000);

    expect(finished.status).toBe("finished");
    for (const gameId of GAME_IDS) {
      expect(finished[GAME_EVIDENCE_STATE_KEYS[gameId]]).toBeUndefined();
    }
    expect(finished.finale?.evidenceCapturedAt).toBe(10_000);
    expect(finished.finale?.evidence.map((item) => item.gameId).sort()).toEqual(
      [...GAME_IDS].sort(),
    );
  });

  test("does not create empty story memory and preserves unchanged memory by identity", () => {
    const empty = emptyRoomState("Host");
    expect(capturePartyEvidenceState(empty, 1_000)).toBe(empty);

    const captured = capturePartyEvidenceState(evidenceState(), 2_000);
    expect(captured.finale?.evidence.length).toBe(3);
    expect(capturePartyEvidenceState(captured, 9_000)).toBe(captured);
    expect(captured.finale?.evidenceCapturedAt).toBe(2_000);
  });

  test("promotes only bounded public reveals into the next party prompt context", () => {
    const state = evidenceState();
    state.party = contextForExperience("smoke-neon-norrebro", "normal");
    const captured = capturePartyEvidenceState(state, 2_000);
    const serialized = JSON.stringify(captured.party?.storyEvidence);

    expect(captured.party?.storyEvidence?.map((item) => item.gameId)).toEqual([
      "challenge",
      "toastsyndicate",
      "crossexamination",
    ]);
    expect(serialized).toContain("Exhibit A");
    expect(serialized.includes("DO_NOT_LEAK_TRANSCRIPT")).toBe(false);
    expect(serialized.includes("DO_NOT_LEAK_SECRET_WORD")).toBe(false);
    expect(serialized.includes("DO_NOT_LEAK_VIDEO")).toBe(false);
    expect(capturePartyEvidenceState(captured, 9_000)).toBe(captured);
  });

  test("uses a lease so only one request owns generation and an expired owner can be replaced", () => {
    const state = { ...evidenceState(), status: "finished" as const };
    const first = claimFinaleNarrativeState(state, { requestId: "request_a", now: 1_000 });
    const concurrent = claimFinaleNarrativeState(first.state, {
      requestId: "request_b",
      now: 2_000,
    });
    const takeover = claimFinaleNarrativeState(first.state, {
      requestId: "request_c",
      now: 1_000 + FINALE_GENERATION_LEASE_MS + 1,
    });

    expect(first.claimed).toBe(true);
    expect(concurrent.claimed).toBe(false);
    expect(takeover.claimed).toBe(true);
    expect(takeover.state.finale?.generation?.requestId).toBe("request_c");
  });

  test("persists only the lease owner's grounded epilogue and then replays it", () => {
    const base = { ...evidenceState(), status: "finished" as const };
    const claimed = claimFinaleNarrativeState(base, { requestId: "owner", now: 1_000 });
    expect(
      completeFinaleNarrativeState(claimed.state, {
        requestId: "stranger",
        narrative,
        generatedAt: 2_000,
        usedFallback: false,
      }),
    ).toBeNull();

    const completed = completeFinaleNarrativeState(claimed.state, {
      requestId: "owner",
      narrative,
      generatedAt: 2_000,
      usedFallback: false,
    });
    expect(completed?.state.finale?.narrative).toEqual(narrative);
    expect(completed?.state.finale?.generation).toBeUndefined();

    const replay = claimFinaleNarrativeState(completed!.state, {
      requestId: "late",
      now: 3_000,
    });
    expect(replay.claimed).toBe(false);
    expect(replay.narrative).toEqual(narrative);
  });

  test("rejects a late epilogue completion after the room starts a new party", () => {
    const base = { ...evidenceState(), status: "finished" as const };
    const claimed = claimFinaleNarrativeState(base, { requestId: "old-finale", now: 1_000 });
    const restarted = applyHostCommand(
      claimed.state,
      { commandId: "new-party", command: { type: "start-new-party" } },
      2_000,
    ).state;

    expect(restarted.finale).toBeUndefined();
    expect(
      completeFinaleNarrativeState(restarted, {
        requestId: "old-finale",
        narrative,
        generatedAt: 3_000,
        usedFallback: false,
      }),
    ).toBeNull();
  });

  test("keeps a completed narrative only while its evidence is unchanged", () => {
    const state = evidenceState();
    const captured = captureFinaleState(state, 1_000);
    state.finale = { ...captured, narrative, generatedAt: 2_000, usedFallback: false };
    expect(captureFinaleState(state, 3_000).narrative).toEqual(narrative);

    state.smokescreen = {
      runId: "smoke_new",
      status: "results",
      participantIds: ["p1", "p2"],
      assignedPlayerIds: ["p1", "p2"],
      submittedVoterIds: [],
      startedAt: 1,
      recap: "The tongs became an unreliable witness.",
    };
    const recaptured = captureFinaleState(state, 4_000);
    expect(recaptured.narrative).toBeUndefined();
    expect(recaptured.evidence.some((item) => item.gameId === "smokescreen")).toBe(true);
  });
});
