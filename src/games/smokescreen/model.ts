import { z } from "zod";

export const SMOKE_SCREEN_MISSION_KIND = "smokescreen-mission";
export const SMOKE_SCREEN_REVEAL_KIND = "smokescreen-reveal";
export const SMOKE_SCREEN_GUESS_KIND = "smokescreen-guess";
export const SMOKE_SCREEN_RESULT_KIND = "smokescreen-result";
export const SMOKE_SCREEN_PROMPT_VERSION = 1;
export const SMOKE_SCREEN_RECAP_PROMPT_VERSION = 1;

const safeIdSchema = z.string().trim().min(2).max(128);

export const smokeScreenMissionSchema = z
  .object({
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: z.string().trim().min(1).max(500),
    detection_hint: z.string().trim().min(1).max(300),
  })
  .strict();

export const smokeScreenDeckSchema = z
  .object({
    missions: z.array(smokeScreenMissionSchema).min(1).max(30),
  })
  .strict();

export type SmokeScreenMission = z.infer<typeof smokeScreenMissionSchema>;
export type SmokeScreenDeck = z.infer<typeof smokeScreenDeckSchema>;

export const smokeScreenMissionRecordSchema = z
  .object({
    version: z.literal(1),
    mission: smokeScreenMissionSchema,
    assignedAt: z.number().int().nonnegative(),
  })
  .strict();

export type SmokeScreenMissionRecord = z.infer<typeof smokeScreenMissionRecordSchema>;

/** Public anonymous copy. missionId is opaque; the owner link stays on the sealed source row. */
export const smokeScreenRevealRecordSchema = z
  .object({
    version: z.literal(1),
    missionId: safeIdSchema,
    mission: smokeScreenMissionSchema,
    revealedAt: z.number().int().nonnegative(),
  })
  .strict();

export type SmokeScreenRevealRecord = z.infer<typeof smokeScreenRevealRecordSchema>;

export const smokeScreenGuessSchema = z
  .object({
    missionId: safeIdSchema,
    ownerPlayerId: safeIdSchema,
  })
  .strict();

export const smokeScreenGuessRecordSchema = z
  .object({
    version: z.literal(1),
    guesses: z.array(smokeScreenGuessSchema).min(1).max(30),
    submittedAt: z.number().int().nonnegative(),
  })
  .strict();

export type SmokeScreenGuess = z.infer<typeof smokeScreenGuessSchema>;
export type SmokeScreenGuessRecord = z.infer<typeof smokeScreenGuessRecordSchema>;

export const smokeScreenResultEntrySchema = z
  .object({
    missionId: safeIdSchema,
    ownerPlayerId: safeIdSchema,
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    completed: z.boolean(),
    caught: z.boolean(),
    correctDetectiveIds: z.array(safeIdSchema).max(30),
    ownerPoints: z.number().int().min(0).max(15),
  })
  .strict();

export const smokeScreenRecapSchema = z
  .object({ recap: z.string().trim().min(1).max(1600) })
  .strict();

export const smokeScreenResultRecordSchema = z
  .object({
    version: z.literal(1),
    completedMissionIds: z.array(safeIdSchema).max(30),
    results: z.array(smokeScreenResultEntrySchema).min(1).max(30),
    recap: z.string().trim().min(1).max(1600),
    aiFallback: z.boolean(),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export type SmokeScreenResultRecord = z.infer<typeof smokeScreenResultRecordSchema>;
