import { describe, expect, test } from "bun:test";
import { ROOM_STATE_SCHEMA_VERSION, type PartyContext } from "./party-context";
import { migrateRoomState } from "./room-state-migration";
import { emptyRoomState, type RoomState } from "./types";

function legacyRoom(overrides: Partial<RoomState> = {}): RoomState {
  const current = emptyRoomState("Legacy Host");
  const { schemaVersion: _schemaVersion, party: _party, ...legacy } = current;
  return { ...legacy, ...overrides };
}

describe("room state migration", () => {
  test("new rooms start at V2 with classic park defaults", () => {
    const state = emptyRoomState("Host");

    expect(state.schemaVersion).toBe(ROOM_STATE_SCHEMA_VERSION);
    expect(state.party).toEqual({
      experienceId: "classic-park",
      actId: "classic",
      venue: "park",
      contingency: "normal",
      uiLocale: "en",
      contentLocale: "en",
    });
  });

  test("migrates a legacy park room without touching game data", () => {
    const legacy = legacyRoom({
      currentGame: "whoamong",
      whoamong: {
        phase: "voting",
        roundId: "wa_legacy",
        roundNumber: 2,
        totalRounds: 5,
        usedPromptIds: ["prompt_1"],
      },
    });
    const migrated = migrateRoomState(legacy);

    expect(migrated === legacy).toBe(false);
    expect(migrated.schemaVersion).toBe(ROOM_STATE_SCHEMA_VERSION);
    expect(migrated.party?.actId).toBe("classic");
    expect(migrated.party?.venue).toBe("park");
    expect(migrated.whoamong).toBe(legacy.whoamong);
    expect(migrated.currentGame).toBe("whoamong");
  });

  test("maps a legacy bar room to the bar act", () => {
    const migrated = migrateRoomState(legacyRoom({ venue: "bar" }));

    expect(migrated.party?.experienceId).toBe("classic-park");
    expect(migrated.party?.actId).toBe("bar");
    expect(migrated.party?.venue).toBe("bar");
    expect(migrated.party?.contingency).toBe("bar-only");
  });

  test("replaces invalid party metadata with backward-compatible defaults", () => {
    const invalid = legacyRoom({ venue: "bar" });
    (invalid as unknown as { party: unknown }).party = {
      experienceId: "unknown",
      actId: "afterparty",
    };

    const migrated = migrateRoomState(invalid);

    expect(migrated.party?.actId).toBe("bar");
    expect(migrated.party?.uiLocale).toBe("en");
  });

  test("preserves a valid V2 room by identity", () => {
    const party: PartyContext = {
      experienceId: "smoke-neon-norrebro",
      actId: "grill",
      venue: "grill-site",
      contingency: "compact",
      uiLocale: "en",
      contentLocale: "ru",
      storySeed: "A public birthday cake with one missing candle",
      actStartedAt: 1234,
    };
    const state: RoomState = { ...emptyRoomState("Host"), party };

    expect(migrateRoomState(state)).toBe(state);
    expect(state.party?.storySeed).toContain("birthday cake");
  });

  test("preserves a valid room-level manual AI mode", () => {
    const state = emptyRoomState("Host");
    state.party = { ...state.party!, aiMode: "manual" };

    expect(migrateRoomState(state)).toBe(state);
    expect(state.party.aiMode).toBe("manual");
  });
});
