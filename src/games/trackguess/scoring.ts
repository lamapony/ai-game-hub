import type { RoomState, Team, TrackGuessRoundResult, TrackGuessState } from "@/lib/types";
import { getCatalogTrack } from "./catalog";

export const TRACK_GUESS_POINTS = 2;

export function scoreTrackGuessRound(
  state: RoomState,
  tg: TrackGuessState,
): { teams: Team[]; roundResult: TrackGuessRoundResult | null } {
  const track = getCatalogTrack(tg.trackId);
  const trackMeta =
    track ??
    (tg.trackId && typeof tg.isAi === "boolean"
      ? {
          id: tg.trackId,
          title: tg.trackTitle ?? "Unknown track",
          artist: tg.trackArtist,
          genre: tg.trackGenre ?? "Unknown genre",
          isAi: tg.isAi,
          sourceLabel: tg.trackSourceLabel,
          sourceUrl: tg.trackSourceUrl,
          artworkUrl: tg.trackArtworkUrl,
        }
      : null);
  if (!trackMeta) return { teams: state.teams, roundResult: null };

  const correctPlayerIds = state.players
    .filter((p) => {
      const guess = tg.guesses?.[p.id];
      if (!guess) return false;
      return guess === (trackMeta.isAi ? "ai" : "real");
    })
    .map((p) => p.id);

  const teamDelta = new Map<string, number>();
  for (const playerId of correctPlayerIds) {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) continue;
    teamDelta.set(player.teamId, (teamDelta.get(player.teamId) ?? 0) + TRACK_GUESS_POINTS);
  }

  const teams = state.teams.map((t) =>
    teamDelta.has(t.id) ? { ...t, score: t.score + (teamDelta.get(t.id) ?? 0) } : t,
  );

  return {
    teams,
    roundResult: {
      trackId: trackMeta.id,
      title: trackMeta.title,
      artist: trackMeta.artist,
      genre: trackMeta.genre,
      isAi: trackMeta.isAi,
      sourceLabel: trackMeta.sourceLabel,
      sourceUrl: trackMeta.sourceUrl,
      artworkUrl: trackMeta.artworkUrl,
      correctPlayerIds,
    },
  };
}
