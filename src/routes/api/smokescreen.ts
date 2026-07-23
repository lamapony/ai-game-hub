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
import { smokeScreenRequestSchema } from "@/lib/smokescreen-lifecycle";
import {
  assignSmokeScreenMissions,
  finalizeSmokeScreenRun,
  revealSmokeScreenRun,
  sealSmokeScreenRun,
  submitSmokeScreenVote,
} from "@/lib/smokescreen.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/smokescreen")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = smokeScreenRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.smokescreen.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid Smoke Screen request", {
            status: 400,
          });
        }
        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:smokescreen:${body.action}`,
          limit: body.action === "vote" ? 90 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          let roomId: string;
          let result: unknown;
          if (body.action === "vote") {
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
            result = await submitSmokeScreenVote({
              roomId,
              state,
              player,
              runId: body.runId,
              guesses: body.guesses,
            });
          } else {
            const room = await authorizeHostRoom({
              roomId: body.roomId,
              hostSecret: hostSecretFromRequest(request, { hostSecret: undefined }),
            });
            roomId = room.id;
            result =
              body.action === "assign"
                ? await assignSmokeScreenMissions({ room, runId: body.runId })
                : body.action === "seal"
                  ? await sealSmokeScreenRun({
                      room,
                      runId: body.runId,
                      allowIncomplete: body.allowIncomplete,
                    })
                  : body.action === "reveal"
                    ? await revealSmokeScreenRun({ room, runId: body.runId })
                    : await finalizeSmokeScreenRun({
                        room,
                        runId: body.runId,
                        completedMissionIds: body.completedMissionIds,
                      });
          }

          logInfo("api.smokescreen.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId,
            runId: body.runId,
            action: body.action,
            playerId: body.action === "vote" ? body.playerId : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.smokescreen.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            runId: body.runId,
            action: body.action,
            playerId: body.action === "vote" ? body.playerId : undefined,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "Smoke Screen failed", status });
        }
      },
    },
  },
});
