import type {
  ContingencyPlan,
  PartyActId,
  PartyContext,
  PartyLocale,
  PartyStoryEvidenceItem,
} from "@/lib/party-context";
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

export type ActTimelineItem = {
  act: ExperienceAct;
  status: RouteTimelineStatus;
  durationMinutes: number;
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
  extended: { en: "Extended", ru: "Расширенный" },
};

const GAME_STEP_LABELS: Record<string, LocalizedText> = {
  smokescreen: { en: "Secret missions", ru: "Тайные миссии" },
  tongsoftruth: { en: "Tongs of Truth", ru: "Щипцы Правды" },
  grilloracle: { en: "Grill Oracle", ru: "Гриль-Оракул" },
  stilllife: { en: "Still Life Survival", ru: "Натюрморт на выживание" },
  phototunt: { en: "Photo Hunt", ru: "Фотоохота" },
  sommelier: { en: "Sommelier Charlatan", ru: "Сомелье-Шарлатан" },
  contraband: { en: "Contraband", ru: "Контрабанда" },
  toastsyndicate: { en: "Toast Syndicate", ru: "Синдикат Тостов" },
  crossexamination: { en: "Cross Examination", ru: "Перекрёстный Допрос" },
  soundscape: { en: "Soundscape Battle", ru: "Звуковой баттл" },
  challenge: { en: "Scene Challenge", ru: "Сценический челлендж" },
  trackguess: { en: "Real or AI?", ru: "Настоящее или AI?" },
  spectrumcourt: { en: "Spectrum Court", ru: "Суд Спектра" },
  whoamong: { en: "Who Among Us", ru: "Кто из нас" },
  impostor: { en: "Who's the Bot?", ru: "Кто здесь бот?" },
};

