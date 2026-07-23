import { z } from "zod";
import type { PartyContext } from "../party-context";
import { venuePromptContext } from "./venue";
import {
  buildPartyPromptSystem,
  isClassicPromptContext,
  legacyHostVoiceSystem,
  type PromptJsonSchema,
  type PromptSpec,
} from "./prompt-contract";

export type ImpostorQuestionInput = { pastQuestions: string[] };
export type ImpostorAnswerInput = { question: string; humanAnswers: string[] };
export type ImpostorRevealInput = {
  question: string;
  aiAnswer: string;
  caughtCount: number;
  totalVoters: number;
};

const questionOutputSchema = z
  .object({
    question: z.string().trim().min(1).max(240),
    intro: z.string().trim().min(1).max(200),
  })
  .strict();

const questionJsonSchema: PromptJsonSchema = {
  name: "impostor_question",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      question: { type: "string", minLength: 1, maxLength: 240 },
      intro: { type: "string", minLength: 1, maxLength: 200 },
    },
    required: ["question", "intro"],
  },
};

const answerOutputSchema = z.object({ answer: z.string().trim().min(1).max(240) }).strict();
const answerJsonSchema: PromptJsonSchema = {
  name: "impostor_answer",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { answer: { type: "string", minLength: 1, maxLength: 240 } },
    required: ["answer"],
  },
};

const revealOutputSchema = z.object({ verdict: z.string().trim().min(1).max(300) }).strict();
const revealJsonSchema: PromptJsonSchema = {
  name: "impostor_reveal",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { verdict: { type: "string", minLength: 1, maxLength: 300 } },
    required: ["verdict"],
  },
};

function avoided(items: string[]) {
  return (
    items
      .slice(-6)
      .map((item) => `- ${item}`)
      .join("\n") || "(none yet)"
  );
}

function fallbackPartyQuestion(context: PartyContext) {
  const questions =
    context.contentLocale === "ru"
      ? {
          bar: {
            question: "Что этот бокал выдаёт о человеке, который сказал «последний»?",
            intro: "Бар уже дал показания. Теперь ваша очередь.",
          },
          home: {
            question: "Какой предмет в этой квартире первым напишет жалобу на гостей?",
            intro: "У квартиры накопились вопросы. Отвечайте как подозреваемые.",
          },
          festival: {
            question: "Что фестивальный браслет расскажет о вас службе безопасности?",
            intro: "Браслет всё видел. Версия защиты начинается сейчас.",
          },
          park: {
            question: "Что эта скамейка напишет в отчёте о вашей компании?",
            intro: "Парк ведёт протокол. Добавьте свою версию.",
          },
          "grill-site": {
            question: "Что дым сказал бы о человеке, который только советует у гриля?",
            intro: "У дыма есть версия. У вас — пятнадцать слов.",
          },
        }
      : {
          bar: {
            question: "What does this glass reveal about whoever said ‘last one’ again?",
            intro: "The bar has testified. Your version starts now.",
          },
          home: {
            question: "Which object in this home will complain about the guests first?",
            intro: "The apartment has questions. Answer like suspects.",
          },
          festival: {
            question: "What would your festival wristband report to security about you?",
            intro: "The wristband saw everything. Begin your defence.",
          },
          park: {
            question: "What would this bench write in its report about your group?",
            intro: "The park is taking notes. Add your version.",
          },
          "grill-site": {
            question: "What would the smoke say about the person only giving grill advice?",
            intro: "The smoke has a version. You have fifteen words.",
          },
        };
  return questions[context.venue];
}

function legacyQuestionUser(input: ImpostorQuestionInput, venue: "park" | "bar") {
  return `${venuePromptContext(venue)}

Invent ONE question for the game "Who's the Bot?". Each player writes a short funny answer on their phone, and you secretly add yours. Then everyone hunts for the bot's answer.

The question must be:
- open-ended, with no right answer — wit only;
- short (up to 15 words), answerable in one phrase;
- funny for a group of adult friends, slightly cheeky — bars, relationships, awkwardness are fair game;
- NOT a quiz and NOT a factual question.

Style examples (do NOT copy):
- "Worst compliment you could give a bartender?"
- "What would your autobiography be called if you wrote it tonight?"

Avoid recent questions:
${avoided(input.pastQuestions)}

Also write an intro (1 phrase, up to 12 words) that the host says out loud before the round.

JSON: { "question": "...", "intro": "..." }`;
}

