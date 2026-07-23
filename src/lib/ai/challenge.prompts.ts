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

export type ChallengeTaskInput = {
  operatorName: string;
  pastTasks: string[];
};

export type ChallengeJudgeInput = {
  task: string;
  transcript: string;
  frames: string[];
  operatorName: string;
};

const LEGACY_CHALLENGE_VOICE_SYSTEM = legacyHostVoiceSystem().replace(
  "Always return strict valid JSON",
  "Always reply with strict valid JSON",
);

const BAR_FALLBACK_TASKS = [
  {
    task: "Act out a tasting of the most expensive drink in history — in turns, with sommelier faces falling apart.",
    intro: "The bar becomes a theater. Sorry, bar.",
  },
  {
    task: "Perform a scene: you are a board of directors urgently deciding who gives the next toast.",
    intro: "Corporate drama at the table.",
  },
  {
    task: 'Show a silent film called "the last hour before closing" — drama, chase, and happy end required.',
    intro: "Lights, camera, bodega.",
  },
  {
    task: "Act out an orchestra where every instrument is something on the table.",
    intro: "The Philharmonic of this bodega opens tonight.",
  },
  {
    task: "Stage a negotiation between two bar stools fighting over who has suffered more tonight.",
    intro: "Furniture HR is in session.",
  },
  {
    task: "Perform a slow-motion documentary about the last ice cube in the glass.",
    intro: "The ice has legal representation.",
  },
  {
    task: "Act out a luxury perfume ad for the cheapest thing on the table.",
    intro: "Elegance has hit budget mode.",
  },
  {
    task: "Show a silent argument between a menu, a receipt, and a person pretending not to panic.",
    intro: "The bill has entered the chat.",
  },
  {
    task: "Perform a heroic rescue mission for a napkin that fell behind enemy lines.",
    intro: "No napkin left behind.",
  },
  {
    task: "Act out the founding ceremony of a secret society based around this table.",
    intro: "Congratulations, you are a cult now.",
  },
  {
    task: "Show the exact moment a casual toast becomes a political crisis.",
    intro: "Raise glasses, lower expectations.",
  },
  {
    task: "Perform a courtroom drama where the playlist is accused of ruining the vibe.",
    intro: "The aux cable pleads not guilty.",
  },
];

const PARK_FALLBACK_TASKS = [
  {
    task: "Act out a council of trees that just learned they were assigned to be Wi-Fi routers.",
    intro: "The park spirit switches on emergency theater.",
  },
  {
    task: "Perform a scene: you are a rescue team trying to revive a very dramatic leaf.",
    intro: "The leaf is not okay. You won't be either.",
  },
  {
    task: "Show what the park would look like if every bench suddenly became a manager.",
    intro: "The benches demand respect.",
  },
  {
    task: "Act out the championship final of invisible frisbee. Commentator, injury, and victory pose required.",
    intro: "Invisible sport, visible embarrassment.",
  },
  {
    task: "Perform a nature documentary about a sausage that believes it is the alpha predator.",
    intro: "The food chain is confused.",
  },
  {
    task: "Act out a weather forecast delivered by people who are personally offended by clouds.",
    intro: "The sky has made enemies.",
  },
  {
    task: "Show a survival team crossing three meters of grass like it is the Arctic.",
    intro: "A tiny expedition begins.",
  },
  {
    task: "Perform a council meeting where the grill tongs demand democratic elections.",
    intro: "The tongs want power.",
  },
  {
    task: "Act out a slow-motion betrayal over the last piece of bread.",
    intro: "Carbs reveal character.",
  },
  {
    task: "Show what happens when the smoke starts giving everyone life coaching.",
    intro: "The smoke has opinions.",
  },
  {
    task: "Perform a sports broadcast for the most dramatic flip on the grill.",
    intro: "Tonight's main event is edible.",
  },
  {
    task: "Act out a rescue operation for a drink placed dangerously close to the edge.",
    intro: "Hydration is in danger.",
  },
];

