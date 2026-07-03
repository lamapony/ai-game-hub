import { eventProfile } from "@/lib/event-profile";
import type { CatalogTrack } from "./catalog";

export type CustomRealTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  url: string;
  sourceUrl?: string;
  artworkUrl?: string;
};

export const CUSTOM_REAL_TRACKS_KEY = `${eventProfile.storagePrefix}:trackguess:custom-real-tracks`;

function cleanText(value: unknown, fallback = "", maxLength = 80) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : fallback;
}

function cleanUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function isSpotifyUrl(value: string) {
  if (value.startsWith("spotify:")) return true;
  try {
    const url = new URL(value);
    return url.hostname === "open.spotify.com" || url.hostname.endsWith(".spotify.com");
  } catch {
    return false;
  }
}

function sanitizeCustomTrack(value: unknown): CustomRealTrack | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = cleanText(raw.id, "", 64);
  const title = cleanText(raw.title);
  const artist = cleanText(raw.artist, "Unknown artist");
  const genre = cleanText(raw.genre, "Real music");
  const url = cleanUrl(raw.url);
  const sourceUrl = cleanUrl(raw.sourceUrl);
  const artworkUrl = cleanUrl(raw.artworkUrl);
  if (!id || !title || !url) return null;
  return {
    id,
    title,
    artist,
    genre,
    url,
    sourceUrl: sourceUrl || undefined,
    artworkUrl: artworkUrl || undefined,
  };
}

export function loadCustomRealTracks(): CustomRealTrack[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CUSTOM_REAL_TRACKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCustomTrack).filter((track): track is CustomRealTrack => !!track);
  } catch {
    localStorage.removeItem(CUSTOM_REAL_TRACKS_KEY);
    return [];
  }
}

export function saveCustomRealTracks(tracks: CustomRealTrack[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_REAL_TRACKS_KEY, JSON.stringify(tracks));
}

export function customTrackToCatalogTrack(track: CustomRealTrack): CatalogTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    genre: track.genre,
    url: track.url,
    isAi: false,
    sourceLabel: track.sourceUrl && isSpotifyUrl(track.sourceUrl) ? "Spotify" : "Custom",
    sourceUrl: track.sourceUrl,
    artworkUrl: track.artworkUrl,
  };
}

export function makeCustomTrackId() {
  return `custom-real-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
