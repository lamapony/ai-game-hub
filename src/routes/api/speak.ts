// TTS endpoint: returns an MP3 stream for a given text. Cached by browser via query string.
import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/speak")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startedAt = Date.now();
        const url = new URL(request.url);
        const text = (url.searchParams.get("text") ?? "").slice(0, 600);
        const voice = url.searchParams.get("voice") ?? "alloy";
        const roomId = (url.searchParams.get("roomId") ?? "").trim();
        if (!text || !roomId) {
          logWarn("api.speak.invalid", { durationMs: Date.now() - startedAt, status: 400 });
          return new Response("text and roomId required", { status: 400 });
        }
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:speak",
          limit: 180,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.speak.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }
        const { speakWithRoomBudget } = await import("@/lib/ai-budget.server");
        try {
          const buf = await speakWithRoomBudget({ roomId, text, voice });
          logInfo("api.speak.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            textChars: text.length,
            voice,
            roomId,
          });
          return new Response(buf, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (e) {
          logError("api.speak.failure", e, {
            durationMs: Date.now() - startedAt,
            status: 502,
            textChars: text.length,
            voice,
            roomId,
          });
          const status = publicApiErrorStatus(e, 502);
          return publicApiErrorResponse(e, { fallbackMessage: "TTS failed", status });
        }
      },
    },
  },
});
