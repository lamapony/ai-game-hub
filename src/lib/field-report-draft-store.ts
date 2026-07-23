import { z } from "zod";
import type { PartyRecordRow } from "./party-records";
import { statusError } from "./player-auth.server";
import {
  buildEmptyFieldReportPhysicalReliability,
  type FieldReportObservations,
} from "./field-report";
import { mergeFieldReportDraftObservations } from "./field-report-draft";
export { mergeFieldReportDraftObservations } from "./field-report-draft";
import { QUICK_START_LAUNCH_SIGNALS } from "./quick-start-launch-coach";
import type { RoomState } from "./types";

export const FIELD_REPORT_DRAFT_VERSION = 3 as const;
export const FIELD_REPORT_DRAFT_GAME_ID = "field-report";
export const FIELD_REPORT_DRAFT_KIND = "field-report-draft";

const sharedFieldReportObservationShape = {
  eventDate: z.string().max(10),
  eventLabel: z.string().max(500),
  hostDevice: z.string().max(500),
  networkNotes: z.string().max(500),
  estimatedProviderCost: z.string().max(120),
  preparedLaunchNotes: z.string().max(500),
  failureNotes: z.string().max(1_000),
  outcome: z.enum(["pending", "pass", "fail"]),
  runKind: z.enum(["unclassified", "physical", "automated"]),
  sqlStateEdits: z.enum(["unknown", "none", "performed"]),
  secretIncident: z.enum(["unknown", "none", "suspected"]),
  hostHandoff: z.enum(["unknown", "verified", "failed"]),
  hostExperience: z.enum(["unknown", "first-time", "returning"]),
  hostAutonomy: z.enum(["unknown", "independent", "prompted"]),
  storyCallbackInGame: z.enum(["unknown", "observed", "not-observed", "not-tested"]),
  storyCallbackInFinale: z.enum(["unknown", "observed", "not-observed", "not-tested"]),
  storySafety: z.enum(["unknown", "safe", "concern", "not-tested"]),
  pacingReviewed: z.boolean(),
};

const legacyFieldReportObservationsV1Schema = z
  .object({
    ...sharedFieldReportObservationShape,
    launchCoachResult: z.enum(["unknown", "followed", "misunderstood"]),
  })
  .strict();

export const fieldReportPhysicalReliabilitySchema = z
  .object({
    hostNetworkSwitch: z.enum(["not-tested", "passed", "failed"]),
    backupTakeover: z.enum(["not-tested", "passed", "failed"]),
    playerBackgroundResume: z.enum(["not-tested", "passed", "failed"]),
    hostRefreshRecovery: z.enum(["not-tested", "passed", "failed"]),
    lateJoinAcrossActs: z.enum(["not-tested", "passed", "failed"]),
    teamSwitchIntegrity: z.enum(["not-tested", "passed", "failed"]),
    mediaPermissionRecovery: z.enum(["not-tested", "passed", "failed"]),
  })
  .strict();

export const fieldReportObservationsSchema = z
  .object({
    ...sharedFieldReportObservationShape,
    launchSignalResult: z.enum(["unknown", "followed", "misunderstood"]),
    launchSignalsObserved: z.array(z.enum(QUICK_START_LAUNCH_SIGNALS)).max(6),
    physicalReliability: fieldReportPhysicalReliabilitySchema,
  })
  .strict();

const legacyFieldReportObservationsV2Schema = z
  .object({
    ...sharedFieldReportObservationShape,
    launchCoachResult: z.enum(["unknown", "followed", "misunderstood"]),
    physicalReliability: fieldReportPhysicalReliabilitySchema,
  })
  .strict();

type LegacyFieldReportObservations =
  | z.infer<typeof legacyFieldReportObservationsV1Schema>
  | z.infer<typeof legacyFieldReportObservationsV2Schema>;

function migrateLegacyFieldReportObservations(
  observations: LegacyFieldReportObservations,
): FieldReportObservations {
  const { launchCoachResult, ...legacy } = observations;
  return fieldReportObservationsSchema.parse({
    ...legacy,
    launchSignalResult: launchCoachResult,
    launchSignalsObserved: [],
    physicalReliability:
      "physicalReliability" in observations
        ? observations.physicalReliability
        : buildEmptyFieldReportPhysicalReliability(),
  });
}

const fieldReportObservationsRequestSchema = z
  .union([
    fieldReportObservationsSchema,
    legacyFieldReportObservationsV2Schema,
    legacyFieldReportObservationsV1Schema,
  ])
  .transform((observations): FieldReportObservations =>
    "launchSignalResult" in observations
      ? observations
      : migrateLegacyFieldReportObservations(observations),
  );

