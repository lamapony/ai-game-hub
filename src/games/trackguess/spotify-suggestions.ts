/**
 * Ready Spotify recommendations for TrackGuess
 * These are "уже готовые залитые" tracks.
 *
 * Use for:
 * - Adding as Custom Real Tracks (via TrackVault in game)
 * - Inspiration for AI prompts
 * - sourceUrl for labeling
 *
 * NOTE: For playback you need direct audio URL.
 * Spotify links are only for source metadata.
 */

export type SpotifySuggestion = {
  title: string;
  artist: string;
  genre: string;
  spotifySearch: string; // Copy this into Spotify search
  spotifyUrlExample?: string; // Example full link (find the real one)
  vibe: string; // Why it fits the game
  difficulty: "easy" | "medium" | "hard";
  isAiLike?: boolean; // Sounds somewhat AI / hyper-produced
};

export const SPOTIFY_SUGGESTIONS: SpotifySuggestion[] = [
  // === COOL REAL PERFORMANCES (impressive executions) ===
  {
    title: "Take Me To Church (Tiny Desk)",
    artist: "Hozier",
    genre: "Soul / Live",
    spotifySearch: "Hozier Tiny Desk",
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
    title: "[Search Suno AI]",
    artist: "Various creators",
    genre: "AI / Soul / Bar",
    spotifySearch: "Suno AI soul",
    vibe: "Many creators upload realistic Suno generations. Pick ones with good vocals.",
    difficulty: "medium",
  },
  {
    title: "[Search Udio AI]",
    artist: "Various",
    genre: "AI / Acoustic",
    spotifySearch: "Udio AI",
    vibe: "Look for realistic acoustic or bar-style AI tracks.",
    difficulty: "medium",
  },
  {
    title: "AI generated bar music",
    artist: "Various small artists",
    genre: "AI / Chill",
    spotifySearch: "AI generated music bar",
    vibe: "Search for AI tracks that sound like real bar performances.",
    difficulty: "medium",
  },
];

// Helper to turn suggestion into something close to CustomRealTrack format
export function suggestionToCustomTrack(suggestion: SpotifySuggestion) {
  return {
    id: `spotify-${suggestion.title.toLowerCase().replace(/\s+/g, "-")}`,
    title: suggestion.title,
    artist: suggestion.artist,
    genre: suggestion.genre,
    url: "", // User must provide direct audio
    sourceUrl: "", // Paste real Spotify link here
  };
}
