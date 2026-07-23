import { describe, expect, test } from "bun:test";
import type { CreatePartyRecordInput, PartyRecordRow } from "./party-records";
import { emptyRoomState } from "./types";
import {
  assertPartyRecordOwner,
  currentPartyRecordFilters,
  partyRecordIdentityMatches,
  resolvePartyRecordWrite,
} from "./party-records.server";

const input: CreatePartyRecordInput = {
  idempotencyKey: "mission:p1:run_1",
  runId: "run_1",
  gameId: "smoke-screen",
  ownerPlayerId: "p1",
  kind: "mission",
  visibility: "player",
  payload: { secret: "mission" },
};

function record(overrides: Partial<PartyRecordRow> = {}): PartyRecordRow {
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
    payload: { secret: "mission" },
    idempotency_key: "mission:p1:run_1",
    created_at: "2026-07-15T12:00:00.000Z",
    revealed_at: null,
    ...overrides,
    session_started_at: overrides.session_started_at ?? 1_234,
  };
}

function rejectedStatus(run: () => unknown) {
  try {
    run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("party record server invariants", () => {
  test("scopes cross-game evidence to the current reusable-room session", () => {
    const state = emptyRoomState("Host");
    state.party = { ...state.party!, sessionStartedAt: 1_234 };

    expect(currentPartyRecordFilters(state)).toEqual({
      createdAtOrAfter: 1_234,
      sessionStartedAt: 1_234,
    });
    expect(currentPartyRecordFilters(state, { kind: "stilllife-result" })).toEqual({
      kind: "stilllife-result",
      createdAtOrAfter: 1_234,
      sessionStartedAt: 1_234,
    });
    expect(currentPartyRecordFilters(emptyRoomState("Host"), { kind: "legacy" })).toEqual({
      kind: "legacy",
    });
  });

  test("accepts only player/team owners present in current server state", () => {
    const state = {
      ...emptyRoomState("Host"),
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
    };

    expect(assertPartyRecordOwner(state, input)).toBeUndefined();
    expect(
      rejectedStatus(() => assertPartyRecordOwner(state, { ...input, ownerPlayerId: "missing" })),
    ).toBe(409);
    expect(
      rejectedStatus(() =>
        assertPartyRecordOwner(state, {
          ...input,
          ownerPlayerId: undefined,
          ownerTeamId: "missing",
        }),
      ),
    ).toBe(409);
  });

  test("idempotency identity survives later seal/reveal lifecycle changes", () => {
    expect(partyRecordIdentityMatches(record(), input, "grill", 1_234)).toBe(true);
    expect(
      partyRecordIdentityMatches(
        record({
          visibility: "revealed",
          revealed_at: "2026-07-15T15:00:00.000Z",
        }),
        input,
        "grill",
        1_234,
      ),
    ).toBe(true);
    expect(
      partyRecordIdentityMatches(record({ owner_player_id: "p2" }), input, "grill", 1_234),
    ).toBe(false);
    expect(partyRecordIdentityMatches(record(), input, "grill", 9_999)).toBe(false);
  });

  test("returns the original row on replay and rejects key reuse for another owner", () => {
    const first = resolvePartyRecordWrite({
      inserted: record(),
      existing: null,
      input,
      actId: "grill",
      sessionStartedAt: 1_234,
    });
    expect(first.replayed).toBe(false);

    const replay = resolvePartyRecordWrite({
      inserted: null,
      existing: record({ visibility: "sealed" }),
      input,
      actId: "grill",
      sessionStartedAt: 1_234,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.row.id).toBe("record_1");

    expect(
      rejectedStatus(() =>
        resolvePartyRecordWrite({
          inserted: null,
          existing: record({ owner_player_id: "p2" }),
          input,
          actId: "grill",
          sessionStartedAt: 1_234,
        }),
      ),
    ).toBe(409);
  });
});
