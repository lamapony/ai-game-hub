import { z } from "zod";
import {
  CONTRABAND_ARBITRATION_PROMPT_VERSION,
  CONTRABAND_GENERATION_PROMPT_VERSION,
  contrabandAiVerdictSchema,
  type ContrabandAiVerdict,
} from "@/games/contraband/model";
import { contrabandFallbackPhrases } from "@/games/contraband/fallback-catalog";
import { buildPartyPromptSystem, type PromptJsonSchema, type PromptSpec } from "./prompt-contract";

export type ContrabandGenerationInput = { count: number; seed: number; recentPhrases: string[] };
export type ContrabandGenerationOutput = { phrases: string[] };
export type ContrabandArbitrationInput = {
  playerName: string;
  phrase: string;
  transcript: string;
};

export const contrabandGenerationSchema = z
  .object({ phrases: z.array(z.string().trim().min(3).max(180)).min(1).max(30) })
  .strict();

export const contrabandGenerationJsonSchema: PromptJsonSchema = {
  name: "contraband_phrase_deck",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      phrases: {
        type: "array",
        minItems: 1,
        maxItems: 30,
        items: { type: "string", minLength: 3, maxLength: 180 },
      },
    },
    required: ["phrases"],
  },
};

export const contrabandArbitrationJsonSchema: PromptJsonSchema = {
  name: "contraband_arbitration",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      organic_score: { type: "integer", minimum: 1, maximum: 10 },
      verdict: { type: "string", minLength: 1, maxLength: 500 },
      smuggler_points: { type: "integer", minimum: 0, maximum: 10 },
      catcher_points: { type: "integer", minimum: 0, maximum: 5 },
    },
    required: ["organic_score", "verdict", "smuggler_points", "catcher_points"],
  },
};

export const contrabandGenerationSpec: PromptSpec<
  ContrabandGenerationInput,
  ContrabandGenerationOutput
> = {
  id: "contraband.generation",
  version: CONTRABAND_GENERATION_PROMPT_VERSION,
  gameId: "contraband",
  outputSchema: contrabandGenerationSchema,
  jsonSchema: contrabandGenerationJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Generate secret contraband phrases for real adult bar conversations. Every phrase must be possible to weave into normal speech with noticeable effort, and strange enough that an attentive listener may become suspicious. Keep them witty, harmless and self-contained. Never demand drinking, touching, humiliation, illegal behavior, protected-trait jokes, private disclosures or targeting another guest.",
      scoringRubric:
        "Internal +5 environment rubric: prefer phrases that can become plausible through a real glass, warm light, menu, table, coat check or bar counter. Do not require props and do not output a separate score.",
      schema: contrabandGenerationJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Input: 2 фразы. Output: {"phrases":["я в целом доверяю уткам","это как Болонский процесс, только наоборот"]}',
              'Input: 2 фразы для бара. Output: {"phrases":["у этого бокала энергия среднего менеджмента","барная стойка уже видела такой почерк"]}',
            ]
          : [
              'Input: 2 phrases. Output: {"phrases":["I generally trust ducks","this is like the Bologna Process, only backwards"]}',
              'Input: 2 bar phrases. Output: {"phrases":["this glass has middle-management energy","the bar counter has seen this pattern before"]}',
            ],
    }),
  buildUser: (input) =>
    `Generate exactly ${input.count} distinct phrases. Avoid these recent phrases: ${JSON.stringify(input.recentPhrases)}.`,
  fallback: (input, context) => ({
    phrases: contrabandFallbackPhrases(context.contentLocale, input.count, input.seed),
  }),
};

export const contrabandArbitrationSpec: PromptSpec<
  ContrabandArbitrationInput,
  ContrabandAiVerdict
> = {
  id: "contraband.arbitration",
  version: CONTRABAND_ARBITRATION_PROMPT_VERSION,
  gameId: "contraband",
  outputSchema: contrabandAiVerdictSchema,
  jsonSchema: contrabandArbitrationJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Arbitrate how organically the assigned phrase was woven into the supplied reenacted conversation context. Judge only the words in the transcript, not honesty, personality, intent or vocal emotion. Do not claim deception detection. The verdict must be short, sharp and affectionate, and must not repeat the secret phrase verbatim.",
      scoringRubric:
        "organic_score is 1–10. 7+ means clean contraband: smuggler_points 10 and catcher_points 0. Below 7 means caught: smuggler_points 0 and catcher_points 5. Internal +5 environment criterion: award the top half only when the phrase is meaningfully anchored to a real glass, light, counter, menu, table or another visible bar detail. The server recomputes all points.",
      schema: contrabandArbitrationJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Input: фраза про уток; контекст связывает её с рисунком на меню. Output: {"organic_score":8,"verdict":"Меню обеспечило алиби: странность прозвучала как наблюдение, а не доставка груза.","smuggler_points":10,"catcher_points":0}',
              'Input: фраза про Болонский процесс; контекст состоит только из внезапной фразы. Output: {"organic_score":3,"verdict":"Груз поставили посреди стола без упаковки и объяснений.","smuggler_points":0,"catcher_points":5}',
            ]
          : [
              'Input: duck phrase; context links it to a duck printed on the menu. Output: {"organic_score":8,"verdict":"The menu supplied an alibi; it sounded like an observation, not a delivery.","smuggler_points":10,"catcher_points":0}',
              'Input: Bologna Process phrase; context is only the sudden phrase. Output: {"organic_score":3,"verdict":"The cargo landed on the table without packaging or explanation.","smuggler_points":0,"catcher_points":5}',
            ],
    }),
  buildUser: (input) =>
    `Player ${JSON.stringify(input.playerName)}; assigned phrase ${JSON.stringify(input.phrase)}; reenacted context transcript ${JSON.stringify(input.transcript)}.`,
  fallback: (_input, context) => ({
    organic_score: 5,
    verdict:
      context.contentLocale === "ru"
        ? "AI-арбитр потерял связь с баром. Нужен ручной вердикт ведущего."
        : "The AI referee lost the bar. The host must decide manually.",
    smuggler_points: 0,
    catcher_points: 5,
  }),
};
