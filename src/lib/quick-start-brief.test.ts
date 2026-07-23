import { describe, expect, test } from "bun:test";
import { QUICK_START_DURATIONS, QUICK_START_VENUES, type QuickStartInput } from "./quick-start";
import { buildQuickStartBrief } from "./quick-start-brief";

describe("quick-start host brief", () => {
  test("explains every supported route without changing the exact duration promise", () => {
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const input: QuickStartInput = {
          venue,
          targetDurationMinutes,
          expectedPlayers: 12,
        };
        const brief = buildQuickStartBrief(input);

        expect(brief.venue).toBe(venue);
        expect(brief.targetDurationMinutes).toBe(targetDurationMinutes);
        expect(brief.routeDurationMinutes).toBe(targetDurationMinutes);
        expect(brief.expectedPlayers).toBe(12);
        expect(brief.gameMoments > 0).toBe(true);
        expect(brief.distinctGames > 0).toBe(true);
        expect(brief.guidedBreaks > 0).toBe(true);
        expect(brief.hasFinale).toBe(true);
        expect(brief.essentials.length >= 4).toBe(true);
        expect(brief.recoveryPromise).toContain("without losing the route or finale");
      }
    }
  });

  test("turns technical game capabilities into equipment a first-time host understands", () => {
    const festival = buildQuickStartBrief({
      venue: "festival",
      targetDurationMinutes: 240,
      expectedPlayers: 30,
    });

    expect(festival.equipment.map((item) => item.id)).toEqual(["camera", "microphone", "playback"]);
    expect(festival.equipment.every((item) => item.momentCount > 0)).toBe(true);
    expect(festival.essentials.join(" ")).toContain("30 guests");
    expect(festival.essentials.join(" ")).toContain("regroup point");
  });

  test("carries the normalized party-specific thread into the host brief", () => {
    const brief = buildQuickStartBrief({
      venue: "park",
      targetDurationMinutes: 120,
      expectedPlayers: 10,
      storySeed: "  Niko's promotion   and a cursed picnic fork ",
    });

    expect(brief.storySeed).toBe("Niko's promotion and a cursed picnic fork");
  });

  test("does not invent microphone or speaker needs for a camera-only compact home route", () => {
    const home = buildQuickStartBrief({
      venue: "home",
      targetDurationMinutes: 120,
      expectedPlayers: 8,
    });

    expect(home.equipment.map((item) => item.id)).toEqual(["camera"]);
    expect(home.essentials.join(" ")).toContain("no special props");
  });
});
