import { describe, expect, test } from "bun:test";
import { getExperienceRoute } from "@/experiences/catalog";
import {
  QUICK_START_DURATIONS,
  QUICK_START_PROFILES,
  QUICK_START_VENUES,
  quickStartContingency,
  type QuickStartInput,
} from "./quick-start";
import { buildOperatorNightPack, type OperatorNightPack } from "./operator-night-pack";
import {
  assertOperatorNightPackPrivacy,
  formatOperatorNightPackJson,
  formatOperatorNightPackMarkdown,
  operatorNightPackFilename,
} from "./operator-night-pack-export";

const SECRET_STORY =
  "SECRET_THREAD_TEXT hs_should_not_leak #host-access hostSecret=never storySeed=raw";

const FORBIDDEN_SENTINELS = [
  SECRET_STORY,
  "SECRET_THREAD_TEXT",
  "#host-access",
  "hs_should_not_leak",
  "hs_",
  '"hostSecret"',
  "hostSecret=",
  '"storySeed":',
  "playerName",
  "transcript",
  "mediaUrl",
  "/recordings/",
  "privateAssignment",
  "scoreReason",
  "scoringRubric",
] as const;

const FORGED_PAYLOAD = "FORGED_EXPORT_PAYLOAD_MUST_FAIL";

