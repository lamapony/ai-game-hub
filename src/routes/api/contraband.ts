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
import { contrabandRequestSchema } from "@/lib/contraband-lifecycle";
import {
  accuseContraband,
  assignContrabandPhrases,
  contrabandHostCase,
  contrabandPlayerAssignment,
  finalizeContraband,
  manuallyResolveContraband,
  respondToContrabandAccusation,
  submitContrabandAudio,
} from "@/lib/contraband.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

const PLAYER_ACTIONS = ["assignment", "accuse", "respond", "submit-audio"] as const;

export const Route = createFileRoute("/api/contraband")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const raw = await request.json().catch(() => null);
        const parsed = contrabandRequestSchema.safeParse(raw);
        if (!parsed.success) {
          logWarn("api.contraband.invalid", {
            status: 400,
            durationMs: Date.now() - startedAt,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid Contraband request", {
            status: 400,
          });
        }
        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:contraband:${body.action}`,
          limit: body.action === "assignment" || body.action === "case" ? 120 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          let result: unknown;
          let roomId: string;
          if ((PLAYER_ACTIONS as readonly string[]).includes(body.action)) {
            const playerBody = body as Extract<
              typeof body,
              { action: "assignment" | "accuse" | "respond" | "submit-audio" }
            >;
            const { data, error } = await supabaseAdmin
              .from("rooms")
              .select("id, state")
              .eq("id", playerBody.roomId)
              .maybeSingle();
            if (error) throw error;
            if (!data) throw statusError("room not found", 404);
            const state = migrateRoomState(data.state as unknown as RoomState);
            const player = requireAuthorizedPlayer(
              state,
              playerBody.playerId,
              playerSecretHashFromRequest(request, playerBody),
            );
            roomId = data.id;
            result =
              playerBody.action === "assignment"
                ? await contrabandPlayerAssignment({
                    roomId,
                    state,
                    player,
                    runId: playerBody.runId,
                  })
                : playerBody.action === "accuse"
                  ? await accuseContraband({
                      roomId,
                      state,
                      player,
                      runId: playerBody.runId,
                      accusedPlayerId: playerBody.accusedPlayerId,
                      suspectedQuote: playerBody.suspectedQuote,
                    })
                  : playerBody.action === "respond"
                    ? await respondToContrabandAccusation({
                        roomId,
                        state,
                        player,
                        runId: playerBody.runId,
                        accusationId: playerBody.accusationId,
                        response: playerBody.response,
                      })
                    : await submitContrabandAudio({
                        roomId,
                        state,
                        player,
                        runId: playerBody.runId,
                        accusationId: playerBody.accusationId,
                        storagePath: playerBody.storagePath,
                        durationSeconds: playerBody.durationSeconds,
                      });
          } else {
            const room = await authorizeHostRoom({
              roomId: body.roomId,
              hostSecret: hostSecretFromRequest(request, { hostSecret: undefined }),
            });
            roomId = room.id;
            result =
              body.action === "assign"
                ? await assignContrabandPhrases({ room, runId: body.runId })
                : body.action === "case"
                  ? await contrabandHostCase({ room, runId: body.runId })
                  : body.action === "resolve"
                    ? await manuallyResolveContraband({
                        room,
                        runId: body.runId,
                        accusationId: body.accusationId,
                        outcome: body.outcome,
                      })
                    : body.action === "finalize"
                      ? await finalizeContraband({ room, runId: body.runId })
                      : (() => {
                          throw statusError("unknown Contraband action", 400);
                        })();
          }
          logInfo("api.contraband.success", {
            status: 200,
            durationMs: Date.now() - startedAt,
            roomId,
            runId: body.runId,
            action: body.action,
            playerId: "playerId" in body ? body.playerId : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.contraband.failure", error, {
            status,
            durationMs: Date.now() - startedAt,
            runId: body.runId,
            action: body.action,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "Contraband failed", status });
        }
      },
    },
  },
});