const PARTY_GRILL_FALLBACK_TASKS = [
  {
    task: "Разыграйте экстренное заседание щипцов: мясо требует адвоката, дым — право на молчание.",
    intro: "Гриль объявлен местом происшествия.",
  },
  {
    task: "Снимите спортивный финал по переворачиванию самого подозрительного овоща на решётке.",
    intro: "Сегодня прожарка решает судьбу чемпионата.",
  },
  {
    task: "Покажите немой фильм, где фольга спасает последнюю сосиску от датской погоды.",
    intro: "Погода снова выбрала нас своей жертвой.",
  },
];

const PARTY_BAR_FALLBACK_TASKS = [
  {
    task: "Разыграйте совет бокалов, который решает, кто пережил этот вечер драматичнее всех.",
    intro: "Барная посуда потребовала права голоса.",
  },
  {
    task: "Покажите суд над тостом, который начинался прилично и слишком далеко зашёл.",
    intro: "У тоста будет государственный защитник.",
  },
  {
    task: "Снимите рекламу самого дешёвого предмета на столе как предмета датской роскоши.",
    intro: "Бюджет закончился, претензии остались.",
  },
];

const PARTY_HOME_FALLBACK_TASKS_RU = [
  {
    task: "Разыграйте экстренное собрание жильцов: свет холодильника поймал закуску после комендантского часа.",
    intro: "Кухня открыла внутреннее расследование.",
  },
  {
    task: "Покажите суд диванных подушек над пультом, который опять исчез без объяснений.",
    intro: "Гостиная требует вернуть вещдок.",
  },
  {
    task: "Снимите документальный фильм о великой миграции обуви через прихожую.",
    intro: "Коридор получил голос за кадром.",
  },
];

const PARTY_FESTIVAL_FALLBACK_TASKS_RU = [
  {
    task: "Разыграйте таможенный досмотр браслета и пустого стакана на входе в следующую реальность.",
    intro: "Фестиваль усилил пограничный контроль.",
  },
  {
    task: "Покажите в замедленной съёмке, как очередь героически продвинулась на один метр.",
    intro: "Исторический момент наконец наступил.",
  },
  {
    task: "Устройте пресс-конференцию указателя, который отправил половину компании не к той сцене.",
    intro: "Навигация согласилась ответить на вопросы.",
  },
];

const PARTY_PARK_FALLBACK_TASKS_RU = [
  {
    task: "Разыграйте пресс-конференцию скамейки, которая видела слишком многое и устала молчать.",
    intro: "Парк выставил главного свидетеля.",
  },
  {
    task: "Покажите штаб на пледе, который пытается пережить личный конфликт с погодой.",
    intro: "Прогноз объявил вам войну.",
  },
  {
    task: "Снимите выборы среди листьев: победитель получает право выбрать направление ветра.",
    intro: "Демократия дошла до газона.",
  },
];

const PARTY_GRILL_FALLBACK_TASKS_EN = [
  {
    task: "Stage an emergency tongs hearing: the food wants a lawyer and the smoke invokes its right to silence.",
    intro: "The grill is now a crime scene.",
  },
  {
    task: "Perform the championship final for flipping the most suspicious vegetable on the grill.",
    intro: "Tonight, doneness decides the title.",
  },
  {
    task: "Show a silent film where foil rescues the final sausage from the Danish weather.",
    intro: "The forecast has chosen another victim.",
  },
];

const PARTY_BAR_FALLBACK_TASKS_EN = [
  {
    task: "Stage a council of glasses deciding who survived tonight with the most dramatic dignity.",
    intro: "The glassware has demanded a vote.",
  },
  {
    task: "Put a toast on trial for starting politely and going much too far.",
    intro: "The toast has been assigned counsel.",
  },
  {
    task: "Film a luxury advert for the cheapest object currently on the table.",
    intro: "The budget ended. The attitude stayed.",
  },
];

