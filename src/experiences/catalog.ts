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

export const PLANNED_GAME_IDS = [] as const;

export type PlannedGameId = (typeof PLANNED_GAME_IDS)[number];
export type ExperienceGameId = GameId | PlannedGameId;
export type ExperienceThemeKey =
  "classic" | "grill" | "transition" | "bar" | "home" | "festival" | "finale";

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
  kind: "transition" | "interlude" | "finale";
  durationMinutes: number;
  optional?: boolean;
  label?: LocalizedText;
  cue?: LocalizedText;
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
    extended: { actOrder: ["classic"], steps: [] },
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
    extended: {
      actOrder: ["grill", "transition", "bar", "finale"],
      steps: [
        interlude(
          "smoke-neon-arrival",
          "grill",
          25,
          { en: "Light the scene", ru: "Разжечь сцену" },
          {
            en: "Let people arrive, claim a drink and turn the grill into tonight's first stage.",
            ru: "Дай людям собраться, взять напиток и превратить гриль в первую сцену вечера.",
          },
        ),
        ...normalSteps.slice(0, 5),
        interlude(
          "smoke-neon-dinner",
          "grill",
          30,
          { en: "Eat the evidence", ru: "Съесть улики" },
          {
            en: "Keep the secret games alive while dinner and real conversation create better evidence.",
            ru: "Оставь тайные игры в фоне: ужин и живой разговор создадут улики получше.",
          },
        ),
        ...normalSteps.slice(5, 9),
        interlude(
          "smoke-neon-bar-breath",
          "bar",
          38,
          { en: "Neon recess", ru: "Неоновая передышка" },
          {
            en: "Give the room time to talk, refill glasses and accidentally improve everyone's alibi.",
            ru: "Дай всем поговорить, обновить бокалы и случайно улучшить собственное алиби.",
          },
        ),
        ...normalSteps.slice(9),
      ],
    },
  },
};

const scriptedFinaleAct = (venue: VenueKind, environmentContext: LocalizedText): ExperienceAct => ({
  id: "finale",
  label: { en: "Finale — The callback", ru: "Финал — Возвращение улик" },
  emoji: "🏆",
  venue,
  themeKey: "finale",
  environmentContext,
});

const parkStoryContext: LocalizedText = {
  en: "LOCATION: a real park gathering. Trees, paths, benches, blankets, weather, passersby and whatever the group brought are the stage. Turn real sounds, found objects and incidents into callbacks. Active tasks are welcome, but never involve strangers without consent.",
  ru: "ЛОКАЦИЯ: настоящая встреча в парке. Деревья, дорожки, скамейки, пледы, погода, прохожие и всё, что принесла компания, становятся сценой. Превращай реальные звуки, предметы и происшествия в сквозные отсылки. Активные задания уместны, но незнакомцев без согласия не вовлекай.",
};

const genericBarContext: LocalizedText = {
  en: "LOCATION: a lively adult bar night. Glasses, menus, coasters, warm light, music and suspiciously confident table philosophy are the stage. Keep tasks seated or bar-safe, never require alcohol, and reuse real toasts, orders and conversational accidents as evidence.",
  ru: "ЛОКАЦИЯ: живой взрослый вечер в баре. Бокалы, меню, подставки, тёплый свет, музыка и подозрительно уверенная застольная философия становятся сценой. Задания безопасны для бара и не требуют алкоголя; реальные тосты, заказы и оговорки превращаются в улики.",
};

const houseContext: LocalizedText = {
  en: "LOCATION: a house party. Sofa, kitchen, hallway, fridge, lamps, shelves, snacks and the host's questionable interior decisions are the stage. Build callbacks from objects people can actually touch, rooms they can move through and incidents that happen tonight.",
  ru: "ЛОКАЦИЯ: домашняя вечеринка. Диван, кухня, коридор, холодильник, лампы, полки, закуски и спорные интерьерные решения хозяина становятся сценой. Строй отсылки из предметов, которых можно коснуться, комнат, по которым можно пройти, и событий именно этого вечера.",
};

