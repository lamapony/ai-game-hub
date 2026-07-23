import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { statusError } from "./player-auth.server";
import {
  partyRecordViewsForHost,
  partyRecordViewsForPlayer,
  type CreatePartyRecordInput,
  type PartyRecordFilters,
  type PartyRecordRow,
} from "./party-records";
import type { Player, RoomState } from "./types";

const PARTY_RECORD_QUERY_LIMIT = 500;

export function assertPartyRecordOwner(state: RoomState, input: CreatePartyRecordInput) {
  if (input.ownerPlayerId && !state.players.some((player) => player.id === input.ownerPlayerId)) {
    throw statusError("record owner player not found", 409);
  }
  if (input.ownerTeamId && !state.teams.some((team) => team.id === input.ownerTeamId)) {
    throw statusError("record owner team not found", 409);
  }
}

async function listRows(roomId: string, filters: PartyRecordFilters = {}) {
  let query = supabaseAdmin
    .from("party_records")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(PARTY_RECORD_QUERY_LIMIT);
  if (filters.runId) query = query.eq("run_id", filters.runId);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.createdAtOrAfter !== undefined) {
    query = query.gte("created_at", new Date(filters.createdAtOrAfter).toISOString());
  }
  if (filters.sessionStartedAt !== undefined) {
    query = query.eq("session_started_at", filters.sessionStartedAt);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PartyRecordRow[];
}

/** Server-only raw access for game lifecycle services that must validate sealed payloads. */
export async function listPartyRecordRows(roomId: string, filters: PartyRecordFilters = {}) {
  return listRows(roomId, filters);
}

export function currentPartyRecordFilters(
  state: Pick<RoomState, "party">,
  filters: PartyRecordFilters = {},
): PartyRecordFilters {
  const createdAtOrAfter = state.party?.sessionStartedAt;
  return createdAtOrAfter === undefined
    ? filters
    : { ...filters, createdAtOrAfter, sessionStartedAt: createdAtOrAfter };
}

export async function findPartyRecordByIdempotency(roomId: string, idempotencyKey: string) {
  const { data, error } = await supabaseAdmin
    .from("party_records")
    .select("*")
    .eq("room_id", roomId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return (data as PartyRecordRow | null) ?? null;
}

export function partyRecordIdentityMatches(
  row: PartyRecordRow,
  input: CreatePartyRecordInput,
  actId: string,
  sessionStartedAt: number,
) {
  return (
    row.run_id === input.runId &&
    row.game_id === input.gameId &&
    row.act_id === actId &&
    row.owner_player_id === (input.ownerPlayerId ?? null) &&
    row.owner_team_id === (input.ownerTeamId ?? null) &&
    row.kind === input.kind &&
    row.session_started_at === sessionStartedAt
  );
}

export function resolvePartyRecordWrite(params: {
  inserted: PartyRecordRow | null;
  existing: PartyRecordRow | null;
  input: CreatePartyRecordInput;
  actId: string;
  sessionStartedAt: number;
}) {
  const row = params.inserted ?? params.existing;
  if (!row) throw new Error("party record write did not return a row");
  if (!partyRecordIdentityMatches(row, params.input, params.actId, params.sessionStartedAt)) {
    throw statusError("idempotency key already belongs to another party record", 409);
  }
  return { row, replayed: !params.inserted };
}

export async function createPartyRecord(params: {
  roomId: string;
  state: RoomState;
  input: CreatePartyRecordInput;
}) {
  assertPartyRecordOwner(params.state, params.input);
  const actId = params.state.party?.actId ?? "classic";
  const sessionStartedAt = params.state.party?.sessionStartedAt ?? 0;
  const insert = {
    room_id: params.roomId,
    run_id: params.input.runId,
    game_id: params.input.gameId,
    act_id: actId,
    owner_player_id: params.input.ownerPlayerId ?? null,
    owner_team_id: params.input.ownerTeamId ?? null,
    kind: params.input.kind,
    visibility: params.input.visibility,
    payload: params.input.payload as Json,
    idempotency_key: params.input.idempotencyKey,
    session_started_at: sessionStartedAt,
  };

  const inserted = await supabaseAdmin
    .from("party_records")
    .upsert(insert, {
      onConflict: "room_id,idempotency_key",
      ignoreDuplicates: true,
    })
    .select("*")
    .maybeSingle();
  if (inserted.error) throw inserted.error;

  const insertedRow = inserted.data as PartyRecordRow | null;
  let existingRow: PartyRecordRow | null = null;
  if (!insertedRow) {
    const existing = await supabaseAdmin
      .from("party_records")
      .select("*")
      .eq("room_id", params.roomId)
      .eq("idempotency_key", params.input.idempotencyKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    existingRow = existing.data as PartyRecordRow | null;
  }
  return resolvePartyRecordWrite({
    inserted: insertedRow,
    existing: existingRow,
    input: params.input,
    actId,
    sessionStartedAt,
  });
}

export async function listPartyRecordsForHost(roomId: string, filters: PartyRecordFilters = {}) {
  return partyRecordViewsForHost(await listRows(roomId, filters));
}

export async function listPartyRecordsForPlayer(
  roomId: string,
  player: Player,
  filters: PartyRecordFilters = {},
) {
  return partyRecordViewsForPlayer(await listRows(roomId, filters), player);
}

export async function transitionPartyRecords(params: {
  roomId: string;
  state: Pick<RoomState, "party">;
  runId: string;
  kind?: string;
  transition: "seal" | "reveal";
  now?: Date;
}) {
  const visibility = params.transition === "seal" ? "sealed" : "revealed";
  const fromVisibilities = params.transition === "seal" ? ["player"] : ["player", "sealed"];
  let query = supabaseAdmin
    .from("party_records")
    .update({
      visibility,
      revealed_at: params.transition === "reveal" ? (params.now ?? new Date()).toISOString() : null,
    })
    .eq("room_id", params.roomId)
    .eq("run_id", params.runId)
    .in("visibility", fromVisibilities);
  if (params.kind) query = query.eq("kind", params.kind);
  const sessionStartedAt = params.state.party?.sessionStartedAt;
  if (sessionStartedAt !== undefined) {
    query = query
      .eq("session_started_at", sessionStartedAt)
      .gte("created_at", new Date(sessionStartedAt).toISOString());
  }
  const { data, error } = await query.select("id");
  if (error) throw error;
  return { updated: data?.length ?? 0, visibility };
}
