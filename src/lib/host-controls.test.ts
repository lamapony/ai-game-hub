import { describe, expect, test } from "bun:test";
import {
  buildWinnerAnnouncement,
  canSkipCurrentPhase,
  CHALLENGE_JUDGING_FALLBACK_FEEDBACK,
  computeTeamStandings,
  finishPartyState,
  forceBackToHubState,
  formatRussianPlace,
  formatRussianPoints,
  getWinningStandings,
  pauseRoomState,
  resetScoresState,
  resumePartyState,
  resumeRoomState,
  setVenueState,
  SOUNDSCAPE_FALLBACK_TOPIC,
  skipCurrentPhaseState,
  spectrumCourtFallbackClue,
} from "./host-controls";
import type { RoomState } from "./types";
import { contextForExperience } from "@/experiences/catalog";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
    ],
    currentGame: "soundscape",
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

describe("host controls state helpers", () => {
  test("pause/resume shifts active timers by pause duration", () => {
    const state = roomState({
      soundscape: {
        phase: "playback",
        roundId: "snd",
        topicsEndsAt: 10_500,
        recordingEndsAt: 11_000,
        voteOpenAt: 12_000,
        playback: { teamId: "forest", startAt: 13_000 },
      },
      challenge: {
        phase: "recording",
        roundId: "ch",
        briefingEndsAt: 13_500,
        recordingEndsAt: 14_000,
      },
      phototunt: {
        phase: "hunting",
        roundId: "ph",
        huntEndsAt: 15_000,
      },
      spectrumcourt: {
        phase: "guessing",
        roundId: "sc",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
        clueEndsAt: 15_500,
        guessEndsAt: 16_000,
        appealEndsAt: 17_000,
        revealEndsAt: 18_000,
      },
      whoamong: {
        phase: "voting",
        roundId: "wa",
        roundNumber: 1,
        totalRounds: 5,
        usedPromptIds: [],
        voteEndsAt: 18_500,
        revealEndsAt: 19_000,
      },
      grilloracle: {
        phase: "capturing",
        roundId: "oracle",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: [],
        captureEndsAt: 20_000,
      },
      sommelier: {
        phase: "voting",
        sessionId: "sommelier",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: ["p1", "p2"],
        roundNumber: 1,
        totalRounds: 2,
        submittedVoterIds: [],
        roundResults: [],
        votingEndsAt: 20_500,
      },
      tongsoftruth: {
        runId: "tongs",
        status: "recording",
        participantIds: ["p1", "p2"],
        speakerOrder: ["p1", "p2"],
        roundNumber: 1,
        totalRounds: 2,
        currentRoundId: "tongs_r1",
        speakerPlayerId: "p1",
        speakerName: "One",
        level: 1,
        question: "Which plan burned first?",
        recordingEndsAt: 21_000,
        roundResults: [],
      },
      crossexamination: {
        runId: "cross",
        status: "capturing",
        participantIds: ["p1", "p2"],
        pairOrder: [
          {
            pairId: "cross_p1",
            playerAId: "p1",
            playerAName: "One",
            playerBId: "p2",
            playerBName: "Two",
          },
        ],
        pairNumber: 1,
        totalPairs: 1,
        currentPairId: "cross_p1",
        submittedPlayerIds: [],
        predictionVoterIds: [],
        pairResults: [],
        recordingEndsAt: 22_000,
      },
    });

    const paused = pauseRoomState(state, 20_000);
    const resumed = resumeRoomState(paused, 25_500);

    expect(resumed.paused).toBeUndefined();
    expect(resumed.soundscape?.topicsEndsAt).toBe(16_000);
    expect(resumed.soundscape?.recordingEndsAt).toBe(16_500);
    expect(resumed.soundscape?.voteOpenAt).toBe(17_500);
    expect(resumed.soundscape?.playback?.startAt).toBe(18_500);
    expect(resumed.challenge?.briefingEndsAt).toBe(19_000);
    expect(resumed.challenge?.recordingEndsAt).toBe(19_500);
    expect(resumed.phototunt?.huntEndsAt).toBe(20_500);
    expect(resumed.spectrumcourt?.clueEndsAt).toBe(21_000);
    expect(resumed.spectrumcourt?.guessEndsAt).toBe(21_500);
    expect(resumed.spectrumcourt?.appealEndsAt).toBe(22_500);
    expect(resumed.spectrumcourt?.revealEndsAt).toBe(23_500);
    expect(resumed.whoamong?.voteEndsAt).toBe(24_000);
    expect(resumed.whoamong?.revealEndsAt).toBe(24_500);
    expect(resumed.grilloracle?.captureEndsAt).toBe(25_500);
    expect(resumed.sommelier?.votingEndsAt).toBe(26_000);
    expect(resumed.tongsoftruth?.recordingEndsAt).toBe(26_500);
    expect(resumed.crossexamination?.recordingEndsAt).toBe(27_500);
  });

  test("forceBackToHub clears active games and pause state", () => {
    const state = roomState({
      paused: { startedAt: 10 },
      currentGame: "challenge",
      soundscape: { phase: "topics", roundId: "snd" },
      challenge: { phase: "briefing", roundId: "ch" },
      phototunt: { phase: "briefing", roundId: "ph" },
      spectrumcourt: {
        phase: "clue",
        roundId: "sc",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
      },
      whoamong: {
        phase: "voting",
        roundId: "wa",
        roundNumber: 1,
        totalRounds: 5,
        usedPromptIds: [],
      },
      grilloracle: {
        phase: "capturing",
        roundId: "oracle",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: [],
      },
      sommelier: {
        phase: "capture",
        sessionId: "sommelier",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: [],
        roundNumber: 0,
        totalRounds: 2,
        submittedVoterIds: [],
        roundResults: [],
      },
      oracleMemory: {
        runId: "oracle",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: ["p1"],
        verifiedPlayerIds: [],
        status: "collecting",
      },
      crossexamination: {
        runId: "cross",
        status: "capturing",
        participantIds: ["p1", "p2"],
        pairOrder: [
          {
            pairId: "cross_p1",
            playerAId: "p1",
            playerAName: "One",
            playerBId: "p2",
            playerBName: "Two",
          },
        ],
        pairNumber: 1,
        totalPairs: 1,
        currentPairId: "cross_p1",
        submittedPlayerIds: [],
        predictionVoterIds: [],
        pairResults: [],
      },
    });

    const result = forceBackToHubState(state);

    expect(result.status).toBe("lobby");
    expect(result.currentGame).toBeNull();
    expect(result.paused).toBeUndefined();
    expect(result.soundscape).toBeUndefined();
    expect(result.challenge).toBeUndefined();
    expect(result.phototunt).toBeUndefined();
    expect(result.spectrumcourt).toBeUndefined();
    expect(result.whoamong).toBeUndefined();
    expect(result.grilloracle).toBeUndefined();
    expect(result.sommelier).toBeUndefined();
    expect(result.crossexamination).toBeUndefined();
    expect(result.oracleMemory).toEqual(state.oracleMemory);
  });

  test("forceBackToHub captures every legacy public result before clearing game state", () => {
    const state = roomState({
      currentGame: "impostor",
      party: contextForExperience("smoke-neon-norrebro", "normal"),
      soundscape: {
        phase: "results",
        roundId: "sound_1",
        topic: "The bar at closing time",
        mixes: {
          forest: { teamId: "forest", intro: "Final mix", cues: [], totalMs: 60_000 },
        },
      },
      challenge: {
        phase: "results",
        roundId: "challenge_1",
        operatorName: "One",
        result: {
          score: 9,
          feedback: "One turned a bar stool into a getaway vehicle.",
          videoUrl: "https://example.test/challenge.mp4",
        },
      },
      phototunt: {
        phase: "results",
        roundId: "photo_1",
        results: [
          {
            playerId: "p2",
            playerName: "Two",
            teamId: "lake",
            photoUrl: "https://example.test/photo.jpg",
            rank: 1,
            points: 5,
            comment: "Two made the fire extinguisher look like the guest of honor.",
          },
        ],
      },
      trackguess: {
        phase: "results",
        roundId: "track_1",
        roundNumber: 1,
        totalRounds: 1,
        usedTrackIds: ["track_a"],
        roundResults: [
          {
            trackId: "track_a",
            title: "Last Call Algorithm",
            artist: "The Turing Tones",
            genre: "disco",
            isAi: true,
            correctPlayerIds: ["p1"],
          },
        ],
      },
      spectrumcourt: {
        phase: "results",
        roundId: "spectrum_1",
        roundNumber: 1,
        totalRounds: 1,
        usedSpectrumIds: ["quiet_loud"],
        roundResults: [
          {
            spectrumId: "quiet_loud",
            leftLabel: "whisper",
            rightLabel: "fire alarm",
            target: 82,
            clue: "the bartender sees the bill",
            clueTeamId: "forest",
            cluePlayerId: "p1",
            teamResults: [],
            clueTeamPoints: 3,
          },
        ],
      },
      whoamong: {
        phase: "results",
        roundId: "who_1",
        roundNumber: 1,
        totalRounds: 1,
        usedPromptIds: ["prompt_1"],
        roundResults: [
          {
            promptId: "prompt_1",
            prompt: "Who would accidentally start a cult by midnight?",
            starIds: ["p2"],
            voteCounts: { p2: 2 },
            correctVoterIds: ["p1", "p2"],
          },
        ],
      },
      impostor: {
        phase: "results",
        roundId: "bot_1",
        roundNumber: 1,
        totalRounds: 1,
        usedQuestionIds: ["question_1"],
        roundResults: [
          {
            questionId: "question_1",
            question: "What did the coat rack witness?",
            answers: [
              { id: "human_1", playerId: "p1", text: "A very deliberate escape." },
              { id: "ai_1", text: "A statistically unusual hat." },
            ],
            aiAnswerId: "ai_1",
            votes: { p1: "ai_1" },
            correctVoterIds: ["p1"],
          },
        ],
      },
    });

    const result = forceBackToHubState(state, 45_000);
    const expectedGameIds = [
      "soundscape",
      "challenge",
      "phototunt",
      "trackguess",
      "spectrumcourt",
      "whoamong",
      "impostor",
    ];

    expect(result.finale?.evidence.map((item) => item.gameId)).toEqual(expectedGameIds);
    expect(result.party?.storyEvidence?.map((item) => item.gameId)).toEqual(
      expectedGameIds.slice(-3),
    );
    expect(result.currentGame).toBeNull();
    expect(result.soundscape).toBeUndefined();
    expect(result.challenge).toBeUndefined();
    expect(result.phototunt).toBeUndefined();
    expect(result.trackguess).toBeUndefined();
    expect(result.spectrumcourt).toBeUndefined();
    expect(result.whoamong).toBeUndefined();
    expect(result.impostor).toBeUndefined();
  });

  test("skip closes Oracle capture without awarding model-proposed points", () => {
    const state = roomState({
      currentGame: "grilloracle",
      teams: [
        { id: "forest", name: "Forest", color: "green", score: 7 },
        { id: "lake", name: "Lake", color: "blue", score: 3 },
      ],
      grilloracle: {
        phase: "capturing",
        roundId: "oracle",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: ["p1"],
        captureEndsAt: 50_000,
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);
    const result = skipCurrentPhaseState(state, 12_000);
    expect(result.grilloracle?.phase).toBe("results");
    expect(result.grilloracle?.captureEndsAt).toBe(12_000);
    expect(result.teams.map((team) => team.score)).toEqual([7, 3]);
  });

  test("skip soundscape topics without generated topics uses fallback theme", () => {
    const state = roomState({
      soundscape: {
        phase: "topics",
        roundId: "snd",
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);

    const result = skipCurrentPhaseState(state, 2000);

    expect(result.soundscape?.phase).toBe("recording");
    expect(result.soundscape?.topic).toBe(SOUNDSCAPE_FALLBACK_TOPIC);
    expect(result.soundscape?.recordingEndsAt).toBe(182_000);
  });

  test("skip soundscape mixing restarts recording with fresh timer", () => {
    const state = roomState({
      soundscape: {
        phase: "mixing",
        roundId: "snd",
        topic: "rain",
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);
    const result = skipCurrentPhaseState(state, 5000);
    expect(result.soundscape?.phase).toBe("recording");
    expect(result.soundscape?.recordingEndsAt).toBe(185_000);
  });

  test("skip challenge judging awards fallback score to operator team", () => {
    const state = roomState({
      currentGame: "challenge",
      challenge: {
        phase: "judging",
        roundId: "ch",
        operatorId: "p1",
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);
    const result = skipCurrentPhaseState(state, 9000);

    expect(result.challenge?.phase).toBe("results");
    expect(result.challenge?.result).toEqual({
      score: 5,
      feedback: CHALLENGE_JUDGING_FALLBACK_FEEDBACK,
      videoUrl: "",
    });
    expect(result.teams.find((team) => team.id === "forest")?.score).toBe(5);
  });

  test("spectrumCourtFallbackClue prefers prompt then default text", () => {
    expect(spectrumCourtFallbackClue({ prompt: "romance" })).toBe("romance");
    expect(spectrumCourtFallbackClue({ prompt: "  " })).toBe("No clue — trust the team instinct!");
  });

  test("skip soundscape topics picks top voted topic and starts recording", () => {
    const state = roomState({
      soundscape: {
        phase: "topics",
        roundId: "snd",
        topics: ["rain", "wind"],
        topicVotes: { p1: "wind", p2: "wind" },
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);

    const result = skipCurrentPhaseState(state, 1000);

    expect(result.soundscape?.phase).toBe("recording");
    expect(result.soundscape?.topic).toBe("wind");
    expect(result.soundscape?.recordingEndsAt).toBe(181_000);
  });

  test("skip disabled while paused", () => {
    const state = roomState({
      paused: { startedAt: 1 },
      soundscape: {
        phase: "recording",
        roundId: "snd",
        recordingEndsAt: 5000,
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(false);
    expect(skipCurrentPhaseState(state, 10_000)).toBe(state);
  });

  test("skip challenge briefing starts recording only after task exists", () => {
    const noTask = roomState({
      currentGame: "challenge",
      challenge: { phase: "briefing", roundId: "ch" },
    });
    const withTask = roomState({
      currentGame: "challenge",
      challenge: { phase: "briefing", roundId: "ch", task: "Dance" },
    });

    expect(canSkipCurrentPhase(noTask)).toBe(false);
    expect(canSkipCurrentPhase(withTask)).toBe(true);
    expect(skipCurrentPhaseState(withTask, 2000).challenge?.recordingEndsAt).toBe(27_000);
  });

  test("skip phototunt hunt ends current timer immediately", () => {
    const state = roomState({
      currentGame: "phototunt",
      phototunt: { phase: "hunting", roundId: "ph", huntEndsAt: 99_000 },
    });

    const result = skipCurrentPhaseState(state, 44_000);

    expect(result.phototunt?.phase).toBe("hunting");
    expect(result.phototunt?.huntEndsAt).toBe(44_000);
  });

  test("skip trackguess guessing ends vote timer immediately", () => {
    const now = 50_000;
    const state = roomState({
      currentGame: "trackguess",
      trackguess: {
        phase: "guessing",
        roundId: "tg",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: [],
        trackId: "real-hozier-take-me-to-church",
        guessEndsAt: now + 20_000,
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);
    expect(skipCurrentPhaseState(state, now).trackguess?.guessEndsAt).toBe(now);
  });

  test("skip spectrum court clue without clue applies fallback and starts guessing", () => {
    const now = 80_000;
    const noClue = roomState({
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "clue",
        roundId: "sc",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
        prompt: "matching tattoos",
        clueTeamId: "forest",
      },
    });
    const withClue = roomState({
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "clue",
        roundId: "sc",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
        clue: "matching tattoos",
      },
    });

    expect(canSkipCurrentPhase(noClue)).toBe(true);
    expect(canSkipCurrentPhase(withClue)).toBe(true);
    const result = skipCurrentPhaseState(noClue, now);
    expect(result.spectrumcourt?.phase).toBe("guessing");
    expect(result.spectrumcourt?.clue).toBe("matching tattoos");
    expect(result.spectrumcourt?.cluePlayerId).toBe("p1");
    expect(result.spectrumcourt?.guessEndsAt).toBe(now + 35_000);
  });

  test("skip spectrum court appeal ends appeal timer immediately", () => {
    const now = 90_000;
    const state = roomState({
      currentGame: "spectrumcourt",
      spectrumcourt: {
        phase: "appeal",
        roundId: "sc",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
        appealEndsAt: now + 18_000,
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);
    expect(skipCurrentPhaseState(state, now).spectrumcourt?.appealEndsAt).toBe(now);
  });

  test("skip whoamong voting ends vote timer immediately", () => {
    const now = 55_000;
    const state = roomState({
      currentGame: "whoamong",
      whoamong: {
        phase: "voting",
        roundId: "wa",
        roundNumber: 1,
        totalRounds: 5,
        usedPromptIds: ["sleep-party"],
        promptId: "sleep-party",
        prompt: "Who among us would fall asleep?",
        voteEndsAt: now + 25_000,
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);
    expect(skipCurrentPhaseState(state, now).whoamong?.voteEndsAt).toBe(now);
  });

  test("skip whoamong reveal ends reveal timer immediately", () => {
    const now = 60_000;
    const state = roomState({
      currentGame: "whoamong",
      whoamong: {
        phase: "reveal",
        roundId: "wa",
        roundNumber: 1,
        totalRounds: 5,
        usedPromptIds: ["sleep-party"],
        revealEndsAt: now + 10_000,
      },
    });

    expect(canSkipCurrentPhase(state)).toBe(true);
    expect(skipCurrentPhaseState(state, now).whoamong?.revealEndsAt).toBe(now);
  });

  test("finishPartyState sets finished and clears game substates", () => {
    const state = roomState({
      paused: { startedAt: 100 },
      teams: [
        { id: "forest", name: "Forest", color: "green", score: 12 },
        { id: "lake", name: "Lake", color: "blue", score: 8 },
      ],
      soundscape: { phase: "voting", roundId: "snd" },
      challenge: { phase: "results", roundId: "ch" },
      phototunt: { phase: "results", roundId: "ph" },
      trackguess: {
        phase: "results",
        roundId: "tg",
        roundNumber: 1,
        totalRounds: 5,
        usedTrackIds: [],
      },
      spectrumcourt: {
        phase: "results",
        roundId: "sc",
        roundNumber: 1,
        totalRounds: 4,
        usedSpectrumIds: [],
      },
      whoamong: {
        phase: "results",
        roundId: "wa",
        roundNumber: 1,
        totalRounds: 5,
        usedPromptIds: [],
      },
      oracleMemory: {
        runId: "oracle",
        participantIds: ["p1", "p2"],
        submittedPlayerIds: ["p1"],
        verifiedPlayerIds: [],
        status: "collecting",
      },
      smokescreen: {
        runId: "smoke",
        status: "active",
        participantIds: ["p1", "p2"],
        assignedPlayerIds: ["p1", "p2"],
        submittedVoterIds: [],
        startedAt: 1,
      },
      contraband: {
        runId: "contraband",
        status: "active",
        participantIds: ["p1", "p2"],
        assignedPlayerIds: ["p1", "p2"],
        resolvedPlayerIds: [],
        startedAt: 1,
      },
      tongsoftruth: {
        runId: "tongs",
        status: "results",
        participantIds: ["p1", "p2"],
        speakerOrder: ["p1", "p2"],
        roundNumber: 1,
        totalRounds: 1,
        currentRoundId: "tongs_r1",
        speakerPlayerId: "p1",
        speakerName: "One",
        level: 1,
        roundResults: [],
      },
    });

    const result = finishPartyState(state);

    expect(result.status).toBe("finished");
    expect(result.currentGame).toBeNull();
    expect(result.paused).toBeUndefined();
    expect(result.soundscape).toBeUndefined();
    expect(result.challenge).toBeUndefined();
    expect(result.phototunt).toBeUndefined();
    expect(result.trackguess).toBeUndefined();
    expect(result.spectrumcourt).toBeUndefined();
    expect(result.whoamong).toBeUndefined();
    expect(result.oracleMemory).toBeUndefined();
    expect(result.smokescreen).toBeUndefined();
    expect(result.contraband).toBeUndefined();
    expect(result.tongsoftruth).toBeUndefined();
    expect(result.teams.find((team) => team.id === "forest")?.score).toBe(12);
    expect(result.players).toHaveLength(2);
  });

  test("resumePartyState returns finished room to lobby", () => {
    const state = roomState({
      status: "finished",
      currentGame: null,
      teams: [
        { id: "forest", name: "Forest", color: "green", score: 15 },
        { id: "lake", name: "Lake", color: "blue", score: 3 },
      ],
      oracleMemory: {
        runId: "old_oracle",
        participantIds: ["p1"],
        submittedPlayerIds: ["p1"],
        verifiedPlayerIds: ["p1"],
        status: "verified",
      },
      smokescreen: {
        runId: "old_smoke",
        status: "results",
        participantIds: ["p1", "p2"],
        assignedPlayerIds: ["p1", "p2"],
        submittedVoterIds: ["p1", "p2"],
        startedAt: 1,
        results: [],
        recap: "Old evidence.",
      },
      contraband: {
        runId: "old_contraband",
        status: "results",
        participantIds: ["p1", "p2"],
        assignedPlayerIds: ["p1", "p2"],
        resolvedPlayerIds: ["p1", "p2"],
        startedAt: 1,
        results: [],
      },
      tongsoftruth: {
        runId: "old_tongs",
        status: "results",
        participantIds: ["p1", "p2"],
        speakerOrder: ["p1", "p2"],
        roundNumber: 1,
        totalRounds: 1,
        currentRoundId: "old_tongs_r1",
        speakerPlayerId: "p1",
        speakerName: "One",
        level: 1,
        roundResults: [],
      },
    });

    const result = resumePartyState(state);

    expect(result.status).toBe("lobby");
    expect(result.currentGame).toBeNull();
    expect(result.teams.find((team) => team.id === "forest")?.score).toBe(15);
    expect(result.oracleMemory).toBeUndefined();
    expect(result.smokescreen).toBeUndefined();
    expect(result.contraband).toBeUndefined();
    expect(result.tongsoftruth).toBeUndefined();
  });

  test("resumePartyState leaves non-finished room unchanged", () => {
    const state = roomState({ status: "playing" });
    expect(resumePartyState(state)).toBe(state);
  });

  test("resetScoresState zeroes all team scores", () => {
    const state = roomState({
      teams: [
        { id: "forest", name: "Forest", color: "green", score: 20 },
        { id: "lake", name: "Lake", color: "blue", score: 7 },
      ],
    });

    const result = resetScoresState(state);

    expect(result.teams.every((team) => team.score === 0)).toBe(true);
    expect(result.players).toHaveLength(2);
  });

  test("setVenueState keeps legacy venue and V2 party context synchronized", () => {
    const bar = setVenueState(roomState(), "bar");
    expect(bar.venue).toBe("bar");
    expect(bar.party?.actId).toBe("bar");
    expect(bar.party?.venue).toBe("bar");
    expect(bar.party?.contingency).toBe("bar-only");

    const park = setVenueState(bar, "park");
    expect(park.venue).toBe("park");
    expect(park.party?.actId).toBe("classic");
    expect(park.party?.venue).toBe("park");
    expect(park.party?.contingency).toBe("normal");
  });

  test("computeTeamStandings handles ties with shared places", () => {
    const state = roomState({
      teams: [
        { id: "forest", name: "Forest", color: "green", score: 10 },
        { id: "lake", name: "Lake", color: "blue", score: 10 },
        { id: "fire", name: "Fire", color: "red", score: 5 },
      ],
      players: [
        { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
        { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
        { id: "p3", name: "Three", teamId: "fire", joinedAt: 3 },
      ],
    });

    const standings = computeTeamStandings(state);

    expect(standings.map((s) => [s.team.id, s.place])).toEqual([
      ["forest", 1],
      ["lake", 1],
      ["fire", 3],
    ]);
    expect(standings[0]?.playerCount).toBe(1);
  });

  test("winner announcement handles single winner and ties", () => {
    const tied = computeTeamStandings(
      roomState({
        teams: [
          { id: "forest", name: "Foxes", color: "green", score: 10 },
          { id: "lake", name: "Hedgehogs", color: "blue", score: 10 },
          { id: "fire", name: "Owls", color: "red", score: 3 },
        ],
      }),
    );
    expect(getWinningStandings(tied)).toHaveLength(2);
    expect(buildWinnerAnnouncement(tied)).toBe("Tie between Foxes and Hedgehogs! 10 points each!");

    const solo = computeTeamStandings(
      roomState({
        teams: [
          { id: "forest", name: "Foxes", color: "green", score: 12 },
          { id: "lake", name: "Hedgehogs", color: "blue", score: 4 },
        ],
      }),
    );
    expect(buildWinnerAnnouncement(solo)).toBe("Party winners: team Foxes! 12 points!");
  });

  test("English place and points formatting", () => {
    expect(formatRussianPlace(1)).toBe("1st");
    expect(formatRussianPlace(2)).toBe("2nd");
    expect(formatRussianPlace(5)).toBe("5th");
    expect(formatRussianPlace(21)).toBe("21st");
    expect(formatRussianPoints(1)).toBe("1 point");
    expect(formatRussianPoints(3)).toBe("3 points");
    expect(formatRussianPoints(11)).toBe("11 points");
  });
});
