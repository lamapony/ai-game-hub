import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerSecretHashFromRequest, statusError } from "@/lib/player-auth.server";
import { withRoomActionQueue } from "@/lib/room-action-queue.server";
import { updateRoomStateWithOptimisticRetry } from "@/lib/room-state-retry.server";
import { migrateRoomState } from "@/lib/room-state-migration";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { Player, RoomState } from "@/lib/types";

const PLAYER_ACTION_MAX_ATTEMPTS = 32;
const PLAYER_ACTION_BACKOFF_CAP_MS = 80;

function playerActionConflictBackoffMs(attempt: number) {
  const exponential = Math.min(10 * 2 ** Math.min(attempt - 1, 3), PLAYER_ACTION_BACKOFF_CAP_MS);
  return exponential + Math.floor(Math.random() * 21);
}

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
          const queued = await withRoomActionQueue(roomId, () =>
            updateRoomStateWithOptimisticRetry<{
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
                if (!data) throw statusError("room not found", 404);
                return {
                  id: data.id,
                  code: data.code,
                  state: migrateRoomState(data.state as unknown as RoomState),
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
              maxAttempts: PLAYER_ACTION_MAX_ATTEMPTS,
              onConflict: async (attempt) => {
                logWarn("api.player_action.write_conflict", {
                  durationMs: Date.now() - startedAt,
                  attempt,
                  action,
                  roomId,
                });
                if (attempt < PLAYER_ACTION_MAX_ATTEMPTS) {
                  await new Promise((resolve) =>
                    setTimeout(resolve, playerActionConflictBackoffMs(attempt)),
                  );
                }
              },
            }),
          );
          const result = queued.value;
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
            queueWaitMs: queued.queueWaitMs,
          });
          return Response.json({ state: nextState, player });
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.player_action.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "player action failed", status });
        }
      },
    },
  },
});
