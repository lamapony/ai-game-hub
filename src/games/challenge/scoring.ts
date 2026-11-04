import type { ChallengeAudienceVote, RoomState } from "@/lib/types";

export const CHALLENGE_AUDIENCE_BOOST = 3;
export const CHALLENGE_AUDIENCE_CUT = -1;
export const CHALLENGE_VOTE_MS = 20_000;

/** Quiplash-style room reaction after the AI roast: boost lands, or the room cuts it. */
export function finalizeChallengeAudienceScore(
  aiScore: number,
  votes: Record<string, ChallengeAudienceVote> | undefined,
) {
  const entries = Object.values(votes ?? {});
  const audienceBoostCount = entries.filter((vote) => vote === "boost").length;
  const audienceCutCount = entries.filter((vote) => vote === "cut").length;
  const audienceAdjustment =
    audienceBoostCount > audienceCutCount
      ? CHALLENGE_AUDIENCE_BOOST
      : audienceCutCount > audienceBoostCount
        ? CHALLENGE_AUDIENCE_CUT
        : 0;
  return {
    audienceBoostCount,
    audienceCutCount,
    audienceAdjustment,
    awardedScore: Math.max(0, Math.trunc(aiScore) + audienceAdjustment),
  };
}

export function applyChallengeVotingResult(state: RoomState): RoomState {
  const challenge = state.challenge;
  if (!challenge || challenge.phase !== "voting" || !challenge.result) return state;
  const finalized = finalizeChallengeAudienceScore(challenge.result.score, challenge.audienceVotes);
  const operator = state.players.find((player) => player.id === challenge.operatorId);
  return {
    ...state,
    teams: state.teams.map((team) =>
      operator && team.id === operator.teamId && finalized.awardedScore > 0
        ? { ...team, score: team.score + finalized.awardedScore }
        : team,
    ),
    challenge: {
      ...challenge,
      phase: "results",
      voteEndsAt: undefined,
      result: {
        ...challenge.result,
        ...finalized,
      },
    },
  };
}
