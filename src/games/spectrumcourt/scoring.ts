import type { RoomState, SpectrumCourtAppeal, SpectrumCourtState } from "@/lib/types";

const APPEAL_NUDGE = 5;

function clampGuess(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function appealDirectionForTeam(appeals: SpectrumCourtAppeal[]) {
  const score = appeals.reduce((sum, appeal) => sum + (appeal.direction === "higher" ? 1 : -1), 0);
  if (score > 0) return "higher" as const;
  if (score < 0) return "lower" as const;
  return undefined;
}

function pointsForDistance(distance: number) {
  return Math.max(0, 10 - Math.floor(distance / 8));
}

export function scoreSpectrumCourtRound(state: RoomState, sc: SpectrumCourtState) {
  if (
    !sc.spectrumId ||
    !sc.leftLabel ||
    !sc.rightLabel ||
    typeof sc.target !== "number" ||
    !sc.clue ||
    !sc.clueTeamId ||
    !sc.cluePlayerId
  ) {
    return null;
  }

  const guessesByTeam = new Map<string, number[]>();
  for (const player of state.players) {
    if (player.teamId === sc.clueTeamId) continue;
    const guess = sc.guesses?.[player.id];
    if (typeof guess !== "number") continue;
    const list = guessesByTeam.get(player.teamId) ?? [];
    list.push(clampGuess(guess));
    guessesByTeam.set(player.teamId, list);
  }

  const appealsByTeam = new Map<string, SpectrumCourtAppeal[]>();
  for (const player of state.players) {
    if (player.teamId === sc.clueTeamId) continue;
    const appeal = sc.appeals?.[player.id];
    if (!appeal) continue;
    const list = appealsByTeam.get(player.teamId) ?? [];
    list.push(appeal);
    appealsByTeam.set(player.teamId, list);
  }

  const teamResults = state.teams
    .filter((team) => team.id !== sc.clueTeamId)
    .map((team) => {
      const rawGuess = clampGuess(average(guessesByTeam.get(team.id) ?? []) ?? 50);
      const appealDirection = appealDirectionForTeam(appealsByTeam.get(team.id) ?? []);
      const finalGuess = clampGuess(
        rawGuess +
          (appealDirection === "higher"
            ? APPEAL_NUDGE
            : appealDirection === "lower"
              ? -APPEAL_NUDGE
              : 0),
      );
      const distance = Math.abs(finalGuess - sc.target!);
      return {
        teamId: team.id,
        rawGuess,
        finalGuess,
        distance,
        points: pointsForDistance(distance),
        appealDirection,
      };
    });

  const clueTeamPoints = Math.max(0, ...teamResults.map((result) => result.points));
  const teams = state.teams.map((team) => {
    if (team.id === sc.clueTeamId) {
      return { ...team, score: team.score + clueTeamPoints };
    }
    const result = teamResults.find((entry) => entry.teamId === team.id);
    return result ? { ...team, score: team.score + result.points } : team;
  });

  return {
    teams,
    roundResult: {
      spectrumId: sc.spectrumId,
      leftLabel: sc.leftLabel,
      rightLabel: sc.rightLabel,
      target: sc.target,
      clue: sc.clue,
      clueTeamId: sc.clueTeamId,
      cluePlayerId: sc.cluePlayerId,
      teamResults,
      clueTeamPoints,
    },
  };
}
