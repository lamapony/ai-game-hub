import { createFileRoute } from "@tanstack/react-router";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

type HostAccessRequest = {
  code?: unknown;
  hostSecret?: unknown;
};

export const Route = createFileRoute("/api/host-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => null)) as HostAccessRequest | null;
        if (!body || typeof body.code !== "string" || !body.code.trim()) {
          logWarn("api.host_access.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("room code is required", { status: 400 });
        }

        try {
          const room = await authorizeHostRoom({
            code: body.code,
            hostSecret: hostSecretFromRequest(request, body),
          });
          logInfo("api.host_access.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
          });
          return Response.json({ roomId: room.id, code: room.code });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.host_access.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          const denied = status === 401 || status === 403 || status === 404;
          return new Response(denied ? "host access denied" : "host access check failed", {
            status: denied ? status : 500,
          });
        }
      },
    },
  },
});
