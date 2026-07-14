// Adapted from grill-bar-party-upgrade.md section 3.5

export type ToastLocale = "en" | "ru";

export type LocalizedString = {
  en: string;
  ru: string;
};

export type ToastGenre = {
  id: string;
  label: LocalizedString;
  instructions: LocalizedString;
};

export type ContrabandWord = {
  id: string;
  label: LocalizedString;
};

export type ToastFallbackWord = {
  id: string;
  text: string;
};

export type ToastFallbackPick = {
  genreId: string;
  genre: string;
  instructions: string;
  words: ToastFallbackWord[];
};

export const TOAST_GENRE_CATALOG: ToastGenre[] = [
  {
    id: "noir-detective",
    label: { en: "Noir detective monologue", ru: "Нуар-детектив" },
    instructions: {
      en: "Deliver the toast like a tired private eye narrating a rainy case file. Dry wit, long shadows, no happy endings promised.",
      ru: "Произнеси тост как уставший частный детектив, диктующий дело под дождём. Сухой сарказм, длинные тени, без обещаний хэппи-энда.",
    },
  },
  {
    id: "investor-pitch",
    label: { en: "Investor pitch", ru: "Питч инвесторам" },
    instructions: {
      en: "Pitch tonight as a Series A opportunity. Traction, unit economics, and a slightly unhinged vision slide.",
      ru: "Продай сегодняшний вечер как Series A. Трекшн, unit economics и слегка безумный vision-слайд.",
    },
  },
  {
    id: "courtroom-defense",
    label: { en: "Courtroom defense", ru: "Оправдательная речь в суде" },
    instructions: {
      en: "Defend the table as if a jury is already judging the friendship. Formal, righteous, slightly theatrical.",
      ru: "Защищай стол так, будто жюри уже судит дружбу. Формально, праведно и чуть театрально.",
    },
  },
  {
    id: "ted-talk-obvious",
    label: { en: "TED talk about the obvious", ru: "TED talk про очевидное" },
    instructions: {
      en: "Give a TED talk about something everyone already knows, with confident pauses and fake research.",
      ru: "Сделай TED talk про то, что все и так знают: уверенные паузы и фейковые исследования.",
    },
  },
  {
    id: "weather-forecast",
    label: { en: "Weather forecast", ru: "Прогноз погоды" },
    instructions: {
      en: "Forecast the social climate of the night: fronts of laughter, pressure drops of silence, and sudden drama.",
      ru: "Прогноз социальной погоды вечера: фронты смеха, падение давления тишины и внезапная драма.",
    },
  },
  {
    id: "ikea-instruction",
    label: { en: "IKEA instruction", ru: "Инструкция IKEA" },
    instructions: {
      en: "Assemble the toast like an IKEA manual: numbered steps, missing screws, and forced optimism.",
      ru: "Собери тост как инструкцию IKEA: нумерованные шаги, недостающие винты и насильственный оптимизм.",
    },
  },
  {
    id: "sports-commentary",
    label: { en: "Sports commentary", ru: "Спортивный комментарий" },
    instructions: {
      en: "Call the toast like a live sports broadcast. Momentum, substitutions, and an unnecessary historical stat.",
      ru: "Веди тост как прямой спортивный эфир. Моментум, замены и ненужная историческая статистика.",
    },
  },
  {
    id: "nature-documentary",
    label: { en: "Nature documentary narration", ru: "Голос документалки о природе" },
    instructions: {
      en: "Narrate the table like rare wildlife at dusk. Whispered awe, Latin-ish names optional.",
      ru: "Опиши стол как редких зверей на закате. Шёпот восхищения, псевдолатинские названия по желанию.",
    },
  },
  {
    id: "product-recall",
    label: { en: "Product recall announcement", ru: "Объявление об отзыве продукта" },
    instructions: {
      en: "Issue a serious recall for emotional defects found in tonight's gathering. Corporate calm, legal escape hatches.",
      ru: "Объяви серьёзный отзыв из-за эмоциональных дефектов сегодняшнего сбора. Корпорационное спокойствие и юридические лазейки.",
    },
  },
  {
    id: "airport-gate",
    label: { en: "Airport gate announcement", ru: "Объявление у гейта" },
    instructions: {
      en: "Boarding call for the evening: delays, priority lanes for people who brought snacks, final destination unknown.",
      ru: "Посадка на вечер: задержки, приоритет тем, кто принёс снеки, пункт назначения неизвестен.",
    },
  },
  {
    id: "cooking-show",
    label: { en: "Cooking show monologue", ru: "Монолог кулинарного шоу" },
    instructions: {
      en: "Plate the toast like a competitive cooking host: timing, plating, and a secret ingredient of friendship.",
      ru: "Подай тост как ведущий кулинарного шоу: тайминг, подача и секретный ингредиент дружбы.",
    },
  },
  {
    id: "museum-audio-guide",
    label: { en: "Museum audio guide", ru: "Аудиогид музея" },
    instructions: {
      en: "Guide visitors through the exhibit of this exact table. Dates approximate, significance inflated.",
      ru: "Проведи экскурсию по экспонату «этот стол». Даты приблизительны, значимость завышена.",
    },
  },
];

