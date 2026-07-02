// Shared game/room types for DIMAS fest.
import { eventProfile } from "./event-profile";

export type Team = {
  id: string;
  name: string;
  color: "red" | "blue" | "green" | "amber";
  score: number;
};

export type Player = {
  id: string;
  name: string;
  teamId: string;
  joinedAt: number;
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
  result?: { score: number; feedback: string; videoUrl: string };
  aiFallback?: boolean;
  pastOperatorIds?: string[];
};

export type GameId =
  "soundscape" | "challenge" | "phototunt" | "trackguess" | "spectrumcourt" | "whoamong";

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
  genre: string;
  isAi: boolean;
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
  trackGenre?: string;
  trackUrl?: string;
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

export type RoomState = {
  hostName: string;
  status: "lobby" | "playing" | "finished";
  teams: Team[];
  players: Player[];
  currentGame: GameId | null;
  paused?: {
    startedAt: number;
  };
  soundscape?: SoundscapeState;
  challenge?: ChallengeState;
  phototunt?: PhotoHuntState;
  trackguess?: TrackGuessState;
  spectrumcourt?: SpectrumCourtState;
  whoamong?: WhoAmongState;
  speakerSlots: Record<number, { connected: boolean; name: string; lastSeenAt?: number }>; // 1..5
};

export type RoomRow = {
  id: string;
  code: string;
  state: RoomState;
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
