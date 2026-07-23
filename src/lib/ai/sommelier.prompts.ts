import {
  SOMMELIER_VISION_PROMPT_VERSION,
  sommelierProfileSchema,
  type SommelierProfile,
} from "@/games/sommelier/model";
import type { PartyContext } from "../party-context";
import {
  buildPartyPromptSystem,
  type PromptContentPart,
  type PromptJsonSchema,
  type PromptSpec,
} from "./prompt-contract";

export type SommelierVisionInput = {
  imageUrl: string;
  seed: number;
};

export const sommelierVisionJsonSchema: PromptJsonSchema = {
  name: "sommelier_charlatan_profile",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      drink_guess: { type: "string", minLength: 1, maxLength: 320 },
      tasting_notes: { type: "string", minLength: 1, maxLength: 700 },
      owner_profile: { type: "string", minLength: 40, maxLength: 1500 },
      pretentiousness: { type: "integer", minimum: 1, maximum: 10 },
      pairing_advice: { type: "string", minLength: 1, maxLength: 700 },
    },
    required: [
      "drink_guess",
      "tasting_notes",
      "owner_profile",
      "pretentiousness",
      "pairing_advice",
    ],
  },
};

const fewShots = {
  ru: [
    'Фото: лагер в бутылке. Output: {"drink_guess":"Лагер из бутылки, стакан проигнорирован из принципа","tasting_notes":"Ноты честности, лёгкая горечь несделанных дел и финиш со вкусом «да нормально всё»","owner_profile":"Этот человек говорит «я почитал исследования» и имеет в виду один хороший тред. На сообщения отвечает через шесть часов фразой «только увидел». В споре о кино побеждает выносливостью.","pretentiousness":2,"pairing_advice":"Сочетается с разговором «а помнишь в 2019» и внезапным заказом картошки"}',
    'Фото: коктейль с розмарином и дымом. Output: {"drink_guess":"Авторский коктейль, где розмарина больше, чем ответов","tasting_notes":"Ноты красивой подачи, дымная пауза и долгое послевкусие переплаты","owner_profile":"Владелец фотографировал этот бокал дольше, чем будет его пить. В плейлисте есть музыка для работы, под которую работа не происходит. Слово «терруар» было выучено заранее и наконец дождалось сцены.","pretentiousness":9,"pairing_advice":"Сочетается с фразой «там интересная подача» и мягким осуждением чужого пива"}',
  ],
  en: [
    'Photo: bottled lager. Output: {"drink_guess":"Bottled lager; glassware declined on principle","tasting_notes":"Notes of honesty, unfinished Monday business and a finish of ‘it is basically fine’","owner_profile":"This person says ‘I read the research’ and means one excellent thread. Messages receive a ‘just saw this’ six hours later. Film arguments are won through stamina.","pretentiousness":2,"pairing_advice":"Pairs with a story from 2019 and the sudden need to order fries"}',
    'Photo: smoky rosemary cocktail. Output: {"drink_guess":"A signature cocktail with more rosemary than answers","tasting_notes":"Notes of presentation, a smoky strategic pause and a long finish of overpayment","owner_profile":"The owner photographed this glass longer than they will drink it. Their focus playlist has never witnessed focus. They learned the word terroir in advance and tonight it finally got a speaking role.","pretentiousness":9,"pairing_advice":"Pairs with ‘the presentation is interesting’ and gentle judgment of somebody else’s beer"}',
  ],
} as const;

function visionParts(input: SommelierVisionInput): PromptContentPart[] {
  return [
    {
      type: "text",
      text: "This is an anonymous real drink. Inspect only the drink, vessel, presentation, light and surrounding bar evidence. Never identify a person or infer protected traits. Return the fictional owner portrait without a name or gender.",
    },
    { type: "image_url", image_url: { url: input.imageUrl } },
  ];
}

export function buildSommelierFallbackProfile(
  input: SommelierVisionInput,
  context: PartyContext,
): SommelierProfile {
  const seed = Math.abs(Math.trunc(input.seed));
  const pretentiousness = 3 + (seed % 6);
  if (context.contentLocale === "ru") {
    return {
      drink_guess: "Напиток, который отказался давать показания без барной стойки",
      tasting_notes:
        "Ноты аварийной уверенности, тёплого света и послевкусие решения, принятого уже у стойки",
      owner_profile:
        "Этот человек открывает меню ради исследования, а заказывает то, что уже решил десять минут назад. На вопрос «как дела» отвечает полноценным подкастом. Уверенность появляется раньше фактов, но обычно всем от этого веселее.",
      pretentiousness,
      pairing_advice: "Сочетается с тёплым светом, громким льдом и фразой «ну раз уж мы здесь»",
    };
  }
  return {
    drink_guess: "A drink declining to testify without the bar counter present",
    tasting_notes:
      "Notes of emergency confidence, warm light and the finish of a decision already made at the counter",
    owner_profile:
      "This person opens the menu for research and orders what they chose ten minutes earlier. ‘How are you?’ receives a full podcast episode. Confidence arrives before evidence, but the table is usually better for it.",
    pretentiousness,
    pairing_advice: "Pairs with warm light, loud ice and the phrase ‘well, since we are here’",
  };
}

export const sommelierVisionSpec: PromptSpec<SommelierVisionInput, SommelierProfile> = {
  id: "sommelier.vision-profile",
  version: SOMMELIER_VISION_PROMPT_VERSION,
  gameId: "sommelier",
  outputSchema: sommelierProfileSchema,
  jsonSchema: sommelierVisionJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "You are a sommelier with a purchased diploma and unlimited confidence. Study an anonymous drink photo. Identify the drink confidently even when uncertain; invent convincing tasting notes; write a sharp but affectionate three-to-four-sentence psychological portrait using habits, phrases and harmless digital behavior; rate pretentiousness 1–10; pair it with a social situation rather than food. The roast targets choices and mannerisms, never protected traits, appearance, health, addiction, sex, finances, politics or trauma. Do not guess the owner's identity, name or gender.",
      scoringRubric:
        "No AI score is awarded. The +0–5 ENVIRONMENT criterion controls specificity only: earn the full +5 in the writing when the actual glass, garnish, foam, condensation, ice, warm light, menu or bar counter visibly supports the profile. Never claim an element that is not visible. Human guesses and the hidden-owner bonus are computed exclusively by the server.",
      schema: sommelierVisionJsonSchema,
      fewShots: fewShots[context.contentLocale],
    }),
  buildUser: visionParts,
  fallback: buildSommelierFallbackProfile,
};