export const CONTRABAND_WORD_CATALOG: ContrabandWord[] = [
  { id: "carburetor", label: { en: "carburetor", ru: "карбюратор" } },
  { id: "fjord", label: { en: "fjord", ru: "фьорд" } },
  { id: "laminate", label: { en: "laminate", ru: "ламинат" } },
  { id: "stapler", label: { en: "stapler", ru: "степлер" } },
  { id: "thermostat", label: { en: "thermostat", ru: "термостат" } },
  { id: "protractor", label: { en: "protractor", ru: "транспортир" } },
  { id: "accordion", label: { en: "accordion", ru: "аккордеон" } },
  { id: "radiator", label: { en: "radiator", ru: "радиатор" } },
  { id: "manhole", label: { en: "manhole cover", ru: "крышка люка" } },
  { id: "asphalt", label: { en: "asphalt", ru: "асфальт" } },
  { id: "tetris", label: { en: "Tetris", ru: "тетрис" } },
  { id: "velcro", label: { en: "velcro", ru: "липучка" } },
  { id: "selenium", label: { en: "selenium", ru: "селен" } },
  { id: "trowel", label: { en: "trowel", ru: "мастерок" } },
  { id: "gasket", label: { en: "gasket", ru: "уплотнительная прокладка" } },
  { id: "silo", label: { en: "silo", ru: "силосная башня" } },
  { id: "parquet", label: { en: "parquet", ru: "паркет" } },
  { id: "anvil", label: { en: "anvil", ru: "наковальня" } },
  { id: "fertilizer", label: { en: "fertilizer", ru: "удобрение" } },
  { id: "compass", label: { en: "compass", ru: "компас" } },
  { id: "xylophone", label: { en: "xylophone", ru: "ксилофон" } },
  { id: "socket", label: { en: "socket wrench", ru: "торцевой ключ" } },
  { id: "linoleum", label: { en: "linoleum", ru: "линолеум" } },
  { id: "pylon", label: { en: "pylon", ru: "пилон" } },
  { id: "capacitor", label: { en: "capacitor", ru: "конденсатор" } },
  { id: "harpoon", label: { en: "harpoon", ru: "гарпун" } },
  { id: "caulk", label: { en: "caulk", ru: "строительный герметик" } },
  { id: "boomerang", label: { en: "boomerang", ru: "бумеранг" } },
  { id: "solder", label: { en: "solder", ru: "припой" } },
  { id: "pulley", label: { en: "pulley", ru: "шкив" } },
  { id: "algae", label: { en: "algae", ru: "водоросли" } },
  { id: "mezzanine", label: { en: "mezzanine", ru: "антресоль" } },
  { id: "kiln", label: { en: "kiln", ru: "печь обжига" } },
  { id: "rivet", label: { en: "rivet", ru: "заклёпка" } },
  { id: "tarp", label: { en: "tarp", ru: "брезент" } },
  { id: "glacier", label: { en: "glacier", ru: "ледник" } },
  { id: "caliper", label: { en: "caliper", ru: "штангенциркуль" } },
  { id: "basalt", label: { en: "basalt", ru: "базальт" } },
  { id: "hinge", label: { en: "hinge", ru: "петля" } },
  { id: "permafrost", label: { en: "permafrost", ru: "вечная мерзлота" } },
];

const REQUIRED_GENRE_IDS = [
  "noir-detective",
  "investor-pitch",
  "courtroom-defense",
  "ted-talk-obvious",
  "weather-forecast",
  "ikea-instruction",
  "sports-commentary",
] as const;

/** Deterministic 0..1 PRNG. No Math.random. */
function createSeededUnit(seed: number): () => number {
  let state = Math.trunc(seed) | 0;
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIndex(length: number, unit: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.floor(unit * length));
}

function poolExcluding<T extends { id: string }>(
  catalog: readonly T[],
  recentIds: readonly string[] | undefined,
  minKeep: number,
): T[] {
  if (!recentIds || recentIds.length === 0) return [...catalog];
  const recent = new Set(recentIds);
  const filtered = catalog.filter((item) => !recent.has(item.id));
  return filtered.length >= minKeep ? filtered : [...catalog];
}

function pickWithoutReplacement<T>(items: readonly T[], count: number, next: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    const index = pickIndex(pool.length, next());
    const [item] = pool.splice(index, 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}

export function pickToastFallback(
  locale: ToastLocale,
  seed: number,
  recentGenreIds?: readonly string[],
  recentWordIds?: readonly string[],
): ToastFallbackPick {
  const next = createSeededUnit(seed);
  const genrePool = poolExcluding(TOAST_GENRE_CATALOG, recentGenreIds, 1);
  const wordPool = poolExcluding(CONTRABAND_WORD_CATALOG, recentWordIds, 3);

  const genre = genrePool[pickIndex(genrePool.length, next())]!;
  const words = pickWithoutReplacement(wordPool, 3, next);

  return {
    genreId: genre.id,
    genre: genre.label[locale],
    instructions: genre.instructions[locale],
    words: words.map((word) => ({
      id: word.id,
      text: word.label[locale],
    })),
  };
}

export const TOAST_REQUIRED_GENRE_IDS = REQUIRED_GENRE_IDS;
