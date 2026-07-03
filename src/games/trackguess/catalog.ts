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
 * The default pool is Spotify-first. Spotify content cannot be converted to
 * direct audio files, so host playback uses Spotify links/embeds while player
 * phones keep the track metadata hidden until reveal.
 *
 * Grill + Bar theme: prefer acoustic, soul, lounge, live-feel tracks.
 */

// === SPOTIFY REAL TRACKS ===
const REAL_TRACKS: CatalogTrack[] = [
  {
    id: "real-hozier-take-me-to-church",
    title: "Take Me To Church",
    artist: "Hozier",
    genre: "Soul / Human vocal",
    url: "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
  },
  {
    id: "real-charli-xcx-360",
    title: "360",
    artist: "Charli xcx",
    genre: "Hyperpop / Produced pop",
    url: "https://open.spotify.com/track/4w2GLmK2wnioVnb5CPQeex",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/4w2GLmK2wnioVnb5CPQeex",
  },
  {
    id: "real-daft-punk-get-lucky",
    title: "Get Lucky",
    artist: "Daft Punk, Pharrell Williams, Nile Rodgers",
    genre: "Disco / Studio performance",
    url: "https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq",
  },
  {
    id: "real-imogen-heap-hide-and-seek",
    title: "Hide and Seek",
    artist: "Imogen Heap",
    genre: "Processed vocal / Human performance",
    url: "https://open.spotify.com/track/7mMlbJlXXo2mRtQ4R9sIzD",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/7mMlbJlXXo2mRtQ4R9sIzD",
  },
  {
    id: "real-solange-cranes",
    title: "Cranes in the Sky",
    artist: "Solange",
    genre: "Soul / Art pop",
    url: "https://open.spotify.com/track/48EjSdYh8wz2gBxxqzrsLe",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/48EjSdYh8wz2gBxxqzrsLe",
  },
  {
    id: "real-anderson-paak-come-down",
    title: "Come Down",
    artist: "Anderson .Paak",
    genre: "Funk / Live-feel groove",
    url: "https://open.spotify.com/track/276zciJ7Fg7Jk6Ta6QuLkp",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/276zciJ7Fg7Jk6Ta6QuLkp",
  },
  {
    id: "real-billie-eilish-ocean-eyes",
    title: "ocean eyes",
    artist: "Billie Eilish",
    genre: "Intimate pop vocal",
    url: "https://open.spotify.com/track/7hDVYcQq6MxkdJGweuCtl9",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/7hDVYcQq6MxkdJGweuCtl9",
  },
  {
    id: "real-jacob-collier-all-night-long",
    title: "All Night Long",
    artist: "Jacob Collier, Metropole Orkest, Jules Buckley, Take 6",
    genre: "Jazz / Vocal arrangement",
    url: "https://open.spotify.com/track/6TN4FrJvMdYrLDF2Lz7ArI",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/6TN4FrJvMdYrLDF2Lz7ArI",
  },
  {
    id: "real-tracy-chapman-fast-car",
    title: "Fast Car",
    artist: "Tracy Chapman",
    genre: "Folk / Human phrasing",
    url: "https://open.spotify.com/track/2M9ro2krNb7nr7HSprkEgo",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/2M9ro2krNb7nr7HSprkEgo",
  },
  {
    id: "real-childish-gambino-redbone",
    title: "Redbone",
    artist: "Childish Gambino",
    genre: "Soul / Falsetto groove",
    url: "https://open.spotify.com/track/3vQ4T78TTMOjQXGfXVKQJo",
    isAi: false,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/3vQ4T78TTMOjQXGfXVKQJo",
  },
];

