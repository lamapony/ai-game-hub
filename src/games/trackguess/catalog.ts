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

/**
 * Track catalog for TrackGuess ("Real or AI?")
 *
 * Playable tracks use royalty-free sources (Mixkit + SoundHelix for more variety).
 * These are base/demo tracks.
 *
 * For hard, realistic rounds with real human performances:
 * - Use spotify-suggestions.ts
 * - Add via TrackVault in the Host UI (supports Spotify sourceUrl)
 *
 * Grill + Bar theme: prefer acoustic, soul, lounge, live-feel tracks.
 */

// === PLAYABLE REAL TRACKS (royalty-free, human-produced feel) ===
const REAL_TRACKS: CatalogTrack[] = [
  {
    id: "real-lounge",
    title: "Retro Lounge",
    artist: "Mixkit",
    genre: "Jazz / Lounge",
    url: "https://assets.mixkit.co/music/preview/mixkit-retro-lounge-140.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-acoustic-guitar",
    title: "Acoustic Morning",
    artist: "Mixkit",
    genre: "Acoustic Guitar",
    url: "https://assets.mixkit.co/music/preview/mixkit-guitar-ascend-2326.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-piano-intimate",
    title: "Piano Moment",
    artist: "Mixkit",
    genre: "Intimate Piano",
    url: "https://assets.mixkit.co/music/preview/mixkit-piano-horror-669.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-ambient-warm",
    title: "Silent Description",
    artist: "Mixkit",
    genre: "Warm Ambient",
    url: "https://assets.mixkit.co/music/preview/mixkit-silent-description-1218.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-pop-acoustic",
    title: "Life is a Wonder",
    artist: "Mixkit",
    genre: "Acoustic Pop",
    url: "https://assets.mixkit.co/music/preview/mixkit-life-is-a-wonder-369.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  // Additional real tracks from SoundHelix (free for testing)
  {
    id: "real-soundhelix-1",
    title: "SoundHelix Song 1",
    artist: "SoundHelix",
    genre: "Acoustic / Guitar",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    isAi: false,
    sourceLabel: "SoundHelix",
  },
  {
    id: "real-soundhelix-2",
    title: "SoundHelix Song 2",
    artist: "SoundHelix",
    genre: "Folk / Instrumental",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    isAi: false,
    sourceLabel: "SoundHelix",
  },
  {
    id: "real-soundhelix-16",
    title: "SoundHelix Song 16",
    artist: "SoundHelix",
    genre: "Chill / Guitar",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3",
    isAi: false,
    sourceLabel: "SoundHelix",
  },
];

// === PLAYABLE AI / SYNTHETIC TRACKS ===
const AI_TRACKS: CatalogTrack[] = [
  {
    id: "ai-synth-bar",
    title: "Virtual Pulse",
    artist: "Synthetic",
    genre: "Synth / Electronic",
    url: "https://assets.mixkit.co/music/preview/mixkit-virtual-reality-842.mp3",
    isAi: true,
  },
  {
    id: "ai-scifi-atmosphere",
    title: "Sci-Fi Intro",
    artist: "Synthetic",
    genre: "Atmospheric Synth",
    url: "https://assets.mixkit.co/music/preview/mixkit-sci-fi-intro-898.mp3",
    isAi: true,
  },
  {
    id: "ai-digital-glitch",
    title: "Digital Clock",
    artist: "Synthetic",
    genre: "Glitch / IDM",
    url: "https://assets.mixkit.co/music/preview/mixkit-digital-clock-927.mp3",
    isAi: true,
  },
  {
    id: "ai-urban-beat",
    title: "Deep Urban",
    artist: "Synthetic",
    genre: "Techno / Beat",
    url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3",
    isAi: true,
  },
  {
    id: "ai-worldbeat",
    title: "Games Worldbeat",
    artist: "Synthetic",
    genre: "World / Chiptune",
    url: "https://assets.mixkit.co/music/preview/mixkit-games-worldbeat-466.mp3",
    isAi: true,
  },
];

export const TRACK_CATALOG: CatalogTrack[] = [
  ...REAL_TRACKS,
  ...AI_TRACKS,
];

// Spotify suggestions (for reference and quick adding via UI)
export const SPOTIFY_REAL_SUGGESTIONS = [
  {
    title: "Take Me To Church (Tiny Desk)",
    artist: "Hozier",
    genre: "Soul / Live Performance",
    search: "Hozier Tiny Desk",
    why: "Raw, emotional live vocal - perfect human performance",
  },
  {
    title: "Tiny Desk Concert",
    artist: "Jacob Collier",
    genre: "Vocal / Jazz Live",
    search: "Jacob Collier Tiny Desk",
    why: "Insane vocal skill and harmonies - very hard to fake",
  },
  {
    title: "360",
    artist: "Charli XCX",
    genre: "Hyperpop",
    search: "Charli XCX 360",
    why: "Hyper-produced, digital, uncanny - feels AI-like",
  },
  {
    title: "Von dutch",
    artist: "Charli XCX",
    genre: "Hyperpop / Digital",
    search: "Charli XCX Von dutch",
    why: "Extremely clean production - blurs real/AI line",
  },
  {
    title: "Tiny Desk",
    artist: "Billie Eilish",
    genre: "Intimate Pop Live",
    search: "Billie Eilish Tiny Desk",
    why: "Natural intimate live take",
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

export function getAllRealTracks(): CatalogTrack[] {
  return TRACK_CATALOG.filter((t) => !t.isAi);
}

export function getAllAiTracks(): CatalogTrack[] {
  return TRACK_CATALOG.filter((t) => t.isAi);
}
