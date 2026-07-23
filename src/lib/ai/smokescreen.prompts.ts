import {
  SMOKE_SCREEN_PROMPT_VERSION,
  SMOKE_SCREEN_RECAP_PROMPT_VERSION,
  smokeScreenDeckSchema,
  smokeScreenRecapSchema,
  type SmokeScreenDeck,
} from "@/games/smokescreen/model";
import type { PartyContext } from "../party-context";
import { buildPartyPromptSystem, type PromptJsonSchema, type PromptSpec } from "./prompt-contract";

export type SmokeScreenGenerationInput = {
  count: number;
  existingMissionTexts: string[];
};

export type SmokeScreenRecapInput = {
  results: Array<{
    player: string;
    mission: string;
    wasCaught: boolean;
    topSuspect: string;
  }>;
  bestDetective?: string;
};

export const smokeScreenDeckJsonSchema: PromptJsonSchema = {
  name: "smokescreen_mission_deck",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      missions: {
        type: "array",
        minItems: 1,
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            tier: { type: "integer", enum: [1, 2, 3] },
            text: { type: "string", minLength: 1, maxLength: 500 },
            detection_hint: { type: "string", minLength: 1, maxLength: 300 },
          },
          required: ["tier", "text", "detection_hint"],
        },
      },
    },
    required: ["missions"],
  },
};

export const smokeScreenRecapJsonSchema: PromptJsonSchema = {
  name: "smokescreen_recap",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { recap: { type: "string", minLength: 1, maxLength: 1600 } },
    required: ["recap"],
  },
};

const generationFewShots = {
  ru: [
    'Input: 2 missions. Output: {"missions":[{"tier":1,"text":"Трижды скажи «в Дании так не делают» в разных разговорах","detection_hint":"слишком последовательная защита воображаемых датских норм"},{"tier":3,"text":"Добейся, чтобы тебе передали кетчуп, ни разу не попросив словами","detection_hint":"подозрительно выразительная пантомима вокруг соуса"}]}',
    'Input: 1 bar mission. Output: {"missions":[{"tier":2,"text":"Уговори двух людей одновременно поднять бокалы, не произнося слова «тост»","detection_hint":"слишком режиссёрское управление чужими бокалами"}]}',
    'Input: 1 home mission. Output: {"missions":[{"tier":2,"text":"Добейся, чтобы двое людей поменялись местами, не предлагая это напрямую","detection_hint":"подозрительно точная диванная дипломатия"}]}',
    'Input: 1 festival mission. Output: {"missions":[{"tier":1,"text":"Спроси у трёх людей, какой браслет выглядит официальнее","detection_hint":"неожиданный аудит фестивальной бюрократии"}]}',
  ],
  en: [
    'Input: 2 missions. Output: {"missions":[{"tier":1,"text":"Say ‘they do not do it this way in Denmark’ in three separate conversations","detection_hint":"an oddly committed defense of imaginary Danish standards"},{"tier":3,"text":"Make someone pass you the ketchup without asking in words","detection_hint":"suspiciously expressive mime around the sauce"}]}',
    'Input: 1 bar mission. Output: {"missions":[{"tier":2,"text":"Get two people to raise their glasses at once without saying the word ‘toast’","detection_hint":"overly deliberate direction of other people’s glasses"}]}',
    'Input: 1 home mission. Output: {"missions":[{"tier":2,"text":"Get two people to swap seats without suggesting it directly","detection_hint":"suspiciously precise sofa diplomacy"}]}',
    'Input: 1 festival mission. Output: {"missions":[{"tier":1,"text":"Ask three people which wristband looks most official","detection_hint":"an unexpected audit of festival bureaucracy"}]}',
  ],
};

const recapFewShots = {
  ru: [
    'Input: Ада не спалилась, Макса вычислили, лучший детектив Лена. Output: {"recap":"Ада прошла через гриль как человек без алиби — и именно поэтому никто ничего не заметил. Макс, напротив, управлял кетчупом с тонкостью диспетчера аэропорта, так что зал взял его тёпленьким. Лена вычисляла чужие мотивы быстрее, чем остывала решётка. Остальные называли это паранойей, пока не увидели счёт. Дым рассеялся; репутации — не все."}',
  ],
  en: [
    'Input: Ada escaped, Max was caught, Lena was best detective. Output: {"recap":"Ada moved through the grill without an alibi, which is exactly why nobody noticed. Max directed the ketchup with the subtlety of airport ground control and was caught warm-handed. Lena read motives faster than the grate cooled. Everyone else called it paranoia until the scoreboard arrived. The smoke cleared; several reputations did not."}',
  ],
};

