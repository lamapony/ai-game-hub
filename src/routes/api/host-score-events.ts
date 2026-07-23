import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { hostScoreEventsRequestSchema } from "@/lib/score-events";
import {
  awardScoreEvents,
  getScoreLedgerSummary,
  listScoreEventsForHost,
  scoreEventFilterFromRequest,
} from "@/lib/score-events.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/host-score-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = hostScoreEventsRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.host_score_events.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid score request", {
            status: 400,
          });
        }

        const body = parsed.data;
        try {
          const room = await authorizeHostRoom({
            roomId: body.roomId,
            code: body.code,
            hostSecret: hostSecretFromRequest(request, body),
          });

          let result: unknown;
          let eventCount: number | undefined;
          let insertedCount: number | undefined;
          if (body.action === "award") {
            const awarded = await awardScoreEvents({
              roomId: room.id,
              state: room.state,
              events: body.events,
            });
            eventCount = awarded.events.length;
            insertedCount = awarded.insertedCount;
            result = awarded;
          } else if (body.action === "list") {
            const events = await listScoreEventsForHost(
              room.id,
              {
                currentTeamIds: room.state.teams.map((team) => team.id),
                sessionStartedAt: room.state.party?.sessionStartedAt,
              },
              scoreEventFilterFromRequest(body),
              body.limit,
            );
            eventCount = events.length;
            result = { events };
          } else {
            const summary = await getScoreLedgerSummary(
              room.id,
              {
                currentTeamIds: room.state.teams.map((team) => team.id),
                sessionStartedAt: room.state.party?.sessionStartedAt,
              },
              scoreEventFilterFromRequest(body),
            );
            eventCount = summary.eventCount;
            result = { summary };
          }

          logInfo("api.host_score_events.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            action: body.action,
            eventCount,
            insertedCount,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.host_score_events.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "score ledger failed", status });
        }
      },
    },
  },
});
