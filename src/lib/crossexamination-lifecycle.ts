import { z } from "zod";
import { CROSS_MANUAL_FINDINGS, CROSS_QUESTION_CATEGORIES } from "@/games/crossexamination/model";

export const CROSS_MIN_RECORDING_SECONDS = 20;
export const CROSS_MAX_RECORDING_SECONDS = 60;

const address = {
  roomId: z.string().trim().min(1).max(128),
  runId: z.string().trim().min(2).max(128),
};
const pairAddress = { ...address, pairId: z.string().trim().min(2).max(128) };
const playerAddress = {
  ...pairAddress,
  playerId: z.string().trim().min(2).max(100),
  playerSecret: z.string().trim().min(16).max(200).optional(),
};

const manualFindingSchema = z
  .object({
    questionId: z.string().trim().min(2).max(128),
    finding: z.enum(CROSS_MANUAL_FINDINGS),
    versionA: z.string().trim().min(1).max(300),
    versionB: z.string().trim().min(1).max(300),
  })
  .strict();

export const crossExaminationRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...address, action: z.literal("case") }).strict(),
  z
    .object({
      ...address,
      action: z.literal("prepare"),
      excludedRecordIds: z.array(z.string().trim().min(2).max(128)).max(50),
      manualFacts: z.array(z.string().trim().min(5).max(300)).max(8),
    })
    .strict(),
  z.object({ ...pairAddress, action: z.literal("open") }).strict(),
  z
    .object({
      ...pairAddress,
      action: z.literal("manual-verdict"),
      findings: z.array(manualFindingSchema).length(4),
      verdict: z.string().trim().min(1).max(1_200),
    })
    .strict(),
  z.object({ ...pairAddress, action: z.literal("skip") }).strict(),
  z.object({ ...pairAddress, action: z.literal("next") }).strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("vote"),
      category: z.enum(CROSS_QUESTION_CATEGORIES),
    })
    .strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("submit-audio"),
      storagePath: z.string().trim().min(1).max(512),
      durationSeconds: z.number().min(CROSS_MIN_RECORDING_SECONDS).max(CROSS_MAX_RECORDING_SECONDS),
    })
    .strict(),
]);

export type CrossExaminationRequest = z.infer<typeof crossExaminationRequestSchema>;