function thrownMessage(run: () => unknown): string {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function forgePrivacyFailure(pack: OperatorNightPack): OperatorNightPack {
  return {
    ...pack,
    privacy: {
      ...pack.privacy,
      containsHostSecret: true,
    } as unknown as OperatorNightPack["privacy"],
  };
}

function expectContentForgeRejected(forged: OperatorNightPack) {
  expect(thrownMessage(() => assertOperatorNightPackPrivacy(forged))).toContain(
    "canonical builder output",
  );
  expect(thrownMessage(() => formatOperatorNightPackMarkdown(forged))).toContain(
    "canonical builder output",
  );
  expect(thrownMessage(() => formatOperatorNightPackJson(forged))).toContain(
    "canonical builder output",
  );
}

describe("operator night pack export", () => {
  test("markdown and json include authoritative route order and durations", () => {
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const input: QuickStartInput = {
          venue,
          targetDurationMinutes,
          expectedPlayers: 14,
        };
        const pack = buildOperatorNightPack(input);
        const route = getExperienceRoute(
          QUICK_START_PROFILES[venue].experienceId,
          quickStartContingency(targetDurationMinutes),
        );
        const markdown = formatOperatorNightPackMarkdown(pack);
        const json = formatOperatorNightPackJson(pack);
        const parsed = JSON.parse(json) as OperatorNightPack;

        expect(parsed.cueSheet.map((step) => step.stepId)).toEqual(
          route.steps.map((step) => step.id),
        );
        expect(parsed.cueSheet.map((step) => step.durationMinutes)).toEqual(
          route.steps.map((step) => step.durationMinutes),
        );

        let cursor = 0;
        for (const cue of pack.cueSheet) {
          const stamp = `[${cue.durationMinutes} min] ${cue.label}:`;
          const at = markdown.indexOf(stamp, cursor);
          expect(at >= 0).toBe(true);
          expect(markdown).toContain(cue.cue);
          cursor = at + stamp.length;
        }
        expect(pack.cueSheet.map((step) => step.stepId)).toEqual(
          route.steps.map((step) => step.id),
        );
        expect(markdown).toContain("Timed cue sheet");
        expect(markdown).toContain("Recovery card");
        expect(markdown).toContain("Contingency previews");
        expect(markdown).toContain("Host handoff");
        expect(markdown.toLowerCase()).toContain("live remap");
        expect(markdown.toLowerCase()).toContain("unavailable");
      }
    }
  });

  test("all 12 quick-start combinations export", () => {
    let count = 0;
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const pack = buildOperatorNightPack({
          venue,
          targetDurationMinutes,
          expectedPlayers: 12,
        });
        const markdown = formatOperatorNightPackMarkdown(pack);
        const json = formatOperatorNightPackJson(pack);
        const filenameMd = operatorNightPackFilename(pack, "md");
        const filenameJson = operatorNightPackFilename(pack, "json");

        expect(markdown.startsWith("# Operator Night Pack")).toBe(true);
        expect(json.startsWith("{\n")).toBe(true);
        expect(json.endsWith("\n")).toBe(true);
        expect(filenameMd).toBe(`operator-night-pack-${venue}-${targetDurationMinutes}m-12p.md`);
        expect(filenameJson).toBe(
          `operator-night-pack-${venue}-${targetDurationMinutes}m-12p.json`,
        );
        count += 1;
      }
    }
    expect(count).toBe(12);
  });

  test("raw story-seed and secret/PII/private/media/score sentinels are absent", () => {
    const pack = buildOperatorNightPack({
      venue: "bar",
      targetDurationMinutes: 180,
      expectedPlayers: 10,
      storySeed: SECRET_STORY,
    });

    const markdown = formatOperatorNightPackMarkdown(pack);
    const json = formatOperatorNightPackJson(pack);
    const filename = operatorNightPackFilename(pack, "md");
    const blob = `${markdown}\n${json}\n${filename}`;

    for (const sentinel of FORBIDDEN_SENTINELS) {
      expect(blob.includes(sentinel)).toBe(false);
    }
    expect(markdown).toContain("thread: configured");
    expect(markdown.toLowerCase().includes("secret_thread")).toBe(false);
    expect(json).toContain('"storySeedConfigured": true');
    expect(json.includes('"storySeed"')).toBe(false);
  });

  test("forged pack with a failed privacy flag is rejected", () => {
    const pack = buildOperatorNightPack({
      venue: "park",
      targetDurationMinutes: 120,
      expectedPlayers: 8,
    });
    const forged = forgePrivacyFailure(pack);

    expect(thrownMessage(() => assertOperatorNightPackPrivacy(forged))).toContain(
      "containsHostSecret",
    );
    expect(thrownMessage(() => formatOperatorNightPackMarkdown(forged))).toContain(
      "containsHostSecret",
    );
    expect(thrownMessage(() => formatOperatorNightPackJson(forged))).toContain(
      "containsHostSecret",
    );
    expect(thrownMessage(() => operatorNightPackFilename(forged, "md"))).toContain(
      "containsHostSecret",
    );
  });

  test("content-forged packs with green privacy flags are rejected", () => {
    const pack = buildOperatorNightPack({
      venue: "park",
      targetDurationMinutes: 120,
      expectedPlayers: 8,
    });

    const forgeCue: OperatorNightPack = {
      ...pack,
      cueSheet: pack.cueSheet.map((step, index) =>
        index === 0 ? { ...step, cue: FORGED_PAYLOAD } : step,
      ),
    };
    const forgeEssential: OperatorNightPack = {
      ...pack,
      essentials: pack.essentials.map((item, index) => (index === 0 ? FORGED_PAYLOAD : item)),
    };
    const forgeRecovery: OperatorNightPack = {
      ...pack,
      recoveryCard: pack.recoveryCard.map((row, index) =>
        index === 0 ? { ...row, hostAction: FORGED_PAYLOAD } : row,
      ),
    };
    const forgeHandoff: OperatorNightPack = {
      ...pack,
      handoffReminder: {
        ...pack.handoffReminder,
        instruction: FORGED_PAYLOAD,
      },
    };

    for (const forged of [forgeCue, forgeEssential, forgeRecovery, forgeHandoff]) {
      expect(forged.privacy).toEqual(pack.privacy);
      expect(forged.handoffReminder.secretIncluded).toBe(false);
      expect(forged.handoffReminder.required).toBe(true);
      expectContentForgeRejected(forged);
    }

    expect(thrownMessage(() => operatorNightPackFilename(forgeCue, "md"))).toContain(
      "canonical builder output",
    );
  });

  test("genuine builder packs and identical JSON round-trips pass the guard", () => {
    const pack = buildOperatorNightPack({
      venue: "home",
      targetDurationMinutes: 180,
      expectedPlayers: 12,
      storySeed: "Public occasion",
    });
    const roundTrip = JSON.parse(JSON.stringify(pack)) as OperatorNightPack;

    expect(thrownMessage(() => assertOperatorNightPackPrivacy(pack))).toBe("");
    expect(thrownMessage(() => assertOperatorNightPackPrivacy(roundTrip))).toBe("");
    expect(formatOperatorNightPackJson(roundTrip)).toContain('"storySeedConfigured": true');
  });

  test("filenames are deterministic and safe", () => {
    const pack = buildOperatorNightPack({
      venue: "festival",
      targetDurationMinutes: 240,
      expectedPlayers: 30,
      storySeed: "Public joke",
    });

    const first = operatorNightPackFilename(pack, "json");
    const second = operatorNightPackFilename(pack, "json");
    expect(first).toBe(second);
    expect(first).toBe("operator-night-pack-festival-240m-30p.json");
    expect(/^[a-z0-9.-]+$/.test(first)).toBe(true);
    expect(first.includes("Public")).toBe(false);
    expect(first.includes(" ")).toBe(false);
    expect(first.includes("#")).toBe(false);
  });

  test("no-thread export states absence without inventing seed text", () => {
    const pack = buildOperatorNightPack({
      venue: "home",
      targetDurationMinutes: 120,
      expectedPlayers: 8,
    });
    const markdown = formatOperatorNightPackMarkdown(pack);
    expect(markdown).toContain("no thread configured");
    expect(markdown.includes("configured (text omitted)")).toBe(false);
  });
});
