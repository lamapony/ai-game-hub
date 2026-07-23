// Accepts multipart audio upload, returns { text }.
import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { transcribeWithRoomBudget } from "@/lib/ai-budget.server";
import {
  cleanId,
  playerSecretHashFromRequest,
  requireAuthorizedPlayer,
  statusError,
} from "@/lib/player-auth.server";
import { assertPlayerMayUpload, cleanRoundId } from "@/lib/player-media.server";
import { migrateRoomState } from "@/lib/room-state-migration";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

async function authorizedTranscription(request: Request, form: FormData, file: Blob) {
  const roomId = cleanId(form.get("roomId"), "roomId");
  const playerId = cleanId(form.get("playerId"), "playerId");
  const roundId = cleanRoundId(form.get("roundId"));
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, state")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  const state = migrateRoomState(data.state as unknown as RoomState);
  const player = requireAuthorizedPlayer(state, playerId, playerSecretHashFromRequest(request, {}));
  if (state.currentGame === "soundscape") {
    assertPlayerMayUpload(state, "soundscape-audio", player, roundId);
  } else if (state.currentGame === "challenge") {
    assertPlayerMayUpload(state, "challenge-video", player, roundId);
  } else {
    throw statusError("transcription is closed", 409);
  }
  if (file.size > MAX_TRANSCRIBE_BYTES) throw statusError("recording is too large", 413);
  const filename = (form.get("filename") as string) || "recording.webm";
  return {
    roomId,
    playerId,
    roundId,
    text: await transcribeWithRoomBudget({
      roomId,
      operationId: `${state.currentGame}:${roundId}:${playerId}:transcription`,
      file,
      filename,
    }),
  };
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: "api:transcribe",
          limit: 120,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          logWarn("api.transcribe.rate_limited", {
            durationMs: Date.now() - startedAt,
            status: 429,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
          return rateLimitResponse(rateLimit);
        }
        if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
          logWarn("api.transcribe.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("multipart audio form required", { status: 400 });
        }
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof Blob)) {
            logWarn("api.transcribe.invalid", {
              durationMs: Date.now() - startedAt,
              status: 400,
            });
            return new Response("file required", { status: 400 });
          }
          const result = await authorizedTranscription(request, form, file);
          logInfo("api.transcribe.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            fileBytes: file.size,
            textChars: result.text.length,
            roomId: result.roomId,
            playerId: result.playerId,
            roundId: result.roundId,
          });
          return Response.json({ text: result.text });
        } catch (e) {
          const status = publicApiErrorStatus(e);
          logError("api.transcribe.fallback", e, {
            durationMs: Date.now() - startedAt,
            status,
            fallback: true,
          });
          if ([400, 401, 403, 404, 409, 413, 429].includes(status)) {
            return publicApiErrorResponse(e, { fallbackMessage: "transcription rejected", status });
          }
          return Response.json({ text: "", fallback: true });
        }
      },
    },
  },
});
