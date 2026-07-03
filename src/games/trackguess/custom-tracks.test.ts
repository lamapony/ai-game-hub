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
      url: "https://example.com/anthem.mp3",
      sourceUrl: "https://open.spotify.com/track/abc",
    };

    saveCustomRealTracks([track]);

    expect(loadCustomRealTracks()).toEqual([track]);
    localStorage.setItem(CUSTOM_REAL_TRACKS_KEY, "{broken");
    expect(loadCustomRealTracks()).toEqual([]);
    expect(localStorage.getItem(CUSTOM_REAL_TRACKS_KEY)).toBeNull();
  });

  test("marks Spotify source links without treating them as audio URLs", () => {
    expect(isSpotifyUrl("https://open.spotify.com/track/abc")).toBe(true);
    expect(isSpotifyUrl("spotify:track:abc")).toBe(true);
    expect(isSpotifyUrl("https://example.com/track.mp3")).toBe(false);

    const catalogTrack = customTrackToCatalogTrack({
      id: "custom-real-1",
      title: "Guestlist Anthem",
      artist: "Actual Human",
      genre: "Pop",
      url: "https://example.com/anthem.mp3",
      sourceUrl: "https://open.spotify.com/track/abc",
    });

    expect(catalogTrack.isAi).toBe(false);
    expect(catalogTrack.sourceLabel).toBe("Spotify");
  });
});
