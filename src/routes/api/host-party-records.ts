import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { authorizeHostRoom, hostSecretFromRequest } from "@/lib/host-auth.server";
import {
  hostPartyRecordsRequestSchema,
  partyRecordViewsForHost,
  type PartyRecordFilters,
} from "@/lib/party-records";
import {
  createPartyRecord,
  currentPartyRecordFilters,
  listPartyRecordsForHost,
  transitionPartyRecords,
} from "@/lib/party-records.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import { ORACLE_RECORD_KIND, ORACLE_VERDICT_RECORD_KIND } from "@/games/grilloracle/model";
import {
  SMOKE_SCREEN_GUESS_KIND,
  SMOKE_SCREEN_MISSION_KIND,
  SMOKE_SCREEN_RESULT_KIND,
  SMOKE_SCREEN_REVEAL_KIND,
} from "@/games/smokescreen/model";
import {
  TOAST_ASSIGNMENT_KIND,
  TOAST_CATCH_KIND,
  TOAST_RECORDING_KIND,
  TOAST_RESULT_KIND,
} from "@/games/toastsyndicate/model";
import {
  STILL_LIFE_HEADLINE_KIND,
  STILL_LIFE_JUDGMENT_KIND,
  STILL_LIFE_RESULT_KIND,
  STILL_LIFE_SUBMISSION_KIND,
  STILL_LIFE_VOTE_KIND,
} from "@/games/stilllife/model";
import {
  SOMMELIER_ANALYSIS_KIND,
  SOMMELIER_CROWD_FAVORITE_KIND,
  SOMMELIER_GUESS_KIND,
  SOMMELIER_RESULT_KIND,
  SOMMELIER_SUBMISSION_KIND,
} from "@/games/sommelier/model";
import {
  CONTRABAND_ACCUSATION_KIND,
  CONTRABAND_ARBITRATION_KIND,
  CONTRABAND_ASSIGNMENT_KIND,
  CONTRABAND_RESOLUTION_KIND,
  CONTRABAND_RESULT_KIND,
} from "@/games/contraband/model";

const LIFECYCLE_RECORD_KINDS = [
  ORACLE_RECORD_KIND,
  ORACLE_VERDICT_RECORD_KIND,
  SMOKE_SCREEN_MISSION_KIND,
  SMOKE_SCREEN_REVEAL_KIND,
  SMOKE_SCREEN_GUESS_KIND,
  SMOKE_SCREEN_RESULT_KIND,
  TOAST_ASSIGNMENT_KIND,
  TOAST_RECORDING_KIND,
  TOAST_CATCH_KIND,
  TOAST_RESULT_KIND,
  STILL_LIFE_HEADLINE_KIND,
  STILL_LIFE_SUBMISSION_KIND,
  STILL_LIFE_JUDGMENT_KIND,
  STILL_LIFE_VOTE_KIND,
  STILL_LIFE_RESULT_KIND,
  SOMMELIER_SUBMISSION_KIND,
  SOMMELIER_ANALYSIS_KIND,
  SOMMELIER_GUESS_KIND,
  SOMMELIER_RESULT_KIND,
  SOMMELIER_CROWD_FAVORITE_KIND,
  CONTRABAND_ASSIGNMENT_KIND,
  CONTRABAND_ACCUSATION_KIND,
  CONTRABAND_ARBITRATION_KIND,
  CONTRABAND_RESOLUTION_KIND,
  CONTRABAND_RESULT_KIND,
];

export const Route = createFileRoute("/api/host-party-records")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const rawBody = await request.json().catch(() => null);
        const parsed = hostPartyRecordsRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          logWarn("api.host_party_records.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
            issue: parsed.error.issues[0]?.message,
          });
          return new Response("invalid party record request", {
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
          const filters: PartyRecordFilters = currentPartyRecordFilters(room.state, {
            runId: "runId" in body ? body.runId : undefined,
            kind: "kind" in body ? body.kind : undefined,
          });

          let result: unknown;
          let recordCount: number | undefined;
          if (body.action === "list") {
            const records = await listPartyRecordsForHost(room.id, filters);
            recordCount = records.length;
            result = { records };
          } else if (body.action === "create") {
            if (LIFECYCLE_RECORD_KINDS.includes(body.kind)) {
              throw Object.assign(
                new Error("this record kind requires its act-aware lifecycle endpoint"),
                { status: 409 },
              );
            }
            const created = await createPartyRecord({
              roomId: room.id,
              state: room.state,
              input: body,
            });
            result = {
              record: partyRecordViewsForHost([created.row])[0],
              replayed: created.replayed,
            };
          } else {
            if (LIFECYCLE_RECORD_KINDS.includes(body.kind)) {
              throw Object.assign(
                new Error("this record kind requires its act-aware lifecycle endpoint"),
                { status: 409 },
              );
            }
            result = await transitionPartyRecords({
              roomId: room.id,
              state: room.state,
              runId: body.runId,
              kind: body.kind,
              transition: body.action === "seal-run" ? "seal" : "reveal",
            });
          }

          logInfo("api.host_party_records.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            action: body.action,
            recordCount,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.host_party_records.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return publicApiErrorResponse(error, { fallbackMessage: "party records failed", status });
        }
      },
    },
  },
});
