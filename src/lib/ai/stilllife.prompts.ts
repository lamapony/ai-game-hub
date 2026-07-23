import { z } from "zod";
import {
  STILL_LIFE_HEADLINE_PROMPT_VERSION,
  STILL_LIFE_JUDGMENT_PROMPT_VERSION,
  stillLifeHeadlineSchema,
  stillLifeJudgmentSchema,
  type StillLifeJudgment,
} from "@/games/stilllife/model";
import type { PartyContext, PartyLocale } from "../party-context";
import {
  buildPartyPromptSystem,
  type PromptContentPart,
  type PromptJsonSchema,
  type PromptSpec,
} from "./prompt-contract";

const stillLifeHeadlineOutputSchema = z
  .object({ headlines: z.array(stillLifeHeadlineSchema).length(1) })
  .strict();

export type StillLifeHeadlineOutput = z.infer<typeof stillLifeHeadlineOutputSchema>;

export type StillLifeHeadlineInput = {
  seed: number;
  recentHeadlines: string[];
};

export type StillLifeJudgmentInput = {
  teamName: string;
  headline: string;
  imageUrl: string;
  seed: number;
};

export const STILL_LIFE_FALLBACK_HEADLINES: Record<PartyLocale, readonly string[]> = {
  ru: [
    "Последний огурец покидает тонущую лодку",
    "Переговоры шампуров зашли в тупик",
    "Фольга требует политического убежища у тарелки",
    "Обугленный перец отказывается давать показания",
    "Сосиска встречает рассвет после тяжёлого развода",
    "Помидор объявляет гриль территорией независимости",
    "Последняя салфетка держит оборону у барной стойки",
    "Коктейльный зонтик переживает крах империи снеков",
    "Хлеб покидает решётку, не простившись с углями",
    "Щипцы выбирают сторону в овощном перевороте",
  ],
  en: [
    "The last cucumber abandons the sinking boat",
    "The skewers' negotiations reach a dead end",
    "Foil seeks political asylum from the plate",
    "A charred pepper refuses to testify",
    "A sausage greets dawn after a difficult divorce",
    "A tomato declares the grill an independent territory",
    "The last napkin holds the line at the bar counter",
    "A cocktail umbrella survives the collapse of the snack empire",
    "Bread leaves the grate without saying goodbye to the coals",
    "The tongs choose sides in the vegetable uprising",
  ],
};

function pickFallbackHeadline(input: StillLifeHeadlineInput, context: PartyContext) {
  const catalog = STILL_LIFE_FALLBACK_HEADLINES[context.contentLocale];
  const recent = new Set(input.recentHeadlines.map((headline) => headline.toLocaleLowerCase()));
  const available = catalog.filter((headline) => !recent.has(headline.toLocaleLowerCase()));
  const pool = available.length > 0 ? available : catalog;
  return pool[Math.abs(Math.trunc(input.seed)) % pool.length]!;
}

export const stillLifeHeadlineJsonSchema: PromptJsonSchema = {
  name: "still_life_headline",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      headlines: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: { type: "string", minLength: 8, maxLength: 220 },
      },
    },
    required: ["headlines"],
  },
};

const headlineFewShots = {
  ru: [
    'Input: один заголовок. Output: {"headlines":["Последний огурец покидает тонущую лодку"]}',
    'Input: один заголовок. Output: {"headlines":["Переговоры шампуров зашли в тупик"]}',
  ],
  en: [
    'Input: one headline. Output: {"headlines":["The last cucumber abandons the sinking boat"]}',
    'Input: one headline. Output: {"headlines":["The skewers\' negotiations reach a dead end"]}',
  ],
} as const;

export const stillLifeHeadlineSpec: PromptSpec<StillLifeHeadlineInput, StillLifeHeadlineOutput> = {
  id: "stilllife.headline",
  version: STILL_LIFE_HEADLINE_PROMPT_VERSION,
  gameId: "stilllife",
  outputSchema: stillLifeHeadlineOutputSchema,
  jsonSchema: stillLifeHeadlineJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Generate exactly one absurd dramatic headline for a physical installation made from real food and nearby utensils. It must contain a conflict or visible drama, be stageable with food, foil, tongs, plates, napkins or cocktail umbrellas, and sound like breaking news or a nineteenth-century painting title. Never require damaging venue property, wasting dangerous amounts of food, touching another person or approaching open flame for the photo.",
      scoringRubric:
        "No points are awarded during headline generation. Make the current environment indispensable: grill headlines should invite smoke, char, tongs or foil; bar fallback headlines should invite snacks, napkins, umbrellas, glasses or warm light.",
      schema: stillLifeHeadlineJsonSchema,
      fewShots: headlineFewShots[context.contentLocale],
    }),
  buildUser: (input) =>
    `Create one new headline. Avoid these recent headlines: ${JSON.stringify(input.recentHeadlines.slice(-4))}. Variation seed: ${input.seed}.`,
  fallback: (input, context) => ({ headlines: [pickFallbackHeadline(input, context)] }),
};

export const stillLifeJudgmentJsonSchema: PromptJsonSchema = {
  name: "still_life_judgment",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      composition_score: { type: "integer", minimum: 0, maximum: 10 },
      drama_score: { type: "integer", minimum: 0, maximum: 10 },
      material_score: { type: "integer", minimum: 0, maximum: 5 },
      catalog_title: { type: "string", minLength: 1, maxLength: 240 },
      auction_price_dkk: { type: "integer", minimum: 100, maximum: 99999999 },
      critique: { type: "string", minLength: 1, maxLength: 1200 },
      points: { type: "integer", minimum: 0, maximum: 25 },
    },
    required: [
      "composition_score",
      "drama_score",
      "material_score",
      "catalog_title",
      "auction_price_dkk",
      "critique",
      "points",
    ],
  },
};

