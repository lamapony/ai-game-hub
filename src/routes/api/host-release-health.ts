import { createFileRoute } from "@tanstack/react-router";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { checkReleaseHealth } from "@/lib/release-health.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

type ReleaseHealthRequest = {
  roomId?: unknown;
  hostSecret?: unknown;
};

export const Route = createFileRoute("/api/host-release-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => null)) as ReleaseHealthRequest | null;
        if (!body || typeof body.roomId !== "string" || !body.roomId) {
          logWarn("api.host_release_health.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("roomId is required", { status: 400 });
        }

        try {
          const room = await authorizeHostRoom({
            roomId: body.roomId,
            hostSecret: hostSecretFromRequest(request, body),
          });
          const report = await checkReleaseHealth();
          logInfo("api.host_release_health.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            releaseStatus: report.status,
            failedChecks: report.checks
              .filter((check) => !check.ready)
              .map((check) => check.id)
              .join(","),
          });
          return Response.json(report);
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.host_release_health.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return new Response(status === 403 ? "forbidden" : "backend preflight failed", {
            status,
          });
        }
      },
    },
  },
});
