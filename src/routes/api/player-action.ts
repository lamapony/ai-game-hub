import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerSecretHashFromRequest } from "@/lib/player-auth.server";
import { updateRoomStateWithOptimisticRetry } from "@/lib/room-state-retry.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { Player, RoomState } from "@/lib/types";

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
        const roomId = body.roomId;
        const action = body.action;

        try {
          const { applyPlayerAction } = await import("@/lib/player-actions.server");
          const playerSecretHash = playerSecretHashFromRequest(request, body);
          const result = await updateRoomStateWithOptimisticRetry<{
            player?: Player;
            roomId: string;
          }>({
            loadSnapshot: async () => {
              const { data, error } = await supabaseAdmin
                .from("rooms")
                .select("id, code, state, updated_at")
                .eq("id", roomId)
                .maybeSingle();
              if (error) throw error;
              if (!data) throw Object.assign(new Error("room not found"), { status: 404 });
              return {
                id: data.id,
                code: data.code,
                state: data.state as unknown as RoomState,
                updatedAt: data.updated_at,
              };
            },
            applyUpdate: async (snapshot) => {
              const nextState = await applyPlayerAction(snapshot.state, {
                ...body,
                playerSecretHash,
              } as never);
              const player =
                typeof body.playerId === "string"
                  ? nextState.players.find((candidate) => candidate.id === body.playerId)
                  : undefined;
              return { state: nextState, value: { player, roomId: snapshot.id } };
            },
            writeSnapshot: async (snapshot, state) => {
              const { data, error } = await supabaseAdmin
                .from("rooms")
                .update({ state: state as never })
                .eq("id", snapshot.id)
                .eq("updated_at", snapshot.updatedAt)
                .select("id")
                .maybeSingle();
              if (error) throw error;
              return !!data;
            },
            onConflict: (attempt) => {
              logWarn("api.player_action.write_conflict", {
                durationMs: Date.now() - startedAt,
                attempt,
                action,
                roomId,
              });
            },
          });
          const nextState = result.state;
          const player = result.value.player;
          logInfo("api.player_action.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: result.value.roomId,
            action,
            playerId: player?.id,
            playerCount: nextState.players.length,
            attempts: result.attempts,
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
