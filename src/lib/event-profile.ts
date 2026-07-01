export type EventProfile = {
  id: string;
  title: string;
  shortTitle: string;
  titleLines: string[];
  defaultHostName: string;
  storagePrefix: string;
  venue: {
    ru: string;
    en: string;
  };
  hostPersona: {
    ru: string;
    en: string;
    voiceRu: string;
    voiceEn: string;
  };
  speakerSlots: Record<number, string>;
  seo: {
    titleRu: string;
    titleEn: string;
    descriptionRu: string;
    descriptionEn: string;
    ogDescriptionRu: string;
    ogDescriptionEn: string;
  };
  landing: {
    badgeRu: string;
    descriptionRu: string;
  };
};

export const eventProfile: EventProfile = {
  id: "dimas-fest",
  title: "DIMAS fest",
  shortTitle: "DIMAS",
  titleLines: ["DIMAS", "fest."],
  defaultHostName: "Ведущий",
  storagePrefix: "dimas",
  venue: {
    ru: "парк",
    en: "park",
  },
  hostPersona: {
    ru: "дух парка",
    en: "park spirit",
    voiceRu: "едкий, остроумный, как саркастичный конферансье",
    voiceEn:
      "witty, energetic, a little sarcastic, like a friend who is also a master of ceremonies",
  },
  speakerSlots: {
    1: "Main Stage",
    2: "Oak Spirit",
    3: "The Wind",
    4: "Squirrel Gossip",
    5: "Forest Echo",
  },
  seo: {
    titleRu: "DIMAS fest — AI-игры в парке",
    titleEn: "DIMAS fest — AI park party games",
    descriptionRu:
      "Jackbox в парке: один телефон ведущего, остальные подключаются по QR. AI ведёт игру, колонки разговаривают.",
    descriptionEn:
      "DIMAS fest: Jackbox-style AI party games for the park. One host screen, every phone joins, five speakers turn the park into a stage.",
    ogDescriptionRu: "AI-игры для тусовки. Телефон ведущего + QR. Без ноутбука.",
    ogDescriptionEn:
      "AI park party games. One screen, every phone joins, the park becomes the stage.",
  },
  landing: {
    badgeRu: "AI-игры для парка",
    descriptionRu:
      "Тусовка в стиле Jackbox прямо в парке. Один телефон ведущего, остальные сканируют QR. AI выдаёт темы, колонки разговаривают. Ноутбук не нужен.",
  },
};

export function speakerSlotPrompt() {
  return Object.entries(eventProfile.speakerSlots)
    .map(([slot, name]) => `slot ${slot} = ${name}${slot === "1" ? " (host)" : ""}`)
    .join(", ");
}

export function playerStorageKey(code: string) {
  return `${eventProfile.storagePrefix}:player:${code}`;
}

export function hostStorageKey(code: string) {
  return `${eventProfile.storagePrefix}:host:${code}`;
}
