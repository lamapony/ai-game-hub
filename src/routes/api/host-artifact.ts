import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { cleanId, statusError } from "@/lib/player-auth.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

type HostArtifactBody = {
  roomId?: unknown;
  code?: unknown;
  hostSecret?: unknown;
  action?: unknown;
  roundId?: unknown;
  score?: unknown;
  feedback?: unknown;
  results?: unknown;
};

function cleanText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw statusError(`${field} required`, 400);
  const text = value.trim().slice(0, maxLength);
  if (!text) throw statusError(`${field} required`, 400);
  return text;
}

function cleanInt(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw statusError(`${field} required`, 400);
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function updateChallengeResult(roomId: string, body: HostArtifactBody) {
  const roundId = cleanId(body.roundId, "roundId");
  const score = cleanInt(body.score, "score", 0, 10);
  const feedback = cleanText(body.feedback, "feedback", 800);
  const { error } = await supabaseAdmin
    .from("challenges")
    .update({ score, ai_feedback: feedback })
    .eq("room_id", roomId)
    .eq("round_id", roundId);
  if (error) throw error;
  return { ok: true };
}

async function updatePhotoResults(roomId: string, body: HostArtifactBody) {
  if (!Array.isArray(body.results)) throw statusError("results required", 400);
  const results = body.results.slice(0, 30).map((entry) => {
    const row = entry as { id?: unknown; rank?: unknown; points?: unknown; comment?: unknown };
    return {
      id: cleanId(row.id, "id"),
      rank: cleanInt(row.rank, "rank", 1, 99),
      points: cleanInt(row.points, "points", 0, 20),
      comment: cleanText(row.comment, "comment", 800),
    };
  });

  await Promise.all(
    results.map(async (result) => {
      const { error } = await supabaseAdmin
        .from("photos")
        .update({
          rank: result.rank,
          points: result.points,
          ai_comment: result.comment,
        })
        .eq("room_id", roomId)
        .eq("id", result.id);
      if (error) throw error;
    }),
  );
  return { ok: true };
}

async function handleHostArtifact(roomId: string, body: HostArtifactBody) {
  if (body.action === "challenge-result") return updateChallengeResult(roomId, body);
  if (body.action === "photo-results") return updatePhotoResults(roomId, body);
  throw statusError("unknown host artifact action", 400);
}

export const Route = createFileRoute("/api/host-artifact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => ({}))) as HostArtifactBody;
        if (typeof body.action !== "string") {
          logWarn("api.host_artifact.invalid", { durationMs: Date.now() - startedAt, status: 400 });
          return new Response("action required", { status: 400 });
        }

        try {
          const room = await authorizeHostRoom({
            roomId: typeof body.roomId === "string" ? body.roomId : undefined,
            code: typeof body.code === "string" ? body.code : undefined,
            hostSecret: hostSecretFromRequest(request, body),
          });
          const result = await handleHostArtifact(room.id, body);
          logInfo("api.host_artifact.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            action: body.action,
          });
          return Response.json(result);
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number((error as { status?: unknown }).status) || 500
              : 500;
          logError("api.host_artifact.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return new Response(error instanceof Error ? error.message : "host artifact failed", {
            status,
          });
        }
      },
    },
  },
});
