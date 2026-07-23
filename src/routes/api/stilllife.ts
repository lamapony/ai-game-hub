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
import {
  finalizeStillLifeRound,
  judgeStillLifeRound,
  listStillLifeGallery,
  nextStillLifeRound,
  prepareStillLifeRound,
  submitStillLifePhoto,
  submitStillLifeVote,
} from "@/lib/stilllife.server";
import { stillLifeRequestSchema } from "@/lib/stilllife-lifecycle";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/stilllife")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = stillLifeRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.stilllife.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid Still Life request", {
            status: 400,
          });
        }
        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:stilllife:${body.action}`,
          limit: body.action === "vote" ? 90 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          let roomId: string;
          let result: unknown;
          if (body.action === "submit-photo" || body.action === "vote") {
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
              body.action === "submit-photo"
                ? await submitStillLifePhoto({
                    roomId,
                    state,
                    player,
                    roundId: body.roundId,
                    storagePath: body.storagePath,
                  })
                : await submitStillLifeVote({
                    roomId,
                    state,
                    player,
                    roundId: body.roundId,
                    teamId: body.teamId,
                  });
          } else {
            const room = await authorizeHostRoom({
              roomId: body.roomId,
              hostSecret: hostSecretFromRequest(request, { hostSecret: undefined }),
            });
            roomId = room.id;
            result =
              body.action === "prepare"
                ? await prepareStillLifeRound({ room, roundId: body.roundId })
                : body.action === "gallery"
                  ? await listStillLifeGallery({ room, roundId: body.roundId })
                  : body.action === "judge"
                    ? await judgeStillLifeRound({
                        room,
                        roundId: body.roundId,
                        manualScores: body.manualScores,
                      })
                    : body.action === "finalize"
                      ? await finalizeStillLifeRound({
                          room,
                          roundId: body.roundId,
                          allowNoVotes: body.allowNoVotes,
                        })
                      : await nextStillLifeRound({ room, roundId: body.roundId });
          }

          logInfo("api.stilllife.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId,
            roundId: body.roundId,
            action: body.action,
            playerId:
              body.action === "submit-photo" || body.action === "vote" ? body.playerId : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.stilllife.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            roundId: body.roundId,
            action: body.action,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "Still Life failed", status });
        }
      },
    },
  },
});
