import type {
  CrossExaminationPair,
  CrossExaminationPairResult,
  CrossExaminationQuestion,
  GrillOracleMemoryStatus,
  RoomState,
  SmokeScreenResultEntry,
} from "./types";
import { CONTRABAND_AUDIO_WINDOW_MS, CONTRABAND_DURATION_MS } from "./contraband-lifecycle";
import { completeRunOfShowGameStepState } from "./run-of-show-progress";
import { TONGS_RECORDING_WINDOW_MS } from "./tongsoftruth-lifecycle";
import { capturePartyEvidenceState } from "./finale-narrative";

function basePlayingState(state: RoomState): RoomState {
  return {
    ...state,
    status: "playing",
    paused: undefined,
    soundscape: undefined,
    challenge: undefined,
    phototunt: undefined,
    trackguess: undefined,
    spectrumcourt: undefined,
    whoamong: undefined,
    impostor: undefined,
    grilloracle: undefined,
    toastsyndicate: undefined,
    stilllife: undefined,
    sommelier: undefined,
    crossexamination: undefined,
  };
}

export const SOMMELIER_MAX_DRINKS = 10;
export const SOMMELIER_CAPTURE_MS = 4 * 60_000;
export const SOMMELIER_VOTING_MS = 45_000;

function sommelierParticipants(state: RoomState, random = 0) {
  const count = Math.min(SOMMELIER_MAX_DRINKS, state.players.length);
  if (count === state.players.length) return state.players.map((player) => player.id);
  const start = Math.floor(Math.max(0, Math.min(0.999999, random)) * state.players.length);
  return Array.from(
    { length: count },
    (_, offset) => state.players[(start + offset) % state.players.length]!.id,
  );
}

export function launchSommelierState(
  state: RoomState,
  sessionId: string,
  random = 0,
  now = Date.now(),
): RoomState | null {
  if (state.players.length < 3) return null;
  const participantIds = sommelierParticipants(state, random);
  return {
    ...basePlayingState(state),
    currentGame: "sommelier",
    sommelier: {
      phase: "capture",
      sessionId,
      participantIds,
      submittedPlayerIds: [],
      captureEndsAt: now + SOMMELIER_CAPTURE_MS,
      roundNumber: 0,
      totalRounds: participantIds.length,
      submittedVoterIds: [],
      roundResults: [],
    },
  };
}

export function markSommelierSubmittedState(
  state: RoomState,
  sessionId: string,
  playerId: string,
): RoomState | null {
  const sommelier = state.sommelier;
  if (
    state.currentGame !== "sommelier" ||
    !sommelier ||
    sommelier.sessionId !== sessionId ||
    sommelier.phase !== "capture" ||
    !sommelier.participantIds.includes(playerId)
  ) {
    return null;
  }
  if (sommelier.submittedPlayerIds.includes(playerId)) return state;
  return {
    ...state,
    sommelier: {
      ...sommelier,
      submittedPlayerIds: [...sommelier.submittedPlayerIds, playerId],
    },
  };
}

export function beginSommelierAnalysisState(state: RoomState, sessionId: string): RoomState | null {
  const sommelier = state.sommelier;
  if (
    !sommelier ||
    sommelier.sessionId !== sessionId ||
    sommelier.phase !== "capture" ||
    sommelier.submittedPlayerIds.length < 2
  ) {
    return null;
  }
  return {
    ...state,
    sommelier: { ...sommelier, phase: "analyzing", captureEndsAt: undefined },
  };
}

export function openSommelierVotingState(
  state: RoomState,
  params: {
    sessionId: string;
    entryId: string;
    profile: NonNullable<RoomState["sommelier"]>["currentProfile"];
    aiFallback: boolean;
    roundNumber: number;
    totalRounds: number;
    now?: number;
  },
): RoomState | null {
  const sommelier = state.sommelier;
  if (
    !sommelier ||
    sommelier.sessionId !== params.sessionId ||
    !["capture", "analyzing", "reveal"].includes(sommelier.phase) ||
    !params.profile ||
    params.totalRounds < 2 ||
    params.roundNumber < 1 ||
    params.roundNumber > params.totalRounds
  ) {
    return null;
  }
  return {
    ...state,
    sommelier: {
      ...sommelier,
      phase: "voting",
      captureEndsAt: undefined,
      currentEntryId: params.entryId,
      currentProfile: params.profile,
      currentAiFallback: params.aiFallback,
      roundNumber: params.roundNumber,
      totalRounds: params.totalRounds,
      votingEndsAt: (params.now ?? Date.now()) + SOMMELIER_VOTING_MS,
      submittedVoterIds: [],
      result: undefined,
    },
  };
}

export function markSommelierVotedState(
  state: RoomState,
  params: { sessionId: string; entryId: string; playerId: string },
): RoomState | null {
  const sommelier = state.sommelier;
  if (
    !sommelier ||
    sommelier.sessionId !== params.sessionId ||
    sommelier.currentEntryId !== params.entryId ||
    sommelier.phase !== "voting" ||
    !state.players.some((player) => player.id === params.playerId)
  ) {
    return null;
  }
  if (sommelier.submittedVoterIds.includes(params.playerId)) return state;
  return {
    ...state,
    sommelier: {
      ...sommelier,
      submittedVoterIds: [...sommelier.submittedVoterIds, params.playerId],
    },
  };
}

export function revealSommelierEntryState(
  state: RoomState,
  sessionId: string,
  result: NonNullable<RoomState["sommelier"]>["roundResults"][number],
): RoomState | null {
  const sommelier = state.sommelier;
  if (
    !sommelier ||
    sommelier.sessionId !== sessionId ||
    sommelier.currentEntryId !== result.entryId ||
    !["voting", "reveal"].includes(sommelier.phase)
  ) {
    return null;
  }
  if (sommelier.roundResults.some((entry) => entry.entryId === result.entryId)) return state;
  return {
    ...state,
    sommelier: {
      ...sommelier,
      phase: "reveal",
      votingEndsAt: undefined,
      result,
      roundResults: [...sommelier.roundResults, result],
    },
  };
}

