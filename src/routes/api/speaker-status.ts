import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import { migrateRoomState } from "@/lib/room-state-migration";
import { SPEAKER_NAMES, type RoomState } from "@/lib/types";

export const Route = createFileRoute("/api/speaker-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => ({}))) as {
          code?: unknown;
          slot?: unknown;
          connected?: unknown;
        };
        if (
          typeof body.code !== "string" ||
          typeof body.slot !== "number" ||
          typeof body.connected !== "boolean"
        ) {
          logWarn("api.speaker_status.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("code, slot, and connected required", { status: 400 });
        }
        const slot = Math.max(2, Math.min(5, Math.round(body.slot)));

        try {
          const { data, error } = await supabaseAdmin
            .from("rooms")
            .select("id, state")
            .eq("code", body.code.trim().toUpperCase())
            .maybeSingle();
          if (error) throw error;
          if (!data) return new Response("room not found", { status: 404 });

          const state = migrateRoomState(data.state as unknown as RoomState);
          const slots = { ...(state.speakerSlots ?? {}) };
          const existing = slots[slot] ?? { connected: false, name: SPEAKER_NAMES[slot] };
          slots[slot] = {
            ...existing,
            connected: body.connected,
            name: existing.name || SPEAKER_NAMES[slot],
            lastSeenAt: body.connected ? Date.now() : existing.lastSeenAt,
          };

          const nextState: RoomState = { ...state, speakerSlots: slots };
          const { error: writeError } = await supabaseAdmin
            .from("rooms")
            .update({ state: nextState as never })
            .eq("id", data.id);
          if (writeError) throw writeError;

          logInfo("api.speaker_status.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: data.id,
            slot,
            connected: body.connected,
          });
          return Response.json({ ok: true });
        } catch (error) {
          logError("api.speaker_status.failure", error, {
            durationMs: Date.now() - startedAt,
            status: 500,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "speaker status failed",
            status: 500,
          });
        }
      },
    },
  },
});
