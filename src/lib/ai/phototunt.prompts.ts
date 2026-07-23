import { z } from "zod";
import type { PartyContext } from "../party-context";
import { venuePromptContext } from "./venue";
import {
  buildPartyPromptSystem,
  isClassicPromptContext,
  legacyHostVoiceSystem,
  taskJsonSchema,
  taskOutputSchema,
  type PromptContentPart,
  type PromptJsonSchema,
  type PromptSpec,
} from "./prompt-contract";

export type PhotoTaskInput = { pastTasks: string[] };
export type PhotoJudgeEntry = { playerId: string; playerName: string; url: string };
export type PhotoJudgeInput = { task: string; photos: PhotoJudgeEntry[] };

const PARK_FALLBACK_TASKS = [
  {
    task: "Snap an object that looks more tired of this party than anyone else.",
    intro: "We're hunting exhaustion in the wild.",
  },
  {
    task: 'Find a shot that could be titled "the last day of normalcy."',
    intro: "Beauty is over. Photo hunt begins.",
  },
  {
    task: "Photograph the most suspicious object within a one-minute jog.",
    intro: "The park is hiding something.",
  },
  {
    task: "Take a photo where an ordinary thing looks like key historical evidence.",
    intro: "The park spirit is on the case.",
  },
  {
    task: "Photograph the grill setup like it is a crime scene with excellent seasoning.",
    intro: "The tongs left fingerprints.",
  },
  {
    task: "Find the object that looks most personally betrayed by the weather.",
    intro: "Nature files a complaint.",
  },
  {
    task: "Take a photo that makes the ground look like an album cover.",
    intro: "The floor gets a record deal.",
  },
  {
    task: "Photograph something that looks like it gives terrible advice.",
    intro: "Wisdom has standards today.",
  },
  {
    task: "Find the most heroic-looking piece of trash nearby.",
    intro: "A small legend rises.",
  },
  {
    task: "Take a photo where smoke, light, or shadow looks like it is judging you.",
    intro: "The atmosphere has notes.",
  },
  {
    task: "Photograph the worst possible throne for a tiny king.",
    intro: "Royalty got budget cuts.",
  },
  {
    task: "Find something that looks like it survived a dramatic breakup.",
    intro: "Emotional damage, outdoors.",
  },
];

const BAR_FALLBACK_TASKS = [
  {
    task: "Photograph a still life from what's on the table that looks like a jazz album cover.",
    intro: "The table is now a recording studio.",
  },
  {
    task: "Take a shot that proves this bar is hiding a dark past.",
    intro: "The bodega knows something.",
  },
  {
    task: "Find the object in the bar that looks most disappointed with this evening.",
    intro: "Hunting exhaustion among the glasses.",
  },
  {
    task: 'Photograph your neighbor so it could be a "Success" business magazine cover.',
    intro: "Forbes is calling.",
  },
  {
    task: "Photograph the object on the table most likely to have a secret second life.",
    intro: "The props are hiding lore.",
  },
  {
    task: "Take a photo that looks like evidence from a very petty crime scene.",
    intro: "Forensics, but make it stupid.",
  },
  {
    task: "Shoot the most dramatic shadow near the table.",
    intro: "The lighting has ambition.",
  },
  {
    task: "Find a composition that makes one glass look like the villain of the evening.",
    intro: "Every glass has a motive.",
  },
  {
    task: "Photograph the most expensive-looking cheap thing within reach.",
    intro: "Budget luxury, go.",
  },
  {
    task: "Take a photo that could be titled 'before the apology message'.",
    intro: "Tomorrow is already nervous.",
  },
  {
    task: "Find something that looks like it just overheard gossip.",
    intro: "Objects are listening.",
  },
  {
    task: "Photograph the exact point where cozy becomes suspicious.",
    intro: "Comfort has crossed a line.",
  },
];

const PARTY_GRILL_FALLBACK_TASKS = [
  {
    task: "Сфотографируйте самый драматичный дым так, будто он уходит из токсичных отношений.",
    intro: "У дыма снова личная жизнь насыщеннее нашей.",
  },
  {
    task: "Снимите щипцы как главную улику в деле о преднамеренной пережарке.",
    intro: "Не трогайте улики жирными руками.",
  },
  {
    task: "Сделайте обугленный продукт героем дорогой датской обложки.",
    intro: "Некролог прожарке снимаем сейчас.",
  },
];