// === SPOTIFY AI / AI-LABELED TRACKS ===
const AI_TRACKS: CatalogTrack[] = [
  {
    id: "ai-aiva-on-the-edge",
    title: "On the Edge - Ai-Generated Rock Music by Aiva",
    artist: "Aiva, Brad Frey",
    genre: "AI-generated rock",
    url: "https://open.spotify.com/track/6Q0qzRjwHohgkYGI3q1bf8",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/6Q0qzRjwHohgkYGI3q1bf8",
  },
  {
    id: "ai-suno-orchestral-f",
    title: "Suno AI Music Epic Powerful Motivational Orchestral F",
    artist: "haunted cherry",
    genre: "Suno / Orchestral",
    url: "https://open.spotify.com/track/1FPzukk8nvTJAtUOKVWFtp",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/1FPzukk8nvTJAtUOKVWFtp",
  },
  {
    id: "ai-generated-boomstick",
    title: "AI Generated Boomstick",
    artist: "dj-Nate",
    genre: "AI-labeled electronic",
    url: "https://open.spotify.com/track/25QVhoqXuY0Kd2F7K1lzKO",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/25QVhoqXuY0Kd2F7K1lzKO",
  },
  {
    id: "ai-this-song-is-ai-generated",
    title: "THIS SONG IS AI GENERATED",
    artist: "googifloop",
    genre: "AI-labeled pop",
    url: "https://open.spotify.com/track/6TyHjo4ZSErLqSiXZdt8j7",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/6TyHjo4ZSErLqSiXZdt8j7",
  },
  {
    id: "ai-nekonoma-one-more",
    title: "One More (feat.suno.ai)",
    artist: "Nekonoma",
    genre: "Suno / Pop",
    url: "https://open.spotify.com/track/7FPMLivewo1uKihuYMfC7S",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/7FPMLivewo1uKihuYMfC7S",
  },
  {
    id: "ai-nekonoma-coffee-jellyfish",
    title: "Coffee Jellyfish (feat.suno.ai)",
    artist: "Nekonoma",
    genre: "Suno / Electronic pop",
    url: "https://open.spotify.com/track/0N7G9MFzIZIiV4LQdbZ3Bm",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/0N7G9MFzIZIiV4LQdbZ3Bm",
  },
  {
    id: "ai-waves-of-time",
    title: "Waves of Time - SUNO AI",
    artist: "Paul BrAIny, Waldo",
    genre: "Suno / Melodic",
    url: "https://open.spotify.com/track/4BI5Eezu81oxDXMWJhu6lg",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/4BI5Eezu81oxDXMWJhu6lg",
  },
  {
    id: "ai-echoes-down-the-road",
    title: "Echoes Down the Road",
    artist: "Suno AI, Julius Apat",
    genre: "Suno / Acoustic pop",
    url: "https://open.spotify.com/track/2kwGVGUN1LtC6fzB4b7OqD",
    isAi: true,
    sourceLabel: "Spotify",
    sourceUrl: "https://open.spotify.com/track/2kwGVGUN1LtC6fzB4b7OqD",
  },
];

export const TRACK_CATALOG: CatalogTrack[] = [...REAL_TRACKS, ...AI_TRACKS];

// Spotify suggestions (for reference and quick adding via UI)
export const SPOTIFY_REAL_SUGGESTIONS = [
  {
    title: "Take Me To Church",
    artist: "Hozier",
    genre: "Soul / Human vocal",
    url: "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
    search: "Hozier Take Me To Church",
    why: "Raw, emotional live vocal - perfect human performance",
  },
  {
    title: "All Night Long",
    artist: "Jacob Collier",
    genre: "Jazz / Vocal arrangement",
    url: "https://open.spotify.com/track/6TN4FrJvMdYrLDF2Lz7ArI",
    search: "Jacob Collier All Night Long",
    why: "Insane vocal skill and harmonies - very hard to fake",
  },
  {
    title: "360",
    artist: "Charli XCX",
    genre: "Hyperpop",
    url: "https://open.spotify.com/track/4w2GLmK2wnioVnb5CPQeex",
    search: "Charli XCX 360",
    why: "Hyper-produced, digital, uncanny - feels AI-like",
  },
  {
    title: "ocean eyes",
    artist: "Billie Eilish",
    genre: "Intimate Pop Live",
    url: "https://open.spotify.com/track/7hDVYcQq6MxkdJGweuCtl9",
    search: "Billie Eilish ocean eyes",
    why: "Natural intimate live take",
  },
  {
    title: "Fast Car",
    artist: "Tracy Chapman",
    genre: "Folk / Human phrasing",
    url: "https://open.spotify.com/track/2M9ro2krNb7nr7HSprkEgo",
    search: "Tracy Chapman Fast Car",
    why: "Plain human timing, phrasing and breath - useful as a real reference",
  },
  {
    title: "Cranes in the Sky",
    artist: "Solange",
    genre: "Soul / Art Pop",
    url: "https://open.spotify.com/track/48EjSdYh8wz2gBxxqzrsLe",
    search: "Solange Cranes in the Sky",
    why: "Minimal, polished and human - a good edge case",
  },
];

