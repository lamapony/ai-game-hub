import {
  CONTINGENCY_PLANS,
  type ContingencyPlan,
  type ExperienceId,
  type PartyActId,
  type PartyContext,
  type PartyLocale,
  type VenueKind,
} from "@/lib/party-context";
import type { GameId } from "@/lib/types";

export type LocalizedText = Record<PartyLocale, string>;

export const PLANNED_GAME_IDS = [
  "grilloracle",
  "tongsoftruth",
  "smokescreen",
  "stilllife",
  "toastsyndicate",
  "sommelier",
  "contraband",
  "crossexamination",
] as const;

export type PlannedGameId = (typeof PLANNED_GAME_IDS)[number];
export type ExperienceGameId = GameId | PlannedGameId;
export type ExperienceThemeKey = "classic" | "grill" | "transition" | "bar" | "finale";

export type ExperienceAct = {
  id: PartyActId;
  label: LocalizedText;
  emoji: string;
  venue: VenueKind;
  themeKey: ExperienceThemeKey;
  environmentContext: LocalizedText;
};

type GameStepKind = "foreground-game" | "background-start" | "reveal";

export type GameRunOfShowStep = {
  id: string;
  actId: PartyActId;
  kind: GameStepKind;
  gameId: ExperienceGameId;
  stage?: string;
  durationMinutes: number;
  optional?: boolean;
};

export type PartyMomentStep = {
  id: string;
  actId: PartyActId;
  kind: "transition" | "finale";
  durationMinutes: number;
  optional?: boolean;
};

export type RunOfShowStep = GameRunOfShowStep | PartyMomentStep;

export type ExperienceRoute = {
  actOrder: readonly PartyActId[];
  steps: readonly RunOfShowStep[];
};

export type ExperiencePack = {
  id: ExperienceId;
  title: LocalizedText;
  shortTitle: LocalizedText;
  hostPersona: {
    name: LocalizedText;
    voice: LocalizedText;
  };
  defaultContext: PartyContext;
  acts: readonly ExperienceAct[];
  routes: Record<ContingencyPlan, ExperienceRoute>;
};

const classicPark: ExperiencePack = {
  id: "classic-park",
  title: { en: "DIMAS fest — Classic", ru: "DIMAS fest — Классика" },
  shortTitle: { en: "Classic", ru: "Классика" },
  hostPersona: {
    name: { en: "park spirit", ru: "дух парка" },
    voice: {
      en: "Witty, energetic and a little sarcastic, like a friend who is also a master of ceremonies.",
      ru: "Остроумный, энергичный и слегка саркастичный друг, который заодно работает конферансье.",
    },
  },
  defaultContext: {
    experienceId: "classic-park",
    actId: "classic",
    venue: "park",
    contingency: "normal",
    uiLocale: "en",
    contentLocale: "en",
  },
  acts: [
    {
      id: "classic",
      label: { en: "Park", ru: "Парк" },
      emoji: "🌳",
      venue: "park",
      themeKey: "classic",
      environmentContext: {
        en: "LOCATION: city park, daytime. Open space, trees, benches, passersby. Tasks can be active: run, yell, act out scenes.",
        ru: "ЛОКАЦИЯ: городской парк днём. Открытое пространство, деревья, скамейки и прохожие. Задания могут быть активными: бегать, кричать и разыгрывать сцены.",
      },
    },
    {
      id: "bar",
      label: { en: "Bar", ru: "Бар" },
      emoji: "🍸",
      venue: "bar",
      themeKey: "bar",
      environmentContext: {
        en: "LOCATION: a cozy bar (bodega), birthday evening. Inside: tables, bar counter, glasses, warm light, music, crowded and fun. Bad weather outside — everyone is warmed up and bold. Tasks must be doable at the table or within the bar. Scene props: drinks, napkins, menus, phones and table neighbors. Joke about toasts, bar philosophy, and how ‘just one more’ becomes ‘one more again.’",
        ru: "ЛОКАЦИЯ: уютный бар вечером. Внутри столы, стойка, бокалы, тёплый свет, музыка и весёлая теснота. Снаружи плохая погода, внутри все уже согрелись и осмелели. Задания выполняются за столом или внутри бара. Реквизит: напитки, салфетки, меню, телефоны и соседи по столу.",
      },
    },
  ],
  routes: {
    normal: { actOrder: ["classic"], steps: [] },
    "bar-only": { actOrder: ["bar"], steps: [] },
    compact: { actOrder: ["classic"], steps: [] },
  },
};

