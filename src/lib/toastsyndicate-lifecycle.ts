import { z } from "zod";
import type {
  ToastAssignment,
  ToastCatchRecord,
  ToastJudgment,
} from "@/games/toastsyndicate/model";
import type { ToastSyndicateRoundResult } from "./types";

const address = {
  roomId: z.string().trim().min(1).max(128),
  roundId: z.string().trim().min(2).max(128),
};
const playerAddress = {
  ...address,
  playerId: z.string().trim().min(2).max(100),
  playerSecret: z.string().trim().min(16).max(200).optional(),
};

export const toastSyndicateRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...address, action: z.literal("assign") }).strict(),
  z.object({ ...address, action: z.literal("start-recording") }).strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("submit-recording"),
      storagePath: z.string().trim().min(1).max(512),
      durationSeconds: z.number().min(1).max(90),
    })
    .strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("catch"),
      guesses: z.array(z.string().trim().min(1).max(80)).max(3),
    })
    .strict(),
  z.object({ ...address, action: z.literal("finalize") }).strict(),
  z.object({ ...address, action: z.literal("next") }).strict(),
]);

export type ToastSyndicateRequest = z.infer<typeof toastSyndicateRequestSchema>;

export function normalizeToastWord(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableTokens(value: string) {
  return normalizeToastWord(value)
    .split(/[\s-]+/)
    .filter((token) => token.length >= 5);
}

export function toastGuessMatchesWord(guess: string, target: string) {
  const normalizedGuess = normalizeToastWord(guess);
  const normalizedTarget = normalizeToastWord(target);
  if (!normalizedGuess || !normalizedTarget) return false;
  if (normalizedGuess === normalizedTarget) return true;
  const guesses = comparableTokens(normalizedGuess);
  const targets = comparableTokens(normalizedTarget);
  return guesses.some((left) =>
    targets.some(
      (right) =>
        left === right ||
        (Math.min(left.length, right.length) >= 6 &&
          (left.startsWith(right) || right.startsWith(left))),
    ),
  );
}

export function transcriptIncludesToastWord(transcript: string, word: string) {
  const normalizedTranscript = normalizeToastWord(transcript);
  const normalizedWord = normalizeToastWord(word);
  if (!normalizedTranscript || !normalizedWord) return false;
  if (` ${normalizedTranscript} `.includes(` ${normalizedWord} `)) return true;
  return comparableTokens(normalizedWord).some((target) =>
    comparableTokens(normalizedTranscript).some(
      (token) =>
        Math.min(token.length, target.length) >= 6 &&
        (token.startsWith(target) || target.startsWith(token)),
    ),
  );
}

export function sameToastGuesses(left: string[], right: string[]) {
  const normalized = (values: string[]) =>
    [...new Set(values.map(normalizeToastWord).filter(Boolean))].sort().join("|");
  return normalized(left) === normalized(right);
}

export function caughtToastWords(params: {
  assignment: ToastAssignment;
  catches: Array<{ playerId: string; record: ToastCatchRecord }>;
}) {
  return Object.fromEntries(
    params.assignment.words.map((word) => [
      word.id,
      params.catches.flatMap(({ playerId, record }) =>
        record.guesses.some((guess) => toastGuessMatchesWord(guess, word.text)) ? [playerId] : [],
      ),
    ]),
  ) as Record<string, string[]>;
}

export function scoreToastRound(params: {
  roundId: string;
  speakerPlayerId: string;
  assignment: ToastAssignment;
  transcript: string;
  judgment: ToastJudgment;
  caughtByWordId: Record<string, string[]>;
}): ToastSyndicateRoundResult {
  const judgedByWord = new Map(
    params.judgment.smuggled.map((entry) => [normalizeToastWord(entry.word), entry]),
  );
  const listenerPoints: Record<string, number> = {};
  const words = params.assignment.words.map((word) => {
    const judged = judgedByWord.get(normalizeToastWord(word.text));
    const used = judged?.used ?? transcriptIncludesToastWord(params.transcript, word.text);
    const caughtByPlayerIds = used ? [...new Set(params.caughtByWordId[word.id] ?? [])] : [];
    caughtByPlayerIds.forEach((playerId) => {
      listenerPoints[playerId] = (listenerPoints[playerId] ?? 0) + 3;
    });
    return {
      id: word.id,
      text: word.text,
      used,
      smoothness: used ? (judged?.smoothness ?? 0) : 0,
      caughtByPlayerIds,
    };
  });
  return {
    roundId: params.roundId,
    speakerPlayerId: params.speakerPlayerId,
    genre: params.assignment.genre,
    transcript: params.transcript,
    genreScore: params.judgment.genre_score,
    words,
    speakerPoints:
      params.judgment.genre_score +
      words.filter((word) => word.used && word.caughtByPlayerIds.length === 0).length * 5,
    listenerPoints,
    comment: params.judgment.comment,
  };
}
