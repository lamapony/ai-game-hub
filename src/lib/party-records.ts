import { z } from "zod";
import type { PartyActId } from "./party-context";
import type { Json, Tables } from "@/integrations/supabase/types";

export const PARTY_RECORD_VISIBILITIES = ["player", "host", "sealed", "revealed"] as const;
export const PARTY_RECORD_INITIAL_VISIBILITIES = ["player", "host"] as const;
export const PARTY_RECORD_PAYLOAD_MAX_BYTES = 65_536;

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

const payloadSchema = z.record(z.unknown()).superRefine((payload, context) => {
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > PARTY_RECORD_PAYLOAD_MAX_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "payload is too large" });
  }
});

const addressFields = {
  roomId: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().min(1).max(16).optional(),
  hostSecret: z.string().trim().min(1).max(256).optional(),
};

const listFilterFields = {
  runId: safeIdSchema,
  kind: safeIdSchema.optional(),
};

const hostListRequestSchema = z
  .object({
    ...addressFields,
    action: z.literal("list"),
    ...listFilterFields,
  })
  .strict();

const hostCreateRequestSchema = z
  .object({
    ...addressFields,
    action: z.literal("create"),
    idempotencyKey: idempotencyKeySchema,
    runId: safeIdSchema,
    gameId: safeIdSchema,
    ownerPlayerId: safeIdSchema.optional(),
    ownerTeamId: safeIdSchema.optional(),
    kind: safeIdSchema,
    visibility: z.enum(PARTY_RECORD_INITIAL_VISIBILITIES),
    payload: payloadSchema,
  })
  .strict()
  .refine((value) => !(value.ownerPlayerId && value.ownerTeamId), {
    message: "record cannot have both player and team owners",
    path: ["ownerPlayerId"],
  })
  .refine(
    (value) => value.visibility !== "player" || Boolean(value.ownerPlayerId || value.ownerTeamId),
    {
      message: "player-visible record requires an owner",
      path: ["ownerPlayerId"],
    },
  );

const hostTransitionRequestSchema = z
  .object({
    ...addressFields,
    action: z.enum(["seal-run", "reveal-run"]),
    runId: safeIdSchema,
    kind: safeIdSchema,
  })
  .strict();

export const hostPartyRecordsRequestSchema = z
  .union([hostListRequestSchema, hostCreateRequestSchema, hostTransitionRequestSchema])
  .refine((value) => Boolean(value.roomId || value.code), {
    message: "roomId or code required",
    path: ["roomId"],
  });

export const playerPartyRecordsRequestSchema = z
  .object({
    roomId: z.string().trim().min(1).max(128),
    playerId: safeIdSchema,
    playerSecret: z.string().trim().min(16).max(200).optional(),
    action: z.literal("list"),
    ...listFilterFields,
  })
  .strict();

export type PartyRecordRow = Tables<"party_records">;
export type PartyRecordVisibility = (typeof PARTY_RECORD_VISIBILITIES)[number];
export type HostPartyRecordsRequest = z.infer<typeof hostPartyRecordsRequestSchema>;
export type PlayerPartyRecordsRequest = z.infer<typeof playerPartyRecordsRequestSchema>;
export type PartyRecordFilters = {
  runId?: string;
  kind?: string;
  createdAtOrAfter?: number;
  sessionStartedAt?: number;
};

export type CreatePartyRecordInput = {
  idempotencyKey: string;
  runId: string;
  gameId: string;
  ownerPlayerId?: string;
  ownerTeamId?: string;
  kind: string;
  visibility: "player" | "host";
  payload: Record<string, unknown>;
};

export type PartyRecordView = {
  id: string;
  runId: string;
  gameId: string;
  actId: PartyActId;
  ownerPlayerId?: string;
  ownerTeamId?: string;
  kind: string;
  visibility: PartyRecordVisibility;
  createdAt: string;
  revealedAt?: string;
  payloadRedacted: boolean;
  payload?: Json;
};

function recordView(
  row: PartyRecordRow,
  canReadPayload: boolean,
  canReadOwner = true,
): PartyRecordView {
  return {
    id: row.id,
    runId: row.run_id,
    gameId: row.game_id,
    actId: row.act_id as PartyActId,
    ownerPlayerId: canReadOwner ? (row.owner_player_id ?? undefined) : undefined,
    ownerTeamId: canReadOwner ? (row.owner_team_id ?? undefined) : undefined,
    kind: row.kind,
    visibility: row.visibility as PartyRecordVisibility,
    createdAt: row.created_at,
    revealedAt: row.revealed_at ?? undefined,
    payloadRedacted: !canReadPayload,
    ...(canReadPayload ? { payload: row.payload } : {}),
  };
}

/** Hosts can count all assignments, but cannot inspect player secrets or sealed content. */
export function partyRecordViewsForHost(rows: PartyRecordRow[]): PartyRecordView[] {
  return rows.map((row) => {
    const canRead = row.visibility === "host" || row.visibility === "revealed";
    return recordView(row, canRead, canRead);
  });
}

/** Players see their own/team secrets until sealed, plus records revealed to the room. */
export function partyRecordViewsForPlayer(
  rows: PartyRecordRow[],
  player: { id: string; teamId: string },
): PartyRecordView[] {
  return rows.flatMap((row) => {
    if (row.visibility === "host") return [];
    if (row.visibility === "revealed") return [recordView(row, true)];

    const isOwner =
      row.owner_player_id === player.id ||
      (row.owner_team_id !== null && row.owner_team_id === player.teamId);
    if (!isOwner) return [];
    return [recordView(row, row.visibility === "player")];
  });
}
