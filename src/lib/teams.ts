import type { RoomState, Team } from "./types";

export const TEAM_COLORS: Team["color"][] = ["green", "blue", "red", "amber"];
export const MAX_TEAMS = 8;

export function nextTeamColor(teams: Team[]): Team["color"] {
  return TEAM_COLORS[teams.length % TEAM_COLORS.length];
}

export function suggestTeamName(teams: Team[]): string {
  return `Team ${teams.length + 1}`;
}

export function addTeamToState(state: RoomState, name: string, id: string): RoomState | null {
  const trimmed = name.trim();
  if (!trimmed || state.teams.length >= MAX_TEAMS) return null;
  const team: Team = {
    id,
    name: trimmed,
    color: nextTeamColor(state.teams),
    score: 0,
  };
  return { ...state, teams: [...state.teams, team] };
}

export function renameTeamInState(
  state: RoomState,
  teamId: string,
  name: string,
): RoomState | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!state.teams.some((t) => t.id === teamId)) return null;
  return {
    ...state,
    teams: state.teams.map((t) => (t.id === teamId ? { ...t, name: trimmed } : t)),
  };
}

export function removeTeamFromState(state: RoomState, teamId: string): RoomState | null {
  if (state.teams.length <= 1) return null;
  if (state.players.some((p) => p.teamId === teamId)) return null;
  return { ...state, teams: state.teams.filter((t) => t.id !== teamId) };
}

export function playersOnTeam(state: RoomState, teamId: string) {
  return state.players.filter((p) => p.teamId === teamId);
}
