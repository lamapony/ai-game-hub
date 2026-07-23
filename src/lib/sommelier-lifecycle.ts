import { z } from "zod";
import type { SommelierProfile, SommelierRoundResult } from "@/games/sommelier/model";

const safeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, "contains unsupported characters");

const baseRequest = {
  roomId: z.string().trim().min(1).max(128),
  sessionId: safeIdSchema,
};

const playerFields = {
  playerId: safeIdSchema,
  playerSecret: z.string().trim().min(16).max(200).optional(),
};

export const sommelierRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...baseRequest,
      ...playerFields,
      action: z.literal("submit-photo"),
      storagePath: z.string().trim().min(1).max(512),
    })
    .strict(),
  z.object({ ...baseRequest, action: z.literal("prepare") }).strict(),
  z.object({ ...baseRequest, action: z.literal("current") }).strict(),
  z.object({ ...baseRequest, ...playerFields, action: z.literal("status") }).strict(),
  z
    .object({
      ...baseRequest,
      ...playerFields,
      action: z.literal("guess"),
      entryId: safeIdSchema,
      guessedOwnerPlayerId: safeIdSchema,
    })
    .strict(),
  z
    .object({
      ...baseRequest,
      action: z.literal("reveal"),
      entryId: safeIdSchema,
      allowNoVotes: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...baseRequest,
      action: z.literal("next"),
      entryId: safeIdSchema,
    })
    .strict(),
  z
    .object({
      ...baseRequest,
      action: z.literal("crowd-favorite"),
      entryId: safeIdSchema,
    })
    .strict(),
]);

export const SOMMELIER_CORRECT_GUESS_POINTS = 3;
export const SOMMELIER_UNDISCOVERED_OWNER_POINTS = 5;
export const SOMMELIER_CROWD_FAVORITE_POINTS = 3;

export type SommelierBallot = {
  voterPlayerId: string;
  guessedOwnerPlayerId: string;
};

export function scoreSommelierRound(params: {
  entryId: string;
  ownerPlayerId: string;
  ownerPlayerName: string;
  ownerTeamId: string;
  profile: SommelierProfile;
  aiFallback: boolean;
  candidatePlayerIds: string[];
  ballots: SommelierBallot[];
}): SommelierRoundResult {
  const candidates = new Set(params.candidatePlayerIds);
  const seenVoters = new Set<string>();
  const validBallots: SommelierBallot[] = [];
  params.ballots.forEach((ballot) => {
    if (
      ballot.voterPlayerId === params.ownerPlayerId ||
      ballot.voterPlayerId === ballot.guessedOwnerPlayerId ||
      seenVoters.has(ballot.voterPlayerId) ||
      !candidates.has(ballot.guessedOwnerPlayerId)
    ) {
      return;
    }
    seenVoters.add(ballot.voterPlayerId);
    validBallots.push(ballot);
  });

  const correctGuesserIds = validBallots
    .filter((ballot) => ballot.guessedOwnerPlayerId === params.ownerPlayerId)
    .map((ballot) => ballot.voterPlayerId);
  const guesserPoints = Object.fromEntries(
    correctGuesserIds.map((playerId) => [playerId, SOMMELIER_CORRECT_GUESS_POINTS]),
  );

  return {
    entryId: params.entryId,
    ownerPlayerId: params.ownerPlayerId,
    ownerPlayerName: params.ownerPlayerName,
    ownerTeamId: params.ownerTeamId,
    profile: params.profile,
    correctGuesserIds,
    ballotCount: validBallots.length,
    ownerPoints: correctGuesserIds.length === 0 ? SOMMELIER_UNDISCOVERED_OWNER_POINTS : 0,
    guesserPoints,
    aiFallback: params.aiFallback,
  };
}
