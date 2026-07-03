export type EventProfile = {
  id: string;
  title: string;
  shortTitle: string;
  titleLines: string[];
  defaultHostName: string;
  storagePrefix: string;
  venue: string;
  hostPersona: {
    name: string;
    voice: string;
  };
  speakerSlots: Record<number, string>;
  seo: {
    title: string;
    description: string;
    ogDescription: string;
  };
  landing: {
    badge: string;
    description: string;
  };
};

export const eventProfile: EventProfile = {
  id: "dimas-fest",
  title: "DIMAS fest",
  shortTitle: "DIMAS",
  titleLines: ["DIMAS", "fest."],
  defaultHostName: "Host",
  storagePrefix: "dimas",
  venue: "park",
  hostPersona: {
    name: "park spirit",
    voice:
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
    title: "DIMAS fest — AI park party games",
    description:
      "DIMAS fest: Jackbox-style AI party games for the park. One host screen, every phone joins, five speakers turn the park into a stage.",
    ogDescription:
      "AI park party games. One screen, every phone joins, the park becomes the stage.",
  },
  landing: {
    badge: "AI park games",
    description:
      "Jackbox-style party games right in the park. One host phone, everyone else scans the QR. AI creates the prompts, speakers talk, no laptop needed.",
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

export function hostPersonaName() {
  return eventProfile.hostPersona.name;
}

export function hostPersonaVoice() {
  return eventProfile.hostPersona.voice;
}

export function seoTitle() {
  return eventProfile.seo.title;
}

export function seoDescription() {
  return eventProfile.seo.description;
}

export function landingBadge() {
  return eventProfile.landing.badge;
}

export function landingDescription() {
  return eventProfile.landing.description;
}
