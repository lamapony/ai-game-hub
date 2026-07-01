// Scheduled/admin cleanup endpoint for old party rooms and uploaded media.
import { createFileRoute } from "@tanstack/react-router";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  return authorization.slice("bearer ".length).trim();
}

export const Route = createFileRoute("/api/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cleanupSecret = process.env.CLEANUP_SECRET;
        if (!cleanupSecret) return new Response("cleanup not configured", { status: 503 });

        const token = getBearerToken(request) ?? request.headers.get("x-cleanup-secret") ?? "";
        if (!timingSafeEqual(token, cleanupSecret)) {
          return new Response("unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const body = await request
          .json()
          .catch(() => ({}) as { retentionHours?: unknown; dryRun?: unknown });
        const retentionHoursRaw = body.retentionHours ?? url.searchParams.get("retentionHours");
        const dryRunRaw = body.dryRun ?? url.searchParams.get("dryRun");
        const retentionHours =
          typeof retentionHoursRaw === "number" ? retentionHoursRaw : Number(retentionHoursRaw);
        const dryRun =
          dryRunRaw === true || dryRunRaw === "true" || dryRunRaw === "1" || dryRunRaw === 1;

        const { cleanupOldRooms } = await import("@/lib/cleanup.server");
        const result = await cleanupOldRooms({ retentionHours, dryRun });
        const status = result.errors.length > 0 ? 207 : 200;
        return Response.json(result, { status });
      },
    },
  },
});
