// Shared game/room types for DIMAS fest.
import { eventProfile } from "./event-profile";
import {
  ROOM_STATE_SCHEMA_VERSION,
  legacyPartyContext,
  type ContingencyPlan,
  type ExperienceId,
  type PartyContext,
} from "./party-context";
import type { AiRuntimeState } from "./ai-budget";
import type { QuickStartSetup } from "./quick-start";
import type { GameId } from "@/games/ids";

export type { GameId } from "@/games/ids";

export type Team = {
  id: string;
  name: string;
  color: "red" | "blue" | "green" | "amber";
  score: number;
};

export type DeviceCheckStatus = "ready" | "denied" | "unavailable" | "error";

export type PlayerDeviceCheck = {
  camera: DeviceCheckStatus;
  microphone: DeviceCheckStatus;
  checkedAt: number;
};

export type Player = {
  id: string;
  name: string;
  teamId: string;
  joinedAt: number;
  secretHash?: string;
  deviceCheck?: PlayerDeviceCheck;
};

export type SoundscapePhase =
  "idle" | "topics" | "recording" | "mixing" | "playback" | "voting" | "results";

export type SoundscapeCue = {
  atMs: number;
  slot: number; // 1..5
  type: "audio" | "tts";
  url?: string;
  text?: string;
  durationMs?: number;
};

export type SoundscapeMix = {
  teamId: string;
  intro: string; // TTS spoken on slot 1
  cues: SoundscapeCue[];
  totalMs: number;
  feedback?: string;
  bonusPoints?: number;
  aiFallback?: boolean;
};

export type SoundscapeState = {
  phase: SoundscapePhase;
  roundId: string;
  topics?: string[];
  aiFallback?: boolean;
  topic?: string;
  topicVotes?: Record<string, string>;
  topicsEndsAt?: number;
  recordingEndsAt?: number;
  mixes?: Record<string, SoundscapeMix>; // teamId -> mix
  playback?: {
    teamId: string;
    startAt: number; // epoch ms
  };
  voteOpenAt?: number;
};

export type ChallengePhase = "briefing" | "recording" | "judging" | "results";

export type ChallengeRound = {
  roundId: string;
  task: string;
  operatorId: string;
  operatorName: string;
  videoUrl?: string;
  transcript?: string;
  score?: number;
  feedback?: string;
};

export type ChallengeState = {
  phase: ChallengePhase;
  roundId: string;
  task?: string;
  operatorId?: string;
  operatorName?: string;
  briefingEndsAt?: number;
  recordingEndsAt?: number;
  result?: {
    score: number;
    feedback: string;
    videoUrl: string;
    breakdown?: {
      performance: number;
      creativity: number;
      energy: number;
      environment: number;
    };
  };
  aiFallback?: boolean;
  pastOperatorIds?: string[];
};

/** Where the party is happening right now — affects AI prompts and available games. */
export type Venue = "park" | "bar";

export type GrillOraclePhase = "capturing" | "results";

export type GrillOracleMemoryStatus = "collecting" | "ready" | "sealed" | "revealed" | "verified";

/** Public progress only. Prophecies and photo paths live in private party_records. */
export type GrillOracleState = {
  phase: GrillOraclePhase;
  roundId: string;
  participantIds: string[];
  submittedPlayerIds: string[];
  captureEndsAt?: number;
};

/** Public cross-act summary only. Secret text remains exclusively in party_records. */
export type GrillOracleMemory = {
  runId: string;
  participantIds: string[];
  submittedPlayerIds: string[];
  verifiedPlayerIds: string[];
  status: GrillOracleMemoryStatus;
};

export type SmokeScreenStatus = "assigning" | "active" | "sealed" | "revealed" | "results";

export type SmokeScreenResultEntry = {
  missionId: string;
  ownerPlayerId: string;
  tier: 1 | 2 | 3;
  completed: boolean;
  caught: boolean;
  correctDetectiveIds: string[];
  ownerPoints: number;
};

