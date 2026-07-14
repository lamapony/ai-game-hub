import { createFileRoute } from "@tanstack/react-router";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import { migrateRoomState } from "@/lib/room-state-migration";
import type { RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/host-state")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => ({}))) as {
          roomId?: unknown;
          code?: unknown;
          hostSecret?: unknown;
          state?: unknown;
        };
        if (!body.state || typeof body.state !== "object") {
          logWarn("api.host_state.invalid", { durationMs: Date.now() - startedAt, status: 400 });
          return new Response("state required", { status: 400 });
        }

        const { authorizeHostRoom, hostSecretFromRequest, writeAuthorizedRoomState } =
          await import("@/lib/host-auth.server");

        try {
          const room = await authorizeHostRoom({
            roomId: typeof body.roomId === "string" ? body.roomId : undefined,
            code: typeof body.code === "string" ? body.code : undefined,
            hostSecret: hostSecretFromRequest(request, body),
          });
          const nextState = migrateRoomState(body.state as RoomState);
          const writtenState = await writeAuthorizedRoomState(room.id, nextState, room.state);
          logInfo("api.host_state.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            currentGame: writtenState.currentGame ?? undefined,
          });
          return Response.json({ state: writtenState });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.host_state.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return new Response(error instanceof Error ? error.message : "host state failed", {
            status,
          });
        }
      },
    },
  },
});
