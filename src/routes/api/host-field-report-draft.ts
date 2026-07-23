import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import { fieldReportDraftRequestSchema } from "@/lib/field-report-draft-store";
import { loadFieldReportDraft, saveFieldReportDraft } from "@/lib/field-report-draft.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";

export const Route = createFileRoute("/api/host-field-report-draft")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const parsed = fieldReportDraftRequestSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) {
          logWarn("api.host_field_report_draft.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid field report draft", {
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
          const draft =
            body.action === "load"
              ? await loadFieldReportDraft({
                  roomId: room.id,
                  state: room.state,
                  configuredAt: body.configuredAt,
                })
              : await saveFieldReportDraft({
                  roomId: room.id,
                  state: room.state,
                  configuredAt: body.configuredAt,
                  observations: body.observations,
                  baseObservations: body.baseObservations,
                });
          logInfo("api.host_field_report_draft.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            action: body.action,
            hasDraft: Boolean(draft),
          });
          return Response.json({ draft });
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.host_field_report_draft.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "field report draft failed",
            status,
          });
        }
      },
    },
  },
});
