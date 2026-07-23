import { z } from "zod";

export const TONGS_TESTIMONY_KIND = "tongs-testimony";
export const TONGS_VERDICT_KIND = "tongs-verdict";
export const TONGS_QUESTION_PROMPT_VERSION = 1;
export const TONGS_JUDGMENT_PROMPT_VERSION = 1;

const safeId = z.string().trim().min(2).max(128);

export const tongsJudgmentSchema = z
  .object({
    honesty_score: z.number().int().min(0).max(10),
    dodge_detected: z.boolean(),
    artistry_score: z.number().int().min(0).max(5),
    environment_used: z.boolean(),
    comment: z.string().trim().min(1).max(800),
    points: z.number().int().min(0).max(20),
  })
  .strict();

export const tongsTestimonyRecordSchema = z
  .object({
    version: z.literal(1),
    roundId: safeId,
    speakerPlayerId: safeId,
    speakerName: z.string().trim().min(1).max(80),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    question: z.string().trim().min(3).max(500),
    storagePath: z.string().trim().min(1).max(512),
    durationSeconds: z.number().min(1).max(25),
    transcript: z.string().trim().max(8_000),
    judgment: tongsJudgmentSchema.optional(),
    sttFallback: z.boolean(),
    aiFallback: z.boolean(),
    recordedAt: z.number().int().nonnegative(),
  })
  .strict();

export const tongsVerdictRecordSchema = z
  .object({
    version: z.literal(1),
    roundId: safeId,
    speakerPlayerId: safeId,
    source: z.enum(["ai", "manual", "skipped"]),
    honestyScore: z.number().int().min(0).max(10),
    dodgeDetected: z.boolean(),
    artistryScore: z.number().int().min(0).max(5),
    environmentUsed: z.boolean(),
    points: z.number().int().min(0).max(20),
    comment: z.string().trim().min(1).max(800),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export type TongsJudgment = z.infer<typeof tongsJudgmentSchema>;
export type TongsTestimonyRecord = z.infer<typeof tongsTestimonyRecordSchema>;
export type TongsVerdictRecord = z.infer<typeof tongsVerdictRecordSchema>;