export const SPOTIFY_AI_SUGGESTIONS = [
  {
    title: "On the Edge - Ai-Generated Rock Music by Aiva",
    artist: "Aiva, Brad Frey",
    genre: "AI-generated rock",
    url: "https://open.spotify.com/track/6Q0qzRjwHohgkYGI3q1bf8",
    search: "Aiva On the Edge Ai-Generated Rock Music",
    why: "Explicit AI-composed rock reference",
  },
  {
    title: "One More (feat.suno.ai)",
    artist: "Nekonoma",
    genre: "Suno / Pop",
    url: "https://open.spotify.com/track/7FPMLivewo1uKihuYMfC7S",
    search: "Nekonoma One More feat.suno.ai",
    why: "Suno-labeled track already on Spotify",
  },
  {
    title: "THIS SONG IS AI GENERATED",
    artist: "googifloop",
    genre: "AI-labeled pop",
    url: "https://open.spotify.com/track/6TyHjo4ZSErLqSiXZdt8j7",
    search: "googifloop THIS SONG IS AI GENERATED",
    why: "On-the-nose AI bait, useful for chaos rounds",
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

function normalizeRandom(random: number) {
  if (!Number.isFinite(random)) return Math.random();
  return Math.max(0, Math.min(0.999999, random));
}

function pickFromCandidates(candidates: CatalogTrack[], random: number): CatalogTrack {
  const index = Math.min(
    candidates.length - 1,
    Math.floor(normalizeRandom(random) * candidates.length),
  );
  return candidates[index]!;
}

export function pickBalancedTrackFromPool(
  pool: CatalogTrack[],
  usedTrackIds: string[],
  random = Math.random(),
): CatalogTrack {
  if (pool.length === 0) return TRACK_CATALOG[0]!;

  const available = pool.filter((track) => !usedTrackIds.includes(track.id));
  const candidates = available.length > 0 ? available : pool;
  const usedFromPool = pool.filter((track) => usedTrackIds.includes(track.id));
  const usedAi = usedFromPool.filter((track) => track.isAi).length;
  const usedReal = usedFromPool.length - usedAi;
  const freshAi = candidates.filter((track) => track.isAi);
  const freshReal = candidates.filter((track) => !track.isAi);

  let targetIsAi: boolean;
  if (usedAi < usedReal && freshAi.length > 0) {
    targetIsAi = true;
  } else if (usedReal < usedAi && freshReal.length > 0) {
    targetIsAi = false;
  } else {
    targetIsAi = normalizeRandom(random) >= 0.5;
  }

  const preferred = targetIsAi ? freshAi : freshReal;
  const fallback = targetIsAi ? freshReal : freshAi;
  return pickFromCandidates(
    preferred.length > 0 ? preferred : fallback.length > 0 ? fallback : candidates,
    random,
  );
}

export function pickCatalogTrack(usedTrackIds: string[], random = Math.random()): CatalogTrack {
  return pickBalancedTrackFromPool(TRACK_CATALOG, usedTrackIds, random);
}

export function getAllRealTracks(): CatalogTrack[] {
  return TRACK_CATALOG.filter((t) => !t.isAi);
}

export function getAllAiTracks(): CatalogTrack[] {
  return TRACK_CATALOG.filter((t) => t.isAi);
}