export function openSommelierCrowdFavoriteState(
  state: RoomState,
  sessionId: string,
  entryId: string,
): RoomState | null {
  const sommelier = state.sommelier;
  if (
    !sommelier ||
    sommelier.sessionId !== sessionId ||
    sommelier.currentEntryId !== entryId ||
    sommelier.phase !== "reveal" ||
    sommelier.roundResults.length !== sommelier.totalRounds
  ) {
    return null;
  }
  return {
    ...state,
    sommelier: {
      ...sommelier,
      phase: "crowd-favorite",
      currentEntryId: undefined,
      currentProfile: undefined,
      currentAiFallback: undefined,
      submittedVoterIds: [],
      result: undefined,
    },
  };
}

export function finalizeSommelierState(
  state: RoomState,
  params: { sessionId: string; entryId: string; ownerPlayerId: string },
): RoomState | null {
  const sommelier = state.sommelier;
  if (!sommelier || sommelier.sessionId !== params.sessionId) return null;
  if (sommelier.phase === "results" && sommelier.crowdFavoriteEntryId === params.entryId) {
    return state;
  }
  if (
    sommelier.phase !== "crowd-favorite" ||
    !sommelier.roundResults.some(
      (result) =>
        result.entryId === params.entryId && result.ownerPlayerId === params.ownerPlayerId,
    )
  ) {
    return null;
  }
  return {
    ...state,
    sommelier: {
      ...sommelier,
      phase: "results",
      crowdFavoriteEntryId: params.entryId,
      crowdFavoriteOwnerId: params.ownerPlayerId,
    },
  };
}

export const TOAST_SYNDICATE_TOTAL_ROUNDS = 6;
export const TOAST_BRIEFING_MS = 45_000;
export const TOAST_RECORDING_MS = 60_000;
export const TOAST_CATCHING_MS = 45_000;

function toastRoundId(sessionId: string, roundNumber: number) {
  return `${sessionId}_r${roundNumber}`;
}

function pickToastSpeaker(state: RoomState, previousSpeakerId: string | undefined, seed = 0) {
  const candidates = state.players.filter((player) => player.id !== previousSpeakerId);
  const pool = candidates.length > 0 ? candidates : state.players;
  const index = Math.min(
    pool.length - 1,
    Math.floor(Math.max(0, Math.min(0.999999, seed)) * pool.length),
  );
  return pool[index];
}

export function launchToastSyndicateState(
  state: RoomState,
  sessionId: string,
  random = 0,
): RoomState | null {
  if (state.players.length < 3) return null;
  const speaker = pickToastSpeaker(state, undefined, random);
  if (!speaker) return null;
  return {
    ...basePlayingState(state),
    currentGame: "toastsyndicate",
    toastsyndicate: {
      phase: "briefing",
      sessionId,
      roundId: toastRoundId(sessionId, 1),
      roundNumber: 1,
      totalRounds: TOAST_SYNDICATE_TOTAL_ROUNDS,
      speakerPlayerId: speaker.id,
      speakerName: speaker.name,
      recordingSubmitted: false,
      submittedListenerIds: [],
      roundResults: [],
    },
  };
}

export function assignToastSyndicateState(
  state: RoomState,
  params: {
    roundId: string;
    genre: string;
    genreInstructions: string;
    aiFallback: boolean;
    now?: number;
  },
): RoomState | null {
  const toast = state.toastsyndicate;
  if (
    state.currentGame !== "toastsyndicate" ||
    !toast ||
    toast.roundId !== params.roundId ||
    toast.phase !== "briefing"
  ) {
    return null;
  }
  if (toast.genre) return state;
  return {
    ...state,
    toastsyndicate: {
      ...toast,
      genre: params.genre,
      genreInstructions: params.genreInstructions,
      briefingEndsAt: (params.now ?? Date.now()) + TOAST_BRIEFING_MS,
      aiFallback: params.aiFallback,
    },
  };
}

export function startToastRecordingState(
  state: RoomState,
  roundId: string,
  now = Date.now(),
): RoomState | null {
  const toast = state.toastsyndicate;
  if (
    state.currentGame !== "toastsyndicate" ||
    !toast ||
    toast.roundId !== roundId ||
    toast.phase !== "briefing" ||
    !toast.genre
  ) {
    return null;
  }
  return {
    ...state,
    toastsyndicate: {
      ...toast,
      phase: "recording",
      briefingEndsAt: undefined,
      recordingEndsAt: now + TOAST_RECORDING_MS,
    },
  };
}

export function markToastRecordingSubmittedState(
  state: RoomState,
  roundId: string,
  now = Date.now(),
): RoomState | null {
  const toast = state.toastsyndicate;
  if (
    state.currentGame !== "toastsyndicate" ||
    !toast ||
    toast.roundId !== roundId ||
    !["recording", "catching"].includes(toast.phase)
  ) {
    return null;
  }
  if (toast.recordingSubmitted) return state;
  return {
    ...state,
    toastsyndicate: {
      ...toast,
      phase: "catching",
      recordingSubmitted: true,
      recordingEndsAt: undefined,
      catchingEndsAt: now + TOAST_CATCHING_MS,
    },
  };
}

export function markToastListenerSubmittedState(
  state: RoomState,
  roundId: string,
  playerId: string,
): RoomState | null {
  const toast = state.toastsyndicate;
  if (
    state.currentGame !== "toastsyndicate" ||
    !toast ||
    toast.roundId !== roundId ||
    toast.phase !== "catching" ||
    toast.speakerPlayerId === playerId ||
    !state.players.some((player) => player.id === playerId)
  ) {
    return null;
  }
  if (toast.submittedListenerIds.includes(playerId)) return state;
  return {
    ...state,
    toastsyndicate: {
      ...toast,
      submittedListenerIds: [...toast.submittedListenerIds, playerId],
    },
  };
}

export function beginToastJudgingState(state: RoomState, roundId: string): RoomState | null {
  const toast = state.toastsyndicate;
  if (!toast || toast.roundId !== roundId || toast.phase !== "catching") return null;
  return {
    ...state,
    toastsyndicate: { ...toast, phase: "judging", catchingEndsAt: undefined },
  };
}