const configuredAtSchema = z.number().int().nonnegative().safe();
const addressFields = {
  roomId: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().min(1).max(16).optional(),
  hostSecret: z.string().trim().min(1).max(256).optional(),
};

export const fieldReportDraftRequestSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        ...addressFields,
        action: z.literal("load"),
        configuredAt: configuredAtSchema,
      })
      .strict(),
    z
      .object({
        ...addressFields,
        action: z.literal("save"),
        configuredAt: configuredAtSchema,
        observations: fieldReportObservationsRequestSchema,
        baseObservations: fieldReportObservationsRequestSchema.optional(),
      })
      .strict(),
  ])
  .refine((value) => Boolean(value.roomId || value.code), {
    message: "roomId or code required",
    path: ["roomId"],
  });

export const fieldReportDraftPayloadSchema = z
  .object({
    version: z.literal(FIELD_REPORT_DRAFT_VERSION),
    configuredAt: configuredAtSchema,
    observations: fieldReportObservationsSchema,
    updatedAt: configuredAtSchema,
  })
  .strict();

const legacyFieldReportDraftV2PayloadSchema = z
  .object({
    version: z.literal(2),
    configuredAt: configuredAtSchema,
    observations: legacyFieldReportObservationsV2Schema,
    updatedAt: configuredAtSchema,
  })
  .strict();

const legacyFieldReportDraftV1PayloadSchema = z
  .object({
    version: z.literal(1),
    configuredAt: configuredAtSchema,
    observations: legacyFieldReportObservationsV1Schema,
    updatedAt: configuredAtSchema,
  })
  .strict();

export type FieldReportDraftRequest = z.infer<typeof fieldReportDraftRequestSchema>;
export type FieldReportDraft = z.infer<typeof fieldReportDraftPayloadSchema>;

export function fieldReportDraftIdentity(configuredAt: number) {
  const normalized = configuredAtSchema.parse(configuredAt);
  return {
    runId: `field-report-${normalized}`,
    gameId: FIELD_REPORT_DRAFT_GAME_ID,
    kind: FIELD_REPORT_DRAFT_KIND,
    idempotencyKey: `field-report-draft:${normalized}`,
  };
}

export function assertCurrentFieldReportRun(state: RoomState, configuredAt: number) {
  if (state.quickStart?.configuredAt !== configuredAt) {
    throw statusError("field report draft belongs to another party run", 409);
  }
}

export function fieldReportDraftRowMatches(row: PartyRecordRow, configuredAt: number) {
  const identity = fieldReportDraftIdentity(configuredAt);
  return (
    row.run_id === identity.runId &&
    row.game_id === identity.gameId &&
    row.kind === identity.kind &&
    row.idempotency_key === identity.idempotencyKey &&
    row.visibility === "host" &&
    row.owner_player_id === null &&
    row.owner_team_id === null
  );
}

export function parseFieldReportDraftRow(row: PartyRecordRow, configuredAt: number) {
  if (!fieldReportDraftRowMatches(row, configuredAt)) {
    throw statusError("field report draft identity mismatch", 409);
  }
  const parsed = fieldReportDraftPayloadSchema.safeParse(row.payload);
  if (parsed.success && parsed.data.configuredAt === configuredAt) {
    return parsed.data;
  }
  const legacyV2 = legacyFieldReportDraftV2PayloadSchema.safeParse(row.payload);
  if (legacyV2.success && legacyV2.data.configuredAt === configuredAt) {
    return fieldReportDraftPayloadSchema.parse({
      version: FIELD_REPORT_DRAFT_VERSION,
      configuredAt: legacyV2.data.configuredAt,
      observations: migrateLegacyFieldReportObservations(legacyV2.data.observations),
      updatedAt: legacyV2.data.updatedAt,
    });
  }
  const legacyV1 = legacyFieldReportDraftV1PayloadSchema.safeParse(row.payload);
  if (legacyV1.success && legacyV1.data.configuredAt === configuredAt) {
    return fieldReportDraftPayloadSchema.parse({
      version: FIELD_REPORT_DRAFT_VERSION,
      configuredAt: legacyV1.data.configuredAt,
      observations: migrateLegacyFieldReportObservations(legacyV1.data.observations),
      updatedAt: legacyV1.data.updatedAt,
    });
  }
  throw statusError("field report draft payload is invalid", 409);
}

export function buildFieldReportDraftPayload(params: {
  configuredAt: number;
  observations: FieldReportObservations;
  updatedAt: number;
}): FieldReportDraft {
  return fieldReportDraftPayloadSchema.parse({
    version: FIELD_REPORT_DRAFT_VERSION,
    ...params,
  });
}
