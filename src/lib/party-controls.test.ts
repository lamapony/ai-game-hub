import { describe, expect, test } from "bun:test";
import { emptyRoomState } from "./types";
import { selectExperienceState, selectPartyActState } from "./party-controls";

describe("party controls", () => {
  test("selects Smoke & Neon with route-specific first acts", () => {
    const normal = selectExperienceState(emptyRoomState(), "smoke-neon-norrebro", "normal", 100);
    expect(normal.party).toEqual({
      experienceId: "smoke-neon-norrebro",
      actId: "grill",
      venue: "grill-site",
      contingency: "normal",
      uiLocale: "en",
      contentLocale: "ru",
      actStartedAt: 100,
    });
    expect(normal.venue).toBe("park");

    const barOnly = selectExperienceState(emptyRoomState(), "smoke-neon-norrebro", "bar-only", 200);
    expect(barOnly.party?.actId).toBe("bar");
    expect(barOnly.party?.venue).toBe("bar");
    expect(barOnly.venue).toBe("bar");
  });

  test("moves only to acts declared by the selected route", () => {
    const state = selectExperienceState(emptyRoomState(), "smoke-neon-norrebro", "normal", 100);
    const bar = selectPartyActState(state, "bar", 300);
    expect(bar?.party?.actId).toBe("bar");
    expect(bar?.party?.actStartedAt).toBe(300);
    expect(bar?.venue).toBe("bar");

    expect(selectPartyActState(state, "classic", 300)).toBeNull();
  });

  test("classic bar-only remains compatible with the legacy venue field", () => {
    const state = selectExperienceState(emptyRoomState(), "classic-park", "bar-only", 10);
    expect(state.party?.actId).toBe("bar");
    expect(state.venue).toBe("bar");
  });
});
