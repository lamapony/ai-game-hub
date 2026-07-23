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
  chooseSommelierCrowdFavorite,
  currentSommelierCard,
  nextSommelierCard,
  prepareSommelierSession,
  revealSommelierCard,
  sommelierPlayerStatus,
  submitSommelierGuess,
  submitSommelierPhoto,
} from "@/lib/sommelier.server";
import { sommelierRequestSchema } from "@/lib/sommelier-lifecycle";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/sommelier")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = sommelierRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.sommelier.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid Sommelier request", {
            status: 400,
          });
        }
        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:sommelier:${body.action}`,
          limit: body.action === "status" ? 120 : body.action === "guess" ? 90 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          let roomId: string;
          let result: unknown;
          if (["submit-photo", "status", "guess"].includes(body.action)) {
            const playerBody = body as Extract<
              typeof body,
              { action: "submit-photo" | "status" | "guess" }
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
              playerBody.action === "submit-photo"
                ? await submitSommelierPhoto({
                    roomId,
                    state,
                    player,
                    sessionId: playerBody.sessionId,
                    storagePath: playerBody.storagePath,
                  })
                : playerBody.action === "status"
                  ? await sommelierPlayerStatus({
                      roomId,
                      state,
                      player,
                      sessionId: playerBody.sessionId,
                    })
                  : await submitSommelierGuess({
                      roomId,
                      state,
                      player,
                      sessionId: playerBody.sessionId,
                      entryId: playerBody.entryId,
                      guessedOwnerPlayerId: playerBody.guessedOwnerPlayerId,
                    });
          } else {
            const room = await authorizeHostRoom({
              roomId: body.roomId,
              hostSecret: hostSecretFromRequest(request, { hostSecret: undefined }),
            });
            roomId = room.id;
            result =
              body.action === "prepare"
                ? await prepareSommelierSession({ room, sessionId: body.sessionId })
                : body.action === "current"
                  ? await currentSommelierCard({ room, sessionId: body.sessionId })
                  : body.action === "reveal"
                    ? await revealSommelierCard({
                        room,
                        sessionId: body.sessionId,
                        entryId: body.entryId,
                        allowNoVotes: body.allowNoVotes,
                      })
                    : body.action === "next"
                      ? await nextSommelierCard({
                          room,
                          sessionId: body.sessionId,
                          entryId: body.entryId,
                        })
                      : body.action === "crowd-favorite"
                        ? await chooseSommelierCrowdFavorite({
                            room,
                            sessionId: body.sessionId,
                            entryId: body.entryId,
                          })
                        : (() => {
                            throw statusError("unknown Sommelier action", 400);
                          })();
          }

          logInfo("api.sommelier.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId,
            sessionId: body.sessionId,
            action: body.action,
            playerId:
              body.action === "submit-photo" || body.action === "status" || body.action === "guess"
                ? body.playerId
                : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.sommelier.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            sessionId: body.sessionId,
            action: body.action,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "Sommelier failed", status });
        }
      },
    },
  },
});