export function finalizeToastSyndicateState(
  state: RoomState,
  roundId: string,
  result: NonNullable<RoomState["toastsyndicate"]>["roundResults"][number],
): RoomState | null {
  const toast = state.toastsyndicate;
  if (
    !toast ||
    toast.roundId !== roundId ||
    !["catching", "judging", "results"].includes(toast.phase)
  ) {
    return null;
  }
  if (toast.result?.roundId === roundId) return state;
  return {
    ...state,
    toastsyndicate: {
      ...toast,
      phase: "results",
      catchingEndsAt: undefined,
      result,
      roundResults: [...toast.roundResults, result],
    },
  };
}

export function nextToastSyndicateRoundState(
  state: RoomState,
  roundId: string,
  random = 0,
): RoomState | null {
  const toast = state.toastsyndicate;
  if (!toast || toast.roundId !== roundId || toast.phase !== "results") return null;
  if (toast.roundNumber >= toast.totalRounds) return state;
  const nextRoundNumber = toast.roundNumber + 1;
  const speaker = pickToastSpeaker(state, toast.speakerPlayerId, random);
  if (!speaker) return null;
  return {
    ...state,
    toastsyndicate: {
      phase: "briefing",
      sessionId: toast.sessionId,
      roundId: toastRoundId(toast.sessionId, nextRoundNumber),
      roundNumber: nextRoundNumber,
      totalRounds: toast.totalRounds,
      speakerPlayerId: speaker.id,
      speakerName: speaker.name,
      recordingSubmitted: false,
      submittedListenerIds: [],
      roundResults: toast.roundResults,
    },
  };
}

export const STILL_LIFE_TOTAL_ROUNDS = 2;
export const STILL_LIFE_BUILDING_MS = 5 * 60_000;
export const STILL_LIFE_VOTING_MS = 45_000;

function stillLifeRoundId(sessionId: string, roundNumber: number) {
  return `${sessionId}_r${roundNumber}`;
}

function activeStillLifeTeamIds(state: RoomState) {
  const represented = new Set(state.players.map((player) => player.teamId));
  return state.teams.filter((team) => represented.has(team.id)).map((team) => team.id);
}

export function launchStillLifeState(state: RoomState, sessionId: string): RoomState | null {
  const activeTeamIds = activeStillLifeTeamIds(state);
  if (activeTeamIds.length < 2) return null;
  return {
    ...basePlayingState(state),
    currentGame: "stilllife",
    stilllife: {
      phase: "briefing",
      sessionId,
      roundId: stillLifeRoundId(sessionId, 1),
      roundNumber: 1,
      totalRounds: STILL_LIFE_TOTAL_ROUNDS,
      activeTeamIds,
      submittedTeamIds: [],
      submittedVoterIds: [],
      roundResults: [],
    },
  };
}

export function prepareStillLifeRoundState(
  state: RoomState,
  params: { roundId: string; headline: string; aiFallback: boolean; now?: number },
): RoomState | null {
  const still = state.stilllife;
  if (
    state.currentGame !== "stilllife" ||
    !still ||
    still.roundId !== params.roundId ||
    still.phase !== "briefing"
  ) {
    return null;
  }
  if (still.headline) return state;
  return {
    ...state,
    stilllife: {
      ...still,
      phase: "building",
      headline: params.headline,
      headlineAiFallback: params.aiFallback,
      buildingEndsAt: (params.now ?? Date.now()) + STILL_LIFE_BUILDING_MS,
    },
  };
}

export function markStillLifeTeamSubmittedState(
  state: RoomState,
  roundId: string,
  teamId: string,
): RoomState | null {
  const still = state.stilllife;
  if (
    state.currentGame !== "stilllife" ||
    !still ||
    still.roundId !== roundId ||
    still.phase !== "building" ||
    !still.activeTeamIds.includes(teamId)
  ) {
    return null;
  }
  if (still.submittedTeamIds.includes(teamId)) return state;
  return {
    ...state,
    stilllife: {
      ...still,
      submittedTeamIds: [...still.submittedTeamIds, teamId],
    },
  };
}

export function beginStillLifeJudgingState(state: RoomState, roundId: string): RoomState | null {
  const still = state.stilllife;
  if (!still || still.roundId !== roundId || still.phase !== "building") return null;
  if (still.submittedTeamIds.length < 2) return null;
  return {
    ...state,
    stilllife: { ...still, phase: "judging", buildingEndsAt: undefined },
  };
}

export function openStillLifeVotingState(
  state: RoomState,
  params: {
    roundId: string;
    judgments: NonNullable<RoomState["stilllife"]>["judgments"];
    now?: number;
  },
): RoomState | null {
  const still = state.stilllife;
  if (
    !still ||
    still.roundId !== params.roundId ||
    !["building", "judging"].includes(still.phase)
  ) {
    return null;
  }
  if (!params.judgments || params.judgments.length < 2) return null;
  return {
    ...state,
    stilllife: {
      ...still,
      phase: "voting",
      buildingEndsAt: undefined,
      votingEndsAt: (params.now ?? Date.now()) + STILL_LIFE_VOTING_MS,
      judgments: params.judgments,
      submittedVoterIds: [],
    },
  };
}

export function markStillLifeVotedState(
  state: RoomState,
  roundId: string,
  playerId: string,
): RoomState | null {
  const still = state.stilllife;
  if (
    !still ||
    still.roundId !== roundId ||
    still.phase !== "voting" ||
    !state.players.some((player) => player.id === playerId)
  ) {
    return null;
  }
  if (still.submittedVoterIds.includes(playerId)) return state;
  return {
    ...state,
    stilllife: {
      ...still,
      submittedVoterIds: [...still.submittedVoterIds, playerId],
    },
  };
}

export function finalizeStillLifeState(
  state: RoomState,
  roundId: string,
  result: NonNullable<RoomState["stilllife"]>["roundResults"][number],
): RoomState | null {
  const still = state.stilllife;
  if (!still || still.roundId !== roundId || !["voting", "results"].includes(still.phase)) {
    return null;
  }
  if (still.result?.roundId === roundId) return state;
  return {
    ...state,
    stilllife: {
      ...still,
      phase: "results",
      votingEndsAt: undefined,
      result,
      roundResults: [...still.roundResults, result],
    },
  };
}

