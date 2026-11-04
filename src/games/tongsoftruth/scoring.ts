import type { TongsAudienceBet } from "@/lib/types";

export const TONGS_AUDIENCE_BET_POINTS = 2;

export function tongsPoints(input: {
  honestyScore: number;
  dodgeDetected: boolean;
  artistryScore: number;
  environmentUsed: boolean;
}) {
  const honesty = Math.max(0, Math.min(10, Math.trunc(input.honestyScore)));
  const artistry = Math.max(0, Math.min(5, Math.trunc(input.artistryScore)));
  return Math.max(
    0,
    Math.min(
      20,
      honesty + artistry + (input.environmentUsed ? 5 : 0) - (input.dodgeDetected ? 3 : 0),
    ),
  );
}

/** Trivia Murder Party-style side bet: will they dodge, or stand and answer? */
export function scoreTongsAudienceBets(
  bets: Record<string, TongsAudienceBet> | undefined,
  dodgeDetected: boolean,
  skipped = false,
): {
  audienceDodgeCount: number;
  audienceStandCount: number;
  correctBetterIds: string[];
} {
  const entries = Object.entries(bets ?? {});
  const audienceDodgeCount = entries.filter(([, bet]) => bet === "dodge").length;
  const audienceStandCount = entries.filter(([, bet]) => bet === "stand").length;
  if (skipped) {
    return { audienceDodgeCount, audienceStandCount, correctBetterIds: [] };
  }
  const winningBet: TongsAudienceBet = dodgeDetected ? "dodge" : "stand";
  return {
    audienceDodgeCount,
    audienceStandCount,
    correctBetterIds: entries.filter(([, bet]) => bet === winningBet).map(([id]) => id),
  };
}
