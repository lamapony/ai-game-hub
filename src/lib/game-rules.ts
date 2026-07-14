import { LEGACY_GAME_IDS } from "@/games/ids";
import type { GameId } from "./types";
import {
  SPECTRUM_COURT_TOTAL_ROUNDS,
  TRACK_GUESS_TOTAL_ROUNDS,
  WHO_AMONG_TOTAL_ROUNDS,
} from "./game-state";
import {
  CHALLENGE_BRIEFING_MS,
  SOUND_RECORDING_MS,
  SOUND_TOPICS_MS,
  SPECTRUM_COURT_CLUE_MS,
  TRACK_GUESS_LISTEN_MS,
  WHO_AMONG_VOTE_MS,
} from "./host-controls";

export type GameRules = {
  title: string;
  emoji: string;
  tagline: string;
  steps: string[];
  scoring: string;
  minPlayers: string;
};

export const GAME_IDS: readonly GameId[] = LEGACY_GAME_IDS;

const soundRecordingMin = Math.round(SOUND_RECORDING_MS / 60_000);
const topicsSec = Math.round(SOUND_TOPICS_MS / 1000);
const challengeBriefingSec = Math.round(CHALLENGE_BRIEFING_MS / 1000);
const listenSec = Math.round(TRACK_GUESS_LISTEN_MS / 1000);
const clueSec = Math.round(SPECTRUM_COURT_CLUE_MS / 1000);
const voteSec = Math.round(WHO_AMONG_VOTE_MS / 1000);

export const GAME_RULES: Record<GameId, GameRules> = {
  soundscape: {
    title: "Soundscape Battle",
    emoji: "🎚️",
    tagline: "Capture park sounds — AI turns them into a speaker mix",
    steps: [
      `Vote for a theme — it locks after ${topicsSec}s`,
      `${soundRecordingMin} min to record sounds on your phone`,
      "Listen to team mixes through the park speakers",
      "Vote in 3 categories — not for your own team",
    ],
    scoring: "5 points per category vote + an AI bonus for the mix",
    minPlayers: "1+ players",
  },
  challenge: {
    title: "Park Spirit Challenge",
    emoji: "🎬",
    tagline: "One player films while everyone else performs",
    steps: [
      "AI gives a prompt — a random player becomes the camera operator",
      `The operator has ${challengeBriefingSec}s to tap "Open camera"`,
      "25s of filming — everyone else performs the prompt",
      "AI judges the frames and transcribed speech",
    ],
    scoring: "0–10 points to the operator's team",
    minPlayers: "2+ players",
  },
  phototunt: {
    title: "Photo Hunt",
    emoji: "📸",
    tagline: "A wild prompt — one fast photo",
    steps: [
      "The park spirit puts an absurd prompt on screen",
      "60s to find something and take one photo",
      "Tap once — the photo is submitted, no retakes",
      "AI ranks the shots and announces the verdict",
    ],
    scoring: "Places score 5 / 3 / 2 / 1 points for the team",
    minPlayers: "1+ players",
  },
  trackguess: {
    title: "Guess the Track",
    emoji: "🎧",
    tagline: "Real music or AI — trust your ears",
    steps: [
      `${TRACK_GUESS_TOTAL_ROUNDS} rounds — host can add real audio clips before launch`,
      `Listen to a ~${listenSec}s mystery clip`,
      "Choose: real track or AI",
      "The host reveals the truth and awards points",
    ],
    scoring: "+2 points to the team for each correct guess",
    minPlayers: "1+ players",
  },
  spectrumcourt: {
    title: "Spectrum Court",
    emoji: "⚖️",
    tagline: "Give a clue for a hidden point on a 0–100 scale",
    steps: [
      `${SPECTRUM_COURT_TOTAL_ROUNDS} rounds — one team sees the target`,
      `${clueSec}s to give a clue, then the fallback kicks in`,
      "Others place a marker, then appeal ±5",
      "Closer marker means more points",
    ],
    scoring: "0–10 by distance; clue team gets the best opponent score",
    minPlayers: "2+ active teams",
  },
  impostor: {
    title: "Who's the Bot?",
    emoji: "🤖",
    tagline: "Everyone writes a witty answer — one is secretly AI",
    steps: [
      "A question appears — write a funny answer on your phone",
      "AI secretly slips its own answer into the pile",
      "All answers appear anonymously — vote for the bot's one",
      "Reveal: spot the bot for points, or get mistaken for it",
    ],
    scoring: "Spot the bot +3; +1 per vote your answer steals",
    minPlayers: "3+ players",
  },
  whoamong: {
    title: "Who Among Us",
    emoji: "🕵️",
    tagline: "A pointed question — secretly vote for the best fit",
    steps: [
      `${WHO_AMONG_TOTAL_ROUNDS} rounds — a "who among us..." question appears`,
      "Secretly choose one player — yourself is allowed",
      `You get ~${voteSec}s to vote and can change your mind`,
      "The host reveals the round star and awards points",
    ],
    scoring: "Round star +3 to their team; guessing the star +2",
    minPlayers: "3+ players",
  },
};