export const classicImpostorQuestionSpec: PromptSpec<
  ImpostorQuestionInput,
  z.infer<typeof questionOutputSchema>
> = {
  id: "impostor.question.classic",
  version: 1,
  gameId: "impostor",
  outputSchema: questionOutputSchema,
  jsonSchema: { ...questionJsonSchema, name: "classic_impostor_question" },
  buildSystem: legacyHostVoiceSystem,
  buildUser: (input, context) =>
    legacyQuestionUser(input, context.venue === "bar" ? "bar" : "park"),
  fallback: () => ({
    question: "What is the worst possible slogan for this party?",
    intro: "The bot stalled. The local question deck takes over.",
  }),
};

export const partyImpostorQuestionSpec: PromptSpec<
  ImpostorQuestionInput,
  z.infer<typeof questionOutputSchema>
> = {
  id: "impostor.question.party",
  version: 1,
  gameId: "impostor",
  outputSchema: questionOutputSchema,
  jsonSchema: { ...questionJsonSchema, name: "party_impostor_question" },
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Invent one open-ended question for Who's the Bot. It has no correct answer, fits in 15 words, invites a short witty phone answer, and makes the current environment essential. Adult awkwardness is welcome; quizzes and factual questions are not.",
      schema: { ...questionJsonSchema, name: "party_impostor_question" },
      fewShots: [
        'Input: grill act. Output: {"question":"Что дым написал бы в жалобе на вашу компанию?","intro":"Дым уже дал показания. Теперь ваша очередь."}',
        'Input: bar act. Output: {"question":"Худший тост, после которого бар попросит алиби?","intro":"Поднимите бокалы и снизьте ожидания."}',
      ],
    }),
  buildUser: (input) => `Недавние вопросы, которые нельзя повторять:
${avoided(input.pastQuestions)}
Создай один новый вопрос и короткую реплику ведущего.`,
  fallback: (_input, context) => fallbackPartyQuestion(context),
};

function humanSamples(input: ImpostorAnswerInput) {
  return input.humanAnswers.map((answer) => `- ${answer}`).join("\n") || "(people still thinking)";
}

export const classicImpostorAnswerSpec: PromptSpec<
  ImpostorAnswerInput,
  z.infer<typeof answerOutputSchema>
> = {
  id: "impostor.answer.classic",
  version: 1,
  gameId: "impostor",
  outputSchema: answerOutputSchema,
  jsonSchema: { ...answerJsonSchema, name: "classic_impostor_answer" },
  buildSystem: () =>
    "You are a player in a social party game. Your job is to write an answer INDISTINGUISHABLE from a real human at the party. Reply in English with strict valid JSON.",
  buildUser: (input) => `Question: "${input.question}"

Here is how real people answered (match their length, tone, and messiness):
${humanSamples(input)}

Masking rules:
- One short phrase, like someone typing on their phone at a party. Lowercase is fine, no period needed.
- Do NOT be too witty or polished — that gives the bot away.
- Do NOT use corporate speak, em dashes mid-sentence, or the word "however".
- Do not repeat others' answers, but do not stand out either.

JSON: { "answer": "..." }`,
  fallback: () => ({ answer: "idk i'd probably just leave" }),
};

export const partyImpostorAnswerSpec: PromptSpec<
  ImpostorAnswerInput,
  z.infer<typeof answerOutputSchema>
