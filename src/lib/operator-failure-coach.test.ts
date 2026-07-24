import { describe, expect, test } from "bun:test";
import {
  OPERATOR_FAILURE_COACH_ACTION_INTENTS,
  OPERATOR_FAILURE_SYMPTOMS,
  buildOperatorFailureCoach,
  type OperatorFailureCoach,
  type OperatorFailureSymptom,
} from "./operator-failure-coach";

const INCIDENT_SYMPTOMS = OPERATOR_FAILURE_SYMPTOMS.filter(
  (symptom): symptom is Exclude<OperatorFailureSymptom, "healthy"> => symptom !== "healthy",
);

const CLOSED_ACTION_INTENTS = [
  "pause-and-resync",
  "use-manual-ai",
  "skip-media-phase",
  "open-media-permissions",
  "open-live-safety",
  "retry-health-check",
] as const;

const FORBIDDEN_SENTINELS = [
  "#host-access",
  "hs_",
  "hostSecret",
  "apiKey",
  "SQL",
  "UPDATE",
  "DELETE",
  "scoreReason",
  "transcript",
  "mediaUrl",
  "mediaPath",
  "/recordings/",
  "ECONNRESET",
  "provider error",
  "OpenAI",
  "Anthropic",
] as const;

function integrityMentions(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("route progress") &&
    lower.includes("private records") &&
    lower.includes("score ledger")
  );
}

function coachText(coach: OperatorFailureCoach) {
  return [
    coach.symptom,
    coach.title,
    coach.nextAction,
    coach.actionIntent,
    coach.mustRemainIntact,
    String(coach.requiresStateMutation),
  ].join(" ");
}