const PARTY_BAR_FALLBACK_TASKS = [
  {
    task: "Снимите бокал так, будто он единственный знает, что случилось после второго тоста.",
    intro: "У стекла есть показания.",
  },
  {
    task: "Найдите самый театральный свет на столе и превратите его в афишу нуар-фильма.",
    intro: "Бар включил диплом оператора.",
  },
  {
    task: "Сфотографируйте предмет, который выглядит дороже после фразы «авторская подача».",
    intro: "Наценка начинается с ракурса.",
  },
];

const PARTY_HOME_FALLBACK_TASKS_RU = [
  {
    task: "Снимите обычный предмет в доме так, будто он главный свидетель ночного происшествия.",
    intro: "Квартира начала давать показания.",
  },
  {
    task: "Превратите свет холодильника и одну закуску в афишу тревожного артхауса.",
    intro: "Кухня получила фестивальный бюджет.",
  },
  {
    task: "Найдите самый подозрительный угол комнаты и сфотографируйте его без людей.",
    intro: "У интерьера появилось алиби. Слабое.",
  },
];

const PARTY_FESTIVAL_FALLBACK_TASKS_RU = [
  {
    task: "Снимите браслет на фоне сцены так, будто это пропуск в очень сомнительное будущее.",
    intro: "Браслет знает, куда вы ввязались.",
  },
  {
    task: "Превратите указатель, баннер или вывеску в улику фестивального заговора.",
    intro: "Поле оставило подсказку на виду.",
  },
  {
    task: "Сфотографируйте землю под ногами как обложку альбома после слишком длинного сета.",
    intro: "Главная сцена сегодня внизу.",
  },
];

const PARTY_PARK_FALLBACK_TASKS_RU = [
  {
    task: "Снимите скамейку так, будто она устала хранить секреты этой компании.",
    intro: "Парк больше не соблюдает конфиденциальность.",
  },
  {
    task: "Превратите плед, дорожку или дерево в главную улику очень мелкого преступления.",
    intro: "Следствие вышло на свежий воздух.",
  },
  {
    task: "Сфотографируйте погоду так, будто она лично сорвала ваш безупречный план.",
    intro: "У прогноза появился мотив.",
  },
];

const PARTY_GRILL_FALLBACK_TASKS_EN = [
  {
    task: "Photograph the smoke like it just quit the grill after a public argument.",
    intro: "The smoke is ready to testify.",
  },
  {
    task: "Frame the tongs as the key evidence in a deliberate overcooking case.",
    intro: "Do not contaminate the evidence.",
  },
  {
    task: "Turn one charred ingredient into the cover star of an expensive food magazine.",
    intro: "The obituary needs a cover shot.",
  },
];

const PARTY_BAR_FALLBACK_TASKS_EN = [
  {
    task: "Photograph one glass like it alone remembers what happened after the second toast.",
    intro: "The glass has agreed to testify.",
  },
  {
    task: "Turn the most theatrical table light into a poster for a suspicious noir film.",
    intro: "The bar has hired a cinematographer.",
  },
  {
    task: "Photograph the object that gains the most value after someone says ‘house special’.",
    intro: "The markup begins with the angle.",
  },
];

const PARTY_HOME_FALLBACK_TASKS_EN = [
  {
    task: "Photograph an ordinary household object like it witnessed tonight's main incident.",
    intro: "The apartment has begun giving evidence.",
  },
  {
    task: "Turn fridge light and one snack into a poster for an anxious art-house film.",
    intro: "The kitchen received festival funding.",
  },
  {
    task: "Find the room's most suspicious corner and photograph it without any people.",
    intro: "The interior has an alibi. A weak one.",
  },
];

const PARTY_FESTIVAL_FALLBACK_TASKS_EN = [
  {
    task: "Frame a wristband against a stage like a pass into a very questionable future.",
    intro: "The wristband knows what you joined.",
  },
  {
    task: "Turn a sign, banner or wayfinding marker into evidence of a festival conspiracy.",
    intro: "The field left a clue in plain sight.",
  },
  {
    task: "Photograph the ground as an album cover after one set too many.",
    intro: "Tonight's main stage is underfoot.",
  },
];

const PARTY_PARK_FALLBACK_TASKS_EN = [
  {
    task: "Photograph a bench like it is tired of keeping this group's secrets.",
    intro: "The park has ended confidentiality.",
  },
  {
    task: "Turn a blanket, path or tree into evidence from an extremely petty crime.",
    intro: "The investigation has gone outdoors.",
  },
  {
    task: "Photograph the weather like it personally ruined your flawless plan.",
    intro: "The forecast has acquired a motive.",
  },
];

