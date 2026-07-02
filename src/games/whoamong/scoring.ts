import type { RoomState, Team, WhoAmongRoundResult, WhoAmongState } from "@/lib/types";

export const WHO_AMONG_STAR_POINTS = 3;
export const WHO_AMONG_VOTER_POINTS = 2;

export function scoreWhoAmongRound(
  state: RoomState,
  wa: WhoAmongState,
): { teams: Team[]; roundResult: WhoAmongRoundResult | null } {
  const promptId = wa.promptId;
  const prompt = wa.prompt;
  if (!promptId || !prompt) return { teams: state.teams, roundResult: null };

  const votes = wa.votes ?? {};
  const voteCounts: Record<string, number> = {};
  for (const targetId of Object.values(votes)) {
    voteCounts[targetId] = (voteCounts[targetId] ?? 0) + 1;
  }

  const totalVotes = Object.keys(votes).length;
  let starIds: string[] = [];
  if (totalVotes > 0) {
    const maxCount = Math.max(...Object.values(voteCounts), 0);
    starIds = Object.entries(voteCounts)
      .filter(([, count]) => count === maxCount)
      .map(([id]) => id);
  }

  const correctVoterIds = Object.entries(votes)
    .filter(([, targetId]) => starIds.includes(targetId))
    .map(([voterId]) => voterId);

  const teamDelta = new Map<string, number>();

  for (const starId of starIds) {
    const player = state.players.find((p) => p.id === starId);
    if (!player) continue;
    teamDelta.set(player.teamId, (teamDelta.get(player.teamId) ?? 0) + WHO_AMONG_STAR_POINTS);
  }

  for (const voterId of correctVoterIds) {
    const player = state.players.find((p) => p.id === voterId);
    if (!player) continue;
    teamDelta.set(player.teamId, (teamDelta.get(player.teamId) ?? 0) + WHO_AMONG_VOTER_POINTS);
  }

  const teams = state.teams.map((t) =>
    teamDelta.has(t.id) ? { ...t, score: t.score + (teamDelta.get(t.id) ?? 0) } : t,
  );

  return {
    teams,
    roundResult: {
      promptId,
      prompt,
      starIds,
      voteCounts,
      correctVoterIds,
    },
  };
}
