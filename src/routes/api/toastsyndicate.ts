import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import {
  playerSecretHashFromRequest,
  requireAuthorizedPlayer,
  statusError,
} from "@/lib/player-auth.server";
import { migrateRoomState } from "@/lib/room-state-migration";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import { toastSyndicateRequestSchema } from "@/lib/toastsyndicate-lifecycle";
import {
  assignToastSyndicateRound,
  finalizeToastSyndicateRound,
  nextToastSyndicateRound,
  startToastSyndicateRecording,
  submitToastSyndicateCatch,
  submitToastSyndicateRecording,
} from "@/lib/toastsyndicate.server";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/toastsyndicate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = toastSyndicateRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.toastsyndicate.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid toast request", {
            status: 400,
          });
        }
        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:toastsyndicate:${body.action}`,
          limit: body.action === "catch" ? 90 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          let roomId: string;
          let result: unknown;
          if (body.action === "catch" || body.action === "submit-recording") {
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
            roomId = data.id;
            result =
              body.action === "catch"
                ? await submitToastSyndicateCatch({
                    roomId,
                    state,
                    player,
                    roundId: body.roundId,
                    guesses: body.guesses,
                  })
                : await submitToastSyndicateRecording({
                    roomId,
                    state,
                    player,
                    roundId: body.roundId,
                    storagePath: body.storagePath,
                    durationSeconds: body.durationSeconds,
                  });
          } else {
            const room = await authorizeHostRoom({
              roomId: body.roomId,
              hostSecret: hostSecretFromRequest(request, { hostSecret: undefined }),
            });
            roomId = room.id;
            result =
              body.action === "assign"
                ? await assignToastSyndicateRound({ room, roundId: body.roundId })
                : body.action === "start-recording"
                  ? await startToastSyndicateRecording({ room, roundId: body.roundId })
                  : body.action === "finalize"
                    ? await finalizeToastSyndicateRound({ room, roundId: body.roundId })
                    : await nextToastSyndicateRound({ room, roundId: body.roundId });
          }

          logInfo("api.toastsyndicate.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId,
            roundId: body.roundId,
            action: body.action,
            playerId:
              body.action === "catch" || body.action === "submit-recording"
                ? body.playerId
                : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.toastsyndicate.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            roundId: body.roundId,
            action: body.action,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "Toast Syndicate failed",
            status,
          });
        }
      },
    },
  },
});