const PARTY_FALLBACK_TASKS = {
  ru: {
    "grill-site": PARTY_GRILL_FALLBACK_TASKS,
    bar: PARTY_BAR_FALLBACK_TASKS,
    home: PARTY_HOME_FALLBACK_TASKS_RU,
    festival: PARTY_FESTIVAL_FALLBACK_TASKS_RU,
    park: PARTY_PARK_FALLBACK_TASKS_RU,
  },
  en: {
    "grill-site": PARTY_GRILL_FALLBACK_TASKS_EN,
    bar: PARTY_BAR_FALLBACK_TASKS_EN,
    home: PARTY_HOME_FALLBACK_TASKS_EN,
    festival: PARTY_FESTIVAL_FALLBACK_TASKS_EN,
    park: PARTY_PARK_FALLBACK_TASKS_EN,
  },
} as const;

function firstUnused<T extends { task: string }>(pool: readonly T[], pastTasks: string[]) {
  return pool.find((candidate) => !pastTasks.includes(candidate.task)) ?? pool[0]!;
}

export function fallbackPhotoTask(input: PhotoTaskInput, context: PartyContext) {
  if (isClassicPromptContext(context)) {
    return firstUnused(
      context.venue === "bar" ? BAR_FALLBACK_TASKS : PARK_FALLBACK_TASKS,
      input.pastTasks,
    );
  }
  return firstUnused(PARTY_FALLBACK_TASKS[context.contentLocale][context.venue], input.pastTasks);
}

function avoided(items: string[]) {
  return (
    items
      .slice(-6)
      .map((item) => `- ${item}`)
      .join("\n") || "(none yet)"
  );
}

function legacyPhotoTaskUser(input: PhotoTaskInput, venue: "park" | "bar") {
  return `${venuePromptContext(venue)}

Invent ONE photo-hunt task. All players at once have 60 seconds to take ONE phone photo that best fits the task. The task must be doable in the current location.
The task must be:
- absurd but physically doable here and now;
- UNAMBIGUOUS to judge (you can look at the photo and tell how well it fits);
- creative, not just "photograph whatever you see."

Style examples (do NOT copy):
- "Find the object that looks loneliest in this park."
- "Take a shot that could be the cover of a sad indie album."
- "Photograph something that looks like your ex's face."
- "Find the worst landscaping attempt."

Avoid recent tasks:
${avoided(input.pastTasks)}

Also write a short intro (1 phrase, up to 12 words) that the park spirit will say out loud before the start.

JSON: { "task": "...", "intro": "..." }`;
}

export const classicPhotoTaskSpec: PromptSpec<PhotoTaskInput, z.infer<typeof taskOutputSchema>> = {
  id: "phototunt.task.classic",
  version: 1,
  gameId: "phototunt",
  outputSchema: taskOutputSchema,
  jsonSchema: { ...taskJsonSchema, name: "classic_photo_task" },
  buildSystem: legacyHostVoiceSystem,
  buildUser: (input, context) =>
    legacyPhotoTaskUser(input, context.venue === "bar" ? "bar" : "park"),
  fallback: fallbackPhotoTask,
};

export const partyPhotoTaskSpec: PromptSpec<PhotoTaskInput, z.infer<typeof taskOutputSchema>> = {
  id: "phototunt.task.party",
  version: 1,
  gameId: "phototunt",
  outputSchema: taskOutputSchema,
  jsonSchema: { ...taskJsonSchema, name: "party_photo_task" },
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Invent exactly one 60-second photo hunt. It must be absurd, physically safe, possible right now and visually unambiguous to compare. Require meaningful use of a real object, material, light or event from the current act.",
      schema: { ...taskJsonSchema, name: "party_photo_task" },
      fewShots: [
        'Input: grill act. Output: {"task":"Снимите дым так, будто он только что уволился с гриля со скандалом.","intro":"Дым готов дать показания."}',
        'Input: bar act. Output: {"task":"Превратите бокал и тёплый свет в обложку альбома о плохих решениях.","intro":"У бара появился арт-директор."}',
      ],
    }),
  buildUser: (input) => `Недавние задания, которые нельзя повторять:
${avoided(input.pastTasks)}
Создай одно новое фото-задание и короткую реплику ведущего.`,
  fallback: fallbackPhotoTask,
};