/** Public background-run summary. Mission text and guesses remain in party_records. */
export type SmokeScreenState = {
  runId: string;
  status: SmokeScreenStatus;
  participantIds: string[];
  assignedPlayerIds: string[];
  submittedVoterIds: string[];
  startedAt: number;
  revealedAt?: number;
  completedAt?: number;
  results?: SmokeScreenResultEntry[];
  recap?: string;
  aiFallback?: boolean;
};

export type ContrabandStatus =
  "assigning" | "active" | "awaiting-response" | "awaiting-audio" | "review" | "results";

export type ContrabandResultEntry = {
  playerId: string;
  playerName: string;
  phrase: string;
  outcome: "caught" | "clean" | "survived";
  points: number;
};

/** Public progress only. Phrases, quotes, transcripts and media paths stay in party_records. */
export type ContrabandState = {
  runId: string;
  status: ContrabandStatus;
  participantIds: string[];
  assignedPlayerIds: string[];
  resolvedPlayerIds: string[];
  startedAt: number;
  endsAt?: number;
  activeAccusation?: {
    accusationId: string;
    accuserPlayerId: string;
    accusedPlayerId: string;
    createdAt: number;
    audioEndsAt?: number;
  };
  lastResolution?: {
    accusationId: string;
    accuserPlayerId: string;
    accusedPlayerId: string;
    outcome: "caught" | "clean" | "false-accusation";
    smugglerPoints: number;
    catcherPoints: number;
    falseAccusationPenalty: number;
    completedAt: number;
  };
  completedAt?: number;
  results?: ContrabandResultEntry[];
};

export type TongsOfTruthStatus =
  "question" | "recording" | "judging" | "review" | "reveal" | "results";

export type TongsOfTruthRoundResult = {
  roundId: string;
  speakerPlayerId: string;
  speakerName: string;
  level: 1 | 2 | 3;
  question: string;
  honestyScore: number;
  dodgeDetected: boolean;
  artistryScore: number;
  environmentUsed: boolean;
  points: number;
  comment: string;
  source: "ai" | "manual" | "skipped";
};

/** Public ritual state. Audio paths and verbatim transcripts stay in host-only party_records. */
export type TongsOfTruthState = {
  runId: string;
  status: TongsOfTruthStatus;
  participantIds: string[];
  speakerOrder: string[];
  roundNumber: number;
  totalRounds: number;
  currentRoundId: string;
  speakerPlayerId: string;
  speakerName: string;
  level: 1 | 2 | 3;
  question?: string;
  questionAiFallback?: boolean;
  recordingEndsAt?: number;
  result?: TongsOfTruthRoundResult;
  roundResults: TongsOfTruthRoundResult[];
  completedAt?: number;
};

export type CrossExaminationStatus =
  "curation" | "briefing" | "capturing" | "comparing" | "review" | "reveal" | "results";

export type CrossQuestionCategory = "order" | "object" | "person" | "detail";

export type CrossExaminationQuestion = {
  questionId: string;
  category: CrossQuestionCategory;
  text: string;
};

export type CrossExaminationPair = {
  pairId: string;
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
};

export type CrossExaminationFinding = {
  questionId: string;
  category: CrossQuestionCategory;
  question: string;
  versionA: string;
  versionB: string;
  severity: 0 | 1 | 2 | 3;
};

export type CrossExaminationPairResult = {
  pairId: string;
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  findings: CrossExaminationFinding[];
  alibiStrength: number;
  environmentBonus: 0 | 5;
  pairPoints: number;
  verdict: string;
  predictionCounts: Partial<Record<CrossQuestionCategory, number>>;
  correctPredictionCategories: CrossQuestionCategory[];
  correctVoterIds: string[];
  source: "ai" | "manual" | "skipped";
};