const PARTY_HOME_FALLBACK_TASKS_EN = [
  {
    task: "Stage an emergency house meeting: the fridge light caught a snack out after curfew.",
    intro: "The kitchen has opened an inquiry.",
  },
  {
    task: "Put the missing remote on trial before a jury of sofa cushions.",
    intro: "The living room wants its evidence back.",
  },
  {
    task: "Film a nature documentary about the great migration of shoes across the hallway.",
    intro: "The corridor has hired a narrator.",
  },
];

const PARTY_FESTIVAL_FALLBACK_TASKS_EN = [
  {
    task: "Stage a customs inspection of a wristband and an empty cup entering the next reality.",
    intro: "The festival has tightened border control.",
  },
  {
    task: "Show in slow motion how the queue heroically advances by one full metre.",
    intro: "The historic moment has finally arrived.",
  },
  {
    task: "Hold a press conference for the sign that sent half the group to the wrong stage.",
    intro: "Wayfinding has agreed to take questions.",
  },
];

const PARTY_PARK_FALLBACK_TASKS_EN = [
  {
    task: "Stage a press conference for the bench that has seen too much and is tired of silence.",
    intro: "The park has produced its main witness.",
  },
  {
    task: "Show a blanket headquarters trying to survive its personal feud with the weather.",
    intro: "The forecast has declared war on you.",
  },
  {
    task: "Film an election among the leaves; the winner chooses the wind's next direction.",
    intro: "Democracy has reached the lawn.",
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

export function fallbackChallengeTask(input: ChallengeTaskInput, context: PartyContext) {
  if (isClassicPromptContext(context)) {
    return firstUnused(
      context.venue === "bar" ? BAR_FALLBACK_TASKS : PARK_FALLBACK_TASKS,
      input.pastTasks,
    );
  }
  return firstUnused(PARTY_FALLBACK_TASKS[context.contentLocale][context.venue], input.pastTasks);
}

function avoided(items: string[], limit: number) {
  return (
    items
      .slice(-limit)
      .map((item) => `- ${item}`)
      .join("\n") || "(none yet)"
  );
}

function legacyChallengeTaskUser(input: ChallengeTaskInput, venue: "park" | "bar") {
  return `${venuePromptContext(venue)}

The operator right now is ${input.operatorName}. They are filming the other players for 20 seconds.
Invent ONE absurd scene task for everyone else. Something that makes them perform, yell, or make faces. No more than 2 sentences. No "how to do it" hints. The task must be doable in the current location.

Style examples (do NOT copy):
- "Act out a scene: you are three squirrels who just learned nuts got expensive. One of you must cry for real."
- "Perform as a rain-knight ensemble. Someone is thunder, someone is lightning, someone is an offended cloud."

Avoid these recent tasks:
${avoided(input.pastTasks, 5)}

Also write a short intro (1 short phrase, up to 12 words) that the park spirit will say out loud before the task. Full of character.

JSON: { "task": "...", "intro": "..." }`;
}

export const classicChallengeTaskSpec: PromptSpec<
  ChallengeTaskInput,
  z.infer<typeof taskOutputSchema>
> = {
  id: "challenge.task.classic",
  version: 1,
  gameId: "challenge",
  outputSchema: taskOutputSchema,
  jsonSchema: { ...taskJsonSchema, name: "classic_challenge_task" },
  buildSystem: () => LEGACY_CHALLENGE_VOICE_SYSTEM,
  buildUser: (input, context) =>
    legacyChallengeTaskUser(input, context.venue === "bar" ? "bar" : "park"),
  fallback: fallbackChallengeTask,
};

export const partyChallengeTaskSpec: PromptSpec<
  ChallengeTaskInput,
  z.infer<typeof taskOutputSchema>
> = {
  id: "challenge.task.party",
  version: 1,
  gameId: "challenge",
  outputSchema: taskOutputSchema,
  jsonSchema: { ...taskJsonSchema, name: "party_challenge_task" },
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Invent exactly one absurd 20-second ensemble scene. The camera operator films; everyone else performs. It must be immediately understandable, physically safe and doable in the current environment. Make the environment the star, not decorative wallpaper. Return a task of at most two sentences and an intro of at most 12 words.",
      schema: { ...taskJsonSchema, name: "party_challenge_task" },
      fewShots: [
        'Input: grill act. Output: {"task":"Разыграйте пресс-конференцию: щипцы обвиняют дым в подрыве репутации гриля.","intro":"Следствие наконец добралось до щипцов."}',
        'Input: bar act. Output: {"task":"Покажите немой развод бокала и последнего кубика льда. Бармен — их уставший медиатор.","intro":"У этого льда есть адвокат."}',
      ],
    }),
  buildUser: (input) => `Оператор: ${input.operatorName}.
Недавние задания, которые нельзя повторять:
${avoided(input.pastTasks, 5)}
Создай одно новое задание и короткую реплику ведущего.`,
  fallback: fallbackChallengeTask,
};

