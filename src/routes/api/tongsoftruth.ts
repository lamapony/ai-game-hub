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
import { tongsRequestSchema } from "@/lib/tongsoftruth-lifecycle";
import {
  manuallyResolveTongs,
  nextTongsRound,
  prepareTongsQuestion,
  skipTongsRound,
  startTongsRecording,
  submitTongsAudio,
  tongsHostCase,
} from "@/lib/tongsoftruth.server";
import type { RoomState } from "@/lib/types";

const PLAYER_ACTIONS = ["start", "submit-audio"] as const;

export const Route = createFileRoute("/api/tongsoftruth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const raw = await request.json().catch(() => null);
        const parsed = tongsRequestSchema.safeParse(raw);
        if (!parsed.success) {
          logWarn("api.tongsoftruth.invalid", {
            status: 400,
            durationMs: Date.now() - startedAt,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid Tongs request", {
            status: 400,
          });
        }
        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:tongsoftruth:${body.action}`,
          limit: body.action === "case" ? 120 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          let result: unknown;
          let roomId: string;
          if ((PLAYER_ACTIONS as readonly string[]).includes(body.action)) {
            const playerBody = body as Extract<typeof body, { action: "start" | "submit-audio" }>;
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
              playerBody.action === "start"
                ? await startTongsRecording({
                    roomId,
                    state,
                    player,
                    runId: playerBody.runId,
                  })
                : await submitTongsAudio({
                    roomId,
                    state,
                    player,
                    runId: playerBody.runId,
                    roundId: playerBody.roundId,
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
              body.action === "prepare"
                ? await prepareTongsQuestion({ room, runId: body.runId })
                : body.action === "case"
                  ? await tongsHostCase({ room, runId: body.runId })
                  : body.action === "manual-verdict"
                    ? await manuallyResolveTongs({
                        room,
                        runId: body.runId,
                        roundId: body.roundId,
                        honestyScore: body.honestyScore,
                        dodgeDetected: body.dodgeDetected,
                        artistryScore: body.artistryScore,
                        environmentUsed: body.environmentUsed,
                        comment: body.comment,
                      })
                    : body.action === "skip"
                      ? await skipTongsRound({
                          room,
                          runId: body.runId,
                          roundId: body.roundId,
                        })
                      : body.action === "next"
                        ? await nextTongsRound({
                            room,
                            runId: body.runId,
                            roundId: body.roundId,
                          })
                        : (() => {
                            throw statusError("unknown Tongs action", 400);
                          })();
          }
          logInfo("api.tongsoftruth.success", {
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
          logError("api.tongsoftruth.failure", error, {
            status,
            durationMs: Date.now() - startedAt,
            runId: body.runId,
            action: body.action,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "Tongs of Truth failed",
            status,
          });
        }
      },
    },
  },
});
