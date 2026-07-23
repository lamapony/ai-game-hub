import { z } from "zod";

export const CONTRABAND_ASSIGNMENT_KIND = "contraband-assignment";
export const CONTRABAND_ACCUSATION_KIND = "contraband-accusation";
export const CONTRABAND_ARBITRATION_KIND = "contraband-arbitration";
export const CONTRABAND_RESOLUTION_KIND = "contraband-resolution";
export const CONTRABAND_RESULT_KIND = "contraband-result";
export const CONTRABAND_GENERATION_PROMPT_VERSION = 1;
export const CONTRABAND_ARBITRATION_PROMPT_VERSION = 1;

const safeId = z.string().trim().min(2).max(128);

export const contrabandAssignmentRecordSchema = z
  .object({
    version: z.literal(1),
    phraseId: safeId,
    phrase: z.string().trim().min(3).max(180),
    ownerPlayerId: safeId,
    assignedAt: z.number().int().nonnegative(),
    aiFallback: z.boolean(),
  })
  .strict();

export const contrabandAccusationRecordSchema = z
  .object({
    version: z.literal(1),
    accusationId: safeId,
    accuserPlayerId: safeId,
    accusedPlayerId: safeId,
    suspectedQuote: z.string().trim().min(2).max(240),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();

export const contrabandAiVerdictSchema = z
  .object({
    organic_score: z.number().int().min(1).max(10),
    verdict: z.string().trim().min(1).max(500),
    smuggler_points: z.number().int().min(0).max(10),
    catcher_points: z.number().int().min(0).max(5),
  })
  .strict();

export const contrabandArbitrationRecordSchema = z
  .object({
    version: z.literal(1),
    accusationId: safeId,
    storagePath: z.string().trim().min(1).max(512),
    durationSeconds: z.number().min(1).max(30),
    transcript: z.string().trim().max(8_000),
    aiVerdict: contrabandAiVerdictSchema.optional(),
    sttFallback: z.boolean(),
    aiFallback: z.boolean(),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export const contrabandOutcomeSchema = z.enum(["caught", "clean", "false-accusation"]);

export const contrabandResolutionRecordSchema = z
  .object({
    version: z.literal(1),
    accusationId: safeId,
    accuserPlayerId: safeId,
    accusedPlayerId: safeId,
    outcome: contrabandOutcomeSchema,
    source: z.enum(["ai", "manual", "confession"]),
    organicScore: z.number().int().min(1).max(10).optional(),
    verdict: z.string().trim().min(1).max(500),
    smugglerPoints: z.number().int().min(0).max(10),
    catcherPoints: z.number().int().min(0).max(5),
    falseAccusationPenalty: z.number().int().min(-2).max(0),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export const contrabandResultRecordSchema = z
  .object({
    version: z.literal(1),
    completedAt: z.number().int().nonnegative(),
    entries: z
      .array(
        z
          .object({
            playerId: safeId,
            playerName: z.string().trim().min(1).max(80),
            phrase: z.string().trim().min(3).max(180),
            outcome: z.enum(["caught", "clean", "survived"]),
            points: z.number().int().min(0).max(10),
          })
          .strict(),
      )
      .max(30),
    accusations: z
      .array(
        z
          .object({
            accusationId: safeId,
            accuserPlayerId: safeId,
            accusedPlayerId: safeId,
            outcome: contrabandOutcomeSchema,
            verdict: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(90),
  })
  .strict();

export type ContrabandAssignmentRecord = z.infer<typeof contrabandAssignmentRecordSchema>;
export type ContrabandAccusationRecord = z.infer<typeof contrabandAccusationRecordSchema>;
export type ContrabandAiVerdict = z.infer<typeof contrabandAiVerdictSchema>;
export type ContrabandArbitrationRecord = z.infer<typeof contrabandArbitrationRecordSchema>;
export type ContrabandResolutionRecord = z.infer<typeof contrabandResolutionRecordSchema>;
export type ContrabandResultRecord = z.infer<typeof contrabandResultRecordSchema>;
