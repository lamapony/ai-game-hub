import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { playerSecretHashFromRequest, requireAuthorizedPlayer } from "@/lib/player-auth.server";
import {
  buildPlayerUploadPath,
  cleanRoundId,
  extensionForUpload,
  assertPlayerMayUpload,
  RECORDINGS_BUCKET,
  type PlayerUploadAction,
} from "@/lib/player-media.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import { migrateRoomState } from "@/lib/room-state-migration";
import type { RoomState } from "@/lib/types";

type UploadTargetBody = {
  roomId?: unknown;
  action?: unknown;
  playerId?: unknown;
  playerSecret?: unknown;
  roundId?: unknown;
  mimeType?: unknown;
};

function cleanAction(value: unknown): PlayerUploadAction {
  if (value === "soundscape-audio" || value === "challenge-video" || value === "photo") {
    return value;
  }
  throw Object.assign(new Error("unknown upload action"), { status: 400 });
}

export const Route = createFileRoute("/api/player-upload-target")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => ({}))) as UploadTargetBody;
        if (typeof body.roomId !== "string" || typeof body.action !== "string") {
          logWarn("api.player_upload_target.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("roomId and action required", { status: 400 });
        }

        try {
          const action = cleanAction(body.action);
          const roundId = cleanRoundId(body.roundId);
          const { mime, extension } = extensionForUpload(action, body.mimeType);
          const { data, error } = await supabaseAdmin
            .from("rooms")
            .select("id, state")
            .eq("id", body.roomId)
            .maybeSingle();
          if (error) throw error;
          if (!data) return new Response("room not found", { status: 404 });

          const state = migrateRoomState(data.state as unknown as RoomState);
          const player = requireAuthorizedPlayer(
            state,
            body.playerId,
            playerSecretHashFromRequest(request, body),
          );
          assertPlayerMayUpload(state, action, player, roundId);

          const path = buildPlayerUploadPath({
            roomId: data.id,
            action,
            roundId,
            playerId: player.id,
            extension,
          });
          const signed = await supabaseAdmin.storage
            .from(RECORDINGS_BUCKET)
            .createSignedUploadUrl(path, { upsert: false });
          if (signed.error) throw signed.error;

          logInfo("api.player_upload_target.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: data.id,
            action,
            playerId: player.id,
            mimeType: mime,
          });
          return Response.json({
            bucket: RECORDINGS_BUCKET,
            path: signed.data.path,
            token: signed.data.token,
          });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.player_upload_target.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return new Response(error instanceof Error ? error.message : "upload target failed", {
            status,
          });
        }
      },
    },
  },
});
