import { z } from "zod";

export const CONTRABAND_DURATION_MS = 30 * 60_000;
export const CONTRABAND_AUDIO_WINDOW_MS = 90_000;
export const CONTRABAND_SMUGGLER_POINTS = 10;
export const CONTRABAND_CATCHER_POINTS = 5;
export const CONTRABAND_FALSE_ACCUSATION_POINTS = -2;

const address = {
  roomId: z.string().trim().min(1).max(128),
  runId: z.string().trim().min(2).max(128),
};
const playerAddress = {
  ...address,
  playerId: z.string().trim().min(2).max(100),
  playerSecret: z.string().trim().min(16).max(200).optional(),
};

export const contrabandRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...address, action: z.literal("assign") }).strict(),
  z.object({ ...address, action: z.literal("case") }).strict(),
  z
    .object({
      ...address,
      action: z.literal("resolve"),
      accusationId: z.string().trim().min(2).max(128),
      outcome: z.enum(["caught", "clean", "false-accusation"]),
    })
    .strict(),
  z.object({ ...address, action: z.literal("finalize") }).strict(),
  z.object({ ...playerAddress, action: z.literal("assignment") }).strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("accuse"),
      accusedPlayerId: z.string().trim().min(2).max(100),
      suspectedQuote: z.string().trim().min(2).max(240),
    })
    .strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("respond"),
      accusationId: z.string().trim().min(2).max(128),
      response: z.enum(["confess", "dispute"]),
    })
    .strict(),
  z
    .object({
      ...playerAddress,
      action: z.literal("submit-audio"),
      accusationId: z.string().trim().min(2).max(128),
      storagePath: z.string().trim().min(1).max(512),
      durationSeconds: z.number().min(1).max(30),
    })
    .strict(),
]);

export function outcomePoints(outcome: "caught" | "clean" | "false-accusation") {
  return {
    smugglerPoints: outcome === "clean" ? CONTRABAND_SMUGGLER_POINTS : 0,
    catcherPoints: outcome === "caught" ? CONTRABAND_CATCHER_POINTS : 0,
    falseAccusationPenalty: outcome === "false-accusation" ? CONTRABAND_FALSE_ACCUSATION_POINTS : 0,
  };
}

export function aiOutcome(organicScore: number): "caught" | "clean" {
  return organicScore >= 7 ? "clean" : "caught";
}