const STEP_CUES: Record<RunOfShowStep["kind"], LocalizedText> = {
  "background-start": {
    en: "Assign it now, then let it run while the party keeps moving.",
    ru: "Раздай сейчас и оставь работать в фоне, пока вечеринка движется дальше.",
  },
  "foreground-game": {
    en: "Bring the room together for one focused round.",
    ru: "Собери всех вместе на один сфокусированный раунд.",
  },
  reveal: {
    en: "Gather the room and cash in a callback from earlier tonight.",
    ru: "Собери всех и верни в игру событие из начала вечера.",
  },
  transition: {
    en: "Seal the grill evidence, pack the props and move the story indoors.",
    ru: "Опечатай улики гриля, собери реквизит и перенеси историю внутрь.",
  },
  interlude: {
    en: "Let the party breathe while the background story gathers real material.",
    ru: "Дай вечеринке подышать, пока фоновый сюжет собирает реальный материал.",
  },
  finale: {
    en: "Close the case with the podium, personal titles and the evening's best callbacks.",
    ru: "Закрой дело пьедесталом, личными титулами и лучшими отсылками вечера.",
  },
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
export function buildRouteTimeline(
  context: PartyContext,
  completedStepIds: readonly string[] = [],
): RouteTimelineItem[] {
  const route = getActiveExperienceRoute(context);
  const currentIndex = route.actOrder.indexOf(context.actId);

  return route.steps.map((step) => ({
    step,
    status: completedStepIds.includes(step.id)
      ? "past"
      : timelineStatusForAct(step.actId, currentIndex, route.actOrder),
  }));
}

export function buildActTimeline(context: PartyContext): ActTimelineItem[] {
  const route = getActiveExperienceRoute(context);
  const currentIndex = route.actOrder.indexOf(context.actId);
  return route.actOrder.flatMap((actId, index) => {
    const act = getExperienceAct(context.experienceId, actId);
    if (!act) return [];
    return [
      {
        act,
        status:
          currentIndex < 0 || index > currentIndex
            ? "upcoming"
            : index === currentIndex
              ? "current"
              : "past",
        durationMinutes: route.steps
          .filter((step) => step.actId === actId)
          .reduce((total, step) => total + step.durationMinutes, 0),
      } satisfies ActTimelineItem,
    ];
  });
}

export function getNextExperienceAct(context: PartyContext): PartyActId | undefined {
  const route = getActiveExperienceRoute(context);
  const currentIndex = route.actOrder.indexOf(context.actId);
  return currentIndex >= 0 ? route.actOrder[currentIndex + 1] : undefined;
}

export function getRouteDurationMinutes(context: PartyContext): number {
  return getActiveExperienceRoute(context).steps.reduce(
    (total, step) => total + step.durationMinutes,
    0,
  );
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

export function getNextIncompleteRouteStep(
  context: PartyContext,
  completedStepIds: readonly string[],
): RunOfShowStep | undefined {
  const remaining = getActiveExperienceRoute(context).steps.filter(
    (step) => step.actId === context.actId && !completedStepIds.includes(step.id),
  );
  return remaining.find((step) => !step.optional) ?? remaining[0];
}

export function getNextActionableRouteStep(
  context: PartyContext,
  isActionable: (step: RunOfShowStep) => boolean,
): RunOfShowStep | undefined {
  const actSteps = getActiveExperienceRoute(context).steps.filter(
    (step) => step.actId === context.actId && isActionable(step),
  );
  return actSteps.find((step) => !step.optional) ?? actSteps[0];
}

export function getRunStepLabel(step: RunOfShowStep, locale: PartyLocale): string {
  if ("label" in step && step.label) return step.label[locale];
  if (step.kind === "transition") return locale === "ru" ? "Опечатать улики" : "Seal the evidence";
  if (step.kind === "finale") return locale === "ru" ? "Вердикт вечера" : "The party verdict";
  if (!("gameId" in step)) return step.id;
  const base = GAME_STEP_LABELS[step.gameId]?.[locale] ?? step.gameId;
  if (step.kind === "reveal") {
    return locale === "ru" ? `${base} — раскрытие` : `${base} — reveal`;
  }
  return base;
}

export function getRunStepCue(step: RunOfShowStep, locale: PartyLocale): string {
  if ("cue" in step && step.cue) return step.cue[locale];
  return STEP_CUES[step.kind][locale];
}

export function getRunStepStoryBridge(
  step: RunOfShowStep,
  locale: PartyLocale,
  evidence: PartyStoryEvidenceItem,
): string | undefined {
  const detail = evidence.detail.replace(/\s+/g, " ").trim();
  if (!detail) return undefined;
  const label = getRunStepLabel(step, locale);

  if (locale === "ru") {
    if (step.kind === "finale") {
      return `«${detail}» пережило весь маршрут. Внесём это в «${label}» как улику №1.`;
    }
    if (step.kind === "transition") {
      return `«${detail}» едет с нами. Опечатай это в «${label}»: следующая локация наследует дело.`;
    }
    if (step.kind === "reveal") {
      return `«${detail}» было предупреждением. В «${label}» комнате придётся объясниться.`;
    }
    return `«${detail}» — теперь улика №1. В «${label}» у комнаты будет один шанс объясниться.`;
  }

  if (step.kind === "finale") {
    return `“${detail}” survived the whole route. Bring it into “${label}” as Exhibit A.`;
  }
  if (step.kind === "transition") {
    return `“${detail}” comes with us. Seal it in “${label}”; the next location inherits the case.`;
  }
  if (step.kind === "reveal") {
    return `“${detail}” was the warning. “${label}” is where the room explains itself.`;
  }
  return `“${detail}” is now Exhibit A. “${label}” gives the room one chance to explain itself.`;
}

export function getRunStepStoryOpening(
  step: RunOfShowStep,
  locale: PartyLocale,
  storySeed: string,
): string | undefined {
  const seed = storySeed.replace(/\s+/g, " ").trim();
  if (!seed) return undefined;
  const label = getRunStepLabel(step, locale);

  if (locale === "ru") {
    if (step.kind === "finale") {
      return `Дело началось с «${seed}». В «${label}» покажи, во что комната превратила эту нить.`;
    }
    if (step.kind === "transition") {
      return `Дело началось с «${seed}». Провези эту нить через «${label}»: следующая локация должна добавить свою улику.`;
    }
    if (step.kind === "reveal") {
      return `Помни исходную версию: «${seed}». В «${label}» комната покажет, как она её переписала.`;
    }
    return `Сегодняшнее дело начинается с «${seed}». В «${label}» добудь первую настоящую улику.`;
  }

  if (step.kind === "finale") {
    return `The case began with “${seed}”. In “${label}”, show what the room turned that thread into.`;
  }
  if (step.kind === "transition") {
    return `The case began with “${seed}”. Carry that thread through “${label}”; the next location must add its own evidence.`;
  }
  if (step.kind === "reveal") {
    return `Remember the opening version: “${seed}”. “${label}” shows how the room rewrote it.`;
  }
  return `Tonight's case begins with “${seed}”. Use “${label}” to collect the first real clue.`;
}

export function formatActElapsed(startedAt: number | undefined, now: number): string {
  if (!startedAt || !Number.isFinite(startedAt) || now <= startedAt) return "0:00";
  const elapsedMinutes = Math.floor((now - startedAt) / 60_000);
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
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