const fallbackMissions = {
  ru: {
    "grill-site": [
      [
        1,
        "Трижды уточни, кто именно отвечает за щипцы",
        "необычный интерес к должностной инструкции щипцов",
      ],
      [
        2,
        "Уговори двух людей оценить прожарку одного и того же куска",
        "внезапно организованная комиссия по прожарке",
      ],
      [
        3,
        "Добейся, чтобы тебе передали соус без прямой просьбы",
        "театральная дипломатия вокруг бутылки соуса",
      ],
      [1, "Дважды назови дым частью атмосферы", "подозрительно упорный ребрендинг дыма"],
      [
        2,
        "Вставь слово «карамелизация» в три разных разговора",
        "неестественно высокая частота кулинарного термина",
      ],
      [
        3,
        "Организуй передачу щипцов по кругу, не объявляя правила",
        "скрытая режиссура движения главного гриль-артефакта",
      ],
    ],
    bar: [
      [1, "Дважды похвали тёплый свет как ингредиент", "подозрительное внимание к освещению"],
      [
        2,
        "Добейся, чтобы кто-то сам предложил тебе салфетку",
        "слишком выразительная пантомима вокруг салфеток",
      ],
      [
        3,
        "Уговори двух людей одновременно поднять бокалы, не произнося слово «тост»",
        "скрытое управление чужими бокалами",
      ],
      [
        1,
        "Трижды уточни полное название одного напитка",
        "неожиданная преданность барной номенклатуре",
      ],
      [
        2,
        "Добейся, чтобы кто-то вслух прочитал одну строку меню",
        "подозрительная литературная программа вокруг меню",
      ],
      [
        3,
        "Запусти короткий спор о правильной форме бокала, не высказывая своего мнения",
        "слишком точная модерация стеклянной философии",
      ],
    ],
    park: [
      [
        1,
        "Спроси у трёх людей, какая скамейка выглядит влиятельнее",
        "подозрительный аудит парковой власти",
      ],
      [
        2,
        "Добейся, чтобы кто-то передвинул один предмет пикника ровно на ладонь",
        "слишком точная режиссура пикникового реквизита",
      ],
      [
        3,
        "Заставь двух людей одновременно прислушаться к одному звуку, не объясняя зачем",
        "скрытое дирижирование вниманием компании",
      ],
      [
        1,
        "Дважды назови один порыв ветра сюжетным поворотом",
        "упорная драматургия обычной погоды",
      ],
      [
        2,
        "Уговори кого-то выбрать официальный талисман пикника",
        "внезапная избирательная кампания среди случайных предметов",
      ],
      [
        3,
        "Организуй короткую минуту тишины для самого нелепого звука вокруг",
        "подозрительно уверенное управление общей тишиной",
      ],
    ],
    home: [
      [
        1,
        "Дважды уточни, кому принадлежит самый странный предмет на полке",
        "настойчивое домашнее расследование",
      ],
      [
        2,
        "Добейся, чтобы кто-то открыл холодильник и закрыл его, ничего не взяв",
        "слишком целенаправленный интерес к холодильнику",
      ],
      [
        3,
        "Уговори двух людей поменяться местами, не предлагая это напрямую",
        "скрытая диванная дипломатия",
      ],
      [1, "Трижды назови кухню штабом вечера", "подозрительно последовательное повышение кухни"],
      [
        2,
        "Добейся, чтобы кто-то принёс из другой комнаты безобидный предмет по твоему описанию",
        "домашняя логистика с оттенком спецоперации",
      ],
      [
        3,
        "Запусти спор о том, какой предмет в комнате переживёт апокалипсис",
        "слишком подготовленная экспертиза домашнего имущества",
      ],
    ],
    festival: [
      [
        1,
        "Спроси у трёх людей, какой браслет выглядит официальнее",
        "неожиданный аудит фестивальной бюрократии",
      ],
      [
        2,
        "Добейся, чтобы двое людей дали одно название ближайшей очереди",
        "слишком организованный брендинг очереди",
      ],
      [
        3,
        "Заставь кого-то указать на сцену или баннер, не спрашивая где они",
        "скрытая режиссура фестивального внимания",
      ],
      [1, "Дважды назови погоду частью лайнапа", "упорная попытка забронировать погоду"],
      [
        2,
        "Уговори кого-то сравнить два звука с разных сцен",
        "подозрительно серьёзная звуковая экспертиза",
      ],
      [
        3,
        "Организуй короткий общий жест в ответ на далёкий бас, не объявляя правила",
        "координация группы без видимого повода",
      ],
    ],
  },
  en: {
    "grill-site": [
      [
        1,
        "Ask three times who is officially responsible for the tongs",
        "unusual interest in the tongs chain of command",
      ],
      [
        2,
        "Get two people to judge the doneness of the same item",
        "a suddenly organized doneness committee",
      ],
      [
        3,
        "Make someone pass you a sauce without asking directly",
        "theatrical diplomacy around a sauce bottle",
      ],
      [
        1,
        "Call the smoke part of the atmosphere twice",
        "suspiciously persistent rebranding of smoke",
      ],
      [
        2,
        "Use the word ‘caramelization’ in three different conversations",
        "an unnatural frequency of culinary terminology",
      ],
      [
        3,
        "Make the tongs travel around the group without announcing a rule",
        "covert direction of the grill’s main artifact",
      ],
    ],
    bar: [
      [1, "Praise the warm light as an ingredient twice", "suspicious attention to lighting"],
      [
        2,
        "Make someone offer you a napkin without asking",
        "overly expressive mime around the napkins",
      ],
      [
        3,
        "Get two people to raise their glasses at once without saying ‘toast’",
        "covert direction of other people’s glasses",
      ],
      [
        1,
        "Ask for the full name of one drink three times",
        "unexpected loyalty to bar nomenclature",
      ],
      [
        2,
        "Make somebody read one line of the menu aloud",
        "a suspicious literary program around the menu",
      ],
      [
        3,
        "Start a short argument about the correct glass shape without stating your own view",
        "overly precise moderation of glassware philosophy",
      ],
    ],
    park: [
      [
        1,
        "Ask three people which bench looks most influential",
        "a suspicious audit of park authority",
      ],
      [
        2,
        "Make someone move one picnic object exactly one handspan",
        "overly precise direction of picnic evidence",
      ],
      [
        3,
        "Make two people listen to the same nearby sound at once without explaining why",
        "covert conducting of the group's attention",
      ],
      [
        1,
        "Call one gust of wind a plot twist twice",
        "persistent dramaturgy around ordinary weather",
      ],
      [
        2,
        "Convince someone to appoint an official picnic mascot",
        "a sudden election campaign among random objects",
      ],
      [
        3,
        "Arrange a brief silence for the most ridiculous nearby sound",
        "suspiciously confident control of the group's silence",
      ],
    ],
    home: [
      [
        1,
        "Ask twice who owns the strangest object on a shelf",
        "persistent domestic investigation",
      ],
      [
        2,
        "Make someone open the fridge and close it without taking anything",
        "overly purposeful interest in the fridge",
      ],
      [3, "Get two people to swap seats without suggesting it directly", "covert sofa diplomacy"],
      [
        1,
        "Call the kitchen party headquarters three times",
        "suspiciously consistent promotion of the kitchen",
      ],
      [
        2,
        "Get someone to fetch a harmless object from another room from your description",
        "domestic logistics with an operation-like precision",
      ],
      [
        3,
        "Start a debate about which object in the room would survive an apocalypse",
        "an unusually prepared assessment of household property",
      ],
    ],
    festival: [
      [
        1,
        "Ask three people which wristband looks most official",
        "an unexpected audit of festival bureaucracy",
      ],
      [
        2,
        "Get two people to give the nearest queue one shared name",
        "suspiciously organized queue branding",
      ],
      [
        3,
        "Make someone point at a stage or banner without asking where it is",
        "covert direction of festival attention",
      ],
      [1, "Call the weather part of the lineup twice", "a persistent attempt to book the weather"],
      [
        2,
        "Convince someone to compare sounds from two different stages",
        "suspiciously serious field acoustics",
      ],
      [
        3,
        "Arrange one shared gesture to a distant bass hit without announcing a rule",
        "group coordination without a visible reason",
      ],
    ],
  },
} as const;

