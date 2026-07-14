import type { ContingencyPlan, PartyContext, PartyLocale } from "@/lib/party-context";
import {
  getExperienceAct,
  getExperiencePack,
  getExperienceRoute,
  type ExperienceAct,
  type ExperiencePack,
  type ExperienceRoute,
  type LocalizedText,
  type RunOfShowStep,
} from "./catalog";

export type RouteTimelineStatus = "past" | "current" | "upcoming";

export type RouteTimelineItem = {
  step: RunOfShowStep;
  status: RouteTimelineStatus;
};

export type ConductorLabels = {
  experienceTitle: string;
  experienceShortTitle: string;
  actLabel: string;
  actEmoji: string;
  hostPersonaName: string;
  hostPersonaVoice: string;
  contingencyLabel: string;
};

const CONTINGENCY_LABELS: Record<ContingencyPlan, LocalizedText> = {
  normal: { en: "Full route", ru: "Полный маршрут" },
  "bar-only": { en: "Bar only", ru: "Только бар" },
  compact: { en: "Compact", ru: "Компакт" },
};

/** Resolve LocalizedText with a party locale (UI copy uses uiLocale). */
export function localizeText(text: LocalizedText, locale: PartyLocale): string {
  return text[locale];
}

export function getActiveExperiencePack(context: PartyContext): ExperiencePack {
  return getExperiencePack(context.experienceId);
}

export function getActiveExperienceRoute(context: PartyContext): ExperienceRoute {
  return getExperienceRoute(context.experienceId, context.contingency);
}

export function getActiveExperienceAct(context: PartyContext): ExperienceAct | undefined {
  return getExperienceAct(context.experienceId, context.actId);
}

/**
 * Full run-of-show timeline for the active route.
 * Status is derived solely from the current act's position in `route.actOrder`.
 * If the current act is not on the route, every step is treated as upcoming.
 */
export function buildRouteTimeline(context: PartyContext): RouteTimelineItem[] {
  const route = getActiveExperienceRoute(context);
  const currentIndex = route.actOrder.indexOf(context.actId);

  return route.steps.map((step) => ({
    step,
    status: timelineStatusForAct(step.actId, currentIndex, route.actOrder),
  }));
}

/**
 * Next recommended step for the current act only.
 * Prefers the first non-optional step; falls back to the first optional step.
 */
export function getNextRecommendedRouteStep(context: PartyContext): RunOfShowStep | undefined {
  const route = getActiveExperienceRoute(context);
  const actSteps = route.steps.filter((step) => step.actId === context.actId);
  const required = actSteps.find((step) => !step.optional);
  if (required) return required;
  return actSteps.find((step) => step.optional);
}

/** Host-facing labels localized with `context.uiLocale` (not contentLocale). */
export function getConductorLabels(context: PartyContext): ConductorLabels {
  const locale = context.uiLocale;
  const pack = getActiveExperiencePack(context);
  const act = getActiveExperienceAct(context);

  return {
    experienceTitle: localizeText(pack.title, locale),
    experienceShortTitle: localizeText(pack.shortTitle, locale),
    actLabel: act ? localizeText(act.label, locale) : "",
    actEmoji: act?.emoji ?? "",
    hostPersonaName: localizeText(pack.hostPersona.name, locale),
    hostPersonaVoice: localizeText(pack.hostPersona.voice, locale),
    contingencyLabel: localizeText(CONTINGENCY_LABELS[context.contingency], locale),
  };
}

function timelineStatusForAct(
  stepActId: PartyContext["actId"],
  currentIndex: number,
  actOrder: readonly PartyContext["actId"][],
): RouteTimelineStatus {
  if (currentIndex < 0) return "upcoming";

  const stepIndex = actOrder.indexOf(stepActId);
  if (stepIndex < 0) return "upcoming";
  if (stepIndex < currentIndex) return "past";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
}
