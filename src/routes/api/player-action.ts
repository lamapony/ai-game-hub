import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/player-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:player-action",
          limit: 180,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.player_action.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }

        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          action?: unknown;
          playerId?: unknown;
        };
        if (typeof body.code !== "string" || typeof body.action !== "string") {
          logWarn("api.player_action.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("code and action required", { status: 400 });
        }

        try {
          const { data, error } = await supabaseAdmin
            .from("rooms")
            .select("id, code, state")
            .eq("code", body.code.trim().toUpperCase())
            .maybeSingle();
          if (error) throw error;
          if (!data) return new Response("room not found", { status: 404 });

          const { applyPlayerAction } = await import("@/lib/player-actions.server");
          const nextState = await applyPlayerAction(
            data.state as unknown as RoomState,
            body as never,
          );
          const { error: writeError } = await supabaseAdmin
            .from("rooms")
            .update({ state: nextState as never })
            .eq("id", data.id);
          if (writeError) throw writeError;

          const player =
            typeof body.playerId === "string"
              ? nextState.players.find((candidate) => candidate.id === body.playerId)
              : undefined;
          logInfo("api.player_action.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: data.id,
            action: body.action,
            playerId: player?.id,
            playerCount: nextState.players.length,
          });
          return Response.json({ state: nextState, player });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.player_action.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return new Response(error instanceof Error ? error.message : "player action failed", {
            status,
          });
        }
      },
    },
  },
});
