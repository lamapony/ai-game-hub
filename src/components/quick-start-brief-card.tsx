import { buildQuickStartBrief } from "@/lib/quick-start-brief";
import type { QuickStartInput } from "@/lib/quick-start";

export function QuickStartBriefCard({
  input,
  context,
}: {
  input: QuickStartInput;
  context: "landing" | "host";
}) {
  const brief = buildQuickStartBrief(input);

  if (context === "landing") {
    return (
      <section
        data-testid="quick-start-brief"
        data-context={context}
        data-venue={brief.venue}
        data-duration-minutes={brief.targetDurationMinutes}
        data-route-duration-minutes={brief.routeDurationMinutes}
        data-expected-players={brief.expectedPlayers}
        data-game-moments={brief.gameMoments}
        data-distinct-games={brief.distinctGames}
        data-guided-breaks={brief.guidedBreaks}
        data-has-finale={brief.hasFinale ? "true" : "false"}
        data-has-story-seed={brief.storySeed ? "true" : "false"}
        data-equipment={brief.equipment.map((item) => item.id).join(",")}
        className="agh-route-brief"
        aria-label="Generated run of show"
      >
        <header className="agh-route-heading">
          <div>
            <span>Your run of show</span>
            <strong>{brief.title}</strong>
          </div>
          <p>
            {brief.routeDurationMinutes} min · {brief.expectedPlayers} guests
          </p>
        </header>

        {brief.storySeed && (
          <div data-testid="quick-start-story-thread" className="agh-route-thread">
            <span>Tonight&apos;s thread</span>
            <p>{brief.storySeed}</p>
          </div>
        )}

        <div className="agh-route-metrics">
          <LandingMetric value={brief.gameMoments} label="game moments" />
          <LandingMetric value={brief.guidedBreaks} label="guided breaks" />
          <LandingMetric value={brief.hasFinale ? 1 : 0} label="story finale" />
        </div>

        <div className="agh-route-equipment">
          <span>Needs</span>
          <p>
            {brief.equipment.length > 0
              ? brief.equipment.map((item) => `${item.label} × ${item.momentCount}`).join(" / ")
              : "Nothing beyond the phones already in the room"}
          </p>
          <strong>No app · no account</strong>
        </div>

        <details className="agh-route-details">
          <summary>What to have ready</summary>
          <ul>
            {brief.essentials.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {brief.equipment.map((item) => (
            <p key={item.id}>
              <strong>{item.label}:</strong> {item.instruction}
            </p>
          ))}
        </details>

        <p className="agh-route-recovery">{brief.recoveryPromise}</p>
      </section>
    );
  }

  return (
    <section
      data-testid="quick-start-brief"
      data-context={context}
      data-venue={brief.venue}
      data-duration-minutes={brief.targetDurationMinutes}
      data-route-duration-minutes={brief.routeDurationMinutes}
      data-expected-players={brief.expectedPlayers}
      data-game-moments={brief.gameMoments}
      data-distinct-games={brief.distinctGames}
      data-guided-breaks={brief.guidedBreaks}
      data-has-finale={brief.hasFinale ? "true" : "false"}
      data-has-story-seed={brief.storySeed ? "true" : "false"}
      data-equipment={brief.equipment.map((item) => item.id).join(",")}
      className="agh-host-brief"
      aria-label="Host run of show"
    >
      <header className="agh-host-brief-heading">
        <div>
          <span>Your run of show</span>
          <strong>{brief.title}</strong>
        </div>
        <p>
          {brief.routeDurationMinutes} min · {brief.expectedPlayers} guests
        </p>
      </header>

      {brief.storySeed && (
        <div data-testid="quick-start-story-seed" className="agh-host-brief-thread">
          <span>Tonight&apos;s thread</span>
          <p>{brief.storySeed}</p>
        </div>
      )}

      <div className="agh-host-brief-metrics">
        <LandingMetric value={brief.gameMoments} label="game moments" />
        <LandingMetric value={brief.guidedBreaks} label="guided breaks" />
        <LandingMetric value={brief.hasFinale ? 1 : 0} label="story finale" />
      </div>

      <div className="agh-host-brief-equipment">
        <span>Needs</span>
        <p>
          {brief.equipment.length > 0
            ? brief.equipment.map((item) => `${item.label} × ${item.momentCount}`).join(" / ")
            : "Nothing beyond the phones already in the room"}
        </p>
        <strong>No app · no account</strong>
      </div>

      <details className="agh-host-brief-details">
        <summary>What to have ready</summary>
        <ul>
          {brief.essentials.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {brief.equipment.map((item) => (
          <p key={item.id}>
            <strong>{item.label}:</strong> {item.instruction}
          </p>
        ))}
      </details>

      <p className="agh-host-brief-recovery">{brief.recoveryPromise}</p>
    </section>
  );
}

function LandingMetric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
