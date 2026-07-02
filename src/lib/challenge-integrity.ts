import type { RoomState } from "./types";

export type ChallengeJudgePayload = {
  roundId: string;
  operatorId: string;
  frames: string[];
  transcript: string;
  videoUrl: string | null;
  operatorName: string;
  task: string;
};

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function normalizeChallengeJudgePayload(input: unknown): ChallengeJudgePayload | null {
  if (!input || typeof input !== "object") return null;
  const payload = input as Record<string, unknown>;
  const roundId = safeString(payload.roundId);
  const operatorId = safeString(payload.operatorId);
  if (!roundId || !operatorId) return null;

  return {
    roundId,
    operatorId,
    frames: Array.isArray(payload.frames)
      ? payload.frames.filter((frame): frame is string => typeof frame === "string").slice(0, 6)
      : [],
    transcript: safeString(payload.transcript),
    videoUrl: typeof payload.videoUrl === "string" ? payload.videoUrl : null,
    operatorName: safeString(payload.operatorName),
    task: safeString(payload.task),
  };
}

export function canAcceptChallengeJudgePayload(
  state: RoomState,
  payload: ChallengeJudgePayload,
): boolean {
  const challenge = state.challenge;
  if (state.currentGame !== "challenge" || !challenge) return false;
  if (challenge.phase !== "recording") return false;
  if (payload.roundId !== challenge.roundId) return false;
  if (!challenge.operatorId || payload.operatorId !== challenge.operatorId) return false;
  if (challenge.task && payload.task !== challenge.task) return false;
  return true;
}