/** Public finale-game state. Evidence ids, votes, audio paths and transcripts stay host-only. */
export type CrossExaminationState = {
  runId: string;
  status: CrossExaminationStatus;
  participantIds: string[];
  pairOrder: CrossExaminationPair[];
  pairNumber: number;
  totalPairs: number;
  currentPairId: string;
  questions?: CrossExaminationQuestion[];
  selectedSourceCount?: number;
  questionsAiFallback?: boolean;
  recordingEndsAt?: number;
  submittedPlayerIds: string[];
  predictionVoterIds: string[];
  result?: CrossExaminationPairResult;
  pairResults: CrossExaminationPairResult[];
  completedAt?: number;
};

export type ToastSyndicatePhase = "briefing" | "recording" | "catching" | "judging" | "results";

export type ToastSyndicateRoundResult = {
  roundId: string;
  speakerPlayerId: string;
  genre: string;
  transcript: string;
  genreScore: number;
  words: Array<{
    id: string;
    text: string;
    used: boolean;
    smoothness: number;
    caughtByPlayerIds: string[];
  }>;
  speakerPoints: number;
  listenerPoints: Record<string, number>;
  comment: string;
};

/** Public ritual state. Contraband words stay in the speaker's private party record until results. */
export type ToastSyndicateState = {
  phase: ToastSyndicatePhase;
  sessionId: string;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  speakerPlayerId: string;
  speakerName: string;
  genre?: string;
  genreInstructions?: string;
  briefingEndsAt?: number;
  recordingEndsAt?: number;
  catchingEndsAt?: number;
  recordingSubmitted: boolean;
  submittedListenerIds: string[];
  result?: ToastSyndicateRoundResult;
  roundResults: ToastSyndicateRoundResult[];
  aiFallback?: boolean;
};

export type StillLifePhase = "briefing" | "building" | "judging" | "voting" | "results";

export type StillLifeResultEntry = {
  teamId: string;
  teamName: string;
  compositionScore: number;
  dramaScore: number;
  materialScore: number;
  points: number;
  catalogTitle: string;
  auctionPriceDkk: number;
  critique: string;
  audienceVotes: number;
  aiFallback: boolean;
  manualOverride: boolean;
};

export type StillLifeRoundResult = {
  roundId: string;
  headline: string;
  entries: StillLifeResultEntry[];
  winningTeamIds: string[];
};

/** Public progress and reveal only. Image paths and raw judgments live in party_records. */
export type StillLifeState = {
  phase: StillLifePhase;
  sessionId: string;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  activeTeamIds: string[];
  headline?: string;
  headlineAiFallback?: boolean;
  buildingEndsAt?: number;
  votingEndsAt?: number;
  submittedTeamIds: string[];
  submittedVoterIds: string[];
  judgments?: StillLifeResultEntry[];
  result?: StillLifeRoundResult;
  roundResults: StillLifeRoundResult[];
};

export type SommelierPhase =
  "capture" | "analyzing" | "voting" | "reveal" | "crowd-favorite" | "results";

export type SommelierPublicProfile = {
  drink_guess: string;
  tasting_notes: string;
  owner_profile: string;
  pretentiousness: number;
  pairing_advice: string;
};

export type SommelierRoundResult = {
  entryId: string;
  ownerPlayerId: string;
  ownerPlayerName: string;
  ownerTeamId: string;
  profile: SommelierPublicProfile;
  correctGuesserIds: string[];
  ballotCount: number;
  ownerPoints: number;
  guesserPoints: Record<string, number>;
  aiFallback: boolean;
};

/** Public progress and revealed cards only. Owner mapping, photo paths and ballots stay private. */
export type SommelierState = {
  phase: SommelierPhase;
  sessionId: string;
  participantIds: string[];
  submittedPlayerIds: string[];
  captureEndsAt?: number;
  currentEntryId?: string;
  currentProfile?: SommelierPublicProfile;
  currentAiFallback?: boolean;
  roundNumber: number;
  totalRounds: number;
  votingEndsAt?: number;
  submittedVoterIds: string[];
  result?: SommelierRoundResult;
  roundResults: SommelierRoundResult[];
  crowdFavoriteEntryId?: string;
  crowdFavoriteOwnerId?: string;
};