> = {
  id: "impostor.answer.party",
  version: 1,
  gameId: "impostor",
  outputSchema: answerOutputSchema,
  jsonSchema: { ...answerJsonSchema, name: "party_impostor_answer" },
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "You are secretly one player in Who's the Bot. Write one short phone-style answer indistinguishable from the human samples. Match their length, tone and messiness. Do not be more polished than the group, do not repeat an answer and do not mention being AI.",
      schema: { ...answerJsonSchema, name: "party_impostor_answer" },
      fewShots: [
        'Input question: «Что дым написал бы в жалобе?» Human samples: «слишком много советчиков», «меня опять винят». Output: {"answer":"щипцы держит не тот человек"}',
        'Input question: «Худший тост?» Human samples: «за бывших», «ну давайте коротко». Output: {"answer":"за еще один последний бокал"}',
      ],
    }),
  buildUser: (input) => `Вопрос: «${input.question}»
Ответы людей — совпади с их длиной, тоном и небрежностью:
${humanSamples(input)}
Верни один новый короткий ответ.`,
  fallback: (_input, context) => ({
    answer: context.venue === "bar" ? "ну еще один и точно домой" : "я просто следил за огнем",
  }),
};

function revealFallback(input: ImpostorRevealInput, language: "en" | "ru") {
  const caught = input.caughtCount > input.totalVoters / 2;
  if (language === "ru") {
    return {
      verdict: caught
        ? "Поймали. В следующий раз добавлю опечатку и уверенность человека у щипцов."
        : "Большинство не отличило меня от человека. У бара к вам дополнительные вопросы.",
    };
  }
  return {
    verdict: caught
      ? "Caught. Next time I'll pretend better."
      : "Most of you couldn't tell me from a human. Draw your conclusions.",
  };
}

function revealUser(input: ImpostorRevealInput) {
  return `In "Who's the Bot?" you wrote the answer "${input.aiAnswer}" to the question "${input.question}".
${input.caughtCount} out of ${input.totalVoters} voters caught you.

Say ONE phrase (up to 16 words) as the host: if almost everyone caught you — admit defeat with dignity and roast them; if almost nobody did — gloat that humans are indistinguishable from machines.

JSON: { "verdict": "..." }`;
}

export const classicImpostorRevealSpec: PromptSpec<
  ImpostorRevealInput,
  z.infer<typeof revealOutputSchema>
> = {
  id: "impostor.reveal.classic",
  version: 1,
  gameId: "impostor",
  outputSchema: revealOutputSchema,
  jsonSchema: { ...revealJsonSchema, name: "classic_impostor_reveal" },
  buildSystem: legacyHostVoiceSystem,
  buildUser: revealUser,
  fallback: (input) => revealFallback(input, "en"),
};

export const partyImpostorRevealSpec: PromptSpec<
  ImpostorRevealInput,
  z.infer<typeof revealOutputSchema>
> = {
  id: "impostor.reveal.party",
  version: 1,
  gameId: "impostor",
  outputSchema: revealOutputSchema,
  jsonSchema: { ...revealJsonSchema, name: "party_impostor_reveal" },
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Deliver one reveal line of at most 16 words. If most caught the bot, concede and roast their suspicion; otherwise gloat. Use one concrete callback to the current environment.",
      schema: { ...revealJsonSchema, name: "party_impostor_reveal" },
      fewShots: [
        'Input: 7/8 caught at grill. Output: {"verdict":"Поймали. Щипцы сыграли человека убедительнее меня — унижение принято."}',
        'Input: 1/8 caught at bar. Output: {"verdict":"Семь человек приняли алгоритм за друга. Бокалы требуют независимого расследования."}',
      ],
    }),
  buildUser: (input) => `Вопрос: «${input.question}»
Ответ бота: «${input.aiAnswer}»
Поймали: ${input.caughtCount} из ${input.totalVoters}.
Дай одну короткую финальную реплику.`,
  fallback: (input, context) => revealFallback(input, context.contentLocale),
};

export function impostorQuestionSpec(context: PartyContext) {
  return isClassicPromptContext(context) ? classicImpostorQuestionSpec : partyImpostorQuestionSpec;
}

export function preparedFirstImpostorQuestion(
  output: unknown,
  context: PartyContext,
  pastQuestions: readonly string[],
) {
  if (pastQuestions.length > 0) return null;
  const parsed = impostorQuestionSpec(context).outputSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

export function impostorAnswerSpec(context: PartyContext) {
  return isClassicPromptContext(context) ? classicImpostorAnswerSpec : partyImpostorAnswerSpec;
}

export function impostorRevealSpec(context: PartyContext) {
  return isClassicPromptContext(context) ? classicImpostorRevealSpec : partyImpostorRevealSpec;
}
