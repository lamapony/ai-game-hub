import type { ReactNode } from "react";
import type {
  QuickStartLaunchBackendStatus,
  QuickStartLaunchCoach,
} from "@/lib/quick-start-launch-coach";

export type QuickStartLaunchFact = {
  label: string;
  value: string;
};

function formatLaunchClock(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatServiceStatus(status: QuickStartLaunchBackendStatus): string {
  if (status === "ready") return "service ready";
  if (status === "checking") return "service checking";
  return "service blocked";
}

export function QuickStartLaunchSignal({
  coach,
  venue,
  durationMinutes,
  elapsedSeconds,
  joinedPlayers,
  backendStatus,
  facts,
  action,
}: {
  coach: QuickStartLaunchCoach;
  venue: string;
  durationMinutes: number;
  elapsedSeconds: number;
  joinedPlayers: number;
  backendStatus: QuickStartLaunchBackendStatus;
  facts: readonly QuickStartLaunchFact[];
  action: ReactNode;
}) {
  const durationLabel =
    durationMinutes % 60 === 0
      ? `${durationMinutes / 60} ${durationMinutes === 60 ? "HOUR" : "HOURS"}`
      : `${durationMinutes} MINUTES`;

  return (
    <div
      data-testid="quick-start-launch-coach"
      data-coach-state={coach.state}
      data-coach-action={coach.action}
      data-signal={coach.signal}
      className={`agh-launch-signal is-${coach.tone}`}
    >
      <div className="agh-launch-signal-meta">
        <strong>
          LIVE DEPARTURE / {venue.toUpperCase()} / {durationLabel}
        </strong>
        <span>
          {joinedPlayers} joined · {formatServiceStatus(backendStatus)} ·{" "}
          {formatLaunchClock(elapsedSeconds)}
        </span>
      </div>
      <strong className="agh-launch-signal-word" aria-live="polite">
        {coach.signal}
      </strong>
      <div className="agh-launch-signal-command">
        <div>
          <strong>{coach.title}</strong>
          <p>{coach.detail}</p>
        </div>
        {action}
      </div>
      <dl className="agh-launch-signal-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
