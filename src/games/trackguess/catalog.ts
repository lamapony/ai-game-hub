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
 * Improved catalog for TrackGuess ("Real or AI?")
 * 
 * Base tracks use royalty-free Mixkit previews (playable).
 * For much harder rounds see:
 *   - spotify-suggestions.ts (ready tracks on Spotify)
 *   - recommended-tracks.md (Suno prompts + hyper-real ideas)
 * 
 * Goal: Blur the line for grill + bar party.
 */

// === REAL TRACKS (human-produced stock, more varied) ===
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
    genre: "Acoustic / Fingerstyle",
    url: "https://assets.mixkit.co/music/preview/mixkit-guitar-ascend-2326.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-piano-intimate",
    title: "Piano Moment",
    artist: "Mixkit",
    genre: "Piano / Intimate",
    url: "https://assets.mixkit.co/music/preview/mixkit-piano-horror-669.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-ambient-warm",
    title: "Silent Description",
    artist: "Mixkit",
    genre: "Ambient / Warm",
    url: "https://assets.mixkit.co/music/preview/mixkit-silent-description-1218.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
  {
    id: "real-pop-acoustic",
    title: "Life is a Wonder",
    artist: "Mixkit",
    genre: "Pop / Acoustic",
    url: "https://assets.mixkit.co/music/preview/mixkit-life-is-a-wonder-369.mp3",
    isAi: false,
    sourceLabel: "Mixkit",
  },
];

// === AI TRACKS (synthetic but trying to be less obvious) ===
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
    genre: "Atmospheric / Synthwave",
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

// === SPOTIFY HARD MODE SUGGESTIONS (not playable yet) ===
// These are real tracks on Spotify. Use them via custom tracks or inspiration.
// See spotify-suggestions.ts for full list with search terms.
const SPOTIFY_HARD_REAL: Partial<CatalogTrack>[] = [
  // Cool live performances
  { id: "spotify-hozier-live", title: "Take Me To Church (Live/Tiny Desk)", artist: "Hozier", genre: "Soul / Live", isAi: false, sourceLabel: "Spotify" },
  { id: "spotify-jacob-collier", title: "Tiny Desk (Live)", artist: "Jacob Collier", genre: "Vocal Jazz / Live", isAi: false, sourceLabel: "Spotify" },
  // Hyper-real / AI-like real
  { id: "spotify-charli-360", title: "360", artist: "Charli XCX", genre: "Hyperpop", isAi: false, sourceLabel: "Spotify" },
  { id: "spotify-charli-vondutch", title: "Von dutch", artist: "Charli XCX", genre: "Hyperpop / Digital", isAi: false, sourceLabel: "Spotify" },
];

export const TRACK_CATALOG: CatalogTrack[] = [
  ...REAL_TRACKS,
  ...AI_TRACKS,
];

export const SPOTIFY_SUGGESTED = SPOTIFY_HARD_REAL;

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

// For future: mix in Spotify suggestions when user adds custom tracks
export function getAllRealTracks(): CatalogTrack[] {
  return TRACK_CATALOG.filter(t => !t.isAi);
}

export function getAllAiTracks(): CatalogTrack[] {
  return TRACK_CATALOG.filter(t => t.isAi);
}
