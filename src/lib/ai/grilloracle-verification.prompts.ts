import {
  ORACLE_VERIFICATION_PROMPT_VERSION,
  oracleVerificationDecisionSchema,
  type OraclePredictionResults,
  type OracleVerificationDecision,
} from "@/games/grilloracle/model";
import type { PartyContext } from "../party-context";
import { oracleScoreForResults } from "../oracle-lifecycle";
import { buildPartyPromptSystem, type PromptJsonSchema, type PromptSpec } from "./prompt-contract";

export type OracleVerificationInput = {
  playerName: string;
  predictions: [string, string, string];
  results: OraclePredictionResults;
};

export const oracleVerificationJsonSchema: PromptJsonSchema = {
  name: "grill_oracle_verification",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      verdict: { type: "string", minLength: 1, maxLength: 900 },
      fulfilled_count: { type: "integer", minimum: 0, maximum: 3 },
      oracle_points: { type: "integer", minimum: 0, maximum: 15 },
      skeptic_points: { type: "integer", minimum: 0, maximum: 9 },
    },
    required: ["verdict", "fulfilled_count", "oracle_points", "skeptic_points"],
  },
};

const russianFewShots = [
  'Input: игрок Дима; ["произнесёт тост","принесёт кому-то воду","попросит зарядку"]; [true,false,true]. Output: {"verdict":"Два знака сбылись без стыда, третий исказила барная стойка — древний враг точной пиромантии.","fulfilled_count":2,"oracle_points":10,"skeptic_points":3}',
  'Input: игрок Лена; ["скажет короче","пойдёт за чужим напитком","перепутает имя"]; [false,false,false]. Output: {"verdict":"Барная аура устроила саботаж по всем трём пунктам. Скептики могут ликовать, но недолго: мадам Гриль уже переписывает методичку.","fulfilled_count":0,"oracle_points":0,"skeptic_points":9}',
];

const englishFewShots = [
  'Input: Dima; ["makes a toast","brings someone water","asks for a charger"]; [true,false,true]. Output: {"verdict":"Two signs landed cleanly; the third was distorted by the bar counter, an ancient enemy of precise pyromancy.","fulfilled_count":2,"oracle_points":10,"skeptic_points":3}',
  'Input: Lena; ["says basically","fetches another drink","answers to a wrong name"]; [false,false,false]. Output: {"verdict":"The bar aura sabotaged all three counts. Skeptics may celebrate briefly while Madame Grill revises absolutely nothing.","fulfilled_count":0,"oracle_points":0,"skeptic_points":9}',
];

function localOracleVerdict(
  input: OracleVerificationInput,
  context: PartyContext,
): OracleVerificationDecision {
  const score = oracleScoreForResults(input.results);
  return {
    verdict:
      context.contentLocale === "ru"
        ? `${score.fulfilledCount} из 3 знаков сбылись. Остальное мадам Гриль официально списывает на искажение ауры барной стойкой.`
        : `${score.fulfilledCount} of 3 signs came true. Madame Grill officially blames the rest on distortion from the bar counter.`,
    fulfilled_count: score.fulfilledCount,
    oracle_points: score.oraclePoints,
    skeptic_points: score.skepticPoints,
  };
}

export const grillOracleVerificationSpec: PromptSpec<
  OracleVerificationInput,
  OracleVerificationDecision
> = {
  id: "grilloracle.verification",
  version: ORACLE_VERIFICATION_PROMPT_VERSION,
  gameId: "grilloracle",
  outputSchema: oracleVerificationDecisionSchema,
  jsonSchema: oracleVerificationJsonSchema,
  buildSystem: (context) =>
    buildPartyPromptSystem(context, {
      gameInstructions:
        "You are the same shamelessly confident Madame Grill at the bar reckoning. Praise fulfilled predictions as proof of your mastery and explain failed ones as distortion caused by the bar counter aura. Write one sharp, performable verdict. Never invent events or change the supplied booleans.",
      scoringRubric:
        "Mechanical scoring is fixed: 5 oracle points per fulfilled prediction and 3 skeptic points per unfulfilled prediction. Mention the current bar environment in the verdict when it materially fits, but add no environment bonus; the server recomputes every numeric field.",
      schema: oracleVerificationJsonSchema,
      fewShots: context.contentLocale === "ru" ? russianFewShots : englishFewShots,
    }),
  buildUser: (input) =>
    `Player: ${input.playerName}\nPredictions: ${JSON.stringify(input.predictions)}\nRoom results: ${JSON.stringify(input.results)}`,
  fallback: localOracleVerdict,
};
