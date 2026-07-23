import { getExperienceRoute } from "@/experiences/catalog";
import { normalizePartyContext } from "./party-context";
import type { GameId, RoomState } from "./types";

const RUN_OF_SHOW_RECEIPT_LIMIT = 128;

function activeProgress(state: RoomState) {
  const party = normalizePartyContext(state.party, state.venue);
  return state.runOfShow?.experienceId === party.experienceId &&
    state.runOfShow.contingency === party.contingency
    ? state.runOfShow
    : {
        experienceId: party.experienceId,
        contingency: party.contingency,
        completedStepIds: [],
      };
}

/** Start a timed route cue once, preserving its original server start time on retries. */
export function beginRunOfShowStepState(state: RoomState, stepId: string, now: number): RoomState {
  const progress = activeProgress(state);
  if (progress.activeStepId === stepId) return state;
  return {
    ...state,
    quickStart: state.quickStart
      ? { ...state.quickStart, startedAt: state.quickStart.startedAt ?? now }
      : undefined,
    runOfShow: {
      ...progress,
      activeStepId: stepId,
      activeStepStartedAt: now,
    },
  };
}

/**
 * Persist one completed route moment against the active experience identity.
 * The bounded receipt list is both idempotent and safe to keep in public room state.
 */
export function completeRunOfShowStepState(state: RoomState, stepId: string): RoomState {
  const progress = activeProgress(state);
  if (progress.completedStepIds.includes(stepId)) return state;
  return {
    ...state,
    runOfShow: {
      ...progress,
      completedStepIds: [...progress.completedStepIds, stepId].slice(-RUN_OF_SHOW_RECEIPT_LIMIT),
      activeStepId: progress.activeStepId === stepId ? undefined : progress.activeStepId,
      activeStepStartedAt:
        progress.activeStepId === stepId ? undefined : progress.activeStepStartedAt,
    },
  };
}

/**
 * Complete the next matching game step in the current act. `stage` is used by
 * multi-act/multi-stage games so a reveal cannot accidentally close a capture step.
 */
export function completeRunOfShowGameStepState(
  state: RoomState,
  gameId: GameId,
  stage?: string,
): RoomState {
  const party = normalizePartyContext(state.party, state.venue);
  const progress = activeProgress(state);
  const routeStep = getExperienceRoute(party.experienceId, party.contingency).steps.find(
    (step) =>
      step.actId === party.actId &&
      "gameId" in step &&
      step.gameId === gameId &&
      (stage === undefined || step.stage === stage) &&
      !progress.completedStepIds.includes(step.id),
  );
  return routeStep ? completeRunOfShowStepState(state, routeStep.id) : state;
}
