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
    voice: "witty, energetic, a little sarcastic, like a friend who is also a master of ceremonies",
  },
  speakerSlots: {
    1: "Main Stage",
    2: "Oak Spirit",
    3: "The Wind",
    4: "Squirrel Gossip",
    5: "Forest Echo",
  },
  seo: {
    title: "DIMAS fest — live AI party director",
    description:
      "Build a complete 2–4 hour live AI party for 8–30 people in a park, bar, home or festival. One host screen, every phone joins.",
    ogDescription:
      "A complete live AI party in two minutes: one host, every phone joins, the real venue becomes the story.",
  },
  landing: {
    badge: "Live AI party director",
    description:
      "Build a connected 2–4 hour story for 8–30 people. Pick park, bar, home or festival; AI turns the real crowd, objects and incidents into the games and finale.",
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

export function playerStoragePrefix() {
  return `${eventProfile.storagePrefix}:player:`;
}

export function lastPlayerRoomStorageKey() {
  return `${eventProfile.storagePrefix}:last-player-room`;
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