export function nextStillLifeRoundState(state: RoomState, roundId: string): RoomState | null {
  const still = state.stilllife;
  if (!still || still.roundId !== roundId || still.phase !== "results") return null;
  if (still.roundNumber >= still.totalRounds) return state;
  const roundNumber = still.roundNumber + 1;
  return {
    ...state,
    stilllife: {
      phase: "briefing",
      sessionId: still.sessionId,
      roundId: stillLifeRoundId(still.sessionId, roundNumber),
      roundNumber,
      totalRounds: still.totalRounds,
      activeTeamIds: still.activeTeamIds,
      submittedTeamIds: [],
      submittedVoterIds: [],
      roundResults: still.roundResults,
    },
  };
}

export const GRILL_ORACLE_CAPTURE_MS = 15 * 60_000;

export function launchSmokeScreenState(
  state: RoomState,
  runId: string,
  now = Date.now(),
): RoomState | null {
  if (state.players.length < 3) return null;
  if (state.smokescreen && state.smokescreen.status !== "results") return null;
  return {
    ...state,
    status: "playing",
    paused: undefined,
    smokescreen: {
      runId,
      status: "assigning",
      participantIds: state.players.map((player) => player.id),
      assignedPlayerIds: [],
      submittedVoterIds: [],
      startedAt: now,
    },
  };
}

export function launchContrabandState(
  state: RoomState,
  runId: string,
  now = Date.now(),
): RoomState | null {
  if (state.players.length < 3 || state.players.length > 30) return null;
  if (state.contraband && state.contraband.status !== "results") return null;
  return {
    ...state,
    status: "playing",
    paused: undefined,
    contraband: {
      runId,
      status: "assigning",
      participantIds: state.players.map((player) => player.id),
      assignedPlayerIds: [],
      resolvedPlayerIds: [],
      startedAt: now,
    },
  };
}

export function tongsLevelForRound(
  roundNumber: number,
  totalRounds: number,
  compact: boolean,
): 1 | 2 | 3 {
  if (compact) return 3;
  const progress = roundNumber / Math.max(1, totalRounds);
  return progress <= 1 / 3 ? 1 : progress <= 2 / 3 ? 2 : 3;
}

export function tongsRoundId(runId: string, roundNumber: number) {
  return `${runId}_r${roundNumber}`;
}

export function launchTongsOfTruthState(
  state: RoomState,
  runId: string,
  random = 0,
): RoomState | null {
  if (state.players.length < 3 || state.players.length > 30) return null;
  if (state.tongsoftruth && state.tongsoftruth.status !== "results") return null;
  const start = Math.floor(Math.max(0, Math.min(0.999999, random)) * state.players.length);
  const rotated = Array.from(
    { length: state.players.length },
    (_, offset) => state.players[(start + offset) % state.players.length]!.id,
  );
  const compact = state.party?.contingency === "compact";
  const speakerOrder = compact ? rotated.slice(0, Math.min(5, rotated.length)) : rotated;
  const speaker = state.players.find((player) => player.id === speakerOrder[0]);
  if (!speaker) return null;
  const totalRounds = speakerOrder.length;
  return {
    ...state,
    status: "playing",
    paused: undefined,
    tongsoftruth: {
      runId,
      status: "question",
      participantIds: state.players.map((player) => player.id),
      speakerOrder,
      roundNumber: 1,
      totalRounds,
      currentRoundId: tongsRoundId(runId, 1),
      speakerPlayerId: speaker.id,
      speakerName: speaker.name,
      level: tongsLevelForRound(1, totalRounds, compact),
      roundResults: [],
    },
  };
}

export function setTongsQuestionState(
  state: RoomState,
  params: { runId: string; roundId: string; question: string; aiFallback: boolean },
): RoomState | null {
  const run = state.tongsoftruth;
  if (
    !run ||
    run.runId !== params.runId ||
    run.currentRoundId !== params.roundId ||
    run.status !== "question"
  ) {
    return null;
  }
  if (run.question) return state;
  return {
    ...state,
    tongsoftruth: {
      ...run,
      question: params.question,
      questionAiFallback: params.aiFallback,
    },
  };
}

export function startTongsRecordingState(
  state: RoomState,
  params: { runId: string; playerId: string; now?: number },
): RoomState | null {
  const run = state.tongsoftruth;
  if (
    !run ||
    run.runId !== params.runId ||
    run.status !== "question" ||
    !run.question ||
    run.speakerPlayerId !== params.playerId
  ) {
    return null;
  }
  return {
    ...state,
    tongsoftruth: {
      ...run,
      status: "recording",
      recordingEndsAt: (params.now ?? Date.now()) + TONGS_RECORDING_WINDOW_MS,
    },
  };
}

export function markTongsJudgingState(
  state: RoomState,
  runId: string,
  roundId: string,
): RoomState | null {
  const run = state.tongsoftruth;
  if (
    !run ||
    run.runId !== runId ||
    run.currentRoundId !== roundId ||
    !["recording", "judging"].includes(run.status)
  ) {
    return null;
  }
  return {
    ...state,
    tongsoftruth: { ...run, status: "judging", recordingEndsAt: undefined },
  };
}

export function reviewTongsRoundState(
  state: RoomState,
  runId: string,
  roundId: string,
): RoomState | null {
  const run = state.tongsoftruth;
  if (
    !run ||
    run.runId !== runId ||
    run.currentRoundId !== roundId ||
    !["recording", "judging", "review"].includes(run.status)
  ) {
    return null;
  }
  return {
    ...state,
    tongsoftruth: { ...run, status: "review", recordingEndsAt: undefined },
  };
}

export function revealTongsRoundState(
  state: RoomState,
  runId: string,
  result: NonNullable<RoomState["tongsoftruth"]>["result"],
): RoomState | null {
  const run = state.tongsoftruth;
  if (!run || !result || run.runId !== runId || run.currentRoundId !== result.roundId) return null;
  if (run.status === "reveal" && run.result?.roundId === result.roundId) return state;
  if (!["question", "recording", "judging", "review"].includes(run.status)) return null;
  return {
    ...state,
    tongsoftruth: {
      ...run,
      status: "reveal",
      recordingEndsAt: undefined,
      result,
      roundResults: [...run.roundResults, result],
    },
  };
}

