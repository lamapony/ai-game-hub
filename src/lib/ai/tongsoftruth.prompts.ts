import { z } from "zod";
import { fallbackTongsQuestion } from "@/games/tongsoftruth/fallback-catalog";
import {
  TONGS_JUDGMENT_PROMPT_VERSION,
  TONGS_QUESTION_PROMPT_VERSION,
  tongsJudgmentSchema,
  type TongsJudgment,
} from "@/games/tongsoftruth/model";
import { tongsPoints } from "../tongsoftruth-lifecycle";
import { buildPartyPromptSystem, type PromptJsonSchema, type PromptSpec } from "./prompt-contract";

export type TongsQuestionInput = {
  playerName: string;
  level: 1 | 2 | 3;
  seed: number;
  recentQuestions: string[];
};

export type TongsQuestionOutput = { question: string };

export type TongsJudgmentInput = {
  playerName: string;
  level: 1 | 2 | 3;
  question: string;
  transcript: string;
};

export const tongsQuestionSchema = z
  .object({ question: z.string().trim().min(3).max(500) })
  .strict();

export const tongsQuestionJsonSchema: PromptJsonSchema = {
  name: "tongs_of_truth_question",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { question: { type: "string", minLength: 3, maxLength: 500 } },
    required: ["question"],
  },
};

export const tongsJudgmentJsonSchema: PromptJsonSchema = {
  name: "tongs_of_truth_judgment",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      honesty_score: { type: "integer", minimum: 0, maximum: 10 },
      dodge_detected: { type: "boolean" },
      artistry_score: { type: "integer", minimum: 0, maximum: 5 },
      environment_used: { type: "boolean" },
      comment: { type: "string", minLength: 1, maxLength: 800 },
      points: { type: "integer", minimum: 0, maximum: 20 },
    },
    required: [
      "honesty_score",
      "dodge_detected",
      "artistry_score",
      "environment_used",
      "comment",
      "points",
    ],
  },
};

export const tongsQuestionSpec: PromptSpec<TongsQuestionInput, TongsQuestionOutput> = {
  id: "tongsoftruth.question",
  version: TONGS_QUESTION_PROMPT_VERSION,
  gameId: "tongsoftruth",
  outputSchema: tongsQuestionSchema,
  jsonSchema: tongsQuestionJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Generate one open-ended question for the guest holding the physical grill tongs. Level 1 is funny and safe; level 2 is personal with a little heat; level 3 is sober late-night honesty. The question must invite a specific short story, never yes/no. Do not ask about health, numerical finances, trauma, illegal behavior, sex, protected traits, or named former partners. Prefer a harmless callback to the visible fire, smoke, food, foil, weather or tongs. Do not claim that the game can detect lies.",
      scoringRubric:
        "Question quality is internal only. The +5 environment criterion is earned later only if the answer meaningfully uses a real object or event from the current scene; merely holding the tongs never qualifies.",
      schema: tongsQuestionJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Input: уровень 1. Output: {"question":"Какой предмет у этого гриля лучше всего описывает твою неделю — и какая конкретная история это доказывает?"}',
              'Input: уровень 3. Output: {"question":"Какое недавнее решение было в основном твоим эго в фартуке? Нужна одна улика, а не пресс-релиз."}',
            ]
          : [
              'Input: level 1. Output: {"question":"Which object around this grill best describes your week, and what specific story proves it?"}',
              'Input: level 3. Output: {"question":"Which recent decision was mostly your ego wearing an apron? Give one piece of evidence, not a press release."}',
            ],
    }),
  buildUser: (input) =>
    `Guest ${JSON.stringify(input.playerName)}; heat level ${input.level}; avoid repeating ${JSON.stringify(input.recentQuestions)}.`,
  fallback: (input, context) => ({
    question: fallbackTongsQuestion(context.contentLocale, input.level, input.seed),
  }),
};

