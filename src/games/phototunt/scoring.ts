import type { RoomState } from "@/lib/types";

export const PHOTO_HUNT_CROWD_FAVORITE = 3;
export const PHOTO_HUNT_VOTE_MS = 25_000;

/** Fibbage-style crowd favorite: unique plurality wins +3. Ties pay nobody. */
export function photoHuntCrowdFavorite(votes: Record<string, string> | undefined) {
  const voteCounts: Record<string, number> = {};
  Object.values(votes ?? {}).forEach((playerId) => {
    voteCounts[playerId] = (voteCounts[playerId] ?? 0) + 1;
  });
  const ranked = Object.entries(voteCounts).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const top = ranked[0];
  const tied = Boolean(top && ranked[1] && ranked[1][1] === top[1]);
  return {
    voteCounts,
    favoritePlayerId: top && !tied ? top[0] : null,
  };
}

export function applyPhotoHuntVotingResult(state: RoomState): RoomState {
  const phototunt = state.phototunt;
  if (!phototunt || phototunt.phase !== "voting" || !phototunt.results) return state;
  const { favoritePlayerId } = photoHuntCrowdFavorite(phototunt.audienceVotes);
  const results = phototunt.results.map((entry) => ({
    ...entry,
    points: entry.points + (entry.playerId === favoritePlayerId ? PHOTO_HUNT_CROWD_FAVORITE : 0),
    crowdFavorite: entry.playerId === favoritePlayerId,
  }));
  const teamDelta = new Map<string, number>();
  results.forEach((entry) => {
    teamDelta.set(entry.teamId, (teamDelta.get(entry.teamId) ?? 0) + entry.points);
  });
  return {
    ...state,
    teams: state.teams.map((team) =>
      teamDelta.has(team.id)
        ? { ...team, score: team.score + (teamDelta.get(team.id) ?? 0) }
        : team,
    ),
    phototunt: {
      ...phototunt,
      phase: "results",
      voteEndsAt: undefined,
      crowdFavoritePlayerId: favoritePlayerId ?? undefined,
      results,
    },
  };
}
