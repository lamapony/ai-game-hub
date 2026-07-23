import { z } from "zod";
import type { StillLifeJudgment } from "@/games/stilllife/model";

const safeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, "contains unsupported characters");

const baseRequest = {
  roomId: z.string().trim().min(1).max(128),
  roundId: safeIdSchema,
};

const manualScoreSchema = z
  .object({
    teamId: safeIdSchema,
    compositionScore: z.number().int().min(0).max(10),
    dramaScore: z.number().int().min(0).max(10),
    materialScore: z.number().int().min(0).max(5),
  })
  .strict();

export const stillLifeRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...baseRequest, action: z.literal("prepare") }).strict(),
  z.object({ ...baseRequest, action: z.literal("gallery") }).strict(),
  z
    .object({
      ...baseRequest,
      action: z.literal("submit-photo"),
      playerId: safeIdSchema,
      playerSecret: z.string().trim().min(16).max(200).optional(),
      storagePath: z.string().trim().min(1).max(512),
    })
    .strict(),
  z
    .object({
      ...baseRequest,
      action: z.literal("judge"),
      manualScores: z.array(manualScoreSchema).min(2).max(4).optional(),
    })
    .strict(),
  z
    .object({
      ...baseRequest,
      action: z.literal("vote"),
      playerId: safeIdSchema,
      playerSecret: z.string().trim().min(16).max(200).optional(),
      teamId: safeIdSchema,
    })
    .strict(),
  z
    .object({
      ...baseRequest,
      action: z.literal("finalize"),
      allowNoVotes: z.boolean().optional(),
    })
    .strict(),
  z.object({ ...baseRequest, action: z.literal("next") }).strict(),
]);

export type StillLifeManualScore = z.infer<typeof manualScoreSchema>;

export function stillLifeJudgmentPoints(judgment: StillLifeJudgment) {
  return judgment.composition_score + judgment.drama_score + judgment.material_score;
}

export type StillLifeScoredJudgment = {
  teamId: string;
  teamName: string;
  judgment: StillLifeJudgment;
  aiFallback: boolean;
  manualOverride: boolean;
};

export function scoreStillLifeRound(params: {
  roundId: string;
  headline: string;
  judgments: StillLifeScoredJudgment[];
  votes: Array<{ playerId: string; teamId: string }>;
}) {
  const validTeamIds = new Set(params.judgments.map((entry) => entry.teamId));
  const audienceVotes = Object.fromEntries(params.judgments.map((entry) => [entry.teamId, 0]));
  const seenVoters = new Set<string>();
  params.votes.forEach((vote) => {
    if (!validTeamIds.has(vote.teamId) || seenVoters.has(vote.playerId)) return;
    seenVoters.add(vote.playerId);
    audienceVotes[vote.teamId] = (audienceVotes[vote.teamId] ?? 0) + 1;
  });

  const entries = params.judgments.map((entry) => ({
    teamId: entry.teamId,
    teamName: entry.teamName,
    compositionScore: entry.judgment.composition_score,
    dramaScore: entry.judgment.drama_score,
    materialScore: entry.judgment.material_score,
    points: stillLifeJudgmentPoints(entry.judgment),
    catalogTitle: entry.judgment.catalog_title,
    auctionPriceDkk: entry.judgment.auction_price_dkk,
    critique: entry.judgment.critique,
    audienceVotes: audienceVotes[entry.teamId] ?? 0,
    aiFallback: entry.aiFallback,
    manualOverride: entry.manualOverride,
  }));
  const bestPoints = Math.max(...entries.map((entry) => entry.points));
  const scoreLeaders = entries.filter((entry) => entry.points === bestPoints);
  const bestAudience = Math.max(...scoreLeaders.map((entry) => entry.audienceVotes));
  const winningTeamIds = scoreLeaders
    .filter((entry) => entry.audienceVotes === bestAudience)
    .map((entry) => entry.teamId);

  return { roundId: params.roundId, headline: params.headline, entries, winningTeamIds };
}