function fallbackJudgment(input: TongsJudgmentInput, locale: "en" | "ru"): TongsJudgment {
  const honesty = input.transcript.trim() ? 5 : 0;
  const values = {
    honestyScore: honesty,
    dodgeDetected: false,
    artistryScore: 0,
    environmentUsed: false,
  };
  return {
    honesty_score: honesty,
    dodge_detected: false,
    artistry_score: 0,
    environment_used: false,
    comment:
      locale === "ru"
        ? "Судья потерял связь с грилем. Ведущий оценит показание вручную — техника не получает права на гадание."
        : "The judge lost the grill. The host will score this testimony manually; an outage earns no right to guess.",
    points: tongsPoints(values),
  };
}

export const tongsJudgmentSpec: PromptSpec<TongsJudgmentInput, TongsJudgment> = {
  id: "tongsoftruth.judgment",
  version: TONGS_JUDGMENT_PROMPT_VERSION,
  gameId: "tongsoftruth",
  outputSchema: tongsJudgmentSchema,
  jsonSchema: tongsJudgmentJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Judge only the supplied transcript of a short answer. honesty_score means apparent candor through specificity, directness and internally coherent detail; it is not factual truth and you cannot detect deception. dodge_detected means the answer replaces the requested story with filler, changes the subject or refuses without substance. artistry_score rewards vivid detail and self-irony. environment_used is true only when the answer meaningfully uses a real current-scene object or event such as smoke, fire, food, foil, weather or the grill; merely holding or mentioning the tongs does not qualify. Comment like a sharp, affectionate MC. Do not diagnose personality or invent facts.",
      scoringRubric:
        "honesty_score 0–10 + artistry_score 0–5 −3 when dodge_detected +5 when environment_used, floor 0 and cap 20. The server recomputes points. The +5 environment bonus must be explicit in the joke when awarded.",
      schema: tongsJudgmentJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Input: конкретная история про удалённое сообщение начальнику ночью, без среды. Output: {"honesty_score":8,"dodge_detected":false,"artistry_score":4,"environment_used":false,"comment":"Удалённое сообщение в два ночи — уже не ответ, а короткометражка с плохим продюсером. Конкретика прожарена ровно.","points":12}',
              'Input: «смотря как посмотреть», смена темы. Output: {"honesty_score":2,"dodge_detected":true,"artistry_score":1,"environment_used":false,"comment":"Посмотрели со всех сторон и нашли только дымовую завесу. Мясо отвечает прямее.","points":0}',
              'Input: конкретная история связывает провал плана с сорванной ветром фольгой перед залом. Output: {"honesty_score":7,"dodge_detected":false,"artistry_score":3,"environment_used":true,"comment":"Фольга улетела, алиби осталось: реальная улика с места события приносит честные +5 за среду.","points":15}',
            ]
          : [
              'Input: specific story about deleting a message to the boss at night, no environment. Output: {"honesty_score":8,"dodge_detected":false,"artistry_score":4,"environment_used":false,"comment":"A deleted 2 a.m. message is no longer an answer; it is a short film with a terrible producer. The detail is properly cooked.","points":12}',
              'Input: “it depends how you look at it,” then a subject change. Output: {"honesty_score":2,"dodge_detected":true,"artistry_score":1,"environment_used":false,"comment":"We looked from every angle and found only a smoke screen. The food answered more directly.","points":0}',
              'Input: a specific failed plan tied to foil that the wind just tore from the grill. Output: {"honesty_score":7,"dodge_detected":false,"artistry_score":3,"environment_used":true,"comment":"The foil escaped but the alibi stayed: real scene evidence earns the full +5 environment bonus.","points":15}',
            ],
    }),
  buildUser: (input) =>
    `Guest ${JSON.stringify(input.playerName)} held the tongs. Heat level ${input.level}. Question ${JSON.stringify(input.question)}. Transcript ${JSON.stringify(input.transcript)}.`,
  fallback: (input, context) => fallbackJudgment(input, context.contentLocale),
};
