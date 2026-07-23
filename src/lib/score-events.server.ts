import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { statusError } from "./player-auth.server";
import {
  SCORE_EVENT_SOURCES,
  scoreEventView,
  scoreRowsForCurrentCycle,
  summarizeScoreEvents,
  type ScoreAwardInput,
  type ScoreEventFilters,
  type ScoreEventRow,
  type ScoreEventSource,
} from "./score-events";
import type { RoomState } from "./types";

const SCORE_EVENT_PAGE_SIZE = 500;

type ScoreLedgerScope = {
  currentTeamIds: readonly string[];
  sessionStartedAt?: number;
};

const rpcEventSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  run_id: z.string(),
  game_id: z.string(),
  act_id: z.string(),
  team_id: z.string(),
  player_id: z.string().nullable(),
  points: z.number().int(),
  reason: z.string(),
  source: z.enum(SCORE_EVENT_SOURCES),
  rubric: z.record(z.unknown()),
  idempotency_key: z.string(),
  created_at: z.string(),
  replayed: z.boolean(),
});

const rpcResultSchema = z.object({
  insertedCount: z.number().int().nonnegative(),
  replayedCount: z.number().int().nonnegative(),
  materializedLegacyCount: z.number().int().nonnegative(),
  events: z.array(rpcEventSchema),
  teamTotals: z.array(
    z.object({
      teamId: z.string(),
      score: z.number().int(),
    }),
  ),
});

export type ScoreLedgerWriteResult = {
  insertedCount: number;
  replayedCount: number;
  materializedLegacyCount: number;
  events: Array<ReturnType<typeof scoreEventView> & { replayed: boolean }>;
  teamTotals: Array<{ teamId: string; score: number }>;
};

export function assertScoreAwardTargets(state: RoomState, events: ScoreAwardInput[]) {
  const teams = new Set(state.teams.map((team) => team.id));
  const players = new Map(state.players.map((player) => [player.id, player.teamId]));

  events.forEach((event) => {
    if (!teams.has(event.teamId)) throw statusError("score team not found", 409);
    if (event.playerId && players.get(event.playerId) !== event.teamId) {
      throw statusError("score player does not belong to team", 409);
    }
  });
}

export function scoreLedgerError(error: unknown): Error & { status?: number } {
  if (error && typeof error === "object" && "status" in error) {
    return error as Error & { status?: number };
  }
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "23505") return statusError("score event already recorded", 409);
  if (code === "23503") return statusError("score target no longer exists", 409);
  if (code === "P0002") return statusError("score ledger room not found", 404);
  if (["22023", "22P02", "23514"].includes(code)) return statusError("score event invalid", 400);
  return error instanceof Error ? error : new Error("score ledger failed");
}

function parsedScoreRow(row: z.infer<typeof rpcEventSchema>): ScoreEventRow {
  return {
    id: row.id,
    room_id: row.room_id,
    run_id: row.run_id,
    game_id: row.game_id,
    act_id: row.act_id,
    team_id: row.team_id,
    player_id: row.player_id,
    points: row.points,
    reason: row.reason,
    source: row.source,
    rubric: row.rubric as Json,
    idempotency_key: row.idempotency_key,
    created_at: row.created_at,
  };
}

async function runScoreLedgerTransaction(roomId: string, events: ScoreAwardInput[]) {
  const payload = events.map((event) => ({
    idempotencyKey: event.idempotencyKey,
    runId: event.runId,
    gameId: event.gameId,
    teamId: event.teamId,
    ...(event.playerId ? { playerId: event.playerId } : {}),
    points: event.points,
    reason: event.reason,
    source: event.source,
    rubric: event.rubric,
  }));
  const { data, error } = await supabaseAdmin.rpc("award_score_events", {
    p_room_id: roomId,
    p_events: payload as Json,
  });
  if (error) throw scoreLedgerError(error);

  const parsed = rpcResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("score ledger returned an invalid result");
  return parsed.data;
}

