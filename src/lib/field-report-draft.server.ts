import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  assertCurrentFieldReportRun,
  buildFieldReportDraftPayload,
  fieldReportDraftIdentity,
  fieldReportDraftRowMatches,
  mergeFieldReportDraftObservations,
  parseFieldReportDraftRow,
  type FieldReportDraft,
} from "./field-report-draft-store";
import { nextFieldReportDraftUpdatedAt } from "./field-report-draft";
import { statusError } from "./player-auth.server";
import { createPartyRecord, findPartyRecordByIdempotency } from "./party-records.server";
import type { PartyRecordRow } from "./party-records";
import type { FieldReportObservations } from "./field-report";
import type { RoomState } from "./types";

export async function loadFieldReportDraft(params: {
  roomId: string;
  state: RoomState;
  configuredAt: number;
}): Promise<FieldReportDraft | null> {
  assertCurrentFieldReportRun(params.state, params.configuredAt);
  const identity = fieldReportDraftIdentity(params.configuredAt);
  const row = await findPartyRecordByIdempotency(params.roomId, identity.idempotencyKey);
  return row ? parseFieldReportDraftRow(row, params.configuredAt) : null;
}

export async function saveFieldReportDraft(params: {
  roomId: string;
  state: RoomState;
  configuredAt: number;
  observations: FieldReportObservations;
  baseObservations?: FieldReportObservations;
  now?: number;
}): Promise<FieldReportDraft> {
  assertCurrentFieldReportRun(params.state, params.configuredAt);
  const identity = fieldReportDraftIdentity(params.configuredAt);
  let existing = await findPartyRecordByIdempotency(params.roomId, identity.idempotencyKey);

  if (!existing) {
    const payload = buildFieldReportDraftPayload({
      configuredAt: params.configuredAt,
      observations: params.observations,
      updatedAt: params.now ?? Date.now(),
    });
    const created = await createPartyRecord({
      roomId: params.roomId,
      state: params.state,
      input: {
        ...identity,
        visibility: "host",
        payload,
      },
    });
    if (!created.replayed) return parseFieldReportDraftRow(created.row, params.configuredAt);
    existing = created.row;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!fieldReportDraftRowMatches(existing, params.configuredAt)) {
      throw statusError("field report draft identity mismatch", 409);
    }
    const current = parseFieldReportDraftRow(existing, params.configuredAt);
    const observations = mergeFieldReportDraftObservations(
      current.observations,
      params.observations,
      params.baseObservations,
    );
    const payload = buildFieldReportDraftPayload({
      configuredAt: params.configuredAt,
      observations,
      updatedAt: nextFieldReportDraftUpdatedAt(current.updatedAt, params.now ?? Date.now()),
    });
    const { data, error } = await supabaseAdmin
      .from("party_records")
      .update({
        act_id: params.state.party?.actId ?? "classic",
        payload: payload as Json,
      })
      .eq("id", existing.id)
      .eq("room_id", params.roomId)
      .eq("payload->>updatedAt", String(current.updatedAt))
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data) return parseFieldReportDraftRow(data as PartyRecordRow, params.configuredAt);

    const refreshed = await findPartyRecordByIdempotency(params.roomId, identity.idempotencyKey);
    if (!refreshed) break;
    existing = refreshed;
  }
  throw statusError("field report draft changed too many times; retry the save", 409);
}
