import { z } from "zod";
import type { Json, Tables } from "@/integrations/supabase/types";

export const SCORE_EVENT_SOURCES = [
  "vote",
  "deterministic",
  "ai-bonus",
  "host-adjustment",
  "legacy",
] as const;
export const SCORE_AWARD_SOURCES = [
  "vote",
  "deterministic",
  "ai-bonus",
  "host-adjustment",
] as const;
export const SCORE_EVENT_RUBRIC_MAX_BYTES = 16_384;
export const SCORE_EVENT_BATCH_MAX = 50;

const safeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9:_-]+$/, "contains unsupported characters");

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, "contains unsupported characters");

const rubricSchema = z.record(z.unknown()).superRefine((rubric, context) => {
  const serialized = JSON.stringify(rubric);
  if (new TextEncoder().encode(serialized).byteLength > SCORE_EVENT_RUBRIC_MAX_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "rubric is too large" });
  }
});

export const scoreAwardInputSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    runId: safeIdSchema,
    gameId: safeIdSchema,
    teamId: safeIdSchema,
    playerId: safeIdSchema.optional(),
    points: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((points) => points !== 0, {
        message: "points cannot be zero",
      }),
    reason: z.string().trim().min(2).max(240),
    source: z.enum(SCORE_AWARD_SOURCES),
    rubric: rubricSchema.default({}),
  })
  .strict();

const addressFields = {
  roomId: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().min(1).max(16).optional(),
  hostSecret: z.string().trim().min(1).max(256).optional(),
};

const filterFields = {
  runId: safeIdSchema.optional(),
  gameId: safeIdSchema.optional(),
  actId: safeIdSchema.optional(),
  teamId: safeIdSchema.optional(),
  playerId: safeIdSchema.optional(),
  source: z.enum(SCORE_EVENT_SOURCES).optional(),
};

const hostAwardScoreEventsRequestSchema = z
  .object({
    ...addressFields,
    action: z.literal("award"),
    events: z.array(scoreAwardInputSchema).min(1).max(SCORE_EVENT_BATCH_MAX),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.events.forEach((event, index) => {
      if (seen.has(event.idempotencyKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicate idempotency key in batch",
          path: ["events", index, "idempotencyKey"],
        });
      }
      seen.add(event.idempotencyKey);
    });
  });

const hostListScoreEventsRequestSchema = z
  .object({
    ...addressFields,
    action: z.literal("list"),
    ...filterFields,
    limit: z.number().int().min(1).max(500).default(250),
  })
  .strict();

const hostScoreSummaryRequestSchema = z
  .object({
    ...addressFields,
    action: z.literal("summary"),
    ...filterFields,
  })
  .strict();

export const hostScoreEventsRequestSchema = z
  .union([
    hostAwardScoreEventsRequestSchema,
    hostListScoreEventsRequestSchema,
    hostScoreSummaryRequestSchema,
  ])
  .refine((value) => Boolean(value.roomId || value.code), {
    message: "roomId or code required",
    path: ["roomId"],
  });

export type ScoreEventRow = Tables<"score_events">;
export type ScoreEventSource = (typeof SCORE_EVENT_SOURCES)[number];
export type ScoreAwardSource = (typeof SCORE_AWARD_SOURCES)[number];
export type ScoreAwardInput = z.infer<typeof scoreAwardInputSchema>;
export type HostScoreEventsRequest = z.infer<typeof hostScoreEventsRequestSchema>;
export type ScoreEventFilters = {
  runId?: string;
  gameId?: string;
  actId?: string;
  teamId?: string;
  playerId?: string;
  source?: ScoreEventSource;
};

export type ScoreEventView = {
  id: string;
  runId: string;
  gameId: string;
  actId: string;
  teamId: string;
  playerId?: string;
  points: number;
  reason: string;
  source: ScoreEventSource;
  rubric: Json;
  createdAt: string;
};

export type ScoreSubjectTotal = {
  id: string;
  total: number;
  eventCount: number;
  byAct: Record<string, number>;
  bySource: Partial<Record<ScoreEventSource, number>>;
};

export type ScoreLedgerSummary = {
  eventCount: number;
  totalPoints: number;
  teamTotals: ScoreSubjectTotal[];
  playerTotals: ScoreSubjectTotal[];
  byAct: Record<string, number>;
  bySource: Partial<Record<ScoreEventSource, number>>;
};