const grillContext: LocalizedText = {
  en: "LOCATION: a grill gathering at Grønningen Nordvest, Copenhagen, 17:00. Wind, possible rain, everyone pretending this was the plan. SCENE PROPS: fire, smoke, tongs, grill grate, meat, vegetables, foil, disposable plates and a collective struggle with the elements. Joke about doneness, Danish weather, group cooking and people who ‘just want to watch you grill.’",
  ru: "ЛОКАЦИЯ: гриль-сбор в Grønningen Nordvest, Копенгаген, 17:00. Ветер, возможен дождь, все делают вид, что так и задумано. РЕКВИЗИТ СЦЕНЫ: огонь, дым, щипцы, решётка, мясо, овощи, фольга, одноразовые тарелки, борьба со стихией. Шути про степень прожарки, датскую погоду, коллективное приготовление и людей, которые «просто посмотрят, как ты жаришь».",
};

const barContext: LocalizedText = {
  en: "LOCATION: Viggos Bar, Nørrebro, after 20:00. Warm light, glasses, cocktails, toasts and evening honesty. The crowd has warmed up and grown bolder. Joke about sommelier snobbery, bar philosophy, beautiful cocktail names and how quickly ‘just one’ becomes ‘fine, one more.’",
  ru: "ЛОКАЦИЯ: Viggos Bar, Nørrebro, после 20:00. Тёплый свет, бокалы, коктейли, тосты, вечерняя честность. Публика согрелась и осмелела. Шути про сомелье-снобизм, барную философию, красивые названия коктейлей и то, как быстро «по одной» превращается в «ну ладно, ещё по одной».",
};

const smokeNeonActs: readonly ExperienceAct[] = [
  {
    id: "grill",
    label: { en: "Act I — Fire", ru: "Акт I — Огонь" },
    emoji: "🔥",
    venue: "grill-site",
    themeKey: "grill",
    environmentContext: grillContext,
  },
  {
    id: "transition",
    label: { en: "Evidence sealed", ru: "Показания опечатаны" },
    emoji: "🔴",
    venue: "grill-site",
    themeKey: "transition",
    environmentContext: {
      en: `${grillContext.en} TRANSITION: the grill is now a crime scene. Prophecies and testimony are being sealed before the move to the bar.`,
      ru: `${grillContext.ru} ПЕРЕХОД: гриль объявлен местом происшествия. Пророчества и показания опечатываются перед переездом в бар.`,
    },
  },
  {
    id: "bar",
    label: { en: "Act II — Alibi", ru: "Акт II — Алиби" },
    emoji: "🍸",
    venue: "bar",
    themeKey: "bar",
    environmentContext: barContext,
  },
  {
    id: "finale",
    label: { en: "The verdict", ru: "Вердикт" },
    emoji: "🏆",
    venue: "bar",
    themeKey: "finale",
    environmentContext: {
      en: `${barContext.en} FINALE: use callbacks from the real evening, reveal sealed evidence and keep the verdict sharp but affectionate.`,
      ru: `${barContext.ru} ФИНАЛ: используй реальные события вечера, вскрывай опечатанные улики и выноси меткий, но не токсичный вердикт.`,
    },
  },
];

const normalSteps: readonly RunOfShowStep[] = [
  step("smoke-assign", "grill", "background-start", "smokescreen", 2, "assign"),
  step("tongs-background", "grill", "background-start", "tongsoftruth", 2, "start"),
  step("oracle-capture", "grill", "foreground-game", "grilloracle", 15, "capture"),
  step("still-life", "grill", "foreground-game", "stilllife", 20, undefined, true),
  step("photo-hunt", "grill", "foreground-game", "phototunt", 10, undefined, true),
  moment("seal-evidence", "transition", "transition", 10),
  step("sommelier", "bar", "foreground-game", "sommelier", 20),
  step("contraband-start", "bar", "background-start", "contraband", 2, "assign", true),
  step("toast-syndicate", "bar", "foreground-game", "toastsyndicate", 25),
  step("oracle-verify", "bar", "reveal", "grilloracle", 8, "verify"),
  step("smoke-reveal", "bar", "reveal", "smokescreen", 8, "reveal"),
  step("cross-examination", "bar", "foreground-game", "crossexamination", 20, undefined, true),
  moment("party-verdict", "finale", "finale", 5),
];