export function nextTongsRoundState(
  state: RoomState,
  runId: string,
  now = Date.now(),
): RoomState | null {
  const run = state.tongsoftruth;
  if (!run || run.runId !== runId) return null;
  if (run.status === "results") return capturePartyEvidenceState(state, now);
  if (run.status !== "reveal") return null;
  if (run.roundNumber >= run.totalRounds) {
    return capturePartyEvidenceState(
      completeRunOfShowGameStepState(
        {
          ...state,
          tongsoftruth: { ...run, status: "results", result: undefined, completedAt: now },
        },
        "tongsoftruth",
        state.party?.contingency === "compact" ? "blitz" : "start",
      ),
      now,
    );
  }
  const roundNumber = run.roundNumber + 1;
  const speakerId = run.speakerOrder[roundNumber - 1];
  const speaker = state.players.find((player) => player.id === speakerId);
  if (!speaker) return null;
  const compact = state.party?.contingency === "compact";
  return {
    ...state,
    tongsoftruth: {
      ...run,
      status: "question",
      roundNumber,
      currentRoundId: tongsRoundId(runId, roundNumber),
      speakerPlayerId: speaker.id,
      speakerName: speaker.name,
      level: tongsLevelForRound(roundNumber, run.totalRounds, compact),
      question: undefined,
      questionAiFallback: undefined,
      recordingEndsAt: undefined,
      result: undefined,
    },
  };
}

export const CROSS_EXAMINATION_RECORDING_MS = 2 * 60_000;

export function selectCrossExaminationPairs(
  state: RoomState,
  runId: string,
  random = 0,
): CrossExaminationPair[] {
  const playerCount = state.players.length;
  if (playerCount < 6) return [];
  const start = Math.floor(Math.max(0, Math.min(0.999999, random)) * playerCount);
  const rotated = Array.from(
    { length: playerCount },
    (_, offset) => state.players[(start + offset) % playerCount]!,
  );
  const byTeam = state.teams.map((team) => rotated.filter((player) => player.teamId === team.id));
  const paired: Array<[(typeof rotated)[number], (typeof rotated)[number]]> = [];
  const leftovers: typeof rotated = [];
  byTeam.forEach((players) => {
    for (let index = 0; index + 1 < players.length; index += 2) {
      paired.push([players[index]!, players[index + 1]!]);
    }
    if (players.length % 2 === 1) leftovers.push(players.at(-1)!);
  });
  for (let index = 0; index + 1 < leftovers.length; index += 2) {
    paired.push([leftovers[index]!, leftovers[index + 1]!]);
  }
  const target = Math.min(4, Math.floor(playerCount / 2));
  return paired.slice(0, target).map(([playerA, playerB], index) => ({
    pairId: `${runId}_p${index + 1}`,
    playerAId: playerA.id,
    playerAName: playerA.name,
    playerBId: playerB.id,
    playerBName: playerB.name,
  }));
}

export function launchCrossExaminationState(
  state: RoomState,
  runId: string,
  random = 0,
): RoomState | null {
  if (state.players.length < 6 || state.players.length > 30) return null;
  const pairOrder = selectCrossExaminationPairs(state, runId, random);
  if (pairOrder.length < 3) return null;
  return {
    ...basePlayingState(state),
    currentGame: "crossexamination",
    crossexamination: {
      runId,
      status: "curation",
      participantIds: state.players.map((player) => player.id),
      pairOrder,
      pairNumber: 1,
      totalPairs: pairOrder.length,
      currentPairId: pairOrder[0]!.pairId,
      submittedPlayerIds: [],
      predictionVoterIds: [],
      pairResults: [],
    },
  };
}

export function setCrossExaminationQuestionsState(
  state: RoomState,
  params: {
    runId: string;
    pairId: string;
    questions: CrossExaminationQuestion[];
    selectedSourceCount: number;
    aiFallback: boolean;
  },
): RoomState | null {
  const run = state.crossexamination;
  if (
    !run ||
    run.runId !== params.runId ||
    run.currentPairId !== params.pairId ||
    !["curation", "briefing"].includes(run.status) ||
    params.questions.length !== 4
  ) {
    return null;
  }
  if (run.status === "briefing" && run.questions?.length === 4) return state;
  return {
    ...state,
    crossexamination: {
      ...run,
      status: "briefing",
      questions: params.questions,
      selectedSourceCount: params.selectedSourceCount,
      questionsAiFallback: params.aiFallback,
      submittedPlayerIds: [],
      predictionVoterIds: [],
      recordingEndsAt: undefined,
      result: undefined,
    },
  };
}

export function openCrossExaminationCaptureState(
  state: RoomState,
  runId: string,
  pairId: string,
  now = Date.now(),
): RoomState | null {
  const run = state.crossexamination;
  if (!run || run.runId !== runId || run.currentPairId !== pairId || !run.questions) return null;
  if (run.status === "capturing") return state;
  if (run.status !== "briefing") return null;
  return {
    ...state,
    crossexamination: {
      ...run,
      status: "capturing",
      recordingEndsAt: now + CROSS_EXAMINATION_RECORDING_MS,
    },
  };
}

export function markCrossExaminationPredictionState(
  state: RoomState,
  runId: string,
  pairId: string,
  playerId: string,
): RoomState | null {
  const run = state.crossexamination;
  if (
    !run ||
    run.runId !== runId ||
    run.currentPairId !== pairId ||
    !["capturing", "comparing", "review"].includes(run.status)
  ) {
    return null;
  }
  if (run.predictionVoterIds.includes(playerId)) return state;
  return {
    ...state,
    crossexamination: {
      ...run,
      predictionVoterIds: [...run.predictionVoterIds, playerId],
    },
  };
}

