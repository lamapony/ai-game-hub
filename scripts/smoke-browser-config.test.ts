import { describe, expect, test } from "bun:test";
import {
  BROWSER_SMOKE_MATRIX,
  BROWSER_SMOKE_VENUES,
  browserSmokeScenarioLabel,
  parseBrowserSmokeOptions,
  parseBrowserSmokeScenarios,
} from "./smoke-browser-config";

function thrownMessage(run: () => unknown) {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("browser smoke scenario config", () => {
  test("defaults to the minimum live group on the standard park route", () => {
    expect(parseBrowserSmokeScenarios([], {})).toEqual([
      { venue: "park", durationMinutes: 180, playerCount: 8, expectedPlayers: 8 },
    ]);
  });

  test("accepts every supported single-scenario boundary from CLI", () => {
    expect(
      parseBrowserSmokeScenarios(
        ["--venue=festival", "--duration=240", "--players=30", "--expected-players=30"],
        {},
      ),
    ).toEqual([{ venue: "festival", durationMinutes: 240, playerCount: 30, expectedPlayers: 30 }]);
  });

  test("matrix covers every venue, every duration and both player boundaries", () => {
    const scenarios = parseBrowserSmokeScenarios(["--matrix"], {});

    expect(new Set(scenarios.map((scenario) => scenario.venue))).toEqual(
      new Set(BROWSER_SMOKE_VENUES),
    );
    expect(new Set(scenarios.map((scenario) => scenario.durationMinutes))).toEqual(
      new Set([120, 180, 240]),
    );
    expect(new Set(scenarios.map((scenario) => scenario.playerCount))).toEqual(new Set([8, 30]));
    expect(scenarios).toEqual(BROWSER_SMOKE_MATRIX);
    expect(browserSmokeScenarioLabel(scenarios[3]!)).toBe("festival-180m-30p");
  });

  test("rejects unsupported settings before opening Chrome", () => {
    expect(thrownMessage(() => parseBrowserSmokeScenarios(["--venue=boat"], {}))).toContain(
      "venue must be one of",
    );
    expect(thrownMessage(() => parseBrowserSmokeScenarios(["--duration=90"], {}))).toContain(
      "duration must be one of",
    );
    expect(thrownMessage(() => parseBrowserSmokeScenarios(["--players=31"], {}))).toContain(
      "players must be 8–30",
    );
  });

  test("keeps the full journey distinct from fault and media modes", () => {
    expect(parseBrowserSmokeOptions(["--journey"], {})).toEqual({
      brief: false,
      journey: true,
      media: false,
      resilience: false,
    });
    expect(parseBrowserSmokeOptions([], { BROWSER_SMOKE_JOURNEY: "YES" }).journey).toBe(true);
    expect(parseBrowserSmokeOptions(["--media"], {})).toEqual({
      brief: false,
      journey: false,
      media: true,
      resilience: true,
    });
  });

  test("offers a setup-only matrix for the self-serve host brief", () => {
    expect(parseBrowserSmokeOptions(["--brief"], {})).toEqual({
      brief: true,
      journey: false,
      media: false,
      resilience: false,
    });
    expect(parseBrowserSmokeOptions([], { BROWSER_SMOKE_BRIEF: "YES" }).brief).toBe(true);
  });
});
