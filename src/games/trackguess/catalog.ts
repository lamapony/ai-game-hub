export type CatalogTrack = {
  id: string;
  title: string;
  genre: string;
  url: string;
  isAi: boolean;
};

// Royalty-free preview clips (Mixkit). Real = human-produced stock; AI = synthetic/electronic stand-ins
// for AI-generated music in the party-game fiction.
export const TRACK_CATALOG: CatalogTrack[] = [
  {
    id: "real-lounge",
    title: "Retro Lounge",
    genre: "Джаз / лаунж",
    url: "https://assets.mixkit.co/music/preview/mixkit-retro-lounge-140.mp3",
    isAi: false,
  },
  {
    id: "real-happy",
    title: "Life is a Wonder",
    genre: "Поп / акустика",
    url: "https://assets.mixkit.co/music/preview/mixkit-life-is-a-wonder-369.mp3",
    isAi: false,
  },
  {
    id: "real-ambient",
    title: "Silent Description",
    genre: "Эмбиент",
    url: "https://assets.mixkit.co/music/preview/mixkit-silent-description-1218.mp3",
    isAi: false,
  },
  {
    id: "real-guitar",
    title: "Acoustic Morning",
    genre: "Акустика",
    url: "https://assets.mixkit.co/music/preview/mixkit-guitar-ascend-2326.mp3",
    isAi: false,
  },
  {
    id: "real-piano",
    title: "Piano Moment",
    genre: "Фортепиано",
    url: "https://assets.mixkit.co/music/preview/mixkit-piano-horror-669.mp3",
    isAi: false,
  },
  {
    id: "ai-vr",
    title: "Virtual Pulse",
    genre: "Синт / электро",
    url: "https://assets.mixkit.co/music/preview/mixkit-virtual-reality-842.mp3",
    isAi: true,
  },
  {
    id: "ai-scifi",
    title: "Sci-Fi Intro",
    genre: "Синтвейв",
    url: "https://assets.mixkit.co/music/preview/mixkit-sci-fi-intro-898.mp3",
    isAi: true,
  },
  {
    id: "ai-digital",
    title: "Digital Clock",
    genre: "Глitch / IDM",
    url: "https://assets.mixkit.co/music/preview/mixkit-digital-clock-927.mp3",
    isAi: true,
  },
  {
    id: "ai-worldbeat",
    title: "Games Worldbeat",
    genre: "8-bit / chiptune",
    url: "https://assets.mixkit.co/music/preview/mixkit-games-worldbeat-466.mp3",
    isAi: true,
  },
  {
    id: "ai-urban",
    title: "Deep Urban",
    genre: "Техно / AI-drill",
    url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3",
    isAi: true,
  },
];

export function getCatalogTrack(trackId: string | undefined): CatalogTrack | null {
  if (!trackId) return null;
  return TRACK_CATALOG.find((t) => t.id === trackId) ?? null;
}

export function pickCatalogTrack(usedTrackIds: string[], random = Math.random()): CatalogTrack {
  const available = TRACK_CATALOG.filter((t) => !usedTrackIds.includes(t.id));
  const pool = available.length > 0 ? available : TRACK_CATALOG;
  const index = Math.min(pool.length - 1, Math.floor(random * pool.length));
  return pool[index]!;
}
