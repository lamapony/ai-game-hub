import {
  CONTRABAND_WORD_CATALOG,
  pickToastFallback,
  TOAST_GENRE_CATALOG,
} from "@/games/toastsyndicate/fallback-catalog";
import {
  TOAST_GENERATION_PROMPT_VERSION,
  TOAST_JUDGMENT_PROMPT_VERSION,
  toastAssignmentSchema,
  toastJudgmentSchema,
  type ToastAssignment,
  type ToastJudgment,
} from "@/games/toastsyndicate/model";
import { transcriptIncludesToastWord } from "../toastsyndicate-lifecycle";
import type { PartyContext } from "../party-context";
import { buildPartyPromptSystem, type PromptJsonSchema, type PromptSpec } from "./prompt-contract";

export type ToastGenerationInput = {
  seed: number;
  recentGenreIds: string[];
  recentWordIds: string[];
};

export type ToastJudgmentInput = {
  playerName: string;
  assignment: ToastAssignment;
  transcript: string;
  caughtWords: string[];
};

export const toastAssignmentJsonSchema: PromptJsonSchema = {
  name: "toast_syndicate_assignment",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      genreId: { type: "string", minLength: 2, maxLength: 128 },
      genre: { type: "string", minLength: 1, maxLength: 120 },
      instructions: { type: "string", minLength: 1, maxLength: 500 },
      words: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", minLength: 2, maxLength: 128 },
            text: { type: "string", minLength: 1, maxLength: 80 },
          },
          required: ["id", "text"],
        },
      },
    },
    required: ["genreId", "genre", "instructions", "words"],
  },
};

export const toastJudgmentJsonSchema: PromptJsonSchema = {
  name: "toast_syndicate_judgment",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      genre_score: { type: "integer", minimum: 0, maximum: 10 },
      smuggled: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            word: { type: "string", minLength: 1, maxLength: 80 },
            used: { type: "boolean" },
            caught: { type: "boolean" },
            smoothness: { type: "integer", minimum: 0, maximum: 5 },
          },
          required: ["word", "used", "caught", "smoothness"],
        },
      },
      comment: { type: "string", minLength: 1, maxLength: 1200 },
      speaker_points: { type: "integer", minimum: 0, maximum: 25 },
      audience_points: { type: "integer", minimum: 0, maximum: 90 },
    },
    required: ["genre_score", "smuggled", "comment", "speaker_points", "audience_points"],
  },
};

function fallbackAssignment(input: ToastGenerationInput, context: PartyContext): ToastAssignment {
  return pickToastFallback(
    context.contentLocale,
    input.seed,
    input.recentGenreIds,
    input.recentWordIds,
  );
}

export const toastAssignmentSpec: PromptSpec<ToastGenerationInput, ToastAssignment> = {
  id: "toastsyndicate.assignment",
  version: TOAST_GENERATION_PROMPT_VERSION,
  gameId: "toastsyndicate",
  outputSchema: toastAssignmentSchema,
  jsonSchema: toastAssignmentJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Create one live-toast assignment: one theatrical genre and exactly three absurdly concrete non-bar words that are difficult but possible to weave into 30–60 seconds of speech. Use the supplied catalog ids and localized labels exactly. The genre may use the bar as a scene; the words must not be normal bar vocabulary. Never require drinking, humiliation or targeting another guest.",
      scoringRubric:
        "The server scores genre 0–10 and adds 5 for every used word the audience misses. Internal quality rubric: +5 when the genre meaningfully uses real glasses, warm light, the counter, a toast gesture or another visible part of the bar environment. Do not output a separate rubric.",
      schema: toastAssignmentJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Input: catalog. Output: {"genreId":"noir-detective","genre":"Нуар-детектив","instructions":"Произнеси тост как уставший частный детектив, диктующий дело под дождём.","words":[{"id":"carburetor","text":"карбюратор"},{"id":"fjord","text":"фьорд"},{"id":"laminate","text":"ламинат"}]}',
            ]
          : [
              'Input: catalog. Output: {"genreId":"noir-detective","genre":"Noir detective monologue","instructions":"Deliver the toast like a tired private eye narrating a rainy case file.","words":[{"id":"carburetor","text":"carburetor"},{"id":"fjord","text":"fjord"},{"id":"laminate","text":"laminate"}]}',
            ],
    }),
  buildUser: (input, context) => {
    const locale = context.contentLocale;
    const genres = TOAST_GENRE_CATALOG.filter(
      (genre) => !input.recentGenreIds.includes(genre.id),
    ).map((genre) => ({
      id: genre.id,
      genre: genre.label[locale],
      instructions: genre.instructions[locale],
    }));
    const words = CONTRABAND_WORD_CATALOG.filter(
      (word) => !input.recentWordIds.includes(word.id),
    ).map((word) => ({ id: word.id, text: word.label[locale] }));
    return `Choose from this genre catalog: ${JSON.stringify(genres)}. Choose three distinct entries from this word catalog: ${JSON.stringify(words)}.`;
  },
  fallback: fallbackAssignment,
};

