import { buildOperatorNightPack, type OperatorNightPack } from "./operator-night-pack";
import type { QuickStartInput } from "./quick-start";

const PRIVACY_LITERALS = {
  containsHostSecret: false,
  containsPlayerIdentity: false,
  containsPrivateAssignments: false,
  containsTranscriptsOrMedia: false,
  containsScoreReasonsOrRubrics: false,
  containsStorySeedText: false,
  reviewBeforeSharing: true,
} as const;

const HANDOFF_SECRET_LITERAL = false;

/** Fixed non-sensitive placeholder used only to ask the builder for configured=true. */
const SAFE_STORY_SEED_PLACEHOLDER = "thread-configured";

function safeInputFromPack(pack: OperatorNightPack): QuickStartInput {
  return {
    venue: pack.input.venue,
    targetDurationMinutes: pack.input.targetDurationMinutes,
    expectedPlayers: pack.input.expectedPlayers,
    ...(pack.input.storySeedConfigured ? { storySeed: SAFE_STORY_SEED_PLACEHOLDER } : {}),
  };
}

function enumerablePayloadEquals(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/**
 * Fail closed when any privacy invariant is not the expected literal,
 * or when the pack payload does not match a canonical rebuild from the
 * serialized safe input tuple.
 * Call before formatting or downloading.
 */
export function assertOperatorNightPackPrivacy(pack: OperatorNightPack): void {
  const privacy = pack.privacy;
  for (const [key, expected] of Object.entries(PRIVACY_LITERALS) as Array<
    [keyof typeof PRIVACY_LITERALS, boolean]
  >) {
    if (privacy[key] !== expected) {
      throw new Error(
        `Operator Night Pack privacy invariant failed: ${key} must be ${String(expected)}.`,
      );
    }
  }
  if (pack.handoffReminder.secretIncluded !== HANDOFF_SECRET_LITERAL) {
    throw new Error(
      "Operator Night Pack privacy invariant failed: handoffReminder.secretIncluded must be false.",
    );
  }
  if (pack.handoffReminder.required !== true) {
    throw new Error(
      "Operator Night Pack privacy invariant failed: handoffReminder.required must be true.",
    );
  }

  const canonical = buildOperatorNightPack(safeInputFromPack(pack));
  if (!enumerablePayloadEquals(pack, canonical)) {
    throw new Error(
      "Operator Night Pack privacy invariant failed: pack payload must equal the canonical builder output.",
    );
  }
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Deterministic download filename with only safe lowercase slug characters.
 */
export function operatorNightPackFilename(
  pack: OperatorNightPack,
  extension: "md" | "json",
): string {
  assertOperatorNightPackPrivacy(pack);
  const venue = slugPart(pack.input.venue);
  const duration = `${pack.input.targetDurationMinutes}m`;
  const crowd = `${pack.input.expectedPlayers}p`;
  return `operator-night-pack-${venue}-${duration}-${crowd}.${extension}`;
}

/**
 * Pretty-printed JSON of the pack schema. Stable key order via JSON.stringify.
 */
export function formatOperatorNightPackJson(pack: OperatorNightPack): string {
  assertOperatorNightPackPrivacy(pack);
  return `${JSON.stringify(pack, null, 2)}\n`;
}

/**
 * Usable markdown cue card for a live operator.
 */
export function formatOperatorNightPackMarkdown(pack: OperatorNightPack): string {
  assertOperatorNightPackPrivacy(pack);

  const threadLine = pack.input.storySeedConfigured
    ? "Tonight's thread: configured (text omitted)"
    : "Tonight's thread: no thread configured";

  const cueLines = pack.cueSheet.map((step, index) => {
    const optional = step.optional ? " · optional" : "";
    return `${index + 1}. [${step.durationMinutes} min] ${step.label}: ${step.cue}${optional}`;
  });

  const equipmentLines =
    pack.equipment.length > 0
      ? pack.equipment.map((item) => `- ${item.label} × ${item.momentCount}: ${item.instruction}`)
      : ["- Nothing beyond the phones already in the room"];

  const essentialLines = pack.essentials.map((item) => `- ${item}`);

  const recoveryLines = pack.recoveryCard.map(
    (row) =>
      `- Symptom: ${row.symptom}\n  Action: ${row.hostAction}\n  Keep intact: ${row.mustRemainIntact}`,
  );

  const contingencyLines = pack.contingencyPreviews.map((preview) => {
    const acts = preview.actOrder.join(" → ");
    return [
      `- ${preview.label} (${preview.contingency})`,
      `  ${preview.routeDurationMinutes} min · ${preview.stepCount} steps · acts: ${acts}`,
      `  Live remap: unavailable. ${preview.note}`,
    ].join("\n");
  });

  return `# Operator Night Pack

## Program

- Title: ${pack.program.title}
- Experience: ${pack.program.experienceId}
- Format: ${pack.program.contingencyLabel} (${pack.program.contingency})
- Venue: ${pack.input.venue}
- Duration: ${pack.program.routeDurationMinutes} minutes (target ${pack.input.targetDurationMinutes})
- Expected crowd: ${pack.input.expectedPlayers}
- Game moments: ${pack.program.gameMoments}
- Distinct games: ${pack.program.distinctGames}
- Guided breaks: ${pack.program.guidedBreaks}
- Finale: ${pack.program.hasFinale ? "yes" : "no"}
- ${threadLine}

## Essentials

${essentialLines.join("\n")}

## Equipment

${equipmentLines.join("\n")}

## Timed cue sheet

${cueLines.join("\n")}

## Recovery card

${pack.recoveryPromise}

${recoveryLines.join("\n")}

## Contingency previews (pre-start only)

${contingencyLines.join("\n")}

## Host handoff

${pack.handoffReminder.instruction}

Do not paste a backup host link into this export. Prepare it only from Live safety after the room exists.

## Privacy / share note

Automatic fields exclude host secrets, participant identity, private assignments, speech records, media paths, score reasons/rubrics, and Tonight's thread text. Review before sharing.
`;
}
