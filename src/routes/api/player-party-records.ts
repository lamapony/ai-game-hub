import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerPartyRecordsRequestSchema } from "@/lib/party-records";
import { currentPartyRecordFilters, listPartyRecordsForPlayer } from "@/lib/party-records.server";
import {
  playerSecretHashFromRequest,
  requireAuthorizedPlayer,
  statusError,
} from "@/lib/player-auth.server";
import { migrateRoomState } from "@/lib/room-state-migration";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/player-party-records")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = playerPartyRecordsRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.player_party_records.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid party record request", {
            status: 400,
          });
        }

        const body = parsed.data;
        try {
          const { data, error } = await supabaseAdmin
            .from("rooms")
            .select("id, state")
            .eq("id", body.roomId)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw statusError("room not found", 404);

          const state = migrateRoomState(data.state as unknown as RoomState);
          const player = requireAuthorizedPlayer(
            state,
            body.playerId,
            playerSecretHashFromRequest(request, body),
          );
          const records = await listPartyRecordsForPlayer(
            data.id,
            player,
            currentPartyRecordFilters(state, {
              runId: body.runId,
              kind: body.kind,
            }),
          );

          logInfo("api.player_party_records.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: data.id,
            playerId: player.id,
            recordCount: records.length,
          });
          return Response.json({ records });
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.player_party_records.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "party records failed", status });
        }
      },
    },
  },
});
