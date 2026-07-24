import { useId, useState } from "react";
import { buildOperatorNightPack } from "@/lib/operator-night-pack";
import {
  formatOperatorNightPackJson,
  formatOperatorNightPackMarkdown,
  operatorNightPackFilename,
} from "@/lib/operator-night-pack-export";
import type { QuickStartDuration, QuickStartVenue } from "@/lib/quick-start";

const PREVIEW_CUE_COUNT = 3;

/** Fixed non-sensitive placeholder used only to ask the builder for configured=true. */
const SAFE_STORY_SEED_PLACEHOLDER = "thread-configured";

const PRIVACY_NOTE =
  "Exports stay on this device. They omit secrets, identities, media paths, speech records, and Tonight's thread text.";

/**
 * Narrow safe input for the Operator Night Pack card.
 * Never accept or retain raw story-seed text here.
 */
export type OperatorNightPackCardInput = {
  venue: QuickStartVenue;
  targetDurationMinutes: QuickStartDuration;
  expectedPlayers: number;
  storySeedConfigured: boolean;
};

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function OperatorNightPackCard({
  input,
  context,
}: {
  input: OperatorNightPackCardInput;
  context: "landing" | "host";
}) {
  const pack = buildOperatorNightPack({
    venue: input.venue,
    targetDurationMinutes: input.targetDurationMinutes,
    expectedPlayers: input.expectedPlayers,
    ...(input.storySeedConfigured ? { storySeed: SAFE_STORY_SEED_PLACEHOLDER } : {}),
  });
  const privacyNoteId = useId();
  const statusId = useId();
  const [status, setStatus] = useState("");
  const previewCues = pack.cueSheet.slice(0, PREVIEW_CUE_COUNT);
  const threadStatus = pack.input.storySeedConfigured
    ? "thread configured"
    : "no thread configured";
  const rootClass =
    context === "landing"
      ? "agh-night-pack agh-night-pack--landing"
      : "agh-night-pack agh-night-pack--host";
  const showProgramAndEssentials = context === "host";

  function exportPack(format: "markdown" | "json") {
    try {
      if (format === "markdown") {
        const content = formatOperatorNightPackMarkdown(pack);
        downloadText(operatorNightPackFilename(pack, "md"), content, "text/markdown;charset=utf-8");
        setStatus("Markdown night pack downloaded.");
        return;
      }
      const content = formatOperatorNightPackJson(pack);
      downloadText(
        operatorNightPackFilename(pack, "json"),
        content,
        "application/json;charset=utf-8",
      );
      setStatus("JSON night pack downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? `Download failed: ${error.message}` : "Download failed.");
    }
  }

  return (
    <section
      data-testid="operator-night-pack"
      data-context={context}
      data-venue={pack.input.venue}
      data-duration-minutes={pack.input.targetDurationMinutes}
      data-route-duration-minutes={pack.program.routeDurationMinutes}
      data-expected-players={pack.input.expectedPlayers}
      data-story-seed-configured={pack.input.storySeedConfigured ? "true" : "false"}
      data-cue-count={pack.cueSheet.length}
      className={rootClass}
      aria-label="Operator night pack"
    >
      <header className="agh-night-pack-heading">
        <div>
          <h2>Operator night pack</h2>
          <p>
            {pack.program.title} · {pack.program.contingencyLabel}
          </p>
        </div>
        <p>
          {pack.program.routeDurationMinutes} min · {pack.input.expectedPlayers} guests ·{" "}
          {threadStatus}
        </p>
      </header>

      {showProgramAndEssentials && (
        <div className="agh-night-pack-program">
          <p>
            <strong>{pack.program.gameMoments}</strong> game moments ·{" "}
            <strong>{pack.program.guidedBreaks}</strong> guided breaks · finale{" "}
            {pack.program.hasFinale ? "included" : "not included"}
          </p>
          <p>{pack.recoveryPromise}</p>
        </div>
      )}

      <ol className="agh-night-pack-next" aria-label="Next timed cues">
        {previewCues.map((step, index) => (
          <li key={step.stepId} data-step-id={step.stepId}>
            <span>
              {index + 1}. {step.durationMinutes} min
            </span>
            <strong>{step.label}</strong>
            <p>{step.cue}</p>
          </li>
        ))}
      </ol>

      <details className="agh-night-pack-sheet">
        <summary>Full timed cue sheet ({pack.cueSheet.length})</summary>
        <ol data-testid="operator-night-pack-full-cues">
          {pack.cueSheet.map((step, index) => (
            <li key={step.stepId} data-step-id={step.stepId}>
              <span>
                {index + 1}. {step.durationMinutes} min
                {step.optional ? " · optional" : ""}
              </span>
              <strong>{step.label}</strong>
              <p>{step.cue}</p>
            </li>
          ))}
        </ol>
        <p data-testid="operator-night-pack-remap-warning" className="agh-night-pack-warning">
          Live remap is unavailable. Contingency formats below are choose-before-start only.
        </p>
      </details>

      {showProgramAndEssentials && (
        <div className="agh-night-pack-block">
          <h3>Essentials</h3>
          <ul>
            {pack.essentials.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="agh-night-pack-block">
        <h3>Equipment</h3>
        {pack.equipment.length > 0 ? (
          <ul>
            {pack.equipment.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.label} × {item.momentCount}:
                </strong>{" "}
                {item.instruction}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing beyond the phones already in the room.</p>
        )}
      </div>

      <div className="agh-night-pack-block">
        <h3>Recovery card</h3>
        <ul className="agh-night-pack-recovery">
          {pack.recoveryCard.map((row) => (
            <li key={row.symptom}>
              <strong>{row.symptom}</strong>
              <p>{row.hostAction}</p>
              <small>{row.mustRemainIntact}</small>
            </li>
          ))}
        </ul>
      </div>

      <div className="agh-night-pack-block">
        <h3>Contingency previews</h3>
        <ul>
          {pack.contingencyPreviews.map((preview) => (
            <li key={preview.contingency}>
              <strong>
                {preview.label}: {preview.routeDurationMinutes} min · {preview.stepCount} steps
              </strong>
              <p>{preview.note}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="agh-night-pack-handoff">
        <h3>Host handoff</h3>
        <p>{pack.handoffReminder.instruction}</p>
      </div>

      <div className="agh-night-pack-exports" role="group" aria-label="Download night pack">
        <button
          type="button"
          data-testid="operator-night-pack-download-md"
          aria-describedby={privacyNoteId}
          onClick={() => exportPack("markdown")}
        >
          Download Markdown
        </button>
        <button
          type="button"
          data-testid="operator-night-pack-download-json"
          aria-describedby={privacyNoteId}
          onClick={() => exportPack("json")}
        >
          Download JSON
        </button>
      </div>

      <p
        id={privacyNoteId}
        data-testid="operator-night-pack-privacy-note"
        className="agh-night-pack-privacy"
      >
        {PRIVACY_NOTE}
      </p>

      <p
        id={statusId}
        data-testid="operator-night-pack-status"
        className="agh-night-pack-status"
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
    </section>
  );
}
