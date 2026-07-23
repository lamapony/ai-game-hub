import { describe, expect, test } from "bun:test";
import { buildReleaseHealth, releaseHealthSummaryLines } from "./release-health";

describe("release health", () => {
  test("is ready only when every live dependency is ready", () => {
    const report = buildReleaseHealth(
      {
        privateMemory: true,
        scoreLedger: true,
        mediaStorage: true,
        aiRuntime: true,
      },
      123,
    );

    expect(report.status).toBe("ready");
    expect(report.checkedAt).toBe(123);
    expect(report.checks.every((check) => check.ready)).toBe(true);
  });

  test("turns missing dependencies into sanitized, actionable checks", () => {
    const report = buildReleaseHealth({
      privateMemory: false,
      scoreLedger: false,
      mediaStorage: false,
      aiRuntime: false,
    });

    expect(report.status).toBe("degraded");
    expect(report.checks.map((check) => check.id)).toEqual([
      "private-memory",
      "score-ledger",
      "media-storage",
      "ai-runtime",
    ]);
    expect(
      report.checks
        .map((check) => check.detail)
        .join(" ")
        .includes("20260715143000"),
    ).toBe(true);
    expect(
      report.checks
        .map((check) => check.detail)
        .join(" ")
        .includes("20260715151500"),
    ).toBe(true);
    expect(
      report.checks
        .map((check) => check.detail)
        .join(" ")
        .includes("20260716120000"),
    ).toBe(true);
    expect(JSON.stringify(report).includes("service-role")).toBe(false);
    expect(JSON.stringify(report).includes("provider error")).toBe(false);
  });

  test("formats a deterministic CLI report without backend error payloads", () => {
    const lines = releaseHealthSummaryLines(
      buildReleaseHealth({
        privateMemory: false,
        scoreLedger: true,
        mediaStorage: true,
        aiRuntime: true,
      }),
    );

    expect(lines[0]).toBe("Backend release preflight: DEGRADED");
    expect(lines[1]?.startsWith("FAIL Private party memory — Apply migration")).toBe(true);
    expect(lines.slice(2).every((line) => line.startsWith("PASS"))).toBe(true);
    expect(lines.join("\n").includes("service-role")).toBe(false);
  });
});