const judgmentFewShots = {
  ru: [
    'Заголовок: «Последний огурец покидает тонущую лодку». Фото: огурец на краю тарелки, фольга и обугленный перец. Output: {"composition_score":8,"drama_score":9,"material_score":5,"catalog_title":"Огурец. Исход. Фольга","auction_price_dkk":1240750,"critique":"Наклон огурца на кромке тарелки-лодки передаёт экзистенциальный ужас лучше, чем весь датский кинематограф. Обугленный перец в роли шторма — смелое кастинговое решение.","points":22}',
    'Заголовок: «Переговоры шампуров зашли в тупик». Фото: два шампура лежат параллельно на чистой тарелке. Output: {"composition_score":5,"drama_score":3,"material_score":1,"catalog_title":"Диалог, которого не было","auction_price_dkk":184300,"critique":"Параллельные линии уверенно изображают людей, которые пришли на встречу и открыли разные презентации. Материал присутствует физически, но среда в этом браке давно не участвует.","points":9}',
  ],
  en: [
    'Headline: “The last cucumber abandons the sinking boat.” Photo: cucumber on a plate edge, foil and charred pepper. Output: {"composition_score":8,"drama_score":9,"material_score":5,"catalog_title":"Cucumber. Exodus. Foil","auction_price_dkk":1240750,"critique":"The cucumber\'s tilt conveys existential panic better than an entire season of prestige television. Casting charred pepper as the storm is offensively confident and therefore correct.","points":22}',
    'Headline: “The skewers\' negotiations reach a dead end.” Photo: two skewers parallel on a clean plate. Output: {"composition_score":5,"drama_score":3,"material_score":1,"catalog_title":"The Dialogue That Wasn\'t","auction_price_dkk":184300,"critique":"The parallel lines capture two delegates opening different slide decks. The material is physically present; the environment has left the marriage.","points":9}',
  ],
} as const;

function judgmentParts(input: StillLifeJudgmentInput): PromptContentPart[] {
  return [
    {
      type: "text",
      text: `Team ${input.teamName} built an installation for the headline ${JSON.stringify(input.headline)}. Judge only visible evidence. Treat the points field as composition_score + drama_score + material_score; the server will recompute it.`,
    },
    { type: "image_url", image_url: { url: input.imageUrl } },
  ];
}

export function buildStillLifeFallbackJudgment(
  input: StillLifeJudgmentInput,
  context: PartyContext,
): StillLifeJudgment {
  const seed = Math.abs(Math.trunc(input.seed));
  const composition = 5 + (seed % 4);
  const drama = 6 + (Math.floor(seed / 7) % 4);
  const material = 3 + (Math.floor(seed / 13) % 3);
  if (context.contentLocale === "ru") {
    return {
      composition_score: composition,
      drama_score: drama,
      material_score: material,
      catalog_title: `«${input.headline}»: вещественное доказательство`,
      auction_price_dkk: 210_000 + (seed % 780_000),
      critique:
        "Цифровой критик потерял монокль, поэтому судит по аварийному каталогу. Композиция держится, конфликт читается, а реальная утварь хотя бы не притворяется метафорой из PowerPoint.",
      points: composition + drama + material,
    };
  }
  return {
    composition_score: composition,
    drama_score: drama,
    material_score: material,
    catalog_title: `${input.headline}: Material Evidence`,
    auction_price_dkk: 210_000 + (seed % 780_000),
    critique:
      "The digital critic misplaced its monocle and is judging from the emergency catalogue. The composition holds, the conflict reads, and the real utensils have avoided becoming a PowerPoint metaphor.",
    points: composition + drama + material,
  };
}

export const stillLifeJudgmentSpec: PromptSpec<StillLifeJudgmentInput, StillLifeJudgment> = {
  id: "stilllife.judgment",
  version: STILL_LIFE_JUDGMENT_PROMPT_VERSION,
  gameId: "stilllife",
  outputSchema: stillLifeJudgmentSchema,
  jsonSchema: stillLifeJudgmentJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "You are an unbearably pretentious Sotheby's critic from the Food and Utensils department. Judge the photographed installation against its assigned headline: composition, whether the visible conflict reads as drama, and the courage of using real materials. Give the lot an absurdly precise price in Danish kroner and a catalogue title. Write two or three sentences of clean, situational snobbery. Do not infer protected traits or attack people; critique the artistic choices.",
      scoringRubric:
        "composition_score is 0–10. drama_score is 0–10. material_score is the exact +0–5 ENVIRONMENT bonus: award +5 only when real smoke, fire-safe char, tongs, foil, grill texture, bar snacks, napkins, cocktail umbrellas, glasses or warm light materially carries the idea. points must equal the three fields, capped at 25, but the server always recomputes it and ignores model totals. Audience voting is a separate server-side tie-breaker.",
      schema: stillLifeJudgmentJsonSchema,
      fewShots: judgmentFewShots[context.contentLocale],
    }),
  buildUser: judgmentParts,
  fallback: buildStillLifeFallbackJudgment,
};
