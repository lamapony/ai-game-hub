import type { ImpostorRoundResult, ImpostorState, RoomState, Team } from "@/lib/types";

export const IMPOSTOR_SPOTTER_POINTS = 3;
export const IMPOSTOR_DECOY_POINTS = 1;

/**
 * Deterministic scoring: +3 to your team if you spotted the AI answer,
 * +1 to a player's team for every vote their (human) answer collected —
 * being mistaken for the bot is a talent too.
 */
export function scoreImpostorRound(
  state: RoomState,
  imp: ImpostorState,
): { teams: Team[]; roundResult: ImpostorRoundResult | null } {
  const { questionId, question, shuffled, aiAnswerId } = imp;
  if (!questionId || !question || !shuffled || !aiAnswerId) {
    return { teams: state.teams, roundResult: null };
  }

  const votes = imp.votes ?? {};
  const correctVoterIds = Object.entries(votes)
    .filter(([, answerId]) => answerId === aiAnswerId)
    .map(([voterId]) => voterId);

  const teamDelta = new Map<string, number>();
  const addPoints = (playerId: string, points: number) => {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;
    teamDelta.set(player.teamId, (teamDelta.get(player.teamId) ?? 0) + points);
  };

  for (const voterId of correctVoterIds) {
    addPoints(voterId, IMPOSTOR_SPOTTER_POINTS);
  }

  const answerAuthor = new Map(
    shuffled.filter((a) => a.playerId).map((a) => [a.id, a.playerId!] as const),
  );
  for (const [voterId, answerId] of Object.entries(votes)) {
    const authorId = answerAuthor.get(answerId);
    if (!authorId || authorId === voterId) continue;
    addPoints(authorId, IMPOSTOR_DECOY_POINTS);
  }

  const teams = state.teams.map((t) =>
    teamDelta.has(t.id) ? { ...t, score: t.score + (teamDelta.get(t.id) ?? 0) } : t,
  );

  return {
    teams,
    roundResult: {
      questionId,
      question,
      answers: shuffled,
      aiAnswerId,
      votes,
      correctVoterIds,
    },
  };
}
