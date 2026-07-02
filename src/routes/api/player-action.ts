import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerSecretHashFromRequest } from "@/lib/player-auth.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/player-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => ({}))) as {
          roomId?: unknown;
          action?: unknown;
          playerId?: unknown;
          playerSecret?: unknown;
        };
        if (typeof body.roomId !== "string" || typeof body.action !== "string") {
          logWarn("api.player_action.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("roomId and action required", { status: 400 });
        }

        try {
          const { data, error } = await supabaseAdmin
            .from("rooms")
            .select("id, code, state")
            .eq("id", body.roomId)
            .maybeSingle();
          if (error) throw error;
          if (!data) return new Response("room not found", { status: 404 });

          const { applyPlayerAction } = await import("@/lib/player-actions.server");
          const playerSecretHash = playerSecretHashFromRequest(request, body);
          const nextState = await applyPlayerAction(
            data.state as unknown as RoomState,
            { ...body, playerSecretHash } as never,
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