export function markCrossExaminationSubmittedState(
  state: RoomState,
  runId: string,
  pairId: string,
  playerId: string,
): RoomState | null {
  const run = state.crossexamination;
  if (
    !run ||
    run.runId !== runId ||
    run.currentPairId !== pairId ||
    !["capturing", "comparing"].includes(run.status)
  ) {
    return null;
  }
  const pair = run.pairOrder[run.pairNumber - 1];
  if (!pair || ![pair.playerAId, pair.playerBId].includes(playerId)) return null;
  const submittedPlayerIds = run.submittedPlayerIds.includes(playerId)
    ? run.submittedPlayerIds
    : [...run.submittedPlayerIds, playerId];
  const complete = [pair.playerAId, pair.playerBId].every((id) => submittedPlayerIds.includes(id));
  return {
    ...state,
    crossexamination: {
      ...run,
      status: complete ? "comparing" : "capturing",
      submittedPlayerIds,
      recordingEndsAt: complete ? undefined : run.recordingEndsAt,
    },
  };
}

export function reviewCrossExaminationState(
  state: RoomState,
  runId: string,
  pairId: string,
): RoomState | null {
  const run = state.crossexamination;
  if (
    !run ||
    run.runId !== runId ||
    run.currentPairId !== pairId ||
    !["capturing", "comparing", "review"].includes(run.status)
  ) {
    return null;
  }
  return {
    ...state,
    crossexamination: { ...run, status: "review", recordingEndsAt: undefined },
  };
}

export function revealCrossExaminationState(
  state: RoomState,
  runId: string,
  result: CrossExaminationPairResult,
): RoomState | null {
  const run = state.crossexamination;
  if (!run || run.runId !== runId || run.currentPairId !== result.pairId) return null;
  if (run.status === "reveal" && run.result?.pairId === result.pairId) return state;
  if (!["capturing", "comparing", "review", "briefing"].includes(run.status)) return null;
  return {
    ...state,
    crossexamination: {
      ...run,
      status: "reveal",
      recordingEndsAt: undefined,
      result,
      pairResults: [...run.pairResults, result],
    },
  };
}

export function nextCrossExaminationPairState(
  state: RoomState,
  params: {
    runId: string;
    pairId: string;
    questions?: CrossExaminationQuestion[];
    selectedSourceCount?: number;
    aiFallback?: boolean;
    now?: number;
  },
): RoomState | null {
  const run = state.crossexamination;
  if (!run || run.runId !== params.runId) return null;
  if (
    run.status === "results" &&
    run.pairResults.some((result) => result.pairId === params.pairId)
  ) {
    return capturePartyEvidenceState(state, params.now ?? Date.now());
  }
  if (run.status !== "reveal" || run.currentPairId !== params.pairId) return null;
  if (run.pairNumber >= run.totalPairs) {
    const now = params.now ?? Date.now();
    return capturePartyEvidenceState(
      {
        ...state,
        currentGame: null,
        crossexamination: {
          ...run,
          status: "results",
          result: undefined,
          completedAt: now,
        },
      },
      now,
    );
  }
  if (params.questions?.length !== 4) return null;
  const pairNumber = run.pairNumber + 1;
  return {
    ...state,
    crossexamination: {
      ...run,
      status: "briefing",
      pairNumber,
      currentPairId: run.pairOrder[pairNumber - 1]!.pairId,
      questions: params.questions,
      selectedSourceCount: params.selectedSourceCount,
      questionsAiFallback: params.aiFallback,
      submittedPlayerIds: [],
      predictionVoterIds: [],
      recordingEndsAt: undefined,
      result: undefined,
    },
  };
}

export function dismissCrossExaminationState(
  state: RoomState,
  runId: string,
  now = Date.now(),
): RoomState | null {
  const run = state.crossexamination;
  if (!run || run.runId !== runId) return null;
  if (run.status === "results") return capturePartyEvidenceState(state, now);
  return capturePartyEvidenceState(
    {
      ...state,
      currentGame: null,
      crossexamination: {
        ...run,
        status: "results",
        questions: undefined,
        recordingEndsAt: undefined,
        result: undefined,
        completedAt: now,
      },
    },
    now,
  );
}

export function markContrabandAssignedState(
  state: RoomState,
  runId: string,
  assignedPlayerIds: string[],
  now = Date.now(),
): RoomState | null {
  const run = state.contraband;
  if (!run || run.runId !== runId || !["assigning", "active"].includes(run.status)) return null;
  const assigned = run.participantIds.filter((id) => assignedPlayerIds.includes(id));
  const ready = assigned.length === run.participantIds.length;
  return {
    ...state,
    contraband: {
      ...run,
      assignedPlayerIds: assigned,
      status: ready ? "active" : "assigning",
      endsAt: ready ? (run.endsAt ?? now + CONTRABAND_DURATION_MS) : undefined,
    },
  };
}

export function openContrabandAccusationState(
  state: RoomState,
  params: {
    runId: string;
    accusationId: string;
    accuserPlayerId: string;
    accusedPlayerId: string;
    now?: number;
  },
): RoomState | null {
  const run = state.contraband;
  const now = params.now ?? Date.now();
  if (
    !run ||
    run.runId !== params.runId ||
    run.status !== "active" ||
    (run.endsAt && now > run.endsAt) ||
    params.accuserPlayerId === params.accusedPlayerId ||
    !run.participantIds.includes(params.accuserPlayerId) ||
    !run.participantIds.includes(params.accusedPlayerId) ||
    run.resolvedPlayerIds.includes(params.accusedPlayerId)
  ) {
    return null;
  }
  return {
    ...state,
    contraband: {
      ...run,
      status: "awaiting-response",
      activeAccusation: {
        accusationId: params.accusationId,
        accuserPlayerId: params.accuserPlayerId,
        accusedPlayerId: params.accusedPlayerId,
        createdAt: now,
      },
      lastResolution: undefined,
    },
  };
}

export function disputeContrabandAccusationState(
  state: RoomState,
  runId: string,
  accusationId: string,
  now = Date.now(),
): RoomState | null {
  const run = state.contraband;
  if (
    !run ||
    run.runId !== runId ||
    run.status !== "awaiting-response" ||
    run.activeAccusation?.accusationId !== accusationId
  ) {
    return null;
  }
  return {
    ...state,
    contraband: {
      ...run,
      status: "awaiting-audio",
      activeAccusation: { ...run.activeAccusation, audioEndsAt: now + CONTRABAND_AUDIO_WINDOW_MS },
    },
  };
}

