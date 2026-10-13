import type { Team } from "./types";

export type HostScoreBaseline = Record<string, number>;

export function hostScoreBaseline(teams: readonly Team[]): HostScoreBaseline {
  return Object.fromEntries(teams.map((team) => [team.id, team.score]));
}

export function parseHostScoreBaseline(value: unknown): HostScoreBaseline | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([id, score]) => !id || typeof score !== "number" || !Number.isFinite(score))) {
    return undefined;
  }
  return Object.fromEntries(entries) as HostScoreBaseline;
}
