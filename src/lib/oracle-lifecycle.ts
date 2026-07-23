import { z } from "zod";
import {
  oraclePredictionResultsSchema,
  type OraclePredictionResults,
  type OracleVerificationDecision,
} from "@/games/grilloracle/model";
import type { RoomState } from "./types";
import { statusError } from "./player-auth.server";

const addressFields = {
  roomId: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().min(1).max(16).optional(),
  hostSecret: z.string().trim().min(1).max(256).optional(),
};

const runIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9:_-]+$/, "runId contains unsupported characters");

const playerIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9:_-]+$/, "playerId contains unsupported characters");

export const oracleLifecycleRequestSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        ...addressFields,
        action: z.literal("seal"),
        runId: runIdSchema,
        allowIncomplete: z.boolean().default(false),
      })
      .strict(),
    z
      .object({
        ...addressFields,
        action: z.literal("reveal"),
        runId: runIdSchema,
      })
      .strict(),
    z
      .object({
        ...addressFields,
        action: z.literal("verify"),
        runId: runIdSchema,
        playerId: playerIdSchema,
        results: oraclePredictionResultsSchema,
      })
      .strict(),
  ])
  .refine((value) => Boolean(value.roomId || value.code), {
    message: "roomId or code required",
    path: ["roomId"],
  });

export type OracleLifecycleRequest = z.infer<typeof oracleLifecycleRequestSchema>;

export function oracleScoreForResults(results: OraclePredictionResults) {
  const fulfilledCount = results.filter(Boolean).length;
  const unfulfilledCount = results.length - fulfilledCount;
  return {
    fulfilledCount,
    unfulfilledCount,
    oraclePoints: fulfilledCount * 5,
    skepticPoints: unfulfilledCount * 3,
  };
}

export function deterministicOracleDecision(
  generated: OracleVerificationDecision,
  results: OraclePredictionResults,
): OracleVerificationDecision {
  const score = oracleScoreForResults(results);
  return {
    ...generated,
    fulfilled_count: score.fulfilledCount,
    oracle_points: score.oraclePoints,
    skeptic_points: score.skepticPoints,
  };
}

/** Only teams represented in the room take part in the shared skeptic side. */
export function oracleScoreTargets(state: RoomState, playerId: string) {
  const owner = state.players.find((player) => player.id === playerId);
  if (!owner) throw statusError("oracle owner is no longer in the room", 409);
  const representedTeamIds = new Set(state.players.map((player) => player.teamId));
  return {
    owner,
    skepticTeamIds: state.teams
      .map((team) => team.id)
      .filter((teamId) => representedTeamIds.has(teamId) && teamId !== owner.teamId),
  };
}

export function sameOracleResults(a: OraclePredictionResults, b: OraclePredictionResults) {
  return a.every((value, index) => value === b[index]);
}
