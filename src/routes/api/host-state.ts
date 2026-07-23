import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import { migrateRoomState } from "@/lib/room-state-migration";
import { hostStateWriteGuardMatches, parseHostStateWriteGuard } from "@/lib/host-state-write-guard";
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
          guard?: unknown;
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
          const guard = parseHostStateWriteGuard(body.guard);
          if (body.guard !== undefined && !guard) {
            logWarn("api.host_state.invalid_guard", {
              durationMs: Date.now() - startedAt,
              status: 400,
              roomId: room.id,
            });
            return new Response("invalid host state guard", { status: 400 });
          }
          if (guard && !hostStateWriteGuardMatches(room.state, guard)) {
            logInfo("api.host_state.stale_skipped", {
              durationMs: Date.now() - startedAt,
              status: 200,
              skipped: true,
              roomId: room.id,
              gameId: guard.gameId,
              roundId: guard.roundId,
              currentGame: room.state.currentGame ?? undefined,
            });
            return Response.json({ state: room.state, skipped: true });
          }
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
          const status = publicApiErrorStatus(error);
          logError("api.host_state.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "host state failed", status });
        }
      },
    },
  },
});
