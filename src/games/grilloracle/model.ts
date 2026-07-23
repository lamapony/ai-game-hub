import { z } from "zod";

export const ORACLE_RECORD_KIND = "oracle-prophecy";
export const ORACLE_PROMPT_VERSION = 1;
export const ORACLE_VERDICT_RECORD_KIND = "oracle-verdict";
export const ORACLE_VERIFICATION_PROMPT_VERSION = 1;

export const ORACLE_ITEM_CATEGORIES = ["vegetable", "meat", "bread", "drink", "mystery"] as const;
export const ORACLE_DONENESS_LEVELS = ["raw", "golden", "charred", "incinerated"] as const;

const predictionSchema = z.string().trim().min(1).max(300);

export const oracleReadingSchema = z
  .object({
    item_guess: z.string().trim().min(1).max(240),
    doneness_verdict: z.string().trim().min(1).max(300),
    prophecy: z.string().trim().min(1).max(900),
    predictions: z.tuple([predictionSchema, predictionSchema, predictionSchema]),
    char_reading_style: z.string().trim().min(1).max(160),
    /** Narrative intensity from the source spec. Never written to the score ledger. */
    points: z.number().int().min(5).max(15),
  })
  .strict();

export type OracleReading = z.infer<typeof oracleReadingSchema>;
export type OracleItemCategory = (typeof ORACLE_ITEM_CATEGORIES)[number];
export type OracleDonenessLevel = (typeof ORACLE_DONENESS_LEVELS)[number];

export const oracleRecordPayloadSchema = z
  .object({
    version: z.literal(1),
    reading: oracleReadingSchema,
    capture: z
      .object({
        mode: z.enum(["vision", "host-fallback"]),
        storagePath: z.string().trim().min(1).max(512).optional(),
        capturedAt: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type OracleRecordPayload = z.infer<typeof oracleRecordPayloadSchema>;

export const oraclePredictionResultsSchema = z.tuple([z.boolean(), z.boolean(), z.boolean()]);

export const oracleVerificationDecisionSchema = z
  .object({
    verdict: z.string().trim().min(1).max(900),
    fulfilled_count: z.number().int().min(0).max(3),
    oracle_points: z.number().int().min(0).max(15),
    skeptic_points: z.number().int().min(0).max(9),
  })
  .strict();

export type OraclePredictionResults = z.infer<typeof oraclePredictionResultsSchema>;
export type OracleVerificationDecision = z.infer<typeof oracleVerificationDecisionSchema>;

export const oracleVerdictRecordPayloadSchema = z
  .object({
    version: z.literal(1),
    results: oraclePredictionResultsSchema,
    decision: oracleVerificationDecisionSchema,
    aiFallback: z.boolean(),
    verifiedAt: z.number().int().nonnegative(),
  })
  .strict();

export type OracleVerdictRecordPayload = z.infer<typeof oracleVerdictRecordPayloadSchema>;