const festivalContext: LocalizedText = {
  en: "LOCATION: a festival field or open event. Stages, wristbands, queues, banners, food stalls, changing sound, weather and moving crowds are the stage. Games must survive noise and movement, keep the group findable and turn real festival sightings into shared evidence.",
  ru: "ЛОКАЦИЯ: фестивальное поле или открытое событие. Сцены, браслеты, очереди, баннеры, фуд-корты, меняющийся звук, погода и движущаяся толпа становятся сценой. Игры должны переживать шум и движение, не растерять группу и превращать реальные фестивальные находки в общие улики.",
};

const parkCompact: readonly RunOfShowStep[] = [
  interlude("park-arrival-120", "classic", 15, { en: "Claim the clearing", ru: "Занять поляну" }),
  step("park-smoke-assign-120", "classic", "background-start", "smokescreen", 2, "assign"),
  step("park-soundscape-120", "classic", "foreground-game", "soundscape", 15),
  step("park-challenge-120", "classic", "foreground-game", "challenge", 20),
  step("park-photo-120", "classic", "foreground-game", "phototunt", 15),
  interlude("park-picnic-120", "classic", 15, {
    en: "Picnic with consequences",
    ru: "Пикник с последствиями",
  }),
  step("park-who-120", "classic", "foreground-game", "whoamong", 20),
  step("park-smoke-reveal-120", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("park-finale-120", "finale", "finale", 10),
];

const parkNormal: readonly RunOfShowStep[] = [
  interlude("park-arrival-180", "classic", 20, { en: "Claim the clearing", ru: "Занять поляну" }),
  step("park-smoke-assign-180", "classic", "background-start", "smokescreen", 2, "assign"),
  step("park-soundscape-180", "classic", "foreground-game", "soundscape", 15),
  step("park-challenge-180", "classic", "foreground-game", "challenge", 20),
  step("park-photo-180", "classic", "foreground-game", "phototunt", 20),
  interlude("park-picnic-180", "classic", 20, {
    en: "Picnic with consequences",
    ru: "Пикник с последствиями",
  }),
  step("park-spectrum-180", "classic", "foreground-game", "spectrumcourt", 20),
  step("park-who-180", "classic", "foreground-game", "whoamong", 20),
  step("park-impostor-180", "classic", "foreground-game", "impostor", 20),
  step("park-smoke-reveal-180", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("park-finale-180", "finale", "finale", 15),
];

const parkExtended: readonly RunOfShowStep[] = [
  ...parkNormal.slice(0, -2),
  step("park-track-240", "classic", "foreground-game", "trackguess", 15),
  interlude("park-roam-240", "classic", 30, {
    en: "Golden-hour roam",
    ru: "Прогулка золотого часа",
  }),
  interlude("park-callbacks-240", "classic", 15, {
    en: "Collect the callbacks",
    ru: "Собрать отсылки",
  }),
  step("park-smoke-reveal-240", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("park-finale-240", "finale", "finale", 15),
];

const barCompact: readonly RunOfShowStep[] = [
  interlude("bar-arrival-120", "bar", 15, { en: "Open the tab", ru: "Открыть счёт" }),
  step("bar-smoke-120", "bar", "background-start", "smokescreen", 2, "assign"),
  step("bar-sommelier-120", "bar", "foreground-game", "sommelier", 20),
  step("bar-toast-120", "bar", "foreground-game", "toastsyndicate", 25),
  interlude("bar-talk-120", "bar", 20, { en: "Generate bad alibis", ru: "Наговорить на алиби" }),
  step("bar-who-120", "bar", "foreground-game", "whoamong", 20),
  step("bar-smoke-reveal-120", "bar", "reveal", "smokescreen", 8, "reveal"),
  moment("bar-finale-120", "finale", "finale", 10),
];

const barNormal: readonly RunOfShowStep[] = [
  interlude("bar-arrival-180", "bar", 20, { en: "Open the tab", ru: "Открыть счёт" }),
  step("bar-smoke-180", "bar", "background-start", "smokescreen", 2, "assign"),
  step("bar-sommelier-180", "bar", "foreground-game", "sommelier", 20),
  step("bar-contraband-180", "bar", "background-start", "contraband", 2, "assign", true),
  step("bar-toast-180", "bar", "foreground-game", "toastsyndicate", 25),
  interlude("bar-talk-180", "bar", 30, { en: "Generate bad alibis", ru: "Наговорить на алиби" }),
  step("bar-impostor-180", "bar", "foreground-game", "impostor", 20),
  step("bar-who-180", "bar", "foreground-game", "whoamong", 20),
  step("bar-cross-180", "bar", "foreground-game", "crossexamination", 20),
  step("bar-smoke-reveal-180", "bar", "reveal", "smokescreen", 8, "reveal"),
  moment("bar-finale-180", "finale", "finale", 13),
];

const barExtended: readonly RunOfShowStep[] = [
  ...barNormal.slice(0, -1),
  step("bar-track-240", "bar", "foreground-game", "trackguess", 20),
  step("bar-spectrum-240", "bar", "foreground-game", "spectrumcourt", 20),
  interlude("bar-neon-240", "bar", 20, { en: "Neon recess", ru: "Неоновая передышка" }),
  moment("bar-finale-240", "finale", "finale", 13),
];

const homeCompact: readonly RunOfShowStep[] = [
  interlude("home-arrival-120", "classic", 15, {
    en: "Inspect the premises",
    ru: "Осмотреть помещение",
  }),
  step("home-smoke-assign-120", "classic", "background-start", "smokescreen", 2, "assign"),
  step("home-impostor-120", "classic", "foreground-game", "impostor", 20),
  step("home-photo-120", "classic", "foreground-game", "phototunt", 15),
  interlude("home-kitchen-120", "classic", 10, {
    en: "Kitchen diplomacy",
    ru: "Кухонная дипломатия",
  }),
  step("home-spectrum-120", "classic", "foreground-game", "spectrumcourt", 20),
  step("home-who-120", "classic", "foreground-game", "whoamong", 20),
  step("home-smoke-reveal-120", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("home-finale-120", "finale", "finale", 10),
];

const homeNormal: readonly RunOfShowStep[] = [
  interlude("home-arrival-180", "classic", 20, {
    en: "Inspect the premises",
    ru: "Осмотреть помещение",
  }),
  step("home-smoke-assign-180", "classic", "background-start", "smokescreen", 2, "assign"),
  step("home-soundscape-180", "classic", "foreground-game", "soundscape", 15),
  step("home-impostor-180", "classic", "foreground-game", "impostor", 20),
  step("home-photo-180", "classic", "foreground-game", "phototunt", 20),
  interlude("home-kitchen-180", "classic", 20, {
    en: "Kitchen diplomacy",
    ru: "Кухонная дипломатия",
  }),
  step("home-spectrum-180", "classic", "foreground-game", "spectrumcourt", 20),
  step("home-who-180", "classic", "foreground-game", "whoamong", 20),
  step("home-track-180", "classic", "foreground-game", "trackguess", 20),
  step("home-smoke-reveal-180", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("home-finale-180", "finale", "finale", 15),
];

const homeExtended: readonly RunOfShowStep[] = [
  ...homeNormal.slice(0, -2),
  step("home-challenge-240", "classic", "foreground-game", "challenge", 20),
  interlude("home-late-night-240", "classic", 25, {
    en: "Late-night house lore",
    ru: "Ночная квартирная мифология",
  }),
  interlude("home-callbacks-240", "classic", 15, {
    en: "Inventory the damage",
    ru: "Инвентаризация последствий",
  }),
  step("home-smoke-reveal-240", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("home-finale-240", "finale", "finale", 15),
];

const festivalCompact: readonly RunOfShowStep[] = [
  interlude("festival-rally-120", "classic", 15, { en: "Find the tribe", ru: "Собрать племя" }),
  step("festival-smoke-assign-120", "classic", "background-start", "smokescreen", 2, "assign"),
  step("festival-soundscape-120", "classic", "foreground-game", "soundscape", 15),
  step("festival-photo-120", "classic", "foreground-game", "phototunt", 15),
  step("festival-challenge-120", "classic", "foreground-game", "challenge", 20),
  interlude("festival-roam-120", "classic", 15, {
    en: "Field expedition",
    ru: "Экспедиция по полю",
  }),
  step("festival-who-120", "classic", "foreground-game", "whoamong", 20),
  step("festival-smoke-reveal-120", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("festival-finale-120", "finale", "finale", 10),
];

const festivalNormal: readonly RunOfShowStep[] = [
  interlude("festival-rally-180", "classic", 20, { en: "Find the tribe", ru: "Собрать племя" }),
  step("festival-smoke-assign-180", "classic", "background-start", "smokescreen", 2, "assign"),
  step("festival-soundscape-180", "classic", "foreground-game", "soundscape", 15),
  step("festival-photo-180", "classic", "foreground-game", "phototunt", 20),
  step("festival-challenge-180", "classic", "foreground-game", "challenge", 20),
  interlude("festival-roam-180", "classic", 25, {
    en: "Field expedition",
    ru: "Экспедиция по полю",
  }),
  step("festival-spectrum-180", "classic", "foreground-game", "spectrumcourt", 20),
  step("festival-impostor-180", "classic", "foreground-game", "impostor", 20),
  step("festival-who-180", "classic", "foreground-game", "whoamong", 15),
  step("festival-smoke-reveal-180", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("festival-finale-180", "finale", "finale", 15),
];

const festivalExtended: readonly RunOfShowStep[] = [
  ...festivalNormal.slice(0, -2),
  step("festival-track-240", "classic", "foreground-game", "trackguess", 20),
  step("festival-cross-240", "classic", "foreground-game", "crossexamination", 20),
  interlude("festival-sunset-240", "classic", 20, { en: "Sunset regroup", ru: "Сбор на закате" }),
  step("festival-smoke-reveal-240", "classic", "reveal", "smokescreen", 8, "reveal"),
  moment("festival-finale-240", "finale", "finale", 15),
];

function scriptedPack(options: {
  id: ExperienceId;
  title: LocalizedText;
  shortTitle: LocalizedText;
  personaName: LocalizedText;
  personaVoice: LocalizedText;
  actId: "classic" | "bar";
  actLabel: LocalizedText;
  emoji: string;
  venue: VenueKind;
  themeKey: ExperienceThemeKey;
  environmentContext: LocalizedText;
  compact: readonly RunOfShowStep[];
  normal: readonly RunOfShowStep[];
  extended: readonly RunOfShowStep[];
}): ExperiencePack {
  const mainAct: ExperienceAct = {
    id: options.actId,
    label: options.actLabel,
    emoji: options.emoji,
    venue: options.venue,
    themeKey: options.themeKey,
    environmentContext: options.environmentContext,
  };
  const finale = scriptedFinaleAct(options.venue, {
    en: `${options.environmentContext.en} FINALE: bring back concrete objects, quotes and incidents from this exact party; award affectionate, specific titles.`,
    ru: `${options.environmentContext.ru} ФИНАЛ: верни конкретные предметы, реплики и происшествия именно этой вечеринки; раздай меткие, но доброжелательные титулы.`,
  });
  const route = (steps: readonly RunOfShowStep[]): ExperienceRoute => ({
    actOrder: [options.actId, "finale"],
    steps,
  });
  return {
    id: options.id,
    title: options.title,
    shortTitle: options.shortTitle,
    hostPersona: { name: options.personaName, voice: options.personaVoice },
    defaultContext: {
      experienceId: options.id,
      actId: options.actId,
      venue: options.venue,
      contingency: "normal",
      uiLocale: "en",
      contentLocale: "en",
    },
    acts: [mainAct, finale],
    routes: {
      compact: route(options.compact),
      normal: route(options.normal),
      extended: route(options.extended),
      "bar-only": route(options.normal),
    },
  };
}

const parkStory = scriptedPack({
  id: "park-story",
  title: { en: "Park Expedition", ru: "Парковая экспедиция" },
  shortTitle: { en: "Park", ru: "Парк" },
  personaName: { en: "the field correspondent", ru: "полевой корреспондент" },
  personaVoice: {
    en: "An observant outdoor MC who treats every bench, gust and picnic accident as breaking news.",
    ru: "Наблюдательный ведущий на выезде: каждая скамейка, порыв ветра и авария пикника для него срочная новость.",
  },
  actId: "classic",
  actLabel: { en: "The field report", ru: "Полевой репортаж" },
  emoji: "🌳",
  venue: "park",
  themeKey: "classic",
  environmentContext: parkStoryContext,
  compact: parkCompact,
  normal: parkNormal,
  extended: parkExtended,
});

const barNight = scriptedPack({
  id: "bar-night",
  title: { en: "Last Call Bureau", ru: "Бюро последнего заказа" },
  shortTitle: { en: "Bar", ru: "Бар" },
  personaName: { en: "the tab inspector", ru: "инспектор счёта" },
  personaVoice: {
    en: "A dry, quick adult host who audits toasts, alibis and bar philosophy with affectionate suspicion.",
    ru: "Сухой и быстрый взрослый ведущий, который с доброй подозрительностью проверяет тосты, алиби и барную философию.",
  },
  actId: "bar",
  actLabel: { en: "Open investigation", ru: "Открытое расследование" },
  emoji: "🍸",
  venue: "bar",
  themeKey: "bar",
  environmentContext: genericBarContext,
  compact: barCompact,
  normal: barNormal,
  extended: barExtended,
});

const houseParty = scriptedPack({
  id: "house-party",
  title: { en: "Household Evidence", ru: "Домашние улики" },
  shortTitle: { en: "Home", ru: "Дом" },
  personaName: { en: "the domestic investigator", ru: "квартирный следователь" },
  personaVoice: {
    en: "A house-party MC who notices every fridge raid, sofa alliance and object put somewhere it clearly does not belong.",
    ru: "Домашний ведущий, который замечает каждый набег на холодильник, диванный альянс и предмет, лежащий явно не там.",
  },
  actId: "classic",
  actLabel: { en: "Open house", ru: "Открытый дом" },
  emoji: "🏠",
  venue: "home",
  themeKey: "home",
  environmentContext: houseContext,
  compact: homeCompact,
  normal: homeNormal,
  extended: homeExtended,
});

const festivalField = scriptedPack({
  id: "festival-field",
  title: { en: "Field Signal", ru: "Полевой сигнал" },
  shortTitle: { en: "Festival", ru: "Фестиваль" },
  personaName: { en: "the roaming signal", ru: "бродячий сигнал" },
  personaVoice: {
    en: "A loud, concise festival guide who turns queues, stages and strange sightings into one shared transmission.",
    ru: "Громкий и лаконичный фестивальный проводник, который собирает очереди, сцены и странные находки в одну общую трансляцию.",
  },
  actId: "classic",
  actLabel: { en: "Live from the field", ru: "В эфире с поля" },
  emoji: "🎪",
  venue: "festival",
  themeKey: "festival",
  environmentContext: festivalContext,
  compact: festivalCompact,
  normal: festivalNormal,
  extended: festivalExtended,
});

export const EXPERIENCE_PACKS: Record<ExperienceId, ExperiencePack> = {
  "classic-park": classicPark,
  "smoke-neon-norrebro": smokeNeon,
  "park-story": parkStory,
  "bar-night": barNight,
  "house-party": houseParty,
  "festival-field": festivalField,
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

function interlude(
  id: string,
  actId: PartyActId,
  durationMinutes: number,
  label: LocalizedText,
  cue?: LocalizedText,
): PartyMomentStep {
  return { id, actId, kind: "interlude", durationMinutes, label, cue };
}