export async function awardScoreEvents(params: {
  roomId: string;
  state: RoomState;
  events: ScoreAwardInput[];
}): Promise<ScoreLedgerWriteResult> {
  assertScoreAwardTargets(params.state, params.events);
  const result = await runScoreLedgerTransaction(params.roomId, params.events);
  return {
    insertedCount: result.insertedCount,
    replayedCount: result.replayedCount,
    materializedLegacyCount: result.materializedLegacyCount,
    events: result.events.map((event) => ({
      ...scoreEventView(parsedScoreRow(event)),
      replayed: event.replayed,
    })),
    teamTotals: result.teamTotals,
  };
}

export async function materializeLegacyScoreEvents(roomId: string) {
  const result = await runScoreLedgerTransaction(roomId, []);
  return { materializedLegacyCount: result.materializedLegacyCount };
}

function scoreEventsQuery(roomId: string, filters: ScoreEventFilters) {
  let query = supabaseAdmin.from("score_events").select("*").eq("room_id", roomId);
  if (filters.runId) query = query.eq("run_id", filters.runId);
  if (filters.gameId) query = query.eq("game_id", filters.gameId);
  if (filters.actId) query = query.eq("act_id", filters.actId);
  if (filters.teamId) query = query.eq("team_id", filters.teamId);
  if (filters.playerId) query = query.eq("player_id", filters.playerId);
  if (filters.source) query = query.eq("source", filters.source);
  return query;
}

export async function listScoreEventsForHost(
  roomId: string,
  scope: ScoreLedgerScope,
  filters: ScoreEventFilters = {},
  limit = 250,
) {
  await materializeLegacyScoreEvents(roomId);
  return scoreRowsForCurrentCycle(
    await listAllScoreRows(roomId, {}),
    scope.currentTeamIds,
    scope.sessionStartedAt,
  )
    .filter((row) => scoreEventMatchesFilters(row, filters))
    .slice(-limit)
    .map(scoreEventView);
}

async function listAllScoreRows(roomId: string, filters: ScoreEventFilters) {
  const rows: ScoreEventRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await scoreEventsQuery(roomId, filters)
      .order("created_at", { ascending: true })
      .range(offset, offset + SCORE_EVENT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as ScoreEventRow[];
    rows.push(...page);
    if (page.length < SCORE_EVENT_PAGE_SIZE) return rows;
    offset += SCORE_EVENT_PAGE_SIZE;
  }
}

export async function getScoreLedgerSummary(
  roomId: string,
  scope: ScoreLedgerScope,
  filters: ScoreEventFilters = {},
) {
  await materializeLegacyScoreEvents(roomId);
  const currentRows = scoreRowsForCurrentCycle(
    await listAllScoreRows(roomId, {}),
    scope.currentTeamIds,
    scope.sessionStartedAt,
  );
  return summarizeScoreEvents(currentRows.filter((row) => scoreEventMatchesFilters(row, filters)));
}

function scoreEventMatchesFilters(row: ScoreEventRow, filters: ScoreEventFilters) {
  return (
    (!filters.runId || row.run_id === filters.runId) &&
    (!filters.gameId || row.game_id === filters.gameId) &&
    (!filters.actId || row.act_id === filters.actId) &&
    (!filters.teamId || row.team_id === filters.teamId) &&
    (!filters.playerId || row.player_id === filters.playerId) &&
    (!filters.source || row.source === filters.source)
  );
}

export function scoreEventFilterFromRequest(request: {
  runId?: string;
  gameId?: string;
  actId?: string;
  teamId?: string;
  playerId?: string;
  source?: ScoreEventSource;
}): ScoreEventFilters {
  return {
    runId: request.runId,
    gameId: request.gameId,
    actId: request.actId,
    teamId: request.teamId,
    playerId: request.playerId,
    source: request.source,
  };
}