export function scoreEventView(row: ScoreEventRow): ScoreEventView {
  return {
    id: row.id,
    runId: row.run_id,
    gameId: row.game_id,
    actId: row.act_id,
    teamId: row.team_id,
    playerId: row.player_id ?? undefined,
    points: row.points,
    reason: row.reason,
    source: row.source as ScoreEventSource,
    rubric: row.rubric,
    createdAt: row.created_at,
  };
}

function compareScoreRows(a: ScoreEventRow, b: ScoreEventRow) {
  const timeDifference = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (timeDifference !== 0) return timeDifference;
  if (a.source !== b.source && (a.source === "legacy" || b.source === "legacy")) {
    return a.source === "legacy" ? -1 : 1;
  }
  return a.run_id.localeCompare(b.run_id) || a.id.localeCompare(b.id);
}

/**
 * A score reset is persisted by the existing ledger RPC as one legacy run whose deltas bring every
 * current team to zero. Everything before the latest such run belongs to an earlier score cycle.
 */
export function scoreRowsForCurrentCycle(
  rows: ScoreEventRow[],
  currentTeamIds: readonly string[],
  sessionStartedAt?: number,
): ScoreEventRow[] {
  const trackedTeamIds = [...new Set(currentTeamIds)];
  const ordered = [...rows].sort(compareScoreRows);
  if (trackedTeamIds.length === 0) return ordered;

  const totals = new Map<string, number>();
  let boundary = 0;
  let index = 0;
  while (index < ordered.length) {
    const first = ordered[index]!;
    if (first.source !== "legacy") {
      totals.set(first.team_id, (totals.get(first.team_id) ?? 0) + first.points);
      index += 1;
      continue;
    }

    const runId = first.run_id;
    const hadTrackedScore = trackedTeamIds.some((teamId) => (totals.get(teamId) ?? 0) !== 0);
    do {
      const row = ordered[index]!;
      totals.set(row.team_id, (totals.get(row.team_id) ?? 0) + row.points);
      index += 1;
    } while (
      index < ordered.length &&
      ordered[index]!.source === "legacy" &&
      ordered[index]!.run_id === runId
    );

    if (hadTrackedScore && trackedTeamIds.every((teamId) => (totals.get(teamId) ?? 0) === 0)) {
      boundary = index;
    }
  }

  const currentCycle = ordered.slice(boundary);
  return sessionStartedAt === undefined
    ? currentCycle
    : currentCycle.filter((row) => Date.parse(row.created_at) >= sessionStartedAt);
}

type MutableTotal = {
  total: number;
  eventCount: number;
  byAct: Map<string, number>;
  bySource: Map<ScoreEventSource, number>;
};

function addBreakdown<K>(map: Map<K, number>, key: K, points: number) {
  map.set(key, (map.get(key) ?? 0) + points);
}

function addSubjectEvent(totals: Map<string, MutableTotal>, id: string, event: ScoreEventView) {
  const total = totals.get(id) ?? {
    total: 0,
    eventCount: 0,
    byAct: new Map<string, number>(),
    bySource: new Map<ScoreEventSource, number>(),
  };
  total.total += event.points;
  total.eventCount += 1;
  addBreakdown(total.byAct, event.actId, event.points);
  addBreakdown(total.bySource, event.source, event.points);
  totals.set(id, total);
}

function materializeSubjectTotals(totals: Map<string, MutableTotal>): ScoreSubjectTotal[] {
  return [...totals.entries()]
    .map(([id, total]) => ({
      id,
      total: total.total,
      eventCount: total.eventCount,
      byAct: Object.fromEntries(total.byAct),
      bySource: Object.fromEntries(total.bySource),
    }))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

export function summarizeScoreEvents(rows: ScoreEventRow[]): ScoreLedgerSummary {
  const teamTotals = new Map<string, MutableTotal>();
  const playerTotals = new Map<string, MutableTotal>();
  const byAct = new Map<string, number>();
  const bySource = new Map<ScoreEventSource, number>();
  let totalPoints = 0;

  rows.map(scoreEventView).forEach((event) => {
    totalPoints += event.points;
    addBreakdown(byAct, event.actId, event.points);
    addBreakdown(bySource, event.source, event.points);
    addSubjectEvent(teamTotals, event.teamId, event);
    if (event.playerId) addSubjectEvent(playerTotals, event.playerId, event);
  });

  return {
    eventCount: rows.length,
    totalPoints,
    teamTotals: materializeSubjectTotals(teamTotals),
    playerTotals: materializeSubjectTotals(playerTotals),
    byAct: Object.fromEntries(byAct),
    bySource: Object.fromEntries(bySource),
  };
}
