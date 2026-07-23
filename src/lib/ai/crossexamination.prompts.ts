import type { CrossExaminationQuestion } from "@/lib/types";
import {
  CROSS_COMPARISON_PROMPT_VERSION,
  CROSS_QUESTIONS_PROMPT_VERSION,
  crossComparisonOutputSchema,
  crossQuestionsOutputSchema,
  type CrossComparisonOutput,
  type CrossQuestionsOutput,
} from "@/games/crossexamination/model";
import { buildPartyPromptSystem, type PromptJsonSchema, type PromptSpec } from "./prompt-contract";

export type CrossQuestionsInput = {
  pairAName: string;
  pairBName: string;
  evidence: Array<{ tag: string; fact: string }>;
  previousQuestions: string[];
};

export type CrossComparisonInput = {
  pairAName: string;
  pairBName: string;
  questions: CrossExaminationQuestion[];
  transcriptA: string;
  transcriptB: string;
};

export const crossQuestionsJsonSchema: PromptJsonSchema = {
  name: "cross_examination_questions",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: { type: "string", minLength: 1, maxLength: 300 },
      },
    },
    required: ["questions"],
  },
};

export const crossComparisonJsonSchema: PromptJsonSchema = {
  name: "cross_examination_comparison",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      contradictions: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            question: { type: "string", minLength: 1, maxLength: 300 },
            versionA: { type: "string", minLength: 1, maxLength: 300 },
            versionB: { type: "string", minLength: 1, maxLength: 300 },
            severity: { type: "integer", minimum: 1, maximum: 3 },
          },
          required: ["question", "versionA", "versionB", "severity"],
        },
      },
      alibi_strength: { type: "integer", minimum: 0, maximum: 10 },
      verdict: { type: "string", minLength: 1, maxLength: 1200 },
      pair_points: { type: "integer", minimum: 0, maximum: 10 },
    },
    required: ["contradictions", "alibi_strength", "verdict", "pair_points"],
  },
};

function fallbackQuestions(input: CrossQuestionsInput, locale: "en" | "ru"): CrossQuestionsOutput {
  const anchors =
    input.evidence.length > 0 ? input.evidence : [{ tag: "scene", fact: "the shared party scene" }];
  const label = (index: number) => anchors[index % anchors.length]!.tag.replace(/[_-]+/g, " ");
  return {
    questions:
      locale === "ru"
        ? [
            `Что произошло непосредственно перед эпизодом «${label(0)}»?`,
            `Какой реальный предмет был главным в эпизоде «${label(1)}»?`,
            `Кто первым отреагировал на эпизод «${label(2)}» и что сделал?`,
            `Какая мелкая деталь эпизода «${label(3)}» лучше всего доказывает, что вы оба там были?`,
          ]
        : [
            `What happened immediately before the “${label(0)}” episode?`,
            `Which real object mattered most in the “${label(1)}” episode?`,
            `Who reacted first to the “${label(2)}” episode, and what did they do?`,
            `Which small detail from the “${label(3)}” episode best proves you were both there?`,
          ],
  };
}

export const crossQuestionsSpec: PromptSpec<CrossQuestionsInput, CrossQuestionsOutput> = {
  id: "crossexamination.questions",
  version: CROSS_QUESTIONS_PROMPT_VERSION,
  gameId: "crossexamination",
  outputSchema: crossQuestionsOutputSchema,
  jsonSchema: crossQuestionsJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "You are an AI investigator preparing four questions for two accomplices who must answer separately. Use only facts inside the host-approved EVIDENCE packet. Ask about small observable specifics in this exact order: event order, a real object, who acted, then one precise detail. Never quote a private confession, expose a secret assignment, invent an event, ask for exact clock time, or ask about health, trauma, sex, finances, illegal behavior or protected traits. The questions must remain answerable by people who shared the scene.",
      scoringRubric:
        "Question quality has no points. Later, the server may add exactly +5 only when both independent answers share the same real scene object or event that was not planted in the question. Merely repeating a prompt never qualifies.",
      schema: crossQuestionsJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Evidence: дым сорвал фольгу; щипцы передали после кабачка. Output: {"questions":["Что случилось непосредственно перед тем, как ветер унёс фольгу?","Какой предмет пытались спасти первым?","Кто первым заметил улетающую фольгу?","Что в этот момент лежало на решётке?"]}',
              'Evidence: барный приход, мокрые куртки, первый общий тост. Output: {"questions":["Что произошло первым после входа?","Куда положили мокрые куртки?","Кто первым предложил общий тост?","Какая мелкая деталь выдала погоду снаружи?"]}',
            ]
          : [
              'Evidence: wind took the foil; tongs moved after the zucchini. Output: {"questions":["What happened immediately before the foil escaped?","Which object did people try to save first?","Who first noticed the flying foil?","What was on the grate at that moment?"]}',
              'Evidence: bar arrival, wet coats, first group toast. Output: {"questions":["What happened first after entering?","Where did the wet coats go?","Who proposed the first group toast?","Which small detail gave away the weather outside?"]}',
            ],
    }),
  buildUser: (input) =>
    `Accomplices ${JSON.stringify(input.pairAName)} and ${JSON.stringify(input.pairBName)}. HOST-APPROVED EVIDENCE: ${JSON.stringify(input.evidence)}. Avoid repeats: ${JSON.stringify(input.previousQuestions)}.`,
  fallback: (input, context) => fallbackQuestions(input, context.contentLocale),
};

