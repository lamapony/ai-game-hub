import type { PartyContext } from "../party-context";
import {
  ORACLE_PROMPT_VERSION,
  oracleReadingSchema,
  type OracleDonenessLevel,
  type OracleItemCategory,
  type OracleReading,
} from "@/games/grilloracle/model";
import {
  buildPartyPromptSystem,
  type PromptContentPart,
  type PromptJsonSchema,
  type PromptSpec,
} from "./prompt-contract";

export type OracleVisionInput = {
  playerName: string;
  imageUrl: string;
};

export const oracleReadingJsonSchema: PromptJsonSchema = {
  name: "grill_oracle_reading",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      item_guess: { type: "string", minLength: 1, maxLength: 240 },
      doneness_verdict: { type: "string", minLength: 1, maxLength: 300 },
      prophecy: { type: "string", minLength: 1, maxLength: 900 },
      predictions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string", minLength: 1, maxLength: 300 },
      },
      char_reading_style: { type: "string", minLength: 1, maxLength: 160 },
      points: { type: "integer", minimum: 5, maximum: 15 },
    },
    required: [
      "item_guess",
      "doneness_verdict",
      "prophecy",
      "predictions",
      "char_reading_style",
      "points",
    ],
  },
};

function oracleVisionParts(input: OracleVisionInput): PromptContentPart[] {
  return [
    {
      type: "text",
      text: `Read the photographed party evidence for player ${input.playerName}. Return exactly three concrete, observable predictions with a 30–70% chance of happening before the evening ends. Do not predict danger, health, forced drinking, humiliation, winning money or protected personal traits.`,
    },
    { type: "image_url", image_url: { url: input.imageUrl } },
  ];
}

const russianFewShots = [
  'Фото: почерневший кабачок. Output: {"item_guess":"Кабачок, прошедший через многое","doneness_verdict":"Стадия прожарки: некролог.","prophecy":"Зола ложится полумесяцем — знак того, что вечер пойдёт по нарастающей, но не по плану. Дым ушёл влево: жди разговора, который ты не собирался начинать.","predictions":["До 21:30 ты произнесёшь тост со словом «короче»","Ты минимум раз пойдёшь к бару за другого человека","Кто-то назовёт тебя не твоим именем, и ты откликнешься"],"char_reading_style":"по золе","points":13}',
  'Фото: аккуратная куриная грудка. Output: {"item_guess":"Куриная грудка с полосками решётки идеальной геометрии","doneness_verdict":"Настолько правильная, что ей можно доверить ипотеку.","prophecy":"Ровные полосы обещают жизнь по расписанию. Но третья дрогнула: сегодня контроль даст трещину, и всем будет весело.","predictions":["Ты первым предложишь «ещё по одной»","Ты поправишь чью-то фактическую ошибку до 22:00","Твой телефон разрядится ниже 20%, и ты попросишь зарядку"],"char_reading_style":"по трещинам","points":9}',
];

const englishFewShots = [
  'Photo: a blackened zucchini. Output: {"item_guess":"A zucchini that has seen too much","doneness_verdict":"Doneness level: obituary.","prophecy":"The ash forms a crescent, so the evening will escalate without consulting your plan. Smoke leans left: an unplanned conversation is coming.","predictions":["Before 21:30 you will make a toast containing the word ‘basically’","You will go to the bar for somebody else at least once","Someone will call you by the wrong name and you will answer"],"char_reading_style":"by the ash","points":13}',
  'Photo: geometrically neat chicken. Output: {"item_guess":"Chicken with suspiciously perfect grill lines","doneness_verdict":"So proper it could be trusted with a mortgage.","prophecy":"Straight lines promise a scheduled life. The third one slipped: control will crack tonight, briefly and entertainingly.","predictions":["You will be first to suggest one more round","You will correct someone’s factual error before 22:00","Your phone will fall below 20%, and you will ask for a charger"],"char_reading_style":"by the cracks","points":9}',
];