export function preparedFirstPhotoTask(
  output: unknown,
  context: PartyContext,
  pastTasks: readonly string[],
) {
  if (pastTasks.length > 0) return null;
  const spec = isClassicPromptContext(context) ? classicPhotoTaskSpec : partyPhotoTaskSpec;
  const parsed = spec.outputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

const classicPhotoRankingEntrySchema = z
  .object({
    playerId: z.string().min(1).max(128),
    rank: z.number().int().min(1).max(30),
    comment: z.string().trim().min(1).max(800),
  })
  .strict();

const classicPhotoJudgementSchema = z
  .object({
    ranking: z.array(classicPhotoRankingEntrySchema).min(1).max(30),
    verdict: z.string().trim().min(1).max(300),
  })
  .strict();

const classicPhotoJudgementJsonSchema: PromptJsonSchema = {
  name: "classic_photo_judgement",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ranking: {
        type: "array",
        minItems: 1,
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            playerId: { type: "string", minLength: 1, maxLength: 128 },
            rank: { type: "integer", minimum: 1, maximum: 30 },
            comment: { type: "string", minLength: 1, maxLength: 800 },
          },
          required: ["playerId", "rank", "comment"],
        },
      },
      verdict: { type: "string", minLength: 1, maxLength: 300 },
    },
    required: ["ranking", "verdict"],
  },
};

export const partyPhotoCriterionSchema = z
  .object({
    playerId: z.string().min(1).max(128),
    taskFitScore: z.number().int().min(0).max(10),
    creativityBonus: z.number().int().min(0).max(5),
    humorBonus: z.number().int().min(0).max(5),
    environmentBonus: z.number().int().min(0).max(5),
    comment: z.string().trim().min(1).max(800),
  })
  .strict();

export const partyPhotoJudgementSchema = z
  .object({
    entries: z.array(partyPhotoCriterionSchema).min(1).max(30),
    verdict: z.string().trim().min(1).max(300),
  })
  .strict();

const partyPhotoJudgementJsonSchema: PromptJsonSchema = {
  name: "party_photo_judgement",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      entries: {
        type: "array",
        minItems: 1,
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            playerId: { type: "string", minLength: 1, maxLength: 128 },
            taskFitScore: { type: "integer", minimum: 0, maximum: 10 },
            creativityBonus: { type: "integer", minimum: 0, maximum: 5 },
            humorBonus: { type: "integer", minimum: 0, maximum: 5 },
            environmentBonus: { type: "integer", minimum: 0, maximum: 5 },
            comment: { type: "string", minLength: 1, maxLength: 800 },
          },
          required: [
            "playerId",
            "taskFitScore",
            "creativityBonus",
            "humorBonus",
            "environmentBonus",
            "comment",
          ],
        },
      },
      verdict: { type: "string", minLength: 1, maxLength: 300 },
    },
    required: ["entries", "verdict"],
  },
};

function photoParts(input: PhotoJudgeInput, instructions: string): PromptContentPart[] {
  const parts: PromptContentPart[] = [
    {
      type: "text",
      text: `The task was: "${input.task}"

Player list (same order as the photos):
${input.photos.map((photo, index) => `${index + 1}. ${photo.playerName} (id: ${photo.playerId})`).join("\n")}

${instructions}`,
    },
  ];
  input.photos.forEach((photo, index) => {
    parts.push({ type: "text", text: `Photo #${index + 1} — ${photo.playerName}:` });
    parts.push({ type: "image_url", image_url: { url: photo.url } });
  });
  return parts;
}

export const classicPhotoJudgementSpec: PromptSpec<
  PhotoJudgeInput,
  z.infer<typeof classicPhotoJudgementSchema>
> = {
  id: "phototunt.judge.classic",
  version: 1,
  gameId: "phototunt",
  outputSchema: classicPhotoJudgementSchema,
  jsonSchema: classicPhotoJudgementJsonSchema,
  buildSystem: legacyHostVoiceSystem,
  buildUser: (input) =>
    photoParts(
      input,
      `Look at ALL ${input.photos.length} photos and compare them.
Judge by STRICT criteria:
1. How well the photo fits the task (not just "a pretty photo").
2. Creativity of interpretation.
3. A spark of humor or surprise — bonus points for that.

Rank EVERYONE from 1 (best) to ${input.photos.length} (worst). No ties.
Reply with JSON: { "ranking": [{ "playerId": "<id>", "rank": 1, "comment": "<specific sharp sentence>" }], "verdict": "<announce winner by name>" }`,
    ),
  fallback: (input) => ({
    ranking: input.photos.map((photo, index) => ({
      playerId: photo.playerId,
      rank: index + 1,
      comment: "The AI judge went offline, so upload order decides.",
    })),
    verdict: `${input.photos[0]?.playerName ?? "First uploader"} takes the emergency win.`,
  }),
};

export const partyPhotoJudgementSpec: PromptSpec<
  PhotoJudgeInput,
  z.infer<typeof partyPhotoJudgementSchema>
