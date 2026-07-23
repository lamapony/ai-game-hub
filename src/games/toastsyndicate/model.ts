import { z } from "zod";

export const TOAST_ASSIGNMENT_KIND = "toastsyndicate-assignment";
export const TOAST_RECORDING_KIND = "toastsyndicate-recording";
export const TOAST_CATCH_KIND = "toastsyndicate-catch";
export const TOAST_RESULT_KIND = "toastsyndicate-result";
export const TOAST_GENERATION_PROMPT_VERSION = 1;
export const TOAST_JUDGMENT_PROMPT_VERSION = 1;

const safeIdSchema = z.string().trim().min(2).max(128);

export const toastWordSchema = z
  .object({ id: safeIdSchema, text: z.string().trim().min(1).max(80) })
  .strict();

export const toastAssignmentSchema = z
  .object({
    genreId: safeIdSchema,
    genre: z.string().trim().min(1).max(120),
    instructions: z.string().trim().min(1).max(500),
    words: z.array(toastWordSchema).length(3),
  })
  .strict()
  .refine((value) => new Set(value.words.map((word) => word.id)).size === 3, {
    message: "contraband word ids must be distinct",
    path: ["words"],
  });

export type ToastAssignment = z.infer<typeof toastAssignmentSchema>;

export const toastAssignmentRecordSchema = z
  .object({
    version: z.literal(1),
    assignment: toastAssignmentSchema,
    speakerPlayerId: safeIdSchema,
    assignedAt: z.number().int().nonnegative(),
    aiFallback: z.boolean(),
  })
  .strict();

export type ToastAssignmentRecord = z.infer<typeof toastAssignmentRecordSchema>;

export const toastRecordingRecordSchema = z
  .object({
    version: z.literal(1),
    speakerPlayerId: safeIdSchema,
    storagePath: z.string().trim().min(1).max(512),
    durationSeconds: z.number().min(1).max(90),
    transcript: z.string().trim().max(12_000),
    transcribedAt: z.number().int().nonnegative(),
    sttFallback: z.boolean(),
  })
  .strict();

export type ToastRecordingRecord = z.infer<typeof toastRecordingRecordSchema>;

export const toastCatchRecordSchema = z
  .object({
    version: z.literal(1),
    guesses: z.array(z.string().trim().min(1).max(80)).max(3),
    submittedAt: z.number().int().nonnegative(),
  })
  .strict();

export type ToastCatchRecord = z.infer<typeof toastCatchRecordSchema>;

export const toastSmuggledWordSchema = z
  .object({
    word: z.string().trim().min(1).max(80),
    used: z.boolean(),
    caught: z.boolean(),
    smoothness: z.number().int().min(0).max(5),
  })
  .strict();

export const toastJudgmentSchema = z
  .object({
    genre_score: z.number().int().min(0).max(10),
    smuggled: z.array(toastSmuggledWordSchema).length(3),
    comment: z.string().trim().min(1).max(1200),
    speaker_points: z.number().int().min(0).max(25),
    audience_points: z.number().int().min(0).max(90),
  })
  .strict();

export type ToastJudgment = z.infer<typeof toastJudgmentSchema>;

export const toastResultRecordSchema = z
  .object({
    version: z.literal(1),
    result: z
      .object({
        roundId: safeIdSchema,
        speakerPlayerId: safeIdSchema,
        genre: z.string().trim().min(1).max(120),
        transcript: z.string().max(12_000),
        genreScore: z.number().int().min(0).max(10),
        words: z
          .array(
            z.object({
              id: safeIdSchema,
              text: z.string().trim().min(1).max(80),
              used: z.boolean(),
              smoothness: z.number().int().min(0).max(5),
              caughtByPlayerIds: z.array(safeIdSchema).max(30),
            }),
          )
          .length(3),
        speakerPoints: z.number().int().min(0).max(25),
        listenerPoints: z.record(z.number().int().min(0).max(9)),
        comment: z.string().trim().min(1).max(1200),
      })
      .strict(),
    aiFallback: z.boolean(),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export type ToastResultRecord = z.infer<typeof toastResultRecordSchema>;
