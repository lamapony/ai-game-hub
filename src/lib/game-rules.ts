import { GAME_IDS as REGISTERED_GAME_IDS } from "@/games/ids";
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

export const GAME_IDS: readonly GameId[] = REGISTERED_GAME_IDS;

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
    scoring:
      "0–10 points to the operator's team; party acts show scene / creative / energy / environment breakdown before the cap",
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
    scoring:
      "Server-ranked places score 5 / 3 / 2 / 1; party acts add a visible +0–5 environment criterion",
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
  grilloracle: {
    title: "Grill Oracle",
    emoji: "🔮",
    tagline: "Photograph the evidence — keep three predictions for later",
    steps: [
      "Each player photographs one real object from the grill or bar",
      "AI reads visible details and writes exactly three predictions",
      "The reading stays private to its owner during capture",
      "At the act transition, the host seals it for a later reveal",
      "In the bar, the room confirms all three outcomes before the verdict is locked",
    ],
    scoring:
      "After verification: +5 per fulfilled prediction to the owner; +3 per disproved prediction to each represented opposing team",
    minPlayers: "1+ players",
  },
  smokescreen: {
    title: "Smoke Screen",
    emoji: "🕵️",
    tagline: "Private missions run underneath the party — the bar exposes the evidence",
    steps: [
      "AI privately deals one 5 / 10 / 15-point social mission to every player",
      "Carry it out during the act while foreground games continue normally",
      "The host seals the fieldwork, then reveals an anonymous mission list",
      "Every player maps each mission to a suspected culprit",
      "The host confirms which missions happened and locks the room verdict",
    ],
    scoring:
      "A completed mission earns its 5 / 10 / 15 jackpot only if nobody identifies the owner; every correct guess of another player earns the detective +2",
    minPlayers: "3+ players",
  },
  contraband: {
    title: "Contraband",
    emoji: "🛃",
    tagline: "One secret phrase, thirty minutes, and a room full of customs officers",
    steps: [
      "Every player privately receives one strange but conversational phrase",
      "Weave it into a real bar conversation while foreground games keep running",
      "Anyone who hears suspicious cargo shouts Contraband and files the alleged quote",
      "The accused confesses or records 8–25 seconds of surrounding context",
      "AI judges only textual organicity; if STT or AI fails, the host rules manually",
    ],
    scoring:
      "Clean or timer-surviving smuggler +10; successful catcher +5; false accusation −2. The server, never AI, applies the formula",
    minPlayers: "3–30 players",
  },
  tongsoftruth: {
    title: "Tongs of Truth",
    emoji: "🍢",
    tagline: "The grill tool becomes a microphone and every answer becomes evidence",
    steps: [
      "Pass the real tongs to the named speaker; compact mode runs five level-3 turns",
      "AI asks one open question at heat level 1, 2 or 3",
      "The speaker records a 10–20 second answer while everyone keeps cooking",
      "AI scores only transcript specificity, evasiveness and stagecraft — never factual truth",
      "The private transcript is sealed as testimony for later callbacks and Cross Examination",
    ],
    scoring:
      "Specificity 0–10 + artistry 0–5 −3 for a dodge +5 for meaningful use of a real grill object or event; server cap 20",
    minPlayers: "3–30 players",
  },
  crossexamination: {
    title: "Cross Examination",
    emoji: "🚨",
    tagline: "Private statements turn the real evening into one final shared case",
    steps: [
      "The host reviews real party records and excludes anything too sensitive for a callback",
      "Three or four pairs receive four evidence-grounded questions and answer separately",
      "The audience predicts which category will contain the strongest contradiction",
      "Only short versions and fixed-severity findings become public; full transcripts stay private",
      "The noir verdict feeds the score ledger, then the finale still works if this case is skipped",
    ],
    scoring:
      "Alibi starts at 10: minor mismatch −1, memory gap −2, direct conflict −3; matching unprompted real-scene evidence +5. Pair points are split between accomplices; correct audience prediction +2",
    minPlayers: "6–30 players",
  },
  toastsyndicate: {
    title: "Toast Syndicate",
    emoji: "🥂",
    tagline: "Three forbidden words, one real toast, a room full of customs officers",
    steps: [
      "The speaker privately receives three contraband words; the genre is public",
      "Record a 30–60 second toast while the room listens for suspicious words",
      "Each listener files up to three catches without seeing the real list",
      "STT and the AI judge check genre, usage and smoothness; the server locks the score",
    ],
    scoring:
      "Speaker: genre 0–10 +5 per used word nobody caught; each listener gets +3 per used word they named",
    minPlayers: "3+ players",
  },
  stilllife: {
    title: "Still Life Survival",
    emoji: "🥒",
    tagline: "Build the scandalous artwork before the food becomes dinner",
    steps: [
      "AI publishes one dramatic headline for every active team",
      "Teams get 5 minutes to build from food, foil, plates and the real environment",
      "One teammate photographs and submits the installation",
      "AI or the host jury scores composition, drama and use of materials",
      "Vote for another team's lot; the room breaks only an exact jury-score tie",
    ],
    scoring:
      "Composition 0–10 + drama 0–10 + real-environment material bonus 0–5; audience vote breaks an exact tie",
    minPlayers: "2+ active teams",
  },
  sommelier: {
    title: "Sommelier Charlatan",
    emoji: "🍷",
    tagline: "One anonymous drink, one suspiciously specific owner portrait",
    steps: [
      "Up to 10 selected guests privately photograph the drink already in front of them",
      "AI reads only the glass and bar evidence, then publishes an anonymous roast-profile",
      "Everyone except the real owner secretly guesses whose drink it is",
      "Reveal the owner, then move through every submitted glass",
      "The host names the one reveal that caused the loudest room reaction",
    ],
    scoring:
      "Each correct guess earns +3; an owner nobody identifies earns +5; the single crowd-favorite owner earns +3",
    minPlayers: "3+ players",
  },
};
