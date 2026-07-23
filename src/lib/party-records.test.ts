import { describe, expect, test } from "bun:test";
import {
  hostPartyRecordsRequestSchema,
  partyRecordViewsForHost,
  partyRecordViewsForPlayer,
  playerPartyRecordsRequestSchema,
  type PartyRecordRow,
} from "./party-records";

function row(overrides: Partial<PartyRecordRow> = {}): PartyRecordRow {
  return {
    id: "record_1",
    room_id: "room_1",
    run_id: "run_1",
    game_id: "smoke-screen",
    act_id: "grill",
    owner_player_id: "p1",
    owner_team_id: null,
    kind: "mission",
    visibility: "player",
    payload: { secret: "ask for ketchup without speaking" },
    idempotency_key: "mission:p1:run_1",
    created_at: "2026-07-15T12:00:00.000Z",
    revealed_at: null,
    ...overrides,
    session_started_at: overrides.session_started_at ?? 1_234,
  };
}

describe("party record privacy contracts", () => {
  test("validates bounded player-owned secret records", () => {
    const valid = hostPartyRecordsRequestSchema.safeParse({
      roomId: "room_1",
      action: "create",
      idempotencyKey: "mission:p1:run_1",
      runId: "run_1",
      gameId: "smoke-screen",
      ownerPlayerId: "p1",
      kind: "mission",
      visibility: "player",
      payload: { secret: "compliment the tongs three times" },
    });
    expect(valid.success).toBe(true);

    const ownerless = hostPartyRecordsRequestSchema.safeParse({
      roomId: "room_1",
      action: "create",
      idempotencyKey: "mission:global:1",
      runId: "run_1",
      gameId: "smoke-screen",
      kind: "mission",
      visibility: "player",
      payload: { secret: "nobody can receive this" },
    });
    expect(ownerless.success).toBe(false);

    const twoOwners = hostPartyRecordsRequestSchema.safeParse({
      roomId: "room_1",
      action: "create",
      idempotencyKey: "mission:owners:1",
      runId: "run_1",
      gameId: "smoke-screen",
      ownerPlayerId: "p1",
      ownerTeamId: "forest",
      kind: "mission",
      visibility: "player",
      payload: { secret: "ambiguous ownership" },
    });
    expect(twoOwners.success).toBe(false);
  });

  test("rejects oversized payloads before they reach Postgres", () => {
    const parsed = hostPartyRecordsRequestSchema.safeParse({
      roomId: "room_1",
      action: "create",
      idempotencyKey: "mission:p1:oversized",
      runId: "run_1",
      gameId: "smoke-screen",
      ownerPlayerId: "p1",
      kind: "mission",
      visibility: "player",
      payload: { secret: "🔥".repeat(20_000) },
    });
    expect(parsed.success).toBe(false);
  });

  test("requires a run id for every host and player list request", () => {
    expect(
      hostPartyRecordsRequestSchema.safeParse({
        roomId: "room_1",
        action: "list",
      }).success,
    ).toBe(false);
    expect(
      playerPartyRecordsRequestSchema.safeParse({
        roomId: "room_1",
        playerId: "p1",
        action: "list",
      }).success,
    ).toBe(false);
    expect(
      hostPartyRecordsRequestSchema.safeParse({
        roomId: "room_1",
        action: "list",
        runId: "run_2",
      }).success,
    ).toBe(true);
  });

  test("host can count secrets but cannot read player or sealed payloads", () => {
    const views = partyRecordViewsForHost([
      row(),
      row({ id: "record_2", visibility: "sealed", payload: { secret: "sealed prophecy" } }),
      row({ id: "record_3", visibility: "host", payload: { note: "host-only fallback" } }),
      row({
        id: "record_4",
        visibility: "revealed",
        payload: { secret: "revealed mission" },
        revealed_at: "2026-07-15T15:00:00.000Z",
      }),
    ]);

    expect(views.length).toBe(4);
    expect(views[0]?.payloadRedacted).toBe(true);
    expect(views[0]?.ownerPlayerId).toBeUndefined();
    expect("payload" in views[0]!).toBe(false);
    expect(views[1]?.payloadRedacted).toBe(true);
    expect(views[1]?.ownerPlayerId).toBeUndefined();
    expect(views[2]?.payload).toEqual({ note: "host-only fallback" });
    expect(views[3]?.payload).toEqual({ secret: "revealed mission" });
    expect(views[3]?.ownerPlayerId).toBe("p1");
    expect(JSON.stringify(views).includes("idempotency_key")).toBe(false);
    expect(JSON.stringify(views).includes("ask for ketchup")).toBe(false);
  });

  test("Oracle prophecy is readable by its owner and redacted from the host", () => {
    const oracle = row({
      game_id: "grilloracle",
      kind: "oracle-prophecy",
      payload: {
        version: 1,
        reading: {
          item_guess: "Charred zucchini",
          predictions: ["toast", "charger", "wrong name"],
        },
      },
    });

    const [hostView] = partyRecordViewsForHost([oracle]);
    const [ownerView] = partyRecordViewsForPlayer([oracle], { id: "p1", teamId: "forest" });
    const outsiderViews = partyRecordViewsForPlayer([oracle], { id: "p2", teamId: "lake" });

    expect(hostView?.payloadRedacted).toBe(true);
    expect(JSON.stringify(hostView).includes("wrong name")).toBe(false);
    expect(ownerView?.payloadRedacted).toBe(false);
    expect(JSON.stringify(ownerView)).toContain("wrong name");
    expect(outsiderViews).toEqual([]);
  });

  test("Still Life photo records and storage paths remain host-only", () => {
    const photo = row({
      game_id: "stilllife",
      kind: "stilllife-submission",
      visibility: "host",
      owner_player_id: null,
      owner_team_id: "forest",
      payload: {
        storagePath: "room_1/stilllife/round_1/forest/lot.jpg",
        submittedByPlayerId: "p1",
      },
    });

    const [hostView] = partyRecordViewsForHost([photo]);
    const ownerTeamViews = partyRecordViewsForPlayer([photo], { id: "p1", teamId: "forest" });
    const otherTeamViews = partyRecordViewsForPlayer([photo], { id: "p2", teamId: "lake" });

    expect(hostView?.payload).toEqual(photo.payload);
    expect(ownerTeamViews).toEqual([]);
    expect(otherTeamViews).toEqual([]);
  });

  test("Sommelier owner mapping and storage path remain host-only", () => {
    const submission = row({
      game_id: "sommelier",
      kind: "sommelier-submission",
      visibility: "host",
      payload: {
        entryId: "8474f5fb-0fb0-4f4a-a925-5c3a3cb31a77",
        ownerPlayerId: "p1",
        storagePath: "room_1/sommelier/session_1/p1/drink.jpg",
      },
    });

    const [hostView] = partyRecordViewsForHost([submission]);
    const ownerViews = partyRecordViewsForPlayer([submission], { id: "p1", teamId: "forest" });
    const outsiderViews = partyRecordViewsForPlayer([submission], { id: "p2", teamId: "lake" });

    expect(hostView?.payload).toEqual(submission.payload);
    expect(JSON.stringify(hostView)).toContain("8474f5fb-0fb0-4f4a-a925-5c3a3cb31a77");
    expect(ownerViews).toEqual([]);
    expect(outsiderViews).toEqual([]);
  });

  test("Contraband phrase is readable only by its owner before the public result", () => {
    const assignment = row({
      game_id: "contraband",
      kind: "contraband-assignment",
      payload: {
        version: 1,
        phraseId: "phrase_1",
        phrase: "I generally trust ducks",
        ownerPlayerId: "p1",
        assignedAt: 1,
        aiFallback: false,
      },
    });

    const [hostView] = partyRecordViewsForHost([assignment]);
    const [ownerView] = partyRecordViewsForPlayer([assignment], { id: "p1", teamId: "forest" });
    const outsiderViews = partyRecordViewsForPlayer([assignment], { id: "p2", teamId: "lake" });

    expect(hostView?.payloadRedacted).toBe(true);
    expect(JSON.stringify(hostView).includes("ducks")).toBe(false);
    expect(JSON.stringify(ownerView).includes("ducks")).toBe(true);
    expect(outsiderViews).toEqual([]);
  });

  test("Tongs transcript and recording path stay host-only", () => {
    const testimony = row({
      game_id: "tongsoftruth",
      kind: "tongs-testimony",
      visibility: "host",
      payload: {
        version: 1,
        roundId: "tongs_1_r1",
        transcript: "The foil escaped with my plan.",
        storagePath: "room/tongsoftruth/tongs_1_r1/p1-audio.webm",
      },
    });

    const [hostView] = partyRecordViewsForHost([testimony]);
    expect(JSON.stringify(hostView)).toContain("foil escaped");
    expect(partyRecordViewsForPlayer([testimony], { id: "p1", teamId: "forest" })).toEqual([]);
    expect(partyRecordViewsForPlayer([testimony], { id: "p2", teamId: "lake" })).toEqual([]);
  });

  test("Cross testimonies and audience predictions stay host-only", () => {
    const testimony = row({
      game_id: "crossexamination",
      kind: "cross-testimony",
      visibility: "host",
      payload: {
        version: 1,
        pairId: "cross_1_p1",
        transcript: "The glass fell after the foil escaped.",
        storagePath: "room/crossexamination/cross_1_p1/p1-secret.webm",
      },
    });
    const prediction = row({
      id: "prediction_1",
      game_id: "crossexamination",
      kind: "cross-prediction",
      visibility: "host",
      payload: { pairId: "cross_1_p1", voterPlayerId: "p2", category: "object" },
    });

    const hostViews = partyRecordViewsForHost([testimony, prediction]);
    expect(JSON.stringify(hostViews)).toContain("foil escaped");
    expect(JSON.stringify(hostViews)).toContain("object");
    expect(
      partyRecordViewsForPlayer([testimony, prediction], { id: "p1", teamId: "forest" }),
    ).toEqual([]);
    expect(
      partyRecordViewsForPlayer([testimony, prediction], { id: "p2", teamId: "lake" }),
    ).toEqual([]);
  });

  test("player receives only owned/team secrets and room-wide reveals", () => {
    const views = partyRecordViewsForPlayer(
      [
        row(),
        row({ id: "record_p2", owner_player_id: "p2", payload: { secret: "other player" } }),
        row({
          id: "record_team",
          owner_player_id: null,
          owner_team_id: "forest",
          payload: { secret: "team secret" },
        }),
        row({ id: "record_sealed", visibility: "sealed", payload: { secret: "sealed own" } }),
        row({ id: "record_host", visibility: "host", payload: { secret: "host only" } }),
        row({
          id: "record_revealed",
          owner_player_id: "p2",
          visibility: "revealed",
          payload: { secret: "public reveal" },
          revealed_at: "2026-07-15T15:00:00.000Z",
        }),
      ],
      { id: "p1", teamId: "forest" },
    );

    expect(views.map((view) => view.id)).toEqual([
      "record_1",
      "record_team",
      "record_sealed",
      "record_revealed",
    ]);
    expect(views[0]?.payload).toEqual({ secret: "ask for ketchup without speaking" });
    expect(views[1]?.payload).toEqual({ secret: "team secret" });
    expect(views[2]?.payloadRedacted).toBe(true);
    expect("payload" in views[2]!).toBe(false);
    expect(views[3]?.payload).toEqual({ secret: "public reveal" });
    expect(JSON.stringify(views).includes("other player")).toBe(false);
    expect(JSON.stringify(views).includes("host only")).toBe(false);
    expect(JSON.stringify(views).includes("sealed own")).toBe(false);
  });
});
