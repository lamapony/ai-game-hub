import type { OperatorFailureCoach } from "@/lib/operator-failure-coach";

/**
 * Presentational one-next-action readout. Does not execute host commands.
 */
export function OperatorFailureCoachCard({ coach }: { coach: OperatorFailureCoach | null }) {
  if (!coach) return null;

  return (
    <aside
      data-testid="operator-failure-coach"
      data-symptom={coach.symptom}
      data-action-intent={coach.actionIntent}
      className="agh-failure-coach"
      aria-live="polite"
      aria-label="Operator failure coach"
    >
      <h3>{coach.title}</h3>
      <p data-testid="operator-failure-coach-action">
        <strong>Next:</strong> {coach.nextAction}
      </p>
      <p data-testid="operator-failure-coach-integrity">
        <strong>Keep intact:</strong> {coach.mustRemainIntact}
      </p>
    </aside>
  );
}
