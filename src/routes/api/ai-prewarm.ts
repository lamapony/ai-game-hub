import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { z } from "zod";
import { AI_PREWARM_GAME_IDS } from "@/lib/ai-prewarm";
import { prewarmAiGame } from "@/lib/ai-prewarm.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { PARTY_ACT_IDS } from "@/lib/party-context";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

const requestSchema = z
  .object({
    roomId: z.string().trim().min(1).max(128),
    gameId: z.enum(AI_PREWARM_GAME_IDS),
    targetActId: z.enum(PARTY_ACT_IDS),
  })
  .strict();

export const Route = createFileRoute("/api/ai-prewarm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const raw = await request.json().catch(() => null);
        const parsed = requestSchema.safeParse(raw);
        if (!parsed.success) {
          logWarn("api.ai_prewarm.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid prewarm request", {
            status: 400,
          });
        }
        try {
          const room = await authorizeHostRoom({
            roomId: parsed.data.roomId,
            hostSecret: hostSecretFromRequest(request, {}),
          });
          const result = await prewarmAiGame({ room, ...parsed.data });
          logInfo("api.ai_prewarm.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            gameId: parsed.data.gameId,
            targetActId: parsed.data.targetActId,
            replayed: result.replayed,
            usedFallback: result.record.usedFallback,
          });
          return Response.json({
            prepared: {
              gameId: result.record.gameId,
              targetActId: result.record.targetActId,
              participantCount: result.record.participantIds.length,
              preparedAt: result.record.preparedAt,
              usedFallback: result.record.usedFallback,
            },
            replayed: result.replayed,
          });
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.ai_prewarm.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            gameId: parsed.data.gameId,
            targetActId: parsed.data.targetActId,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "AI preparation failed",
            status,
          });
        }
      },
    },
  },
});
