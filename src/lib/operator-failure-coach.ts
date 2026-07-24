/**
 * Pure one-next-action failure coach for live hosts.
 * Presentational decision table only — never executes host commands or inspects
 * provider/private payloads.
 */

export const OPERATOR_FAILURE_SYMPTOMS = [
  "healthy",
  "network-lost",
  "backend-not-ready",
  "ai-unavailable",
  "ai-budget-exhausted",
  "media-permission-denied",
  "media-phase-stalled",
  "host-device-lost",
] as const;

export type OperatorFailureSymptom = (typeof OPERATOR_FAILURE_SYMPTOMS)[number];

export const OPERATOR_FAILURE_COACH_ACTION_INTENTS = [
  "pause-and-resync",
  "use-manual-ai",
  "skip-media-phase",
  "open-media-permissions",
  "open-live-safety",
  "retry-health-check",
] as const;

export type OperatorFailureCoachActionIntent =
  (typeof OPERATOR_FAILURE_COACH_ACTION_INTENTS)[number];

export type OperatorFailureCoach = {
  symptom: Exclude<OperatorFailureSymptom, "healthy">;
  title: string;
  nextAction: string;
  actionIntent: OperatorFailureCoachActionIntent;
  mustRemainIntact: string;
  requiresStateMutation: false;
};

const MUST_REMAIN_INTACT =
  "Route progress, private records, and the score ledger must remain intact.";

const INCIDENT_CARDS: {
  readonly [K in Exclude<OperatorFailureSymptom, "healthy">]: OperatorFailureCoach;
} = {
  "network-lost": {
    symptom: "network-lost",
    title: "Connection dropped",
    nextAction:
      "Pause the room, restore Wi-Fi or mobile data, then press Resync once and wait for live.",
    actionIntent: "pause-and-resync",
    mustRemainIntact: MUST_REMAIN_INTACT,
    requiresStateMutation: false,
  },
  "backend-not-ready": {
    symptom: "backend-not-ready",
    title: "Live backend is blocked",
    nextAction:
      "Open Live safety, fix the named release check, then press Retry. Do not launch until backend is ready.",
    actionIntent: "retry-health-check",
    mustRemainIntact: MUST_REMAIN_INTACT,
    requiresStateMutation: false,
  },
  "ai-unavailable": {
    symptom: "ai-unavailable",
    title: "AI is unavailable right now",
    nextAction:
      "Press Use manual fallbacks in Live safety, then continue the round with the prepared deck.",
    actionIntent: "use-manual-ai",
    mustRemainIntact: MUST_REMAIN_INTACT,
    requiresStateMutation: false,
  },
  "ai-budget-exhausted": {
    symptom: "ai-budget-exhausted",
    title: "AI budget is exhausted",
    nextAction:
      "Keep Use manual fallbacks on and finish the evening with deterministic cards. Do not change spend limits during the event.",
    actionIntent: "use-manual-ai",
    mustRemainIntact: MUST_REMAIN_INTACT,
    requiresStateMutation: false,
  },
  "media-permission-denied": {
    symptom: "media-permission-denied",
    title: "Camera or microphone is blocked",
    nextAction:
      "Open browser site settings, grant camera and microphone access, return to this tab, and retry.",
    actionIntent: "open-media-permissions",
    mustRemainIntact: MUST_REMAIN_INTACT,
    requiresStateMutation: false,
  },
  "media-phase-stalled": {
    symptom: "media-phase-stalled",
    title: "This media phase is stalled",
    nextAction: "Press Skip phase and continue the route. Do not retry the upload.",
    actionIntent: "skip-media-phase",
    mustRemainIntact: MUST_REMAIN_INTACT,
    requiresStateMutation: false,
  },
  "host-device-lost": {
    symptom: "host-device-lost",
    title: "Primary host device is out",
    nextAction:
      "On the trusted backup device prepared earlier, open Live safety and continue from the same live room.",
    actionIntent: "open-live-safety",
    mustRemainIntact: MUST_REMAIN_INTACT,
    requiresStateMutation: false,
  },
};

/**
 * Map a coarse host-observable symptom to one supported next action.
 * Returns null when there is no active incident.
 */
export function buildOperatorFailureCoach(
  symptom: OperatorFailureSymptom,
): OperatorFailureCoach | null {
  if (symptom === "healthy") return null;

  // Mapped table is exhaustive for every non-healthy symptom.
  const card = INCIDENT_CARDS[symptom];
  return {
    symptom: card.symptom,
    title: card.title,
    nextAction: card.nextAction,
    actionIntent: card.actionIntent,
    mustRemainIntact: card.mustRemainIntact,
    requiresStateMutation: false,
  };
}