describe("operator failure coach", () => {
  test("action intents stay on the closed list", () => {
    expect([...OPERATOR_FAILURE_COACH_ACTION_INTENTS]).toEqual([...CLOSED_ACTION_INTENTS]);
  });

  test("symptom union fixture table is exhaustive", () => {
    expect([...OPERATOR_FAILURE_SYMPTOMS]).toEqual([
      "healthy",
      "network-lost",
      "backend-not-ready",
      "ai-unavailable",
      "ai-budget-exhausted",
      "media-permission-denied",
      "media-phase-stalled",
      "host-device-lost",
    ]);

    const seen = new Set<OperatorFailureSymptom>();
    for (const symptom of OPERATOR_FAILURE_SYMPTOMS) {
      seen.add(symptom);
      const result = buildOperatorFailureCoach(symptom);
      if (symptom === "healthy") {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.symptom).toBe(symptom);
      }
    }
    expect(seen.size).toBe(OPERATOR_FAILURE_SYMPTOMS.length);
  });

  test("healthy produces no incident card", () => {
    expect(buildOperatorFailureCoach("healthy")).toBeNull();
  });

  test("every incident has exactly one nextAction string, one closed intent, and no alternate-action field", () => {
    for (const symptom of INCIDENT_SYMPTOMS) {
      const coach = buildOperatorFailureCoach(symptom);
      expect(coach).not.toBeNull();
      if (!coach) continue;

      expect(coach.symptom).toBe(symptom);
      expect(coach.title.trim().length > 0).toBe(true);
      expect(typeof coach.nextAction).toBe("string");
      expect(coach.nextAction.trim().length > 0).toBe(true);
      expect(coach.nextAction.includes("\n")).toBe(false);
      expect(
        (OPERATOR_FAILURE_COACH_ACTION_INTENTS as readonly string[]).includes(coach.actionIntent),
      ).toBe(true);
      expect(CLOSED_ACTION_INTENTS.includes(coach.actionIntent)).toBe(true);
      expect(coach.requiresStateMutation).toBe(false);

      const keys = Object.keys(coach).sort();
      expect(keys).toEqual(
        [
          "actionIntent",
          "mustRemainIntact",
          "nextAction",
          "requiresStateMutation",
          "symptom",
          "title",
        ].sort(),
      );
      expect("alternateAction" in coach).toBe(false);
      expect("secondaryAction" in coach).toBe(false);
      expect("orElse" in coach).toBe(false);
    }
  });

  test("integrity language mentions route progress, private records, and score ledger", () => {
    for (const symptom of INCIDENT_SYMPTOMS) {
      const coach = buildOperatorFailureCoach(symptom);
      expect(coach).not.toBeNull();
      if (!coach) continue;
      expect(integrityMentions(coach.mustRemainIntact)).toBe(true);
    }
  });

  test("serialized results omit secrets, SQL, score reasons, media paths, and provider text", () => {
    for (const symptom of INCIDENT_SYMPTOMS) {
      const coach = buildOperatorFailureCoach(symptom);
      expect(coach).not.toBeNull();
      if (!coach) continue;
      const serialized = JSON.stringify(coach);
      for (const sentinel of FORBIDDEN_SENTINELS) {
        expect(serialized.includes(sentinel)).toBe(false);
      }
    }
  });

  test("host-device-lost points at Live safety and a trusted backup device", () => {
    const coach = buildOperatorFailureCoach("host-device-lost");
    expect(coach).not.toBeNull();
    if (!coach) return;

    expect(coach.actionIntent).toBe("open-live-safety");
    const text = coachText(coach);
    expect(text).toContain("Live safety");
    expect(text.toLowerCase()).toContain("trusted");
    expect(text.toLowerCase()).toContain("backup");
    expect(text.includes("#host-access")).toBe(false);
    expect(text.includes("hs_")).toBe(false);
    expect(text.toLowerCase().includes("secret")).toBe(false);
    expect(text.toLowerCase().includes("private link")).toBe(false);
  });

  test("AI failure and budget paths use manual recovery and never advise cap changes", () => {
    for (const symptom of ["ai-unavailable", "ai-budget-exhausted"] as const) {
      const coach = buildOperatorFailureCoach(symptom);
      expect(coach).not.toBeNull();
      if (!coach) continue;

      expect(coach.actionIntent).toBe("use-manual-ai");
      const text = coachText(coach).toLowerCase();
      expect(text.includes("manual") || text.includes("fallback")).toBe(true);
      expect(text.includes("raise")).toBe(false);
      expect(text.includes("higher cap")).toBe(false);
      expect(text.includes("increase")).toBe(false);
      expect(text.includes("bypass")).toBe(false);
      expect(text.includes("budget cap")).toBe(false);
    }
  });

  test("media-phase-stalled remains the skip path", () => {
    const stalled = buildOperatorFailureCoach("media-phase-stalled");
    expect(stalled).not.toBeNull();
    if (!stalled) return;

    expect(stalled.actionIntent).toBe("skip-media-phase");
    const lower = stalled.nextAction.toLowerCase();
    expect(lower.includes("skip")).toBe(true);
    expect(lower.includes("permission")).toBe(false);
    expect(lower.includes("site settings")).toBe(false);
  });

  test("backend-not-ready stays a blocked health repair, not a tip", () => {
    const coach = buildOperatorFailureCoach("backend-not-ready");
    expect(coach).not.toBeNull();
    if (!coach) return;

    expect(coach.actionIntent).toBe("retry-health-check");
    const text = coachText(coach).toLowerCase();
    expect(text.includes("live safety") || text.includes("retry")).toBe(true);
    expect(text.includes("tip")).toBe(false);
    expect(text.includes("optional")).toBe(false);
    expect(text.includes("when convenient")).toBe(false);
    expect(text.includes("before") || text.includes("fix") || text.includes("blocked")).toBe(true);
  });

  test("network-lost points at pause and resync", () => {
    const coach = buildOperatorFailureCoach("network-lost");
    expect(coach).not.toBeNull();
    if (!coach) return;
    expect(coach.actionIntent).toBe("pause-and-resync");
    const text = coachText(coach).toLowerCase();
    expect(text.includes("pause") || text.includes("resync")).toBe(true);
  });

  test("media-permission-denied maps to open-media-permissions with one non-branching next action", () => {
    const coach = buildOperatorFailureCoach("media-permission-denied");
    expect(coach).not.toBeNull();
    if (!coach) return;

    expect(coach.actionIntent).toBe("open-media-permissions");
    expect(coach.actionIntent === "skip-media-phase").toBe(false);

    const next = coach.nextAction;
    const lower = next.toLowerCase();
    expect(lower.includes("site settings") || lower.includes("permission")).toBe(true);
    expect(lower.includes("grant") || lower.includes("allow") || lower.includes("access")).toBe(
      true,
    );
    expect(lower.includes("retry") || lower.includes("return")).toBe(true);

    expect(lower.includes("if ")).toBe(false);
    expect(lower.includes("otherwise")).toBe(false);
    expect(next.includes(";")).toBe(false);
    expect(lower.includes("skip")).toBe(false);
  });

  test("builder is deterministic and does not mutate a frozen symptom wrapper", () => {
    const wrapper = Object.freeze({ symptom: "network-lost" as const });
    const first = buildOperatorFailureCoach(wrapper.symptom);
    const second = buildOperatorFailureCoach(wrapper.symptom);

    expect(first).toEqual(second);
    expect(wrapper).toEqual({ symptom: "network-lost" });

    for (const symptom of OPERATOR_FAILURE_SYMPTOMS) {
      expect(buildOperatorFailureCoach(symptom)).toEqual(buildOperatorFailureCoach(symptom));
    }
  });

  test("never suggests SQL edits, room recreation, score edits, or repeated uploads", () => {
    for (const symptom of INCIDENT_SYMPTOMS) {
      const coach = buildOperatorFailureCoach(symptom);
      expect(coach).not.toBeNull();
      if (!coach) continue;
      const text = coachText(coach).toLowerCase();
      expect(text.includes("sql")).toBe(false);
      expect(text.includes("recreate")).toBe(false);
      expect(text.includes("new room")).toBe(false);
      expect(text.includes("clear state")).toBe(false);
      expect(text.includes("edit score")).toBe(false);
      expect(text.includes("upload again")).toBe(false);
      expect(text.includes("resend")).toBe(false);
      expect(text.includes("remap")).toBe(false);
    }
  });
});