export type WhoAmongPhase = "briefing" | "voting" | "reveal" | "results";

export type WhoAmongRoundResult = {
  promptId: string;
  prompt: string;
  starIds: string[];
  voteCounts: Record<string, number>;
  correctVoterIds: string[];
};

export type WhoAmongState = {
  phase: WhoAmongPhase;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  usedPromptIds: string[];
  promptId?: string;
  prompt?: string;
  votes?: Record<string, string>;
  voteEndsAt?: number;
  revealEndsAt?: number;
  roundResults?: WhoAmongRoundResult[];
};

export type PhotoHuntPhase = "briefing" | "hunting" | "judging" | "results";

export type PhotoHuntResultEntry = {
  playerId: string;
  playerName: string;
  teamId: string;
  photoUrl: string;
  rank: number;
  points: number;
  comment: string;
};

export type PhotoHuntState = {
  phase: PhotoHuntPhase;
  roundId: string;
  task?: string;
  intro?: string;
  huntEndsAt?: number;
  hunterIds?: string[];
  submittedPlayerIds?: string[];
  results?: PhotoHuntResultEntry[];
  aiFallback?: boolean;
  pastTasks?: string[];
};

export type TrackGuessPhase = "briefing" | "listening" | "guessing" | "reveal" | "results";

export type TrackGuessRoundResult = {
  trackId: string;
  title: string;
  artist?: string;
  genre: string;
  isAi: boolean;
  sourceLabel?: string;
  sourceUrl?: string;
  artworkUrl?: string;
  correctPlayerIds: string[];
};

export type TrackGuessState = {
  phase: TrackGuessPhase;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  usedTrackIds: string[];
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackGenre?: string;
  trackUrl?: string;
  trackSourceLabel?: string;
  trackSourceUrl?: string;
  trackArtworkUrl?: string;
  listeningEndsAt?: number;
  guessEndsAt?: number;
  revealEndsAt?: number;
  guesses?: Record<string, "real" | "ai">;
  isAi?: boolean;
  roundResults?: TrackGuessRoundResult[];
};

export type SpectrumCourtPhase = "briefing" | "clue" | "guessing" | "appeal" | "reveal" | "results";

export type SpectrumCourtAppeal = {
  direction: "lower" | "higher";
  reason?: string;
};

export type SpectrumCourtTeamResult = {
  teamId: string;
  rawGuess: number;
  finalGuess: number;
  distance: number;
  points: number;
  appealDirection?: "lower" | "higher";
};

export type SpectrumCourtRoundResult = {
  spectrumId: string;
  leftLabel: string;
  rightLabel: string;
  target: number;
  clue: string;
  clueTeamId: string;
  cluePlayerId: string;
  teamResults: SpectrumCourtTeamResult[];
  clueTeamPoints: number;
};

export type SpectrumCourtState = {
  phase: SpectrumCourtPhase;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  usedSpectrumIds: string[];
  spectrumId?: string;
  leftLabel?: string;
  rightLabel?: string;
  prompt?: string;
  target?: number;
  clueTeamId?: string;
  cluePlayerId?: string;
  clue?: string;
  guesses?: Record<string, number>;
  appeals?: Record<string, SpectrumCourtAppeal>;
  clueEndsAt?: number;
  guessEndsAt?: number;
  appealEndsAt?: number;
  revealEndsAt?: number;
  roundResults?: SpectrumCourtRoundResult[];
};

export type ImpostorPhase = "briefing" | "answering" | "voting" | "reveal" | "results";

