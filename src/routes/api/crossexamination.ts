import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { crossExaminationRequestSchema } from "@/lib/crossexamination-lifecycle";
import {
  crossExaminationHostCase,
  manuallyResolveCrossExamination,
  nextCrossExaminationPair,
  openCrossExamination,
  prepareCrossExamination,
  skipCrossExaminationPair,
  submitCrossAudio,
  submitCrossPrediction,
} from "@/lib/crossexamination.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import {
  playerSecretHashFromRequest,
  requireAuthorizedPlayer,
  statusError,
} from "@/lib/player-auth.server";
import { migrateRoomState } from "@/lib/room-state-migration";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import type { RoomState } from "@/lib/types";

const PLAYER_ACTIONS = ["vote", "submit-audio"] as const;

export const Route = createFileRoute("/api/crossexamination")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const raw = await request.json().catch(() => null);
        const parsed = crossExaminationRequestSchema.safeParse(raw);
        if (!parsed.success) {
          logWarn("api.crossexamination.invalid", {
            status: 400,
            durationMs: Date.now() - startedAt,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid Cross request", {
            status: 400,
          });
        }
        const body = parsed.data;
        const { checkRequestRateLimit, rateLimitResponse } =
          await import("@/lib/api-rate-limit.server");
        const rateLimit = checkRequestRateLimit(request, {
          keyPrefix: `api:crossexamination:${body.action}`,
          limit: body.action === "case" ? 120 : 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

        try {
          let result: unknown;
          let roomId: string;
          if ((PLAYER_ACTIONS as readonly string[]).includes(body.action)) {
            const playerBody = body as Extract<typeof body, { action: "vote" | "submit-audio" }>;
            const { data, error } = await supabaseAdmin
              .from("rooms")
              .select("id, state")
              .eq("id", playerBody.roomId)
              .maybeSingle();
            if (error) throw error;
            if (!data) throw statusError("room not found", 404);
            const state = migrateRoomState(data.state as unknown as RoomState);
            const player = requireAuthorizedPlayer(
              state,
              playerBody.playerId,
              playerSecretHashFromRequest(request, playerBody),
            );
            roomId = data.id;
            result =
              playerBody.action === "vote"
                ? await submitCrossPrediction({
                    roomId,
                    state,
                    player,
                    runId: playerBody.runId,
                    pairId: playerBody.pairId,
                    category: playerBody.category,
                  })
                : await submitCrossAudio({
                    roomId,
                    state,
                    player,
                    runId: playerBody.runId,
                    pairId: playerBody.pairId,
                    storagePath: playerBody.storagePath,
                    durationSeconds: playerBody.durationSeconds,
                  });
          } else {
            const room = await authorizeHostRoom({
              roomId: body.roomId,
              hostSecret: hostSecretFromRequest(request, { hostSecret: undefined }),
            });
            roomId = room.id;
            switch (body.action) {
              case "case":
                result = await crossExaminationHostCase({ room, runId: body.runId });
                break;
              case "prepare":
                result = await prepareCrossExamination({
                  room,
                  runId: body.runId,
                  excludedRecordIds: body.excludedRecordIds,
                  manualFacts: body.manualFacts,
                });
                break;
              case "open":
                result = await openCrossExamination({
                  room,
                  runId: body.runId,
                  pairId: body.pairId,
                });
                break;
              case "manual-verdict":
                result = await manuallyResolveCrossExamination({
                  room,
                  runId: body.runId,
                  pairId: body.pairId,
                  findings: body.findings,
                  verdict: body.verdict,
                });
                break;
              case "skip":
                result = await skipCrossExaminationPair({
                  room,
                  runId: body.runId,
                  pairId: body.pairId,
                });
                break;
              case "next":
                result = await nextCrossExaminationPair({
                  room,
                  runId: body.runId,
                  pairId: body.pairId,
                });
                break;
            }
          }
          logInfo("api.crossexamination.success", {
            status: 200,
            durationMs: Date.now() - startedAt,
            roomId,
            runId: body.runId,
            action: body.action,
            playerId: "playerId" in body ? body.playerId : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.crossexamination.failure", error, {
            status,
            durationMs: Date.now() - startedAt,
            runId: body.runId,
            action: body.action,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "Cross Examination failed",
            status,
          });
        }
      },
    },
  },
});
