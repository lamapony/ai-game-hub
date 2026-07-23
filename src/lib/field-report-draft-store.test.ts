import { describe, expect, test } from "bun:test";
import type { FieldReportObservations } from "./field-report";
import {
  FIELD_REPORT_DRAFT_VERSION,
  assertCurrentFieldReportRun,
  buildFieldReportDraftPayload,
  fieldReportDraftIdentity,
  fieldReportDraftRequestSchema,
  fieldReportDraftRowMatches,
  mergeFieldReportDraftObservations,
  parseFieldReportDraftRow,
} from "./field-report-draft-store";
import { nextFieldReportDraftUpdatedAt } from "./field-report-draft";
import {
  partyRecordViewsForHost,
  partyRecordViewsForPlayer,
  type PartyRecordRow,
} from "./party-records";
import { buildQuickStartRoomState } from "./quick-start";

const CONFIGURED_AT = 1_721_234_567_890;

function observations(): FieldReportObservations {
  return {
    eventDate: "2026-07-18",
    eventLabel: "Grønningen Nordvest",
    hostDevice: "iPhone 15, iOS 19, Safari",
    networkNotes: "5G with a portable speaker",
    estimatedProviderCost: "2.40 DKK",
    preparedLaunchNotes: "4.2s cold, 0.4s prepared",
    failureNotes: "No live repair required.",
    outcome: "pass",
    runKind: "physical",
    sqlStateEdits: "none",
    secretIncident: "none",
    hostHandoff: "verified",
    hostExperience: "first-time",
    hostAutonomy: "independent",
    launchSignalResult: "followed",
    launchSignalsObserved: ["CHECK.", "INVITE.", "START."],
    storyCallbackInGame: "observed",
    storyCallbackInFinale: "observed",
    storySafety: "safe",
    physicalReliability: {
      hostNetworkSwitch: "passed",
      backupTakeover: "passed",
      playerBackgroundResume: "passed",
      hostRefreshRecovery: "passed",
      lateJoinAcrossActs: "passed",
      teamSwitchIntegrity: "passed",
      mediaPermissionRecovery: "passed",
    },
    pacingReviewed: true,
  };
}

function state(configuredAt = CONFIGURED_AT) {
  return buildQuickStartRoomState(
    "Dima",
    {
      venue: "park",
      targetDurationMinutes: 180,
      expectedPlayers: 12,
      storySeed: "The silver tongs keep changing hands.",
    },
    configuredAt,
  );
}

function draftRow(overrides: Partial<PartyRecordRow> = {}): PartyRecordRow {
  const identity = fieldReportDraftIdentity(CONFIGURED_AT);
  return {
    id: "draft_1",
    room_id: "room_1",
    run_id: identity.runId,
    game_id: identity.gameId,
    act_id: "grill",
    owner_player_id: null,
    owner_team_id: null,
    kind: identity.kind,
    visibility: "host",
    payload: buildFieldReportDraftPayload({
      configuredAt: CONFIGURED_AT,
      observations: observations(),
      updatedAt: CONFIGURED_AT + 1_000,
    }),
    idempotency_key: identity.idempotencyKey,
    created_at: "2026-07-18T12:00:00.000Z",
    revealed_at: null,
    ...overrides,
    session_started_at: overrides.session_started_at ?? CONFIGURED_AT,
  };
}