export type ImpostorAnswer = {
  id: string;
  /** Missing playerId means the answer was written by AI. */
  playerId?: string;
  text: string;
};

export type ImpostorRoundResult = {
  questionId: string;
  question: string;
  answers: ImpostorAnswer[];
  aiAnswerId: string;
  votes: Record<string, string>;
  correctVoterIds: string[];
};

export type ImpostorState = {
  phase: ImpostorPhase;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  usedQuestionIds: string[];
  questionId?: string;
  question?: string;
  answers?: Record<string, string>;
  shuffled?: ImpostorAnswer[];
  aiAnswerId?: string;
  votes?: Record<string, string>;
  answerEndsAt?: number;
  voteEndsAt?: number;
  revealEndsAt?: number;
  roundResults?: ImpostorRoundResult[];
  aiFallback?: boolean;
};

export type RoomState = {
  schemaVersion?: typeof ROOM_STATE_SCHEMA_VERSION;
  party?: PartyContext;
  /** Host-selected launch promise: venue, full-program duration and expected group size. */
  quickStart?: QuickStartSetup;
  runOfShow?: {
    experienceId: ExperienceId;
    contingency: ContingencyPlan;
    completedStepIds: string[];
    /** Persisted cue currently being led by the host; optional for legacy rooms. */
    activeStepId?: string;
    activeStepStartedAt?: number;
  };
  aiRuntime?: AiRuntimeState;
  /** Public-only evidence and the server-authored connected epilogue for a finished party. */
  finale?: import("./finale-narrative").FinaleState;
  /** Bounded idempotency receipts for server-authoritative host commands. */
  recentHostCommandIds?: string[];
  hostName: string;
  status: "lobby" | "playing" | "finished";
  teams: Team[];
  players: Player[];
  currentGame: GameId | null;
  venue?: Venue;
  paused?: {
    startedAt: number;
  };
  soundscape?: SoundscapeState;
  challenge?: ChallengeState;
  phototunt?: PhotoHuntState;
  trackguess?: TrackGuessState;
  spectrumcourt?: SpectrumCourtState;
  whoamong?: WhoAmongState;
  impostor?: ImpostorState;
  grilloracle?: GrillOracleState;
  oracleMemory?: GrillOracleMemory;
  smokescreen?: SmokeScreenState;
  toastsyndicate?: ToastSyndicateState;
  stilllife?: StillLifeState;
  sommelier?: SommelierState;
  contraband?: ContrabandState;
  tongsoftruth?: TongsOfTruthState;
  crossexamination?: CrossExaminationState;
  speakerSlots: Record<number, { connected: boolean; name: string; lastSeenAt?: number }>; // 1..5
};

export type RoomRow = {
  id: string;
  code: string;
  state: RoomState;
  updatedAt: string;
};

export const DEFAULT_TEAMS: Team[] = [
  { id: "forest", name: "Forest", color: "green", score: 0 },
  { id: "lake", name: "Lake", color: "blue", score: 0 },
  { id: "fire", name: "Fire", color: "red", score: 0 },
  { id: "sun", name: "Sun", color: "amber", score: 0 },
];

export const SPEAKER_NAMES: Record<number, string> = eventProfile.speakerSlots;

export function emptyRoomState(hostName = eventProfile.defaultHostName): RoomState {
  return {
    schemaVersion: ROOM_STATE_SCHEMA_VERSION,
    party: legacyPartyContext("park"),
    hostName,
    status: "lobby",
    teams: DEFAULT_TEAMS.map((t) => ({ ...t })),
    players: [],
    currentGame: null,
    speakerSlots: {
      1: { connected: true, name: SPEAKER_NAMES[1] },
      2: { connected: false, name: SPEAKER_NAMES[2] },
      3: { connected: false, name: SPEAKER_NAMES[3] },
      4: { connected: false, name: SPEAKER_NAMES[4] },
      5: { connected: false, name: SPEAKER_NAMES[5] },
    },
  };
}
