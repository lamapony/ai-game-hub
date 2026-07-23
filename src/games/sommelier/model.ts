import { z } from "zod";

export const SOMMELIER_SUBMISSION_KIND = "sommelier-submission";
export const SOMMELIER_ANALYSIS_KIND = "sommelier-analysis";
export const SOMMELIER_GUESS_KIND = "sommelier-guess";
export const SOMMELIER_RESULT_KIND = "sommelier-result";
export const SOMMELIER_CROWD_FAVORITE_KIND = "sommelier-crowd-favorite";
export const SOMMELIER_VISION_PROMPT_VERSION = 1;

const safeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, "contains unsupported characters");

export const sommelierProfileSchema = z
  .object({
    drink_guess: z.string().trim().min(1).max(320),
    tasting_notes: z.string().trim().min(1).max(700),
    owner_profile: z.string().trim().min(40).max(1_500),
    pretentiousness: z.number().int().min(1).max(10),
    pairing_advice: z.string().trim().min(1).max(700),
  })
  .strict();

export type SommelierProfile = z.infer<typeof sommelierProfileSchema>;

export const sommelierSubmissionRecordSchema = z
  .object({
    version: z.literal(1),
    entryId: safeIdSchema,
    ownerPlayerId: safeIdSchema,
    storagePath: z.string().trim().min(1).max(512),
    submittedAt: z.number().int().nonnegative(),
  })
  .strict();

export const sommelierAnalysisRecordSchema = z
  .object({
    version: z.literal(1),
    entryId: safeIdSchema,
    ownerPlayerId: safeIdSchema,
    profile: sommelierProfileSchema,
    aiFallback: z.boolean(),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export const sommelierGuessRecordSchema = z
  .object({
    version: z.literal(1),
    entryId: safeIdSchema,
    guessedOwnerPlayerId: safeIdSchema,
    submittedAt: z.number().int().nonnegative(),
  })
  .strict();

export const sommelierRoundResultSchema = z
  .object({
    entryId: safeIdSchema,
    ownerPlayerId: safeIdSchema,
    ownerPlayerName: z.string().trim().min(1).max(120),
    ownerTeamId: safeIdSchema,
    profile: sommelierProfileSchema,
    correctGuesserIds: z.array(safeIdSchema).max(30),
    ballotCount: z.number().int().nonnegative().max(30),
    ownerPoints: z.number().int().min(0).max(5),
    guesserPoints: z.record(safeIdSchema, z.number().int().min(1).max(3)),
    aiFallback: z.boolean(),
  })
  .strict();

export type SommelierRoundResult = z.infer<typeof sommelierRoundResultSchema>;

export const sommelierResultRecordSchema = z
  .object({
    version: z.literal(1),
    result: sommelierRoundResultSchema,
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export const sommelierCrowdFavoriteRecordSchema = z
  .object({
    version: z.literal(1),
    entryId: safeIdSchema,
    ownerPlayerId: safeIdSchema,
    bonusPoints: z.literal(3),
    selectedAt: z.number().int().nonnegative(),
  })
  .strict();
