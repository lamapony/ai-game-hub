import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { z } from "zod";
import { generateFinaleNarrative } from "@/lib/finale-narrative.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

const requestSchema = z.object({ roomId: z.string().trim().min(1).max(128) }).strict();

export const Route = createFileRoute("/api/finale-narrative")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const parsed = requestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          logWarn("api.finale_narrative.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid finale request", {
            status: 400,
          });
        }
        try {
          const room = await authorizeHostRoom({
            roomId: parsed.data.roomId,
            hostSecret: hostSecretFromRequest(request, {}),
          });
          const result = await generateFinaleNarrative({ roomId: room.id });
          logInfo("api.finale_narrative.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            replayed: result.replayed,
            usedFallback: result.usedFallback,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.finale_narrative.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "finale generation failed",
            status,
          });
        }
      },
    },
  },
});
