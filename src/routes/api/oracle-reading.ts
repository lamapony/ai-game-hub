import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { z } from "zod";
import { ORACLE_DONENESS_LEVELS, ORACLE_ITEM_CATEGORIES } from "@/games/grilloracle/model";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import {
  createOracleHostFallbackRecord,
  createOracleVisionRecord,
  loadOracleRoom,
  oracleReadingResponseBody,
} from "@/lib/grilloracle.server";
import { playerSecretHashFromRequest, requireAuthorizedPlayer } from "@/lib/player-auth.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

const safeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9:_-]+$/, "contains unsupported characters");

const analyzeRequestSchema = z
  .object({
    action: z.literal("analyze"),
    roomId: z.string().trim().min(1).max(128),
    playerId: safeIdSchema,
    playerSecret: z.string().trim().min(16).max(200).optional(),
    roundId: safeIdSchema,
    storagePath: z.string().trim().min(1).max(512),
  })
  .strict();

const fallbackRequestSchema = z
  .object({
    action: z.literal("host-fallback"),
    roomId: z.string().trim().min(1).max(128),
    hostSecret: z.string().trim().min(1).max(256).optional(),
    playerId: safeIdSchema,
    roundId: safeIdSchema,
    itemCategory: z.enum(ORACLE_ITEM_CATEGORIES),
    doneness: z.enum(ORACLE_DONENESS_LEVELS),
  })
  .strict();

const oracleReadingRequestSchema = z.discriminatedUnion("action", [
  analyzeRequestSchema,
  fallbackRequestSchema,
]);

export const Route = createFileRoute("/api/oracle-reading")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = oracleReadingRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.oracle_reading.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid oracle request", {
            status: 400,
          });
        }

        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:oracle-reading:${body.action}`,
          limit: body.action === "analyze" ? 30 : 120,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.oracle_reading.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            action: body.action,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }
        try {
          const result =
            body.action === "analyze"
              ? await (async () => {
                  const room = await loadOracleRoom(body.roomId);
                  const player = requireAuthorizedPlayer(
                    room.state,
                    body.playerId,
                    playerSecretHashFromRequest(request, body),
                  );
                  return createOracleVisionRecord({
                    roomId: room.id,
                    state: room.state,
                    player,
                    roundId: body.roundId,
                    storagePath: body.storagePath,
                  });
                })()
              : await (async () => {
                  const room = await authorizeHostRoom({
                    roomId: body.roomId,
                    hostSecret: hostSecretFromRequest(request, body),
                  });
                  return createOracleHostFallbackRecord({
                    room,
                    roundId: body.roundId,
                    playerId: body.playerId,
                    itemCategory: body.itemCategory,
                    doneness: body.doneness,
                  });
                })();

          logInfo("api.oracle_reading.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: body.roomId,
            action: body.action,
            playerId: body.playerId,
            replayed: result.replayed,
          });
          return Response.json(oracleReadingResponseBody(body.action, result));
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.oracle_reading.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            roomId: body.roomId,
            action: body.action,
            playerId: body.playerId,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "oracle reading failed",
            status,
          });
        }
      },
    },
  },
});
