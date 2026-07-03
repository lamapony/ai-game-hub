const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;

export function isSpotifyUrl(value: string) {
  const text = value.trim();
  if (text.startsWith("spotify:track:")) {
    return SPOTIFY_TRACK_ID.test(text.split(":")[2] ?? "");
  }

  try {
    const url = new URL(text);
    return (
      url.hostname === "open.spotify.com" ||
      url.hostname.endsWith(".spotify.com") ||
      url.hostname === "spotify.link"
    );
  } catch {
    return false;
  }
}

export function spotifyTrackId(value: string): string | null {
  const text = value.trim();
  if (text.startsWith("spotify:track:")) {
    const id = text.split(":")[2] ?? "";
    return SPOTIFY_TRACK_ID.test(id) ? id : null;
  }

  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const trackIndex = parts.indexOf("track");
    const id = trackIndex >= 0 ? parts[trackIndex + 1] : null;
    return id && SPOTIFY_TRACK_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function spotifyTrackUrl(value: string): string | null {
  const id = spotifyTrackId(value);
  return id ? `https://open.spotify.com/track/${id}` : null;
}

export function spotifyEmbedUrl(value: string): string | null {
  const id = spotifyTrackId(value);
  return id ? `https://open.spotify.com/embed/track/${id}?utm_source=generator` : null;
}
