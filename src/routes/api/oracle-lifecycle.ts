import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import {
  revealOracleRun,
  sealOracleRun,
  verifyOraclePredictions,
} from "@/lib/grilloracle-lifecycle.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { oracleLifecycleRequestSchema } from "@/lib/oracle-lifecycle";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/oracle-lifecycle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = oracleLifecycleRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.oracle_lifecycle.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response(
            parsed.error.issues[0]?.message ?? "invalid oracle lifecycle request",
            {
              status: 400,
            },
          );
        }

        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:oracle-lifecycle:${body.action}`,
          limit: body.action === "verify" ? 90 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          const room = await authorizeHostRoom({
            roomId: body.roomId,
            code: body.code,
            hostSecret: hostSecretFromRequest(request, body),
          });
          const result =
            body.action === "seal"
              ? await sealOracleRun({
                  room,
                  runId: body.runId,
                  allowIncomplete: body.allowIncomplete,
                })
              : body.action === "reveal"
                ? await revealOracleRun({ room, runId: body.runId })
                : await verifyOraclePredictions({
                    room,
                    runId: body.runId,
                    playerId: body.playerId,
                    results: body.results,
                  });

          logInfo("api.oracle_lifecycle.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            runId: body.runId,
            action: body.action,
            playerId: body.action === "verify" ? body.playerId : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.oracle_lifecycle.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            runId: body.runId,
            action: body.action,
            playerId: body.action === "verify" ? body.playerId : undefined,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "oracle lifecycle failed",
            status,
          });
        }
      },
    },
  },
});
