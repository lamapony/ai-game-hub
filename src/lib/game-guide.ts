import type { GameId, RoomState } from "./types";

export type GameGuide = {
  id: GameId;
  title: string;
  shortTitle: string;
  playerGoal: string;
  howToPlay: string[];
  scoring: string;
  rounds: string;
  timing: string;
  hostBrief: string;
};

export const GAME_GUIDES = {
  soundscape: {
    id: "soundscape",
    title: "Soundscape",
    shortTitle: "Soundscape",
    playerGoal: "Record short sounds so the host can build a team sound collage.",
    howToPlay: [
      "Vote on a prompt.",
      "Record a short sound on your phone.",
      "Listen to the team mixes and vote for the most convincing one.",
    ],
    scoring: "Teams score through audience votes and possible AI bonus points for the mix.",
    rounds: "Usually one featured prompt per launch.",
    timing: "Topic vote, short recording window, AI mixing, playback, voting, results.",
    hostBrief:
      "Soundscape: pick a prompt, record a sound, then listen as the room becomes an argument with acoustics.",
  },
  challenge: {
    id: "challenge",
    title: "Challenge",
    shortTitle: "Challenge",
    playerGoal: "Perform a short absurd task while one selected player records it.",
    howToPlay: [
      "One operator is selected to film.",
      "Follow the challenge prompt as a team.",
      "The AI judge scores the attempt after the clip is submitted.",
    ],
    scoring: "The AI judge gives the team a score and short verdict.",
    rounds: "One recorded challenge per launch.",
    timing: "Briefing, recording, judging, results.",
    hostBrief:
      "Challenge: one person records, everyone else performs. Dignity is optional; coherence is useful.",
  },
  phototunt: {
    id: "phototunt",
    title: "Photo Hunt",
    shortTitle: "Photo Hunt",
    playerGoal: "Take one photo that best satisfies the prompt.",
    howToPlay: [
      "Read the prompt.",
      "Take exactly one strong photo.",
      "Submit before the timer ends and wait for the AI ranking.",
    ],
    scoring: "The AI ranks submitted photos and awards points by placement.",
    rounds: "One photo prompt per launch.",
    timing: "Briefing, hunting timer, judging, results.",
    hostBrief:
      "Photo Hunt: you get one prompt, one photo, and one chance to pretend composition was your plan.",
  },
  trackguess: {
    id: "trackguess",
    title: "Track Guess",
    shortTitle: "Track Guess",
    playerGoal: "Decide whether each track is real or AI-generated.",
    howToPlay: [
      "Listen to the track.",
      "Choose real or AI on your phone.",
      "Lock in before the guessing timer ends.",
    ],
    scoring: "Correct guesses add points for the player's team.",
    rounds: "Five tracks per launch.",
    timing: "Briefing, listening, guessing, reveal, results.",
    hostBrief:
      "Track Guess: listen, distrust your instincts, then decide whether the machine has learned taste.",
  },
  spectrumcourt: {
    id: "spectrumcourt",
    title: "Spectrum Court",
    shortTitle: "Spectrum Court",
    playerGoal: "Place your team on a hidden spectrum as close to the target as possible.",
    howToPlay: [
      "A clue-giver gives a clue for the hidden target.",
      "Teams place a guess on the spectrum.",
      "Appeal once if the room has made an obvious philosophical error.",
    ],
    scoring:
      "Closer team guesses score more points; the clue team can score through good guidance.",
    rounds: "Four spectrum rounds per launch.",
    timing: "Briefing, clue, guessing, appeal, reveal, results.",
    hostBrief:
      "Spectrum Court: one clue, many confident interpretations, and a hidden target quietly judging everyone.",
  },
} satisfies Record<GameId, GameGuide>;

export const DEFAULT_GAME_ORDER: GameId[] = [
  "soundscape",
  "phototunt",
  "trackguess",
  "spectrumcourt",
  "challenge",
];

export function gameGuide(gameId: GameId): GameGuide {
  return GAME_GUIDES[gameId];
}

export function currentGamePhaseLabel(state: RoomState): string {
  if (!state.currentGame) return "lobby";
  if (state.currentGame === "soundscape") return state.soundscape?.phase ?? "starting";
  if (state.currentGame === "challenge") return state.challenge?.phase ?? "starting";
  if (state.currentGame === "phototunt") return state.phototunt?.phase ?? "starting";
  if (state.currentGame === "trackguess") return state.trackguess?.phase ?? "starting";
  return state.spectrumcourt?.phase ?? "starting";
}

export function nextLikelyGameId(state: RoomState): GameId {
  if (state.currentGame) return state.currentGame;
  const pendingGame = state.eventDirector?.pendingSuggestion?.gameId;
  if (pendingGame) return pendingGame;
  const activeSegmentGame = state.eventDirector?.segments.find(
    (segment) => segment.status === "active" && segment.gameId,
  )?.gameId;
  if (activeSegmentGame) return activeSegmentGame;
  const pendingSegmentGame = state.eventDirector?.segments.find(
    (segment) => segment.status === "pending" && segment.gameId,
  )?.gameId;
  return pendingSegmentGame ?? state.eventDirector?.playlist[0] ?? DEFAULT_GAME_ORDER[0];
}

export function isSpiritWindowOpen(state: RoomState): boolean {
  if (!state.currentGame) return true;
  return currentGamePhaseLabel(state) === "briefing";
}

export function buildGameGuideContext(state: RoomState) {
  const nextGameId = nextLikelyGameId(state);
  const nextGuide = gameGuide(nextGameId);
  const director = state.eventDirector;
  const currentSegment = director?.segments.find(
    (segment) => segment.id === director.currentSegmentId,
  );
  return {
    nextGameId,
    nextGuide,
    currentPhase: currentGamePhaseLabel(state),
    currentSegmentTitle: currentSegment?.title ?? "No active segment",
    directorMode: director?.mode ?? "off",
    playlist: (director?.playlist?.length ? director.playlist : DEFAULT_GAME_ORDER)
      .map((gameId) => gameGuide(gameId).shortTitle)
      .join(" -> "),
  };
}

export function buildSpiritContextText(opts: {
  roomCode: string;
  state: RoomState;
  playerId: string;
}) {
  const player = opts.state.players.find((candidate) => candidate.id === opts.playerId);
  const team = opts.state.teams.find((candidate) => candidate.id === player?.teamId);
  const guide = buildGameGuideContext(opts.state);
  const allGuides = DEFAULT_GAME_ORDER.map((gameId) => {
    const game = gameGuide(gameId);
    return `${game.title}: ${game.playerGoal} Rules: ${game.howToPlay.join(" ")} Rounds: ${game.rounds} Scoring: ${game.scoring}`;
  }).join("\n");

  return [
    `Room code: ${opts.roomCode.toUpperCase()}`,
    `Player: ${player?.name ?? "Unknown player"}`,
    `Team: ${team?.name ?? "Unknown team"}`,
    `Room status: ${opts.state.status}`,
    `Active game: ${opts.state.currentGame ? gameGuide(opts.state.currentGame).title : "none"}`,
    `Current phase: ${guide.currentPhase}`,
    `Director mode: ${guide.directorMode}`,
    `Director segment: ${guide.currentSegmentTitle}`,
    `Likely next/current game: ${guide.nextGuide.title}`,
    `Playlist: ${guide.playlist}`,
    `Players: ${opts.state.players.length}`,
    `Teams: ${opts.state.teams.map((item) => `${item.name} ${item.score}pt`).join(", ")}`,
    "Game guide:",
    allGuides,
  ].join("\n");
}
