import { z } from "zod";

export const STILL_LIFE_HEADLINE_KIND = "stilllife-headline";
export const STILL_LIFE_SUBMISSION_KIND = "stilllife-submission";
export const STILL_LIFE_JUDGMENT_KIND = "stilllife-judgment";
export const STILL_LIFE_VOTE_KIND = "stilllife-vote";
export const STILL_LIFE_RESULT_KIND = "stilllife-result";
export const STILL_LIFE_HEADLINE_PROMPT_VERSION = 1;
export const STILL_LIFE_JUDGMENT_PROMPT_VERSION = 1;

const safeIdSchema = z.string().trim().min(2).max(128);

export const stillLifeHeadlineSchema = z.string().trim().min(8).max(220);

export const stillLifeJudgmentSchema = z
  .object({
    composition_score: z.number().int().min(0).max(10),
    drama_score: z.number().int().min(0).max(10),
    material_score: z.number().int().min(0).max(5),
    catalog_title: z.string().trim().min(1).max(240),
    auction_price_dkk: z.number().int().min(100).max(99_999_999),
    critique: z.string().trim().min(1).max(1_200),
    points: z.number().int().min(0).max(25),
  })
  .strict();

export type StillLifeJudgment = z.infer<typeof stillLifeJudgmentSchema>;

export const stillLifeHeadlineRecordSchema = z
  .object({
    version: z.literal(1),
    headline: stillLifeHeadlineSchema,
    generatedAt: z.number().int().nonnegative(),
    aiFallback: z.boolean(),
  })
  .strict();

export const stillLifeSubmissionRecordSchema = z
  .object({
    version: z.literal(1),
    teamId: safeIdSchema,
    submittedByPlayerId: safeIdSchema,
    storagePath: z.string().trim().min(1).max(512),
    submittedAt: z.number().int().nonnegative(),
  })
  .strict();

export const stillLifeJudgmentRecordSchema = z
  .object({
    version: z.literal(1),
    teamId: safeIdSchema,
    judgment: stillLifeJudgmentSchema,
    aiFallback: z.boolean(),
    manualOverride: z.boolean(),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export const stillLifeVoteRecordSchema = z
  .object({
    version: z.literal(1),
    teamId: safeIdSchema,
    voterTeamId: safeIdSchema,
    submittedAt: z.number().int().nonnegative(),
  })
  .strict();

export const stillLifeResultEntrySchema = z
  .object({
    teamId: safeIdSchema,
    teamName: z.string().trim().min(1).max(120),
    compositionScore: z.number().int().min(0).max(10),
    dramaScore: z.number().int().min(0).max(10),
    materialScore: z.number().int().min(0).max(5),
    points: z.number().int().min(0).max(25),
    catalogTitle: z.string().trim().min(1).max(240),
    auctionPriceDkk: z.number().int().min(100).max(99_999_999),
    critique: z.string().trim().min(1).max(1_200),
    audienceVotes: z.number().int().nonnegative().max(30),
    aiFallback: z.boolean(),
    manualOverride: z.boolean(),
  })
  .strict();

export const stillLifeRoundResultSchema = z
  .object({
    roundId: safeIdSchema,
    headline: stillLifeHeadlineSchema,
    entries: z.array(stillLifeResultEntrySchema).min(2).max(4),
    winningTeamIds: z.array(safeIdSchema).min(1).max(4),
  })
  .strict();

export const stillLifeResultRecordSchema = z
  .object({
    version: z.literal(1),
    result: stillLifeRoundResultSchema,
    completedAt: z.number().int().nonnegative(),
  })
  .strict();
