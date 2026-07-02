import { createFileRoute } from "@tanstack/react-router";
import type { SpiritQuestionPreset } from "@/lib/spirit-agent.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

const PRESETS = new Set(["how-to-play", "round-count", "what-now", "custom"]);

export const Route = createFileRoute("/api/spirit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { checkRateLimit, checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const ipRateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:spirit:ip",
          limit: 20,
          windowMs: 60_000,
        });
        if (!ipRateLimit.allowed) {
          logWarn("api.spirit.rate_limited.ip", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: ipRateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(ipRateLimit);
        }

        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          playerId?: unknown;
          question?: unknown;
          preset?: unknown;
        };
        const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
        const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
        const question =
          typeof body.question === "string" ? body.question.trim().slice(0, 240) : "";
        const preset: SpiritQuestionPreset =
          typeof body.preset === "string" && PRESETS.has(body.preset)
            ? (body.preset as SpiritQuestionPreset)
            : "custom";

        if (!code || !playerId || !question) {
          logWarn("api.spirit.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("code, playerId and question required", { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { answerSpiritQuestion } = await import("@/lib/spirit-agent.server");
          const { isSpiritWindowOpen } = await import("@/lib/game-guide");
          const { data, error } = await supabaseAdmin
            .from("rooms")
            .select("id, code, state")
            .eq("code", code)
            .maybeSingle();
          if (error) throw error;
          if (!data) {
            logWarn("api.spirit.room_missing", {
              durationMs: Date.now() - startedAt,
              status: 404,
              code,
            });
            return new Response("room not found", { status: 404 });
          }

          const state = data.state as import("@/lib/types").RoomState;
          const player = state.players.find((candidate) => candidate.id === playerId);
          if (!player) {
            logWarn("api.spirit.player_missing", {
              durationMs: Date.now() - startedAt,
              status: 403,
              roomId: data.id,
            });
            return new Response("player not in room", { status: 403 });
          }
          if (!isSpiritWindowOpen(state)) {
            logWarn("api.spirit.window_closed", {
              durationMs: Date.now() - startedAt,
              status: 409,
              roomId: data.id,
              currentGame: state.currentGame ?? undefined,
            });
            return new Response("spirit window closed", { status: 409 });
          }

          const playerRateLimit = checkRateLimit(`api:spirit:player:${code}:${playerId}`, {
            limit: 3,
            windowMs: 10 * 60_000,
          });
          if (!playerRateLimit.allowed) {
            logWarn("api.spirit.rate_limited.player", {
              durationMs: Date.now() - startedAt,
              status: 429,
              code,
              retryAfterSeconds: playerRateLimit.retryAfterSeconds,
            });
            return rateLimitResponse(playerRateLimit);
          }

          const answer = await answerSpiritQuestion({
            roomCode: code,
            state,
            playerId,
            question,
            preset,
          });

          logInfo("api.spirit.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: data.id,
            preset,
            source: answer.source,
            fallback: answer.fallback,
            remaining: playerRateLimit.remaining,
          });
          return Response.json(
            {
              ...answer,
              remaining: playerRateLimit.remaining,
              resetAt: playerRateLimit.resetAt,
            },
            {
              headers: {
                "X-RateLimit-Limit": String(playerRateLimit.limit),
                "X-RateLimit-Remaining": String(playerRateLimit.remaining),
                "X-RateLimit-Reset": String(Math.ceil(playerRateLimit.resetAt / 1000)),
              },
            },
          );
        } catch (error) {
          logError("api.spirit.failure", error, {
            durationMs: Date.now() - startedAt,
            status: 502,
            code,
          });
          return new Response(error instanceof Error ? error.message : "spirit failed", {
            status: 502,
          });
        }
      },
    },
  },
});
