export type CatalogTrack = {
  id: string;
  title: string;
  artist?: string;
  genre: string;
  url: string;
  isAi: boolean;
  sourceLabel?: string;
  sourceUrl?: string;
  artworkUrl?: string;
};

// Royalty-free preview clips (Mixkit). These are temporary stand-ins.
// For hard, realistic "Real or AI?" rounds see src/games/trackguess/recommended-tracks.md
// Goal: AI tracks that sound human + real tracks with impressive/cool executions or uncanny production.
export const TRACK_CATALOG: CatalogTrack[] = [
  {
    id: "real-lounge",
    title: "Retro Lounge",
    artist: "Mixkit",
    genre: "Jazz / lounge",
    url: "https://assets.mixkit.co/music/preview/mixkit-retro-lounge-140.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-happy",
    title: "Life is a Wonder",
    artist: "Mixkit",
    genre: "Pop / acoustic",
    url: "https://assets.mixkit.co/music/preview/mixkit-life-is-a-wonder-369.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-ambient",
    title: "Silent Description",
    artist: "Mixkit",
    genre: "Ambient",
    url: "https://assets.mixkit.co/music/preview/mixkit-silent-description-1218.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-guitar",
    title: "Acoustic Morning",
    artist: "Mixkit",
    genre: "Acoustic",
    url: "https://assets.mixkit.co/music/preview/mixkit-guitar-ascend-2326.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-piano",
    title: "Piano Moment",
    artist: "Mixkit",
    genre: "Piano",
    url: "https://assets.mixkit.co/music/preview/mixkit-piano-horror-669.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "ai-vr",
    title: "Virtual Pulse",
    artist: "Synthetic decoy",
    genre: "Synth / electronic",
    url: "https://assets.mixkit.co/music/preview/mixkit-virtual-reality-842.mp3",
    isAi: true,
  },
  {
    id: "ai-scifi",
    title: "Sci-Fi Intro",
    artist: "Synthetic decoy",
    genre: "Synthwave",
    url: "https://assets.mixkit.co/music/preview/mixkit-sci-fi-intro-898.mp3",
    isAi: true,
  },
  {
    id: "ai-digital",
    title: "Digital Clock",
    artist: "Synthetic decoy",
    genre: "Glitch / IDM",
    url: "https://assets.mixkit.co/music/preview/mixkit-digital-clock-927.mp3",
    isAi: true,
  },
  {
    id: "ai-worldbeat",
    title: "Games Worldbeat",
    artist: "Synthetic decoy",
    genre: "8-bit / chiptune",
    url: "https://assets.mixkit.co/music/preview/mixkit-games-worldbeat-466.mp3",
    isAi: true,
  },
  {
    id: "ai-urban",
    title: "Deep Urban",
    artist: "Synthetic decoy",
    genre: "Techno / AI drill",
    url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3",
    isAi: true,
  },
];

export function getCatalogTrack(trackId: string | undefined): CatalogTrack | null {
  if (!trackId) return null;
  return TRACK_CATALOG.find((t) => t.id === trackId) ?? null;
}

export function pickTrackFromPool(
  pool: CatalogTrack[],
  usedTrackIds: string[],
  random = Math.random(),
): CatalogTrack {
  if (pool.length === 0) return TRACK_CATALOG[0]!;
  const available = pool.filter((t) => !usedTrackIds.includes(t.id));
  const candidates = available.length > 0 ? available : pool;
  const index = Math.min(candidates.length - 1, Math.floor(random * candidates.length));
  return candidates[index]!;
}

export function pickCatalogTrack(usedTrackIds: string[], random = Math.random()): CatalogTrack {
  return pickTrackFromPool(TRACK_CATALOG, usedTrackIds, random);
}