export function preparedFirstChallengeTask(
  output: unknown,
  context: PartyContext,
  pastTasks: readonly string[],
) {
  if (pastTasks.length > 0) return null;
  const spec = isClassicPromptContext(context) ? classicChallengeTaskSpec : partyChallengeTaskSpec;
  const parsed = spec.outputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

const classicChallengeJudgementSchema = z
  .object({
    score: z.number().int().min(1).max(10),
    feedback: z.string().trim().min(1).max(800),
    verdict: z.string().trim().min(1).max(240),
  })
  .strict();

const classicChallengeJudgementJsonSchema: PromptJsonSchema = {
  name: "classic_challenge_judgement",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      score: { type: "integer", minimum: 1, maximum: 10 },
      feedback: { type: "string", minLength: 1, maxLength: 800 },
      verdict: { type: "string", minLength: 1, maxLength: 240 },
    },
    required: ["score", "feedback", "verdict"],
  },
};

export const partyChallengeJudgementSchema = z
  .object({
    performanceScore: z.number().int().min(0).max(4),
    creativityScore: z.number().int().min(0).max(3),
    energyScore: z.number().int().min(0).max(3),
    environmentBonus: z.number().int().min(0).max(5),
    feedback: z.string().trim().min(1).max(800),
    verdict: z.string().trim().min(1).max(240),
  })
  .strict();

const partyChallengeJudgementJsonSchema: PromptJsonSchema = {
  name: "party_challenge_judgement",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      performanceScore: { type: "integer", minimum: 0, maximum: 4 },
      creativityScore: { type: "integer", minimum: 0, maximum: 3 },
      energyScore: { type: "integer", minimum: 0, maximum: 3 },
      environmentBonus: { type: "integer", minimum: 0, maximum: 5 },
      feedback: { type: "string", minLength: 1, maxLength: 800 },
      verdict: { type: "string", minLength: 1, maxLength: 240 },
    },
    required: [
      "performanceScore",
      "creativityScore",
      "energyScore",
      "environmentBonus",
      "feedback",
      "verdict",
    ],
  },
};

