import { z } from "zod";
export { tongsPoints } from "@/games/tongsoftruth/scoring";

export const TONGS_RECORDING_WINDOW_MS = 45_000;
export const TONGS_MIN_RECORDING_SECONDS = 10;
export const TONGS_MAX_RECORDING_SECONDS = 20;

const address = {
  roomId: z.string().trim().min(1).max(128),
  runId: z.string().trim().min(2).max(128),
};
const playerAddress = {
  ...address,
  playerId: z.string().trim().min(2).max(100),
  playerSecret: z.string().trim().min(16).max(200).optional(),
};

const manualRubric = {
  honestyScore: z.number().int().min(0).max(10),
  dodgeDetected: z.boolean(),
  artistryScore: z.number().int().min(0).max(5),
  environmentUsed: z.boolean(),
  comment: z.string().trim().min(1).max(800),
};

export const tongsRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...address, action: z.literal("prepare") }).strict(),
  z.object({ ...address, action: z.literal("case") }).strict(),
  z
    .object({
      ...address,
      action: z.literal("next"),
      roundId: z.string().trim().min(2).max(128),
    })
    .strict(),
  z
    .object({
      ...address,
      action: z.literal("manual-verdict"),
      roundId: z.string().trim().min(2).max(128),
      ...manualRubric,
    })
    .strict(),
  z
    .object({
      ...address,
      action: z.literal("skip"),
      roundId: z.string().trim().min(2).max(128),
    })
    .strict(),
  z.object({ ...playerAddress, action: z.literal("start") }).strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("submit-audio"),
      roundId: z.string().trim().min(2).max(128),
      storagePath: z.string().trim().min(1).max(512),
      durationSeconds: z.number().min(1).max(25),
    })
    .strict(),
]);