export function buildSmokeScreenFallbackDeck(
  input: SmokeScreenGenerationInput,
  context: PartyContext,
): SmokeScreenDeck {
  const locale = context.contentLocale;
  const pool = fallbackMissions[locale][context.venue];
  return {
    missions: Array.from({ length: Math.max(1, Math.min(30, input.count)) }, (_, index) => {
      const [tier, text, detection_hint] = pool[index % pool.length]!;
      const cycle = Math.floor(index / pool.length);
      return {
        tier,
        text: cycle === 0 ? text : `${text} (${cycle + 1})`,
        detection_hint,
      };
    }),
  };
}

export const smokeScreenGenerationSpec: PromptSpec<SmokeScreenGenerationInput, SmokeScreenDeck> = {
  id: "smokescreen.generation",
  version: SMOKE_SCREEN_PROMPT_VERSION,
  gameId: "smokescreen",
  outputSchema: smokeScreenDeckSchema,
  jsonSchema: smokeScreenDeckJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Generate private missions that unfold through ordinary social behavior. They must look almost normal in the moment but suspicious in hindsight. Use only harmless, touchable objects and observable details already present in the server-derived environment. Never require danger, involuntary embarrassment, forced drinking, deception about emergencies, unwanted contact, strangers, leaving the group or damage. Tier 1 is simple, tier 2 is sly, tier 3 is virtuoso. Make every mission distinct. Materially adapt park missions to benches, picnic objects, wind and nearby sounds; grill missions to smoke, fire, tongs, doneness, foil and sauces; bar missions to glasses, warm light, toasts, menus and the counter; home missions to the sofa, kitchen, hallway, fridge, shelves and snacks; festival missions to wristbands, queues, stages, banners, food stalls, weather and changing sound.",
      scoringRubric:
        "Mission tier is deterministic party value: tier 1 = 5, tier 2 = 10, tier 3 = 15. Internal authoring rubric: 5 for feasible social behavior, +5 for suspicious-in-hindsight precision, and +5 for using the current environment as an actual mechanic. Do not output that rubric separately.",
      schema: smokeScreenDeckJsonSchema,
      fewShots: generationFewShots[context.contentLocale],
    }),
  buildUser: (input) =>
    `Generate exactly ${input.count} missions. Avoid these existing mission texts: ${JSON.stringify(input.existingMissionTexts)}.`,
  fallback: buildSmokeScreenFallbackDeck,
};