export const crossComparisonSpec: PromptSpec<CrossComparisonInput, CrossComparisonOutput> = {
  id: "crossexamination.comparison",
  version: CROSS_COMPARISON_PROMPT_VERSION,
  gameId: "crossexamination",
  outputSchema: crossComparisonOutputSchema,
  jsonSchema: crossComparisonJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "Compare two supplied transcripts against the four supplied questions. Report only real discrepancies: direct conflicts, suspicious memory gaps, or materially different detail. For each discrepancy, quote a short neutral version from each witness; never publish a full transcript. Omit genuinely consistent answers from contradictions. Write a 3–4 sentence noir verdict that is sharp but affectionate. Do not infer deception, intoxication, diagnosis or personality, and do not invent facts. The numeric severity, alibi_strength and pair_points fields are proposals required by the source schema; the server ignores and deterministically recomputes them.",
      scoringRubric:
        "Server rules: consistent 0, minor mismatch 1, explicit memory gap 2, direct conflict 3; alibi strength is 10 minus the severity sum, floor 0. A shared unprompted real environment callback adds exactly +5. AI numbers never award points.",
      schema: crossComparisonJsonSchema,
      fewShots:
        context.contentLocale === "ru"
          ? [
              'Input: A говорит «кабачок», B — «сосиски»; A не помнит щипцы, B говорит «я». Output: {"contradictions":[{"question":"Что сгорело первым?","versionA":"Кабачок Ани","versionB":"Сосиски","severity":3},{"question":"Кто трогал щипцы третьим?","versionA":"Не помню","versionB":"Я","severity":2}],"alibi_strength":3,"verdict":"Показания разошлись уже на гарнире. Щипцы тоже нашли хозяина только в одной версии. Алиби держится хуже фольги на ветру.","pair_points":3}',
              'Input: все четыре ответа совпадают по сути. Output: {"contradictions":[],"alibi_strength":10,"verdict":"Редкий случай: двое вошли в комнату и принесли одну версию событий. Следствие недовольно, алиби — нет. Подозрительно крепкая память.","pair_points":10}',
            ]
          : [
              'Input: A says zucchini, B says sausages; A forgets the tongs, B says “me.” Output: {"contradictions":[{"question":"What burned first?","versionA":"Anna’s zucchini","versionB":"The sausages","severity":3},{"question":"Who touched the tongs third?","versionA":"I do not remember","versionB":"Me","severity":2}],"alibi_strength":3,"verdict":"The statements split at the side dish. The tongs found an owner in only one account. This alibi holds worse than foil in wind.","pair_points":3}',
              'Input: all four answers agree in substance. Output: {"contradictions":[],"alibi_strength":10,"verdict":"A rare case: two people entered and brought one version of events. The investigation is annoyed; the alibi is not. Suspiciously sturdy memory.","pair_points":10}',
            ],
    }),
  buildUser: (input) =>
    `Questions: ${JSON.stringify(input.questions)}. Testimony ${JSON.stringify(input.pairAName)}: ${JSON.stringify(input.transcriptA)}. Testimony ${JSON.stringify(input.pairBName)}: ${JSON.stringify(input.transcriptB)}.`,
  fallback: (_input, context) => ({
    contradictions: [],
    alibi_strength: 10,
    verdict:
      context.contentLocale === "ru"
        ? "Следователь потерял связь и отказывается выдумывать противоречия. Ведущий сверит показания вручную. Техника сегодня имеет право хранить молчание."
        : "The investigator lost the line and refuses to invent contradictions. The host will compare the statements manually. Technology may remain silent tonight.",
    pair_points: 10,
  }),
};
