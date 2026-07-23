import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickStartLaunchSignal } from "./quick-start-launch-signal";

describe("quick-start launch signal", () => {
  test("puts the live instruction and one action before the supporting facts", () => {
    const html = renderToStaticMarkup(
      <QuickStartLaunchSignal
        coach={{
          state: "ready-to-start",
          tone: "ready",
          signal: "START.",
          title: "The room is ready. Open with the arrival cue.",
          detail: "All required checks passed in 14 seconds. Extra guests can join later.",
          action: "start",
          actionLabel: "Start the party",
        }}
        venue="park"
        durationMinutes={180}
        elapsedSeconds={14}
        joinedPlayers={8}
        backendStatus="ready"
        facts={[
          { label: "Program", value: "180 minutes, exact route" },
          { label: "Phones", value: "8/8 ready" },
          { label: "First cue", value: "Park arrival · 6 min" },
        ]}
        action={<button type="button">Start the party</button>}
      />,
    );

    expect(html).toContain("START.");
    expect(html).toContain('data-signal="START."');
    expect(html).toContain("LIVE DEPARTURE / PARK / 3 HOURS");
    expect(html).toContain("8 joined · service ready · 00:14");
    expect(html.indexOf("START.") < html.indexOf("Program")).toBe(true);
    expect(html.match(/<button/g)?.length).toBe(1);
  });

  test("keeps blocked service language explicit", () => {
    const html = renderToStaticMarkup(
      <QuickStartLaunchSignal
        coach={{
          state: "repair-backend",
          tone: "blocked",
          signal: "FIX.",
          title: "Fix the live service before starting",
          detail: "Retry the named check.",
          action: "live-safety",
          actionLabel: "Open Live safety",
        }}
        venue="bar"
        durationMinutes={120}
        elapsedSeconds={75}
        joinedPlayers={10}
        backendStatus="degraded"
        facts={[]}
        action={<a href="#live-safety">Open Live safety</a>}
      />,
    );

    expect(html).toContain("FIX.");
    expect(html).toContain('data-signal="FIX."');
    expect(html).toContain("service blocked");
    expect(html).toContain("01:15");
  });
});
