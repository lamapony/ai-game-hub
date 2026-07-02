import { createFileRoute } from "@tanstack/react-router";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/host-state")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:host-state",
          limit: 180,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.host_state.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }

        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          hostSecret?: unknown;
          state?: unknown;
        };
        if (typeof body.code !== "string" || !body.state || typeof body.state !== "object") {
          logWarn("api.host_state.invalid", { durationMs: Date.now() - startedAt, status: 400 });
          return new Response("code and state required", { status: 400 });
        }

        const { authorizeHostRoom, hostSecretFromRequest, writeAuthorizedRoomState } =
          await import("@/lib/host-auth.server");

        try {
          const room = await authorizeHostRoom({
            code: body.code,
            hostSecret: hostSecretFromRequest(request, body),
          });
          const nextState = body.state as RoomState;
          await writeAuthorizedRoomState(room.id, nextState);
          logInfo("api.host_state.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            currentGame: nextState.currentGame ?? undefined,
          });
          return Response.json({ state: nextState });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.host_state.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return new Response(error instanceof Error ? error.message : "host state failed", {
            status,
          });
        }
      },
    },
  },
});
