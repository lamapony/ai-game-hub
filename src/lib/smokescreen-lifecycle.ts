import { z } from "zod";
import type {
  SmokeScreenGuessRecord,
  SmokeScreenMissionRecord,
  SmokeScreenResultRecord,
} from "@/games/smokescreen/model";
import type { Player, SmokeScreenResultEntry } from "./types";
import { statusError } from "./player-auth.server";

const address = {
  roomId: z.string().trim().min(1).max(128),
  runId: z.string().trim().min(2).max(128),
};

const assignRequest = z.object({ ...address, action: z.literal("assign") }).strict();
const sealRequest = z
  .object({ ...address, action: z.literal("seal"), allowIncomplete: z.boolean() })
  .strict();
const revealRequest = z.object({ ...address, action: z.literal("reveal") }).strict();
const voteRequest = z
  .object({
    ...address,
    action: z.literal("vote"),
    playerId: z.string().trim().min(2).max(100),
    playerSecret: z.string().trim().min(16).max(200).optional(),
    guesses: z
      .array(
        z
          .object({
            missionId: z.string().trim().min(2).max(128),
            ownerPlayerId: z.string().trim().min(2).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const finalizeRequest = z
  .object({
    ...address,
    action: z.literal("finalize"),
    completedMissionIds: z.array(z.string().trim().min(2).max(128)).max(30),
  })
  .strict();

export const smokeScreenRequestSchema = z.discriminatedUnion("action", [
  assignRequest,
  sealRequest,
  revealRequest,
  voteRequest,
  finalizeRequest,
]);

export type SmokeScreenRequest = z.infer<typeof smokeScreenRequestSchema>;

export type SmokeScreenOwnedMission = {
  missionId: string;
  owner: Player;
  record: SmokeScreenMissionRecord;
};

export function validateSmokeScreenGuesses(params: {
  missionIds: string[];
  participantIds: string[];
  guesses: Array<{ missionId: string; ownerPlayerId: string }>;
}) {
  const missionIds = new Set(params.missionIds);
  const participantIds = new Set(params.participantIds);
  const guessedMissionIds = new Set(params.guesses.map((guess) => guess.missionId));
  if (
    guessedMissionIds.size !== params.guesses.length ||
    guessedMissionIds.size !== missionIds.size ||
    [...guessedMissionIds].some((missionId) => !missionIds.has(missionId))
  ) {
    throw statusError("submit exactly one guess for every revealed mission", 400);
  }
  if (params.guesses.some((guess) => !participantIds.has(guess.ownerPlayerId))) {
    throw statusError("guessed player is outside this Smoke Screen run", 400);
  }
}

export function sameSmokeScreenGuesses(
  left: SmokeScreenGuessRecord["guesses"],
  right: SmokeScreenGuessRecord["guesses"],
) {
  const normalize = (values: SmokeScreenGuessRecord["guesses"]) =>
    [...values]
      .map((value) => `${value.missionId}:${value.ownerPlayerId}`)
      .sort()
      .join("|");
  return normalize(left) === normalize(right);
}

export function scoreSmokeScreen(params: {
  missions: SmokeScreenOwnedMission[];
  guesses: Array<{ voterPlayerId: string; record: SmokeScreenGuessRecord }>;
  completedMissionIds: string[];
}): SmokeScreenResultEntry[] {
  const completed = new Set(params.completedMissionIds);
  return params.missions.map(({ missionId, owner, record }) => {
    const correctDetectiveIds = params.guesses.flatMap(({ voterPlayerId, record: guessRecord }) => {
      if (voterPlayerId === owner.id) return [];
      const guess = guessRecord.guesses.find((candidate) => candidate.missionId === missionId);
      return guess?.ownerPlayerId === owner.id ? [voterPlayerId] : [];
    });
    const caught = correctDetectiveIds.length > 0;
    const didComplete = completed.has(missionId);
    const tierPoints = record.mission.tier * 5;
    return {
      missionId,
      ownerPlayerId: owner.id,
      tier: record.mission.tier,
      completed: didComplete,
      caught,
      correctDetectiveIds,
      ownerPoints: didComplete && !caught ? tierPoints : 0,
    };
  });
}

export function smokeScreenDetectivePoints(
  results: SmokeScreenResultEntry[],
  participantIds: string[],
) {
  return participantIds.map((playerId) => ({
    playerId,
    points:
      results.reduce(
        (total, result) => total + (result.correctDetectiveIds.includes(playerId) ? 2 : 0),
        0,
      ) || 0,
  }));
}

export function sameCompletedMissionIds(
  existing: SmokeScreenResultRecord["completedMissionIds"],
  submitted: string[],
) {
  return [...existing].sort().join("|") === [...new Set(submitted)].sort().join("|");
}
