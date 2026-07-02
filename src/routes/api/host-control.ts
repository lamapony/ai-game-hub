import { createFileRoute } from "@tanstack/react-router";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/host-control")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:host-control",
          limit: 120,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.host_control.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }

        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          hostSecret?: unknown;
          action?: unknown;
        };
        if (typeof body.code !== "string" || typeof body.action !== "string") {
          logWarn("api.host_control.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("code and action required", { status: 400 });
        }

        const { authorizeHostRoom, hostSecretFromRequest, writeAuthorizedRoomState } =
          await import("@/lib/host-auth.server");
        const { applyHostControlAction } = await import("@/lib/host-control-actions.server");

        try {
          const room = await authorizeHostRoom({
            code: body.code,
            hostSecret: hostSecretFromRequest(request, body),
          });
          const nextState = await applyHostControlAction(room.state, body as never);
          await writeAuthorizedRoomState(room.id, nextState);
          logInfo("api.host_control.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            action: body.action,
            currentGame: nextState.currentGame ?? undefined,
          });
          return Response.json({ state: nextState });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.host_control.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return new Response(error instanceof Error ? error.message : "host control failed", {
            status,
          });
        }
      },
    },
  },
});
