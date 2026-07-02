import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/speaker-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:speaker-status",
          limit: 240,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.speaker_status.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }

        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          slot?: unknown;
          connected?: unknown;
        };
        if (typeof body.code !== "string") {
          logWarn("api.speaker_status.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("code required", { status: 400 });
        }

        try {
          const { data, error } = await supabaseAdmin
            .from("rooms")
            .select("id, code, state")
            .eq("code", body.code.trim().toUpperCase())
            .maybeSingle();
          if (error) throw error;
          if (!data) return new Response("room not found", { status: 404 });

          const { applySpeakerStatus } = await import("@/lib/speaker-actions.server");
          const nextState = applySpeakerStatus(data.state as unknown as RoomState, body as never);
          const { error: writeError } = await supabaseAdmin
            .from("rooms")
            .update({ state: nextState as never })
            .eq("id", data.id);
          if (writeError) throw writeError;

          logInfo("api.speaker_status.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: data.id,
            slot: typeof body.slot === "number" ? body.slot : undefined,
            connected: body.connected === true,
          });
          return Response.json({ state: nextState });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.speaker_status.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return new Response(error instanceof Error ? error.message : "speaker status failed", {
            status,
          });
        }
      },
    },
  },
});
