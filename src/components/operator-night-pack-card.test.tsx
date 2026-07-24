import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorNightPackCard, type OperatorNightPackCardInput } from "./operator-night-pack-card";

const SECRET_STORY =
  "SECRET_THREAD_TEXT hs_should_not_leak #host-access hostSecret=never storySeed=raw";

const BASE_INPUT: OperatorNightPackCardInput = {
  venue: "park",
  targetDurationMinutes: 120,
  expectedPlayers: 8,
  storySeedConfigured: false,
};

const CONFIGURED_INPUT: OperatorNightPackCardInput = {
  ...BASE_INPUT,
  storySeedConfigured: true,
};

describe("operator night pack card", () => {
  test("renders visible title, program facts, and first cues", () => {
    const html = renderToStaticMarkup(
      <OperatorNightPackCard context="landing" input={BASE_INPUT} />,
    );

    expect(html).toContain("Operator night pack");
    expect(html).toContain('data-testid="operator-night-pack"');
    expect(html).toContain('data-venue="park"');
    expect(html).toContain('data-duration-minutes="120"');
    expect(html).toContain("8 guests");
    expect(html).toContain("no thread configured");
    expect(html).toContain("agh-night-pack-next");
    expect(html).toContain("<ol");
    expect(html).toContain("min");
  });

  test("exposes real working HTML buttons for both downloads", () => {
    const html = renderToStaticMarkup(<OperatorNightPackCard context="host" input={BASE_INPUT} />);

    expect(html).toContain('data-testid="operator-night-pack-download-md"');
    expect(html).toContain('data-testid="operator-night-pack-download-json"');
    expect(html).toContain("Download Markdown");
    expect(html).toContain("Download JSON");
    expect((html.match(/type="button"/g) ?? []).length >= 2).toBe(true);
    expect(html.includes('role="button"')).toBe(false);
    expect(html.includes("<a ")).toBe(false);
  });

  test("disclosure contains the full cue list and live-remap warning", () => {
    const html = renderToStaticMarkup(
      <OperatorNightPackCard context="landing" input={BASE_INPUT} />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain('data-testid="operator-night-pack-full-cues"');
    expect(html).toContain('data-testid="operator-night-pack-remap-warning"');
    expect(html.toLowerCase()).toContain("live remap is unavailable");
    expect(html).toContain("Full timed cue sheet");
  });

  test("host and landing contexts expose distinct stable attributes without changing privacy", () => {
    const landing = renderToStaticMarkup(
      <OperatorNightPackCard context="landing" input={CONFIGURED_INPUT} />,
    );
    const host = renderToStaticMarkup(
      <OperatorNightPackCard context="host" input={CONFIGURED_INPUT} />,
    );

    expect(landing).toContain('data-context="landing"');
    expect(landing).toContain("agh-night-pack--landing");
    expect(host).toContain('data-context="host"');
    expect(host).toContain("agh-night-pack--host");
    expect(landing).toContain('data-story-seed-configured="true"');
    expect(host).toContain('data-story-seed-configured="true"');
    expect(landing).toContain("thread configured");
    expect(host).toContain("thread configured");
    expect(landing.includes(SECRET_STORY)).toBe(false);
    expect(host.includes(SECRET_STORY)).toBe(false);
  });

  test("landing omits duplicate program metrics and essentials; host keeps them", () => {
    const landing = renderToStaticMarkup(
      <OperatorNightPackCard context="landing" input={BASE_INPUT} />,
    );
    const host = renderToStaticMarkup(<OperatorNightPackCard context="host" input={BASE_INPUT} />);

    expect(landing.includes("agh-night-pack-program")).toBe(false);
    expect(landing.includes(">Essentials</h3>")).toBe(false);
    expect(host).toContain("agh-night-pack-program");
    expect(host).toContain(">Essentials</h3>");
    expect(host).toContain("game moments");
    expect(landing).toContain("Equipment");
    expect(landing).toContain("Recovery card");
  });

  test("permanent privacy note and empty live status are both present", () => {
    const html = renderToStaticMarkup(
      <OperatorNightPackCard context="landing" input={CONFIGURED_INPUT} />,
    );

    expect(html).toContain('data-testid="operator-night-pack-privacy-note"');
    expect(html).toContain('data-testid="operator-night-pack-status"');
    expect(html).toContain("Exports stay on this device");
    expect(html).toContain("Tonight&#x27;s thread text");
    expect(html).toContain("aria-describedby");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html.includes(SECRET_STORY)).toBe(false);
    expect(html.includes("SECRET_THREAD_TEXT")).toBe(false);
    expect(html.includes("thread-configured")).toBe(false);

    const statusMatch = html.match(/data-testid="operator-night-pack-status"[^>]*>([\s\S]*?)<\/p>/);
    expect(statusMatch?.[1]?.trim() ?? "missing").toBe("");
  });

  test("raw story seed is absent from rendered markup and safe props only say configured", () => {
    const html = renderToStaticMarkup(
      <OperatorNightPackCard context="landing" input={CONFIGURED_INPUT} />,
    );

    for (const sentinel of [
      SECRET_STORY,
      "SECRET_THREAD_TEXT",
      "#host-access",
      "hs_should_not_leak",
      "hostSecret",
      "storySeed",
    ]) {
      expect(html.includes(sentinel)).toBe(false);
    }
    expect(html).toContain("thread configured");
    expect(html.includes("no thread configured")).toBe(false);
  });

  test("does not pull icon-pack markup or fake controls", () => {
    const html = renderToStaticMarkup(
      <OperatorNightPackCard context="landing" input={BASE_INPUT} />,
    );

    expect(html.toLowerCase().includes("lucide")).toBe(false);
    expect(html.includes("svg")).toBe(false);
    expect(html.includes('role="switch"')).toBe(false);
    expect(html.includes('role="tab"')).toBe(false);
    expect(html.includes("aria-disabled")).toBe(false);
  });
});