> = {
  id: "phototunt.judge.party",
  version: 1,
  gameId: "phototunt",
  outputSchema: partyPhotoJudgementSchema,
  jsonSchema: partyPhotoJudgementJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Compare every submitted photo. Return one criteria entry for every playerId, reference a concrete visible detail, and write a short closing line without naming a winner. Do not return ranks, totals or points; the server owns them.",
      scoringRubric:
        "taskFitScore 0–10; creativityBonus 0–5; humorBonus 0–5; environmentBonus 0–5 only when the real current environment materially shapes the shot. Grill evidence: smoke/fire/tongs/char/weather. Bar evidence: glass/warm light/toast/counter. Explain the environment bonus in the comment. Server sums criteria and assigns stable ranks; never invent rank or points.",
      schema: partyPhotoJudgementJsonSchema,
      fewShots: [
        'Input: charred vegetable staged in real smoke. Output entry: {"playerId":"p1","taskFitScore":8,"creativityBonus":4,"humorBonus":3,"environmentBonus":5,"comment":"Обугленный кабачок вышел из дыма как свидетель, которого следствие явно довело."}',
        'Input: generic selfie with no bar detail. Output entry: {"playerId":"p2","taskFitScore":3,"creativityBonus":1,"humorBonus":0,"environmentBonus":0,"comment":"Бар в кадр не пустили: среда предоставила алиби, фотография — нет."}',
        'Output envelope: {"entries":[{"playerId":"p1","taskFitScore":8,"creativityBonus":4,"humorBonus":3,"environmentBonus":5,"comment":"Дым сделал половину режиссуры и не попросил гонорар."}],"verdict":"Один кадр сегодня явно пришёл с сообщником."}',
      ],
    }),
  buildUser: (input) =>
    photoParts(
      input,
      `Сравни все ${input.photos.length} фотографий по четырём критериям. Верни по одной записи на каждый playerId; не назначай места или очки.`,
    ),
  fallback: (input) => ({
    entries: input.photos.map((photo, index) => ({
      playerId: photo.playerId,
      taskFitScore: Math.max(1, 5 - index),
      creativityBonus: 0,
      humorBonus: 0,
      environmentBonus: 0,
      comment: "Цифровой критик ушёл со сцены; аварийный порядок — по времени загрузки.",
    })),
    verdict: "В аварийном режиме побеждает пунктуальность.",
  }),
};

export function finalizePartyPhotoJudgement(
  output: z.infer<typeof partyPhotoJudgementSchema>,
  photos: PhotoJudgeEntry[],
  context: PartyContext,
) {
  const validIds = new Set(photos.map((photo) => photo.playerId));
  const byPlayer = new Map<string, z.infer<typeof partyPhotoCriterionSchema>>();
  for (const entry of output.entries) {
    if (validIds.has(entry.playerId) && !byPlayer.has(entry.playerId)) {
      byPlayer.set(entry.playerId, entry);
    }
  }

  const scored = photos.map((photo, inputOrder) => {
    const entry = byPlayer.get(photo.playerId);
    const total = entry
      ? entry.taskFitScore + entry.creativityBonus + entry.humorBonus + entry.environmentBonus
      : 0;
    return {
      playerId: photo.playerId,
      playerName: photo.playerName,
      inputOrder,
      total,
      comment: entry?.comment ?? "Критик пропустил кадр; сервер поставил его в конец без очков.",
    };
  });
  scored.sort((a, b) => b.total - a.total || a.inputOrder - b.inputOrder);
  const ranking = scored.map((entry, index) => ({
    playerId: entry.playerId,
    rank: index + 1,
    comment: entry.comment,
  }));
  const winner =
    scored[0]?.playerName ?? (context.contentLocale === "ru" ? "Первый кадр" : "First photo");
  const prefix = context.contentLocale === "ru" ? `Побеждает ${winner}.` : `${winner} wins.`;
  const namesOfNonWinners = scored.slice(1).map((entry) => entry.playerName.toLocaleLowerCase());
  const contradictsRanking = namesOfNonWinners.some((name) =>
    output.verdict.toLocaleLowerCase().includes(name),
  );
  const closing = contradictsRanking
    ? context.contentLocale === "ru"
      ? "Сервер сверил протокол и не дал критику перепутать пьедестал."
      : "The server checked the record and kept the critic from changing the podium."
    : output.verdict;
  return { ranking, verdict: `${prefix} ${closing}` };
}

export type ClassicPhotoJudgement = z.infer<typeof classicPhotoJudgementSchema>;