const barOnlySteps: readonly RunOfShowStep[] = [
  step("bar-smoke-assign", "bar", "background-start", "smokescreen", 2, "assign"),
  step("bar-oracle-capture", "bar", "foreground-game", "grilloracle", 12, "bar-capture"),
  step("bar-sommelier", "bar", "foreground-game", "sommelier", 20),
  step("bar-contraband", "bar", "background-start", "contraband", 2, "assign", true),
  step("bar-toast", "bar", "foreground-game", "toastsyndicate", 25),
  step("bar-oracle-verify", "bar", "reveal", "grilloracle", 8, "verify"),
  step("bar-smoke-reveal", "bar", "reveal", "smokescreen", 8, "reveal"),
  step("bar-cross-examination", "bar", "foreground-game", "crossexamination", 20, undefined, true),
  moment("bar-party-verdict", "finale", "finale", 5),
];

const compactSteps: readonly RunOfShowStep[] = [
  step("compact-smoke-assign", "grill", "background-start", "smokescreen", 2, "assign"),
  step("compact-tongs", "grill", "foreground-game", "tongsoftruth", 10, "blitz"),
  step("compact-oracle", "grill", "foreground-game", "grilloracle", 10, "capture"),
  moment("compact-seal", "transition", "transition", 5),
  step("compact-toast", "bar", "foreground-game", "toastsyndicate", 18),
  step("compact-oracle-verify", "bar", "reveal", "grilloracle", 6, "verify"),
  step("compact-smoke-reveal", "bar", "reveal", "smokescreen", 6, "reveal"),
  moment("compact-verdict", "finale", "finale", 5),
];

const smokeNeon: ExperiencePack = {
  id: "smoke-neon-norrebro",
  title: { en: "Smoke & Neon", ru: "Дым и неон" },
  shortTitle: { en: "Smoke & Neon", ru: "Дым и неон" },
  hostPersona: {
    name: { en: "the evening investigator", ru: "следователь вечера" },
    voice: {
      en: "A sharp adult MC with an art-history degree, a bar tab and affection for precise situational jokes.",
      ru: "Остроумный конферансье с дипломом искусствоведа и баром за плечами: взрослый, меткий и слегка саркастичный.",
    },
  },
  defaultContext: {
    experienceId: "smoke-neon-norrebro",
    actId: "grill",
    venue: "grill-site",
    contingency: "normal",
    uiLocale: "en",
    contentLocale: "ru",
  },
  acts: smokeNeonActs,
  routes: {
    normal: {
      actOrder: ["grill", "transition", "bar", "finale"],
      steps: normalSteps,
    },
    "bar-only": {
      actOrder: ["bar", "finale"],
      steps: barOnlySteps,
    },
    compact: {
      actOrder: ["grill", "transition", "bar", "finale"],
      steps: compactSteps,
    },
  },
};

export const EXPERIENCE_PACKS: Record<ExperienceId, ExperiencePack> = {
  "classic-park": classicPark,
  "smoke-neon-norrebro": smokeNeon,
};

export function getExperiencePack(id: ExperienceId): ExperiencePack {
  return EXPERIENCE_PACKS[id];
}

export function getExperienceAct(
  experienceId: ExperienceId,
  actId: PartyActId,
): ExperienceAct | undefined {
  return EXPERIENCE_PACKS[experienceId].acts.find((act) => act.id === actId);
}

export function getExperienceRoute(
  experienceId: ExperienceId,
  contingency: ContingencyPlan,
): ExperienceRoute {
  return EXPERIENCE_PACKS[experienceId].routes[contingency];
}

export function environmentPromptContext(context: PartyContext): string {
  return (
    getExperienceAct(context.experienceId, context.actId)?.environmentContext[
      context.contentLocale
    ] ?? ""
  );
}

export function contextForExperience(
  experienceId: ExperienceId,
  contingency: ContingencyPlan = "normal",
): PartyContext {
  const pack = getExperiencePack(experienceId);
  const route = pack.routes[contingency];
  const firstActId = route.actOrder[0] ?? pack.defaultContext.actId;
  const firstAct = getExperienceAct(experienceId, firstActId);
  return {
    ...pack.defaultContext,
    contingency,
    actId: firstActId,
    venue: firstAct?.venue ?? pack.defaultContext.venue,
  };
}

export function isKnownContingency(value: string): value is ContingencyPlan {
  return (CONTINGENCY_PLANS as readonly string[]).includes(value);
}

function step(
  id: string,
  actId: PartyActId,
  kind: GameStepKind,
  gameId: ExperienceGameId,
  durationMinutes: number,
  stage?: string,
  optional?: boolean,
): GameRunOfShowStep {
  return { id, actId, kind, gameId, durationMinutes, stage, optional };
}

function moment(
  id: string,
  actId: PartyActId,
  kind: PartyMomentStep["kind"],
  durationMinutes: number,
): PartyMomentStep {
  return { id, actId, kind, durationMinutes };
}