export function reviewContrabandAccusationState(
  state: RoomState,
  runId: string,
  accusationId: string,
): RoomState | null {
  const run = state.contraband;
  if (
    !run ||
    run.runId !== runId ||
    !["awaiting-audio", "review"].includes(run.status) ||
    run.activeAccusation?.accusationId !== accusationId
  ) {
    return null;
  }
  return { ...state, contraband: { ...run, status: "review" } };
}

export function resolveContrabandAccusationState(
  state: RoomState,
  params: {
    runId: string;
    accusationId: string;
    outcome: "caught" | "clean" | "false-accusation";
    now?: number;
  },
): RoomState | null {
  const run = state.contraband;
  if (
    !run ||
    run.runId !== params.runId ||
    !["awaiting-response", "awaiting-audio", "review"].includes(run.status) ||
    run.activeAccusation?.accusationId !== params.accusationId
  ) {
    return null;
  }
  const resolvedPlayerIds =
    params.outcome === "false-accusation"
      ? run.resolvedPlayerIds
      : [...new Set([...run.resolvedPlayerIds, run.activeAccusation.accusedPlayerId])];
  return {
    ...state,
    contraband: {
      ...run,
      status: "active",
      resolvedPlayerIds,
      activeAccusation: undefined,
      lastResolution: {
        accusationId: params.accusationId,
        accuserPlayerId: run.activeAccusation.accuserPlayerId,
        accusedPlayerId: run.activeAccusation.accusedPlayerId,
        outcome: params.outcome,
        smugglerPoints: params.outcome === "clean" ? 10 : 0,
        catcherPoints: params.outcome === "caught" ? 5 : 0,
        falseAccusationPenalty: params.outcome === "false-accusation" ? -2 : 0,
        completedAt: params.now ?? Date.now(),
      },
    },
  };
}

export function finalizeContrabandState(
  state: RoomState,
  params: {
    runId: string;
    results: NonNullable<RoomState["contraband"]>["results"];
    now?: number;
  },
): RoomState | null {
  const run = state.contraband;
  if (!run || run.runId !== params.runId) return null;
  const completedAt = params.now ?? Date.now();
  if (run.status === "results") return capturePartyEvidenceState(state, completedAt);
  if (run.activeAccusation) return null;
  return capturePartyEvidenceState(
    {
      ...state,
      contraband: {
        ...run,
        status: "results",
        results: params.results,
        resolvedPlayerIds: run.participantIds,
        completedAt,
        activeAccusation: undefined,
      },
    },
    completedAt,
  );
}

export function markSmokeScreenAssignedState(
  state: RoomState,
  runId: string,
  assignedPlayerIds: string[],
): RoomState | null {
  const smoke = state.smokescreen;
  if (!smoke || smoke.runId !== runId || !["assigning", "active"].includes(smoke.status)) {
    return null;
  }
  const assigned = smoke.participantIds.filter((playerId) => assignedPlayerIds.includes(playerId));
  return {
    ...state,
    smokescreen: {
      ...smoke,
      assignedPlayerIds: assigned,
      status: assigned.length >= smoke.participantIds.length ? "active" : "assigning",
    },
  };
}

export function transitionSmokeScreenState(
  state: RoomState,
  params: { runId: string; status: "sealed" | "revealed"; now?: number },
): RoomState | null {
  const smoke = state.smokescreen;
  if (!smoke || smoke.runId !== params.runId) return null;
  const order = { assigning: 0, active: 1, sealed: 2, revealed: 3, results: 4 } as const;
  if (order[smoke.status] > order[params.status]) return state;
  if (params.status === "sealed" && !["assigning", "active", "sealed"].includes(smoke.status)) {
    return null;
  }
  if (params.status === "revealed" && !["sealed", "revealed"].includes(smoke.status)) return null;
  return {
    ...state,
    smokescreen: {
      ...smoke,
      status: params.status,
      ...(params.status === "revealed" ? { revealedAt: params.now ?? Date.now() } : {}),
    },
  };
}

export function markSmokeScreenVotedState(
  state: RoomState,
  runId: string,
  playerId: string,
): RoomState | null {
  const smoke = state.smokescreen;
  if (
    !smoke ||
    smoke.runId !== runId ||
    smoke.status !== "revealed" ||
    !smoke.participantIds.includes(playerId)
  ) {
    return null;
  }
  if (smoke.submittedVoterIds.includes(playerId)) return state;
  return {
    ...state,
    smokescreen: {
      ...smoke,
      submittedVoterIds: [...smoke.submittedVoterIds, playerId],
    },
  };
}

export function finalizeSmokeScreenState(
  state: RoomState,
  params: {
    runId: string;
    results: SmokeScreenResultEntry[];
    recap: string;
    aiFallback: boolean;
    now?: number;
  },
): RoomState | null {
  const smoke = state.smokescreen;
  if (!smoke || smoke.runId !== params.runId) return null;
  const completedAt = params.now ?? Date.now();
  if (smoke.status === "results") return capturePartyEvidenceState(state, completedAt);
  if (smoke.status !== "revealed") return null;
  return capturePartyEvidenceState(
    completeRunOfShowGameStepState(
      {
        ...state,
        smokescreen: {
          ...smoke,
          status: "results",
          results: params.results,
          recap: params.recap,
          aiFallback: params.aiFallback,
          completedAt,
        },
      },
      "smokescreen",
      "reveal",
    ),
    completedAt,
  );
}

export function launchGrillOracleState(
  state: RoomState,
  roundId: string,
  now = Date.now(),
): RoomState | null {
  if (state.players.length < 1) return null;
  return {
    ...basePlayingState(state),
    currentGame: "grilloracle",
    oracleMemory: {
      runId: roundId,
      participantIds: state.players.map((player) => player.id),
      submittedPlayerIds: [],
      verifiedPlayerIds: [],
      status: "collecting",
    },
    grilloracle: {
      phase: "capturing",
      roundId,
      participantIds: state.players.map((player) => player.id),
      submittedPlayerIds: [],
      captureEndsAt: now + GRILL_ORACLE_CAPTURE_MS,
    },
  };
}

