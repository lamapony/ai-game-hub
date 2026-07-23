import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyHostCommand,
  hostCommandRequestSchema,
  hostCommandRequiresScoreBoundary,
} from "@/lib/host-command";
import { materializeLegacyScoreEvents } from "@/lib/score-events.server";
import { updateRoomStateWithOptimisticRetry } from "@/lib/room-state-retry.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/host-command")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = hostCommandRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.host_command.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid host command", {
            status: 400,
          });
        }

        const body = parsed.data;
        const commandNow = Date.now();
        const { authorizeHostRoom, hostSecretFromRequest } = await import("@/lib/host-auth.server");

        try {
          const hostSecret = hostSecretFromRequest(request, body);
          let committedUpdatedAt: string | null = null;
          const result = await updateRoomStateWithOptimisticRetry({
            loadSnapshot: async () => {
              const room = await authorizeHostRoom({
                roomId: body.roomId,
                code: body.code,
                hostSecret,
              });
              return {
                id: room.id,
                code: room.code,
                state: room.state,
                updatedAt: room.updatedAt,
              };
            },
            applyUpdate: async (snapshot) =>
              applyHostCommand(
                snapshot.state,
                { commandId: body.commandId, command: body.command },
                commandNow,
              ),
            writeSnapshot: async (snapshot, state) => {
              if (state === snapshot.state) {
                committedUpdatedAt = snapshot.updatedAt;
                return true;
              }
              const { data, error } = await supabaseAdmin
                .from("rooms")
                .update({ state: state as never })
                .eq("id", snapshot.id)
                .eq("updated_at", snapshot.updatedAt)
                .select("id, updated_at")
                .maybeSingle();
              if (error) throw error;
              if (data) committedUpdatedAt = data.updated_at;
              return !!data;
            },
            onConflict: (attempt) => {
              logWarn("api.host_command.write_conflict", {
                durationMs: Date.now() - startedAt,
                attempt,
                roomId: body.roomId,
                commandId: body.commandId,
                commandType: body.command.type,
              });
            },
          });

          let materializedScoreBoundaryCount: number | undefined;
          if (hostCommandRequiresScoreBoundary(body.command)) {
            const boundary = await materializeLegacyScoreEvents(result.snapshot.id);
            materializedScoreBoundaryCount = boundary.materializedLegacyCount;
          }

          logInfo("api.host_command.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: result.snapshot.id,
            commandId: result.value.commandId,
            commandType: result.value.commandType,
            replayed: result.value.replayed,
            attempts: result.attempts,
            materializedScoreBoundaryCount,
          });
          return Response.json({
            state: result.state,
            updatedAt: committedUpdatedAt ?? result.snapshot.updatedAt,
            commandId: result.value.commandId,
            replayed: result.value.replayed,
            attempts: result.attempts,
          });
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.host_command.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            commandId: body.commandId,
            commandType: body.command.type,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "host command failed", status });
        }
      },
    },
  },
});
