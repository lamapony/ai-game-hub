import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildOperatorFailureCoach } from "@/lib/operator-failure-coach";
import { OperatorFailureCoachCard } from "./operator-failure-coach-card";

describe("operator failure coach card", () => {
  test("is absent for null", () => {
    const html = renderToStaticMarkup(<OperatorFailureCoachCard coach={null} />);
    expect(html).toBe("");
  });

  test("contains one action and integrity line for an incident", () => {
    const coach = buildOperatorFailureCoach("network-lost");
    expect(coach).not.toBeNull();
    if (!coach) return;

    const html = renderToStaticMarkup(<OperatorFailureCoachCard coach={coach} />);
    expect(html).toContain('data-testid="operator-failure-coach"');
    expect(html).toContain('data-symptom="network-lost"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(coach.title);
    expect(html).toContain('data-testid="operator-failure-coach-action"');
    expect(html).toContain(coach.nextAction);
    expect(html).toContain('data-testid="operator-failure-coach-integrity"');
    expect(html).toContain(coach.mustRemainIntact);
    expect((html.match(/data-testid="operator-failure-coach-action"/g) ?? []).length).toBe(1);
    expect(html.includes("<button")).toBe(false);
    expect(html.includes("<a ")).toBe(false);
  });

  test("does not pull icon-pack dependency or fake control markup", () => {
    const coach = buildOperatorFailureCoach("ai-budget-exhausted");
    expect(coach).not.toBeNull();
    if (!coach) return;

    const html = renderToStaticMarkup(<OperatorFailureCoachCard coach={coach} />);
    expect(html.toLowerCase().includes("lucide")).toBe(false);
    expect(html.includes("svg")).toBe(false);
    expect(html.includes('role="button"')).toBe(false);
    expect(html.includes('role="switch"')).toBe(false);
  });
});
