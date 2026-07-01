// Shared game/room types for DIMAS fest.

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
  | "idle"
  | "topics"
  | "recording"
  | "mixing"
  | "playback"
  | "voting"
  | "results";

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
};

export type SoundscapeState = {
  phase: SoundscapePhase;
  roundId: string;
  topics?: string[];
  topic?: string;
  topicVotes?: Record<string, string>;
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
  recordingEndsAt?: number;
  result?: { score: number; feedback: string; videoUrl: string };
  pastOperatorIds?: string[];
};

export type GameId = "soundscape" | "challenge" | "phototunt";

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
  submittedPlayerIds?: string[];
  results?: PhotoHuntResultEntry[];
  pastTasks?: string[];
};

export type RoomState = {
  hostName: string;
  status: "lobby" | "playing" | "finished";
  teams: Team[];
  players: Player[];
  currentGame: GameId | null;
  soundscape?: SoundscapeState;
  challenge?: ChallengeState;
  phototunt?: PhotoHuntState;
  speakerSlots: Record<number, { connected: boolean; name: string }>; // 1..5
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

export const SPEAKER_NAMES: Record<number, string> = {
  1: "Main Stage",
  2: "Oak Spirit",
  3: "The Wind",
  4: "Squirrel Gossip",
  5: "Forest Echo",
};

export function emptyRoomState(hostName = "Host"): RoomState {
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
