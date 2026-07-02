import type { GameId } from "./types";
import { SPECTRUM_COURT_TOTAL_ROUNDS, TRACK_GUESS_TOTAL_ROUNDS } from "./game-state";
import {
  CHALLENGE_BRIEFING_MS,
  SOUND_RECORDING_MS,
  SOUND_TOPICS_MS,
  SPECTRUM_COURT_CLUE_MS,
  TRACK_GUESS_GUESS_MS,
  TRACK_GUESS_LISTEN_MS,
} from "./host-controls";

export type GameRules = {
  title: string;
  emoji: string;
  tagline: string;
  steps: string[];
  scoring: string;
  minPlayers: string;
};

export const GAME_IDS: GameId[] = [
  "soundscape",
  "challenge",
  "phototunt",
  "trackguess",
  "spectrumcourt",
];

const soundRecordingMin = Math.round(SOUND_RECORDING_MS / 60_000);
const topicsSec = Math.round(SOUND_TOPICS_MS / 1000);
const challengeBriefingSec = Math.round(CHALLENGE_BRIEFING_MS / 1000);
const listenSec = Math.round(TRACK_GUESS_LISTEN_MS / 1000);
const guessSec = Math.round(TRACK_GUESS_GUESS_MS / 1000);
const clueSec = Math.round(SPECTRUM_COURT_CLUE_MS / 1000);

export const GAME_RULES: Record<GameId, GameRules> = {
  soundscape: {
    title: "Звуковой баттл",
    emoji: "🎚️",
    tagline: "Лови звуки парка — AI соберёт микс по колонкам",
    steps: [
      `Голосуй за тему — через ${topicsSec} сек она фиксируется`,
      `${soundRecordingMin} мин на запись звуков телефоном`,
      "Слушайте миксы команд через колонки парка",
      "Голосуй в 3 категориях — не за свою команду",
    ],
    scoring: "5 очков за голос зрителя в категории + AI-бонус за микс",
    minPlayers: "от 1 игрока",
  },
  challenge: {
    title: "Челлендж духа парка",
    emoji: "🎬",
    tagline: "Один снимает, все отыгрывают сценку на камеру",
    steps: [
      "AI даёт задание — оператором становится случайный игрок",
      `Оператору ${challengeBriefingSec} сек, чтобы жать «Открыть камеру»`,
      "25 сек съёмки — остальные жгут по заданию",
      "AI судит по кадрам и распознанной речи",
    ],
    scoring: "0–10 очков команде оператора за сценку",
    minPlayers: "от 2 игроков",
  },
  phototunt: {
    title: "Фотоохота",
    emoji: "📸",
    tagline: "Безумное задание — один кадр на скорость",
    steps: [
      "Дух парка выдаёт абсурдное задание на экран",
      "60 сек найти объект и снять один кадр",
      "Жмёшь — кадр улетает, переделать нельзя",
      "AI ранжирует снимки и оглашает вердикт",
    ],
    scoring: "Места: 5 / 3 / 2 / 1 очко команде",
    minPlayers: "от 1 игрока",
  },
  trackguess: {
    title: "Угадай трек",
    emoji: "🎧",
    tagline: "Живой трек или нейросеть — угадай на слух",
    steps: [
      `${TRACK_GUESS_TOTAL_ROUNDS} раундов — слушаешь отрывок ~${listenSec} сек`,
      "Выбираешь: настоящий трек или AI",
      `На голосование ~${guessSec} сек`,
      "Ведущий раскрывает правду и начисляет очки",
    ],
    scoring: "+2 очка команде за каждое верное угадывание",
    minPlayers: "от 1 игрока",
  },
  spectrumcourt: {
    title: "Спектр-суд",
    emoji: "⚖️",
    tagline: "Подсказка к скрытой точке на шкале 0–100",
    steps: [
      `${SPECTRUM_COURT_TOTAL_ROUNDS} раунда — одна команда видит точку`,
      `${clueSec} сек на подсказку, иначе включается запасная`,
      "Остальные ставят маркер, потом апелляция ±5",
      "Чем ближе маркер к цели — тем больше очков",
    ],
    scoring: "0–10 по дистанции; команда подсказки — лучший чужой счёт",
    minPlayers: "нужно 2+ команды с игроками",
  },
};