export const grillOracleReadingSpec: PromptSpec<OracleVisionInput, OracleReading> = {
  id: "grilloracle.reading",
  version: ORACLE_PROMPT_VERSION,
  gameId: "grilloracle",
  outputSchema: oracleReadingSchema,
  jsonSchema: oracleReadingJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "You are Madame Grill, a shamelessly confident charlatan pyromancer. Identify what the object is or used to be, deliver one sharp doneness verdict, read visible scorch marks, ash, condensation, garnish, foam or reflections as an omen, and write a two-to-three sentence prophecy. Return exactly three specific predictions that the room can verify before the party ends. In a bar capture, adapt the same ritual to the glass, drink, garnish, warm light or bar counter.",
      scoringRubric:
        "The points field is narrative omen intensity, not party score: 5 base, up to +5 for visible drama, and +5 only when the current environment materially shapes the evidence (grill: smoke/fire/tongs/char; bar: glass/warm light/toast/counter), capped at 15. The server never awards this number to a player.",
      schema: oracleReadingJsonSchema,
      fewShots: context.contentLocale === "ru" ? russianFewShots : englishFewShots,
    }),
  buildUser: oracleVisionParts,
  fallback: (input, context) =>
    buildOracleFallbackReading({
      playerName: input.playerName,
      itemCategory: context.actId === "bar" ? "drink" : "mystery",
      doneness: "charred",
      context,
    }),
};

const ITEM_LABELS: Record<OracleItemCategory, { en: string; ru: string }> = {
  vegetable: { en: "a vegetable with a complicated past", ru: "овощ со сложным прошлым" },
  meat: { en: "a piece of meat under investigation", ru: "кусок мяса под следствием" },
  bread: { en: "bread that got too close to the action", ru: "хлеб, подошедший слишком близко" },
  drink: { en: "a drink carrying suspicious reflections", ru: "напиток с подозрительными бликами" },
  mystery: { en: "an object formerly known as food", ru: "объект, ранее известный как еда" },
};

const DONENESS_LINES: Record<OracleDonenessLevel, { en: string; ru: string; points: number }> = {
  raw: { en: "Still negotiating with heat.", ru: "Всё ещё ведёт переговоры с огнём.", points: 5 },
  golden: {
    en: "Suspiciously competent; almost no story.",
    ru: "Подозрительно удачно: почти без драмы.",
    points: 8,
  },
  charred: {
    en: "Charred enough to have legal representation.",
    ru: "Обуглено настолько, что пора звать адвоката.",
    points: 12,
  },
  incinerated: {
    en: "Doneness level: archaeological evidence.",
    ru: "Стадия прожарки: археологическая улика.",
    points: 15,
  },
};

export function buildOracleFallbackReading(input: {
  playerName: string;
  itemCategory: OracleItemCategory;
  doneness: OracleDonenessLevel;
  context: PartyContext;
}): OracleReading {
  const locale = input.context.contentLocale;
  const item = ITEM_LABELS[input.itemCategory][locale];
  const doneness = DONENESS_LINES[input.doneness];
  if (locale === "ru") {
    return {
      item_guess: item,
      doneness_verdict: doneness.ru,
      prophecy: `Мадам Гриль потеряла зрение, но не самоуверенность. Улика игрока ${input.playerName} говорит: вечер будет импровизировать быстрее своего владельца.`,
      predictions: [
        "Ты произнесёшь тост, который начнётся увереннее, чем закончится",
        "Ты хотя бы раз принесёшь кому-то предмет, который тебя не просили приносить",
        "До конца вечера ты скажешь: «это долгая история»",
      ],
      char_reading_style:
        input.context.actId === "bar" ? "по бликам бокала" : "по аварийному шаблону золы",
      points: doneness.points,
    };
  }
  return {
    item_guess: item,
    doneness_verdict: doneness.en,
    prophecy: `Madame Grill has lost her eyesight, not her confidence. ${input.playerName}'s evidence says the evening will improvise faster than its owner.`,
    predictions: [
      "You will make a toast that begins more confidently than it ends",
      "You will bring someone an object they did not ask you to bring",
      "Before the evening ends, you will say ‘that is a long story’",
    ],
    char_reading_style:
      input.context.actId === "bar" ? "by the glass reflections" : "by the emergency ash template",
    points: doneness.points,
  };
}