export function markGrillOracleSubmittedState(
  state: RoomState,
  roundId: string,
  playerId: string,
): RoomState | null {
  const oracle = state.grilloracle;
  if (
    state.currentGame !== "grilloracle" ||
    !oracle ||
    oracle.roundId !== roundId ||
    !oracle.participantIds.includes(playerId)
  ) {
    return null;
  }
  if (oracle.submittedPlayerIds.includes(playerId)) return state;
  if (oracle.phase !== "capturing") return null;
  const submittedPlayerIds = [...oracle.submittedPlayerIds, playerId];
  const completed = submittedPlayerIds.length >= oracle.participantIds.length;
  return {
    ...state,
    oracleMemory:
      state.oracleMemory?.runId === roundId
        ? {
            ...state.oracleMemory,
            submittedPlayerIds,
            status: completed ? "ready" : "collecting",
          }
        : state.oracleMemory,
    grilloracle: {
      ...oracle,
      phase: completed ? "results" : "capturing",
      submittedPlayerIds,
    },
  };
}

const ORACLE_MEMORY_STATUS_ORDER: Record<GrillOracleMemoryStatus, number> = {
  collecting: 0,
  ready: 1,
  sealed: 2,
  revealed: 3,
  verified: 4,
};

/** Monotonic server-side lifecycle update for the public, payload-free Oracle summary. */
export function transitionGrillOracleMemoryState(
  state: RoomState,
  params: {
    runId: string;
    status: "sealed" | "revealed";
    submittedPlayerIds?: string[];
  },
): RoomState | null {
  const memory = state.oracleMemory;
  if (!memory || memory.runId !== params.runId) return null;
  if (ORACLE_MEMORY_STATUS_ORDER[memory.status] > ORACLE_MEMORY_STATUS_ORDER[params.status]) {
    return state;
  }
  return {
    ...state,
    oracleMemory: {
      ...memory,
      submittedPlayerIds: params.submittedPlayerIds ?? memory.submittedPlayerIds,
      status: params.status,
    },
  };
}

export function markGrillOracleVerifiedState(
  state: RoomState,
  runId: string,
  playerId: string,
): RoomState | null {
  const memory = state.oracleMemory;
  if (!memory || memory.runId !== runId || !memory.submittedPlayerIds.includes(playerId)) {
    return null;
  }
  if (ORACLE_MEMORY_STATUS_ORDER[memory.status] < ORACLE_MEMORY_STATUS_ORDER.revealed) {
    return null;
  }
  const verifiedPlayerIds = [...new Set([...memory.verifiedPlayerIds, playerId])];
  const updated: RoomState = {
    ...state,
    oracleMemory: {
      ...memory,
      verifiedPlayerIds,
      status:
        verifiedPlayerIds.length >= memory.submittedPlayerIds.length ? "verified" : "revealed",
    },
  };
  return updated.oracleMemory?.status === "verified"
    ? completeRunOfShowGameStepState(updated, "grilloracle", "verify")
    : updated;
}

export function launchSoundscapeState(state: RoomState, roundId: string): RoomState {
  return {
    ...basePlayingState(state),
    currentGame: "soundscape",
    soundscape: { phase: "topics", roundId },
  };
}

export function launchChallengeState(
  state: RoomState,
  roundId: string,
  random = Math.random(),
): RoomState | null {
  if (state.players.length < 2) return null;
  const operatorIndex = Math.max(
    0,
    Math.min(state.players.length - 1, Math.floor(random * state.players.length)),
  );
  const operator = state.players[operatorIndex];

  return {
    ...basePlayingState(state),
    currentGame: "challenge",
    challenge: {
      phase: "briefing",
      roundId,
      operatorId: operator.id,
      operatorName: operator.name,
      pastOperatorIds: [],
    },
  };
}

export function launchPhotoHuntState(state: RoomState, roundId: string): RoomState | null {
  if (state.players.length < 1) return null;
  return {
    ...basePlayingState(state),
    currentGame: "phototunt",
    phototunt: {
      phase: "briefing",
      roundId,
      pastTasks: [],
    },
  };
}

export const TRACK_GUESS_TOTAL_ROUNDS = 5;
export const SPECTRUM_COURT_TOTAL_ROUNDS = 4;
export const WHO_AMONG_TOTAL_ROUNDS = 5;

export function launchTrackGuessState(state: RoomState, roundId: string): RoomState | null {
  if (state.players.length < 1) return null;
  return {
    ...basePlayingState(state),
    currentGame: "trackguess",
    trackguess: {
      phase: "briefing",
      roundId,
      roundNumber: 1,
      totalRounds: TRACK_GUESS_TOTAL_ROUNDS,
      usedTrackIds: [],
      roundResults: [],
    },
  };
}

export function launchSpectrumCourtState(state: RoomState, roundId: string): RoomState | null {
  const activeTeamIds = new Set(state.players.map((player) => player.teamId));
  if (activeTeamIds.size < 2) return null;
  return {
    ...basePlayingState(state),
    currentGame: "spectrumcourt",
    spectrumcourt: {
      phase: "briefing",
      roundId,
      roundNumber: 1,
      totalRounds: SPECTRUM_COURT_TOTAL_ROUNDS,
      usedSpectrumIds: [],
      roundResults: [],
    },
  };
}

export function launchWhoAmongState(state: RoomState, roundId: string): RoomState | null {
  if (state.players.length < 3) return null;
  return {
    ...basePlayingState(state),
    currentGame: "whoamong",
    whoamong: {
      phase: "briefing",
      roundId,
      roundNumber: 1,
      totalRounds: WHO_AMONG_TOTAL_ROUNDS,
      usedPromptIds: [],
      roundResults: [],
    },
  };
}

export const IMPOSTOR_TOTAL_ROUNDS = 4;

export function launchImpostorState(state: RoomState, roundId: string): RoomState | null {
  if (state.players.length < 3) return null;
  return {
    ...basePlayingState(state),
    currentGame: "impostor",
    impostor: {
      phase: "briefing",
      roundId,
      roundNumber: 1,
      totalRounds: IMPOSTOR_TOTAL_ROUNDS,
      usedQuestionIds: [],
      roundResults: [],
    },
  };
}