function challengeVisionParts(
  input: ChallengeJudgeInput,
  instructions: string,
): PromptContentPart[] {
  return [
    {
      type: "text",
      text: `The task was: "${input.task}"
Operator (filming): ${input.operatorName}.
Audio transcript from the video: "${input.transcript || "(no speech or unintelligible)"}"

${instructions}`,
    },
    ...input.frames.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
}

export const classicChallengeJudgementSpec: PromptSpec<
  ChallengeJudgeInput,
  z.infer<typeof classicChallengeJudgementSchema>
> = {
  id: "challenge.judge.classic",
  version: 1,
  gameId: "challenge",
  outputSchema: classicChallengeJudgementSchema,
  jsonSchema: classicChallengeJudgementJsonSchema,
  buildSystem: () => LEGACY_CHALLENGE_VOICE_SYSTEM,
  buildUser: (input) =>
    challengeVisionParts(
      input,
      `I am giving you ${input.frames.length} frames from the video. Look at them and judge by STRICT criteria:
1. How well the players actually performed the task (not just standing around).
2. Creativity of interpretation.
3. Energy and engagement (visible movement, emotion).
4. Bonus if the operator caught the climax on camera.

Scale 1-10:
- 1-3: nothing happens, boring or off-topic.
- 4-6: they tried, but no spark.
- 7-8: solid scene, effort shows.
- 9-10: brilliant, I'm applauding.

Do NOT dock points for filming technique. Reward the attempt.

Reply with JSON:
{
  "score": <number 1-10>,
  "feedback": "<your comment in 1-2 sentences, like a sarcastic judge, referencing a SPECIFIC detail you see>",
  "verdict": "<SHORT phrase up to 12 words that the park spirit says out loud over the speaker, with the score>"
}`,
    ),
  fallback: (input) => ({
    score: 6,
    feedback: input.transcript
      ? "The judge saw the transcript but could not reach the crystal ball. Crediting the attempt and team energy."
      : "Video accepted, but the judge is blind and deaf today. Crediting the attempt and team energy.",
    verdict: "Six out of ten. The park spirit is working offline.",
  }),
};

export const partyChallengeJudgementSpec: PromptSpec<
  ChallengeJudgeInput,
  z.infer<typeof partyChallengeJudgementSchema>
> = {
  id: "challenge.judge.party",
  version: 1,
  gameId: "challenge",
  outputSchema: partyChallengeJudgementSchema,
  jsonSchema: partyChallengeJudgementJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Judge the submitted scene from its transcript and frames. Reference one concrete visible or audible detail. Do not judge camera technique and do not invent a total score or points.",
      scoringRubric:
        "performanceScore 0–4 for actually performing the task; creativityScore 0–3; energyScore 0–3; environmentBonus 0–5 only for meaningful use of the real act environment (grill: fire/smoke/tongs/food/weather; bar: glasses/light/toasts/counter). The server computes and caps the final 1–10 score. Your feedback must explain the environment bonus through a joke.",
      schema: partyChallengeJudgementJsonSchema,
      fewShots: [
        'Input: the team made the smoke testify while waving tongs. Output: {"performanceScore":4,"creativityScore":3,"energyScore":2,"environmentBonus":5,"feedback":"Дым дал показания убедительнее половины свидетелей, а щипцы впервые выглядели компетентным следователем.","verdict":"Десять. Среда была соучастником, и это сработало."}',
        'Input: the team mostly stood still in a bar. Output: {"performanceScore":1,"creativityScore":1,"energyScore":0,"environmentBonus":0,"feedback":"Бокалы присутствовали, но играли заметно активнее людей — это реквизит, а не использование среды.","verdict":"Два. Бар видел попытку и попросил больше не повторять."}',
      ],
    }),
  buildUser: (input) =>
    challengeVisionParts(
      input,
      `Проанализируй ${input.frames.length} кадров и транскрипт. Верни только оценки по критериям, комментарий и короткий вердикт.`,
    ),
  fallback: (input) => ({
    performanceScore: 3,
    creativityScore: 1,
    energyScore: 2,
    environmentBonus: 0,
    feedback: input.transcript
      ? "Транскрипт принят, но цифровой следователь временно ослеп. Попытка и энергия засчитаны без бонуса за среду."
      : "Видео принято, но цифровой следователь сегодня слеп и глух. Попытка засчитана без бонуса за среду.",
    verdict: "Шесть. Следователь работает в аварийном режиме.",
  }),
};

export type PartyChallengeBreakdown = {
  performance: number;
  creativity: number;
  energy: number;
  environment: number;
};

export function finalizePartyChallengeJudgement(
  output: z.infer<typeof partyChallengeJudgementSchema>,
) {
  const breakdown: PartyChallengeBreakdown = {
    performance: output.performanceScore,
    creativity: output.creativityScore,
    energy: output.energyScore,
    environment: output.environmentBonus,
  };
  const rawScore = Object.values(breakdown).reduce((total, score) => total + score, 0);
  return {
    score: Math.max(1, Math.min(10, rawScore)),
    feedback: output.feedback,
    verdict: output.verdict,
    breakdown,
  };
}

export type ClassicChallengeJudgement = z.infer<typeof classicChallengeJudgementSchema>;
