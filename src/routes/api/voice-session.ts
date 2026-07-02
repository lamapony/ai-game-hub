import { createFileRoute } from "@tanstack/react-router";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/voice-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:voice-session",
          limit: 20,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.voice_session.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }

        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          hostSecret?: unknown;
        };
        if (typeof body.code !== "string") {
          logWarn("api.voice_session.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("code required", { status: 400 });
        }

        const { authorizeHostRoom, hostSecretFromRequest } = await import("@/lib/host-auth.server");
        const { createVoiceSession, voiceProviderConfig } =
          await import("@/lib/voice-provider.server");

        try {
          const room = await authorizeHostRoom({
            code: body.code,
            hostSecret: hostSecretFromRequest(request, body),
          });
          const config = voiceProviderConfig();
          const session = await createVoiceSession();
          logInfo("api.voice_session.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            provider: session.provider,
            model: session.model,
            preference: config.preference,
          });
          return Response.json({
            ...session,
            configured: {
              openai: config.openaiConfigured,
              xai: config.xaiConfigured,
              preference: config.preference,
            },
          });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 502;
          logError("api.voice_session.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return new Response(error instanceof Error ? error.message : "voice session failed", {
            status,
          });
        }
      },
    },
  },
});