export const smokeScreenRecapSpec: PromptSpec<SmokeScreenRecapInput, { recap: string }> = {
  id: "smokescreen.recap",
  version: SMOKE_SCREEN_RECAP_PROMPT_VERSION,
  gameId: "smokescreen",
  outputSchema: smokeScreenRecapSchema,
  jsonSchema: smokeScreenRecapJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Write a four-to-six-sentence recap roast of the completed Smoke Screen results. Praise undetected virtuosos, finish off the caught performers, name the room’s most accurate detective, and use callbacks from the listed missions. Stay affectionate and adult; do not invent outcomes or scores.",
      scoringRubric:
        "No AI scoring. The server already fixed every point. Give narrative credit for a mission that used the environment (+5 as a writing-quality callback), but never change or state a new numeric award.",
      schema: smokeScreenRecapJsonSchema,
      fewShots: recapFewShots[context.contentLocale],
    }),
  buildUser: (input) =>
    `Smoke Screen results: ${JSON.stringify(input.results)}. Best detective: ${input.bestDetective ?? "none"}.`,
  fallback: (input, context) => ({
    recap:
      context.contentLocale === "ru"
        ? `Прикрытие закончилось, а алиби — нет. ${input.results.filter((result) => !result.wasCaught).length} исполнителей прошли мимо радара, остальные переоценили естественность своего поведения. ${input.bestDetective ? `${input.bestDetective} смотрел на компанию как следователь, которому наконец дали бюджет.` : "Детективы спорили громко, но улики спорили убедительнее."} Место вернулось к обычной жизни; подозрения останутся.`
        : `The cover story ended; the alibis did not. ${input.results.filter((result) => !result.wasCaught).length} performers slipped under the radar, while the rest overestimated how natural they looked. ${input.bestDetective ? `${input.bestDetective} watched the room like an investigator who had finally received funding.` : "The detectives argued loudly; the evidence argued better."} The venue returned to normal; the suspicion will travel.`,
  }),
};