describe("field report draft store", () => {
  test("monotonically merges primary and backup host signal evidence", () => {
    const existing = observations();
    existing.launchSignalsObserved = ["CHECK.", "INVITE."];
    const incoming = observations();
    incoming.eventLabel = "Updated by backup host";
    incoming.launchSignalsObserved = ["START.", "CHECK."];

    const merged = mergeFieldReportDraftObservations(existing, incoming);

    expect(merged.eventLabel).toBe("Updated by backup host");
    expect(merged.launchSignalsObserved).toEqual(["CHECK.", "INVITE.", "START."]);
  });

  test("three-way merges independent primary and backup host edits", () => {
    const base = observations();
    const stored = observations();
    stored.networkNotes = "Backup host moved to mobile data";
    stored.physicalReliability.backupTakeover = "failed";
    const incoming = observations();
    incoming.eventLabel = "Assistens Kirkegård";
    incoming.physicalReliability.hostNetworkSwitch = "failed";

    const merged = mergeFieldReportDraftObservations(stored, incoming, base);

    expect(merged.eventLabel).toBe("Assistens Kirkegård");
    expect(merged.networkNotes).toBe("Backup host moved to mobile data");
    expect(merged.physicalReliability).toEqual({
      ...base.physicalReliability,
      backupTakeover: "failed",
      hostNetworkSwitch: "failed",
    });
  });

  test("lets an explicit local clear win without reverting unrelated remote fields", () => {
    const base = observations();
    const stored = observations();
    stored.hostDevice = "Backup: Pixel 10, Chrome";
    const incoming = observations();
    incoming.failureNotes = "";

    const merged = mergeFieldReportDraftObservations(stored, incoming, base);

    expect(merged.failureNotes).toBe("");
    expect(merged.hostDevice).toBe("Backup: Pixel 10, Chrome");
  });

  test("advances the draft revision even when concurrent saves share one millisecond", () => {
    expect(nextFieldReportDraftUpdatedAt(CONFIGURED_AT + 1_000, CONFIGURED_AT + 1_000)).toBe(
      CONFIGURED_AT + 1_001,
    );
    expect(nextFieldReportDraftUpdatedAt(CONFIGURED_AT + 1_000, CONFIGURED_AT + 2_000)).toBe(
      CONFIGURED_AT + 2_000,
    );
  });

  test("accepts exact bounded load and save requests", () => {
    expect(
      fieldReportDraftRequestSchema.safeParse({
        roomId: "room_1",
        action: "load",
        configuredAt: CONFIGURED_AT,
      }).success,
    ).toBe(true);
    expect(
      fieldReportDraftRequestSchema.safeParse({
        code: "ABCD",
        hostSecret: "hs_private",
        action: "save",
        configuredAt: CONFIGURED_AT,
        observations: observations(),
        baseObservations: observations(),
      }).success,
    ).toBe(true);

    const {
      physicalReliability: _physicalReliability,
      launchSignalResult,
      launchSignalsObserved: _launchSignalsObserved,
      ...legacyBase
    } = observations();
    const legacyObservations = { ...legacyBase, launchCoachResult: launchSignalResult };
    const legacyRequest = fieldReportDraftRequestSchema.safeParse({
      code: "ABCD",
      hostSecret: "hs_private",
      action: "save",
      configuredAt: CONFIGURED_AT,
      observations: legacyObservations,
    });
    expect(legacyRequest.success).toBe(true);
    if (legacyRequest.success && legacyRequest.data.action === "save") {
      expect(new Set(Object.values(legacyRequest.data.observations.physicalReliability))).toEqual(
        new Set(["not-tested"]),
      );
      expect(legacyRequest.data.observations.launchSignalResult).toBe("followed");
      expect(legacyRequest.data.observations.launchSignalsObserved).toEqual([]);
    }
  });

  test("rejects unknown fields and oversized evidence", () => {
    expect(
      fieldReportDraftRequestSchema.safeParse({
        roomId: "room_1",
        action: "load",
        configuredAt: CONFIGURED_AT,
        playerId: "not-allowed",
      }).success,
    ).toBe(false);

    const oversized = observations();
    oversized.failureNotes = "x".repeat(1_001);
    expect(
      fieldReportDraftRequestSchema.safeParse({
        roomId: "room_1",
        action: "save",
        configuredAt: CONFIGURED_AT,
        observations: oversized,
      }).success,
    ).toBe(false);
  });

  test("binds drafts to the current quick-start party", () => {
    assertCurrentFieldReportRun(state(), CONFIGURED_AT);

    try {
      assertCurrentFieldReportRun(state(CONFIGURED_AT + 1), CONFIGURED_AT);
      throw new Error("expected stale run rejection");
    } catch (error) {
      expect((error as { status?: number }).status).toBe(409);
      expect((error as Error).message).toContain("another party run");
    }

    expect(
      fieldReportDraftIdentity(CONFIGURED_AT + 1).idempotencyKey ===
        fieldReportDraftIdentity(CONFIGURED_AT).idempotencyKey,
    ).toBe(false);
  });

  test("parses only the private host record with the exact run identity", () => {
    const row = draftRow();
    expect(fieldReportDraftRowMatches(row, CONFIGURED_AT)).toBe(true);
    expect(parseFieldReportDraftRow(row, CONFIGURED_AT).observations.eventLabel).toBe(
      "Grønningen Nordvest",
    );

    expect(fieldReportDraftRowMatches(draftRow({ visibility: "player" }), CONFIGURED_AT)).toBe(
      false,
    );
    expect(fieldReportDraftRowMatches(draftRow({ kind: "other" }), CONFIGURED_AT)).toBe(false);
    try {
      parseFieldReportDraftRow(draftRow({ owner_player_id: "p1" }), CONFIGURED_AT);
      throw new Error("expected identity mismatch");
    } catch (error) {
      expect((error as Error).message).toContain("identity mismatch");
    }
  });

  test("migrates an exact v1 private draft with untested physical drills", () => {
    const {
      physicalReliability: _physicalReliability,
      launchSignalResult,
      launchSignalsObserved: _launchSignalsObserved,
      ...legacyBase
    } = observations();
    const legacyObservations = { ...legacyBase, launchCoachResult: launchSignalResult };
    const parsed = parseFieldReportDraftRow(
      draftRow({
        payload: {
          version: 1,
          configuredAt: CONFIGURED_AT,
          observations: legacyObservations,
          updatedAt: CONFIGURED_AT + 1_000,
        },
      }),
      CONFIGURED_AT,
    );

    expect(parsed.version).toBe(FIELD_REPORT_DRAFT_VERSION);
    expect(new Set(Object.values(parsed.observations.physicalReliability))).toEqual(
      new Set(["not-tested"]),
    );
    expect(parsed.observations.launchSignalResult).toBe("followed");
    expect(parsed.observations.launchSignalsObserved).toEqual([]);
  });

  test("migrates an exact v2 private draft without inventing launch signals", () => {
    const {
      launchSignalResult,
      launchSignalsObserved: _launchSignalsObserved,
      ...legacyBase
    } = observations();
    const parsed = parseFieldReportDraftRow(
      draftRow({
        payload: {
          version: 2,
          configuredAt: CONFIGURED_AT,
          observations: { ...legacyBase, launchCoachResult: launchSignalResult },
          updatedAt: CONFIGURED_AT + 1_000,
        },
      }),
      CONFIGURED_AT,
    );

    expect(parsed.version).toBe(FIELD_REPORT_DRAFT_VERSION);
    expect(parsed.observations.physicalReliability).toEqual(observations().physicalReliability);
    expect(parsed.observations.launchSignalResult).toBe("followed");
    expect(parsed.observations.launchSignalsObserved).toEqual([]);
  });

  test("is readable by the host but absent from every player response", () => {
    const row = draftRow();
    const [hostView] = partyRecordViewsForHost([row]);

    expect(hostView?.payload).toEqual(row.payload);
    expect(partyRecordViewsForPlayer([row], { id: "p1", teamId: "forest" })).toEqual([]);
    expect(JSON.stringify(hostView)).toContain("Grønningen Nordvest");
  });
});