function fallbackJudgment(input: ToastJudgmentInput, context: PartyContext): ToastJudgment {
  const caught = new Set(input.caughtWords.map((word) => word.toLocaleLowerCase()));
  const smuggled = input.assignment.words.map((word) => {
    const used = transcriptIncludesToastWord(input.transcript, word.text);
    return {
      word: word.text,
      used,
      caught: used && caught.has(word.text.toLocaleLowerCase()),
      smoothness: used ? 2 : 0,
    };
  });
  const genre_score = input.transcript.trim() ? 5 : 0;
  const speaker_points =
    genre_score + smuggled.filter((word) => word.used && !word.caught).length * 5;
  const audience_points = smuggled.filter((word) => word.used && word.caught).length * 3;
  return {
    genre_score,
    smuggled,
    comment:
      context.contentLocale === "ru"
        ? "Судья потерял связь с баром: жанр получил нейтральный балл, контрабанду сверили по транскрипту."
        : "The judge lost the bar connection: the genre received a neutral mark and contraband was checked against the transcript.",
    speaker_points,
    audience_points,
  };
}

export const toastJudgmentSpec: PromptSpec<ToastJudgmentInput, ToastJudgment> = {
  id: "toastsyndicate.judgment",
  version: TOAST_JUDGMENT_PROMPT_VERSION,
  gameId: "toastsyndicate",
  outputSchema: toastJudgmentSchema,
  jsonSchema: toastJudgmentJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Judge a transcribed live toast. Score how consistently it follows the assigned genre. For each exact contraband word decide whether it was actually used, whether the supplied audience list caught it, and how smoothly it was integrated. Smoothness 0 means absent or painfully dropped in; 5 means it sounded inevitable. Keep the comment sharp, affectionate and grounded in the transcript. Do not invent speech.",
      scoringRubric:
        "genre_score is 0–10. smoothness is 0–5 and awards the full +5 environment criterion only when the word is organically tied to a real glass, toast gesture, warm light, counter, menu or other visible bar element. speaker_points = genre_score + 5 for every used word not caught. audience_points = 3 for every used caught word. The server recomputes both totals.",
      schema: toastJudgmentJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Input: жанр нуар, слова карбюратор/фьорд/неоднозначно. Output: {"genre_score":9,"smuggled":[{"word":"карбюратор","used":true,"caught":false,"smoothness":5},{"word":"фьорд","used":true,"caught":true,"smoothness":2},{"word":"неоднозначно","used":false,"caught":false,"smoothness":0}],"comment":"Карбуратор прошёл как свидетель под защитой, фьорд торчал из показаний как туристический буклет.","speaker_points":14,"audience_points":3}',
            ]
          : [
              'Input: noir; carburetor/fjord/ambiguous. Output: {"genre_score":9,"smuggled":[{"word":"carburetor","used":true,"caught":false,"smoothness":5},{"word":"fjord","used":true,"caught":true,"smoothness":2},{"word":"ambiguous","used":false,"caught":false,"smoothness":0}],"comment":"Carburetor crossed like a protected witness; fjord stuck out like a tourist brochure.","speaker_points":14,"audience_points":3}',
            ],
    }),
  buildUser: (input) =>
    `Player ${input.playerName}; genre ${JSON.stringify(input.assignment.genre)}; instructions ${JSON.stringify(input.assignment.instructions)}; contraband ${JSON.stringify(input.assignment.words.map((word) => word.text))}; transcript ${JSON.stringify(input.transcript)}; audience caught ${JSON.stringify(input.caughtWords)}.`,
  fallback: fallbackJudgment,
};
