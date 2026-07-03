/**
 * Ready Spotify recommendations for TrackGuess
 * These are "уже готовые залитые" tracks.
 *
 * Use for:
 * - Adding Spotify tracks via TrackVault in game
 * - Inspiration for AI prompts
 * - Building permanent catalog entries
 *
 * Spotify links are the primary playback source. The host cues Spotify and
 * starts the game timer; player phones keep metadata hidden until reveal.
 */

export type SpotifySuggestion = {
  title: string;
  artist: string;
  genre: string;
  spotifySearch: string; // Copy this into Spotify search
  spotifyUrlExample?: string; // Example full link (find the real one)
  vibe: string; // Why it fits the game
  difficulty: "easy" | "medium" | "hard";
  isAi?: boolean;
  isAiLike?: boolean; // Sounds somewhat AI / hyper-produced
};

export const SPOTIFY_SUGGESTIONS: SpotifySuggestion[] = [
  // === COOL REAL PERFORMANCES (impressive executions) ===
  {
    title: "Take Me To Church (Tiny Desk)",
    artist: "Hozier",
    genre: "Soul / Live",
    spotifySearch: "Hozier Tiny Desk",
    spotifyUrlExample: "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
    vibe: "Raw powerful live vocal, very human and emotional. Perfect 'Real' example.",
    difficulty: "medium",
  },
  {
    title: "Live performances (Tiny Desk)",
    artist: "Jacob Collier",
    genre: "Vocal / Jazz / Live",
    spotifySearch: "Jacob Collier Tiny Desk",
    vibe: "Insanely good vocal harmonies and live performance. Hard to fake.",
    difficulty: "hard",
  },
  {
    title: "Tiny Desk Concert",
    artist: "Billie Eilish",
    genre: "Pop / Live Intimate",
    spotifySearch: "Billie Eilish Tiny Desk",
    vibe: "Intimate, high-quality live take. Very natural breathing and emotion.",
    difficulty: "medium",
  },
  {
    title: "Live Acoustic Session",
    artist: "Various (search acoustic live)",
    genre: "Acoustic / Bar",
    spotifySearch: "acoustic live session bar",
    vibe: "Small venue / bar feeling performances. Great for grill-bar theme.",
    difficulty: "medium",
  },

  // === HYPER-REAL / AI-SOUNDING REAL TRACKS ===
  {
    title: "360",
    artist: "Charli XCX",
    genre: "Hyperpop",
    spotifySearch: "Charli XCX 360",
    spotifyUrlExample: "https://open.spotify.com/track/4w2GLmK2wnioVnb5CPQeex",
    vibe: "Extremely processed, digital, perfect. Feels almost AI-generated.",
    difficulty: "hard",
    isAiLike: true,
  },
  {
    title: "Von dutch",
    artist: "Charli XCX",
    genre: "Hyperpop / Digital",
    spotifySearch: "Charli XCX Von dutch",
    vibe: "Hyper-produced, uncanny clean vocals. Blurs real vs AI line.",
    difficulty: "hard",
    isAiLike: true,
  },
  {
    title: "Apple",
    artist: "Charli XCX",
    genre: "Hyperpop",
    spotifySearch: "Charli XCX Apple",
    vibe: "Very modern digital production. Good for 'is this AI?' confusion.",
    difficulty: "hard",
    isAiLike: true,
  },

  // === AI-GENERATED TRACKS ON SPOTIFY (search and pick) ===
  {
    title: "One More (feat.suno.ai)",
    artist: "Nekonoma",
    genre: "Suno / Pop",
    spotifySearch: "Nekonoma One More feat.suno.ai",
    spotifyUrlExample: "https://open.spotify.com/track/7FPMLivewo1uKihuYMfC7S",
    vibe: "Suno-labeled track already on Spotify.",
    difficulty: "medium",
    isAi: true,
  },
  {
    title: "On the Edge - Ai-Generated Rock Music by Aiva",
    artist: "Aiva, Brad Frey",
    genre: "AI-generated rock",
    spotifySearch: "Aiva On the Edge Ai-Generated Rock Music",
    spotifyUrlExample: "https://open.spotify.com/track/6Q0qzRjwHohgkYGI3q1bf8",
    vibe: "Explicit AI-composed rock reference.",
    difficulty: "medium",
    isAi: true,
  },
  {
    title: "THIS SONG IS AI GENERATED",
    artist: "googifloop",
    genre: "AI-labeled pop",
    spotifySearch: "googifloop THIS SONG IS AI GENERATED",
    spotifyUrlExample: "https://open.spotify.com/track/6TyHjo4ZSErLqSiXZdt8j7",
    vibe: "On-the-nose AI bait, useful for chaos rounds.",
    difficulty: "medium",
    isAi: true,
  },
];

// Helper to turn suggestion into something close to CustomRealTrack format
export function suggestionToCustomTrack(suggestion: SpotifySuggestion) {
  return {
    id: `spotify-${suggestion.title.toLowerCase().replace(/\s+/g, "-")}`,
    title: suggestion.title,
    artist: suggestion.artist,
    genre: suggestion.genre,
    url: suggestion.spotifyUrlExample ?? "",
    sourceUrl: suggestion.spotifyUrlExample ?? "",
    isAi: suggestion.isAi === true,
  };
}
