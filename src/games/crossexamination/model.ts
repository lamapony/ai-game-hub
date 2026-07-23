import { z } from "zod";

export const CROSS_EVIDENCE_SELECTION_KIND = "cross-evidence-selection";
export const CROSS_QUESTIONS_KIND = "cross-questions";
export const CROSS_TESTIMONY_KIND = "cross-testimony";
export const CROSS_PREDICTION_KIND = "cross-prediction";
export const CROSS_VERDICT_KIND = "cross-verdict";
export const CROSS_QUESTIONS_PROMPT_VERSION = 1;
export const CROSS_COMPARISON_PROMPT_VERSION = 1;

export const CROSS_QUESTION_CATEGORIES = ["order", "object", "person", "detail"] as const;
export const CROSS_MANUAL_FINDINGS = ["consistent", "minor", "memory-gap", "conflict"] as const;

const safeId = z.string().trim().min(2).max(128);
const shortText = z.string().trim().min(1).max(300);

export const crossQuestionsOutputSchema = z
  .object({ questions: z.tuple([shortText, shortText, shortText, shortText]) })
  .strict();

export const crossComparisonOutputSchema = z
  .object({
    contradictions: z
      .array(
        z
          .object({
            question: shortText,
            versionA: shortText,
            versionB: shortText,
            severity: z.number().int().min(1).max(3),
          })
          .strict(),
      )
      .max(4),
    alibi_strength: z.number().int().min(0).max(10),
    verdict: z.string().trim().min(1).max(1_200),
    pair_points: z.number().int().min(0).max(10),
  })
  .strict();

export const crossEvidenceSelectionRecordSchema = z
  .object({
    version: z.literal(1),
    selectedRecordIds: z.array(safeId).max(50),
    excludedRecordIds: z.array(safeId).max(50),
    manualFacts: z.array(z.string().trim().min(5).max(300)).max(8),
    selectedAt: z.number().int().nonnegative(),
  })
  .strict();

export const crossPublicQuestionSchema = z
  .object({
    questionId: safeId,
    category: z.enum(CROSS_QUESTION_CATEGORIES),
    text: z.string().trim().min(3).max(500),
  })
  .strict();

export const crossQuestionsRecordSchema = z
  .object({
    version: z.literal(1),
    pairId: safeId,
    questions: z.array(crossPublicQuestionSchema).length(4),
    evidenceRecordIds: z.array(safeId).max(50),
    manualFactCount: z.number().int().min(0).max(8),
    aiFallback: z.boolean(),
    generatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const crossTestimonyRecordSchema = z
  .object({
    version: z.literal(1),
    pairId: safeId,
    playerId: safeId,
    playerName: z.string().trim().min(1).max(80),
    storagePath: z.string().trim().min(1).max(512),
    durationSeconds: z.number().min(1).max(75),
    transcript: z.string().trim().max(14_000),
    sttFallback: z.boolean(),
    recordedAt: z.number().int().nonnegative(),
  })
  .strict();

export const crossPredictionRecordSchema = z
  .object({
    version: z.literal(1),
    pairId: safeId,
    voterPlayerId: safeId,
    category: z.enum(CROSS_QUESTION_CATEGORIES),
    submittedAt: z.number().int().nonnegative(),
  })
  .strict();

export const crossFindingRecordSchema = z
  .object({
    questionId: safeId,
    category: z.enum(CROSS_QUESTION_CATEGORIES),
    question: z.string().trim().min(3).max(500),
    versionA: z.string().trim().min(1).max(300),
    versionB: z.string().trim().min(1).max(300),
    severity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

export const crossVerdictRecordSchema = z
  .object({
    version: z.literal(1),
    pairId: safeId,
    playerAId: safeId,
    playerAName: z.string().trim().min(1).max(80),
    playerBId: safeId,
    playerBName: z.string().trim().min(1).max(80),
    findings: z.array(crossFindingRecordSchema).length(4),
    alibiStrength: z.number().int().min(0).max(10),
    environmentBonus: z.union([z.literal(0), z.literal(5)]),
    pairPoints: z.number().int().min(0).max(15),
    verdict: z.string().trim().min(1).max(1_200),
    predictionCounts: z.record(z.enum(CROSS_QUESTION_CATEGORIES), z.number().int().nonnegative()),
    correctPredictionCategories: z.array(z.enum(CROSS_QUESTION_CATEGORIES)).max(4),
    correctVoterIds: z.array(safeId).max(30),
    source: z.enum(["ai", "manual", "skipped"]),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export type CrossQuestionsOutput = z.infer<typeof crossQuestionsOutputSchema>;
export type CrossComparisonOutput = z.infer<typeof crossComparisonOutputSchema>;
export type CrossEvidenceSelectionRecord = z.infer<typeof crossEvidenceSelectionRecordSchema>;
export type CrossQuestionsRecord = z.infer<typeof crossQuestionsRecordSchema>;
export type CrossTestimonyRecord = z.infer<typeof crossTestimonyRecordSchema>;
export type CrossPredictionRecord = z.infer<typeof crossPredictionRecordSchema>;
export type CrossVerdictRecord = z.infer<typeof crossVerdictRecordSchema>;
export type CrossManualFinding = (typeof CROSS_MANUAL_FINDINGS)[number];

export type CrossEvidenceCandidate = {
  recordId: string;
  kind: string;
  actId: string;
  title: string;
  excerpt: string;
  ownerPlayerId?: string;
};
