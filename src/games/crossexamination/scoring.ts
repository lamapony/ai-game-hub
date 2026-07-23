import type {
  CrossExaminationFinding,
  CrossExaminationQuestion,
  CrossQuestionCategory,
} from "@/lib/types";
import type { CrossManualFinding } from "./model";

export const CROSS_AUDIENCE_PREDICTION_POINTS = 2;

export const CROSS_MANUAL_SEVERITY: Record<CrossManualFinding, 0 | 1 | 2 | 3> = {
  consistent: 0,
  minor: 1,
  "memory-gap": 2,
  conflict: 3,
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MEMORY_GAP = [
  "не помню",
  "не знаю",
  "без понятия",
  "забыл",
  "забыла",
  "dont remember",
  "don't remember",
  "do not remember",
  "no idea",
  "forgot",
];

function tokens(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3),
  );
}

/** AI only supplies short versions; this fixed comparator owns public severity. */
export function fixedCrossSeverity(versionA: string, versionB: string): 0 | 1 | 2 | 3 {
  const a = normalize(versionA);
  const b = normalize(versionB);
  if (a === b) return 0;
  if (MEMORY_GAP.some((phrase) => a.includes(phrase) || b.includes(phrase))) return 2;
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  const union = new Set([...aTokens, ...bTokens]);
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const overlap = union.size > 0 ? shared / union.size : 0;
  return overlap >= 0.45 ? 1 : 3;
}

export function crossAlibiStrength(findings: Array<Pick<CrossExaminationFinding, "severity">>) {
  return Math.max(0, Math.min(10, 10 - findings.reduce((sum, item) => sum + item.severity, 0)));
}

const ENVIRONMENT_TOKENS = [
  "fire",
  "smoke",
  "foil",
  "tongs",
  "grill",
  "wind",
  "rain",
  "sausage",
  "zucchini",
  "glass",
  "napkin",
  "menu",
  "огонь",
  "дым",
  "фольга",
  "щипцы",
  "гриль",
  "ветер",
  "дождь",
  "сосиска",
  "кабачок",
  "бокал",
  "салфетка",
  "меню",
] as const;

/** +5 requires the same unprompted real scene callback in both independent statements. */
export function crossEnvironmentBonus(
  transcriptA: string,
  transcriptB: string,
  questions: CrossExaminationQuestion[],
): 0 | 5 {
  const a = normalize(transcriptA);
  const b = normalize(transcriptB);
  const prompts = normalize(questions.map((question) => question.text).join(" "));
  const sharedUnprompted = ENVIRONMENT_TOKENS.some(
    (token) => a.includes(token) && b.includes(token) && !prompts.includes(token),
  );
  return sharedUnprompted ? 5 : 0;
}

export function crossPairPoints(alibiStrength: number, environmentBonus: 0 | 5) {
  return Math.max(0, Math.min(15, Math.trunc(alibiStrength) + environmentBonus));
}

export function splitCrossPairPoints(points: number): [number, number] {
  const bounded = Math.max(0, Math.trunc(points));
  return [Math.ceil(bounded / 2), Math.floor(bounded / 2)];
}

export function correctCrossPredictionCategories(
  findings: Array<Pick<CrossExaminationFinding, "category" | "severity">>,
): CrossQuestionCategory[] {
  const max = Math.max(0, ...findings.map((finding) => finding.severity));
  if (max === 0) return [];
  return [
    ...new Set(
      findings.filter((finding) => finding.severity === max).map((finding) => finding.category),
    ),
  ];
}
