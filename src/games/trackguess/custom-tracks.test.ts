import { describe, expect, test } from "bun:test";
import {
  CUSTOM_REAL_TRACKS_KEY,
  customTrackToCatalogTrack,
  isSpotifyUrl,
  loadCustomRealTracks,
  saveCustomRealTracks,
  type CustomRealTrack,
} from "./custom-tracks";

function installMemoryStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
}

describe("track guess custom tracks", () => {
  test("persists valid custom real tracks and ignores broken storage", () => {
    installMemoryStorage();
    const track: CustomRealTrack = {
      id: "custom-real-1",
      title: "Guestlist Anthem",
      artist: "Actual Human",
      genre: "Pop",
      url: "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
      sourceUrl: "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
    };

    saveCustomRealTracks([track]);

    expect(loadCustomRealTracks()).toEqual([track]);
    localStorage.setItem(CUSTOM_REAL_TRACKS_KEY, "{broken");
    expect(loadCustomRealTracks()).toEqual([]);
    expect(localStorage.getItem(CUSTOM_REAL_TRACKS_KEY)).toBeNull();
  });

  test("marks Spotify links as playable Spotify sources", () => {
    expect(isSpotifyUrl("https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI")).toBe(true);
    expect(isSpotifyUrl("spotify:track:3dYD57lRAUcMHufyqn9GcI")).toBe(true);
    expect(isSpotifyUrl("https://example.com/track.mp3")).toBe(false);

    const catalogTrack = customTrackToCatalogTrack({
      id: "custom-real-1",
      title: "Guestlist Anthem",
      artist: "Actual Human",
      genre: "Pop",
      url: "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
    });

    expect(catalogTrack.isAi).toBe(false);
    expect(catalogTrack.sourceLabel).toBe("Spotify");
    expect(catalogTrack.sourceUrl).toBe("https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI");
  });

  test("preserves custom AI Spotify tracks", () => {
    installMemoryStorage();
    const track: CustomRealTrack = {
      id: "custom-ai-1",
      title: "Machine Confession",
      artist: "Actual Robot",
      genre: "AI pop",
      url: "spotify:track:3dYD57lRAUcMHufyqn9GcI",
      isAi: true,
    };

    saveCustomRealTracks([track]);

    expect(loadCustomRealTracks()).toEqual([track]);
    expect(customTrackToCatalogTrack(track).isAi).toBe(true);
  });
});
