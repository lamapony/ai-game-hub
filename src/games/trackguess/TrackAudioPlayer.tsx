import { useEffect, useRef, useState } from "react";
import { isSpotifyUrl, spotifyEmbedUrl, spotifyTrackUrl } from "./spotify";

type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

export function TrackAudioPlayer({
  src,
  sourceUrl,
  audience = "host",
  disabled,
  className,
}: {
  src: string;
  sourceUrl?: string;
  audience?: "host" | "player";
  disabled?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [error, setError] = useState<string | null>(null);
  const spotifyUrl =
    (isSpotifyUrl(src) ? (spotifyTrackUrl(src) ?? src) : null) ??
    (sourceUrl && isSpotifyUrl(sourceUrl) ? (spotifyTrackUrl(sourceUrl) ?? sourceUrl) : null);
  const embedUrl = spotifyUrl ? spotifyEmbedUrl(spotifyUrl) : null;

  useEffect(() => {
    setPlayback("idle");
    setError(null);
  }, [src]);

  useEffect(() => {
    if (!disabled) return;
    audioRef.current?.pause();
  }, [disabled]);

  async function play() {
    const audio = audioRef.current;
    if (!audio || disabled) return;
    setError(null);
    setPlayback("loading");
    try {
      await audio.play();
      setPlayback("playing");
    } catch {
      setPlayback("idle");
      setError("Browser blocked playback. Tap the audio controls below.");
    }
  }

  if (spotifyUrl) {
    if (audience === "player") {
      return (
        <div
          className={`mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-muted-foreground ${className ?? ""}`}
        >
          Listen to the host audio.
        </div>
      );
    }

    return (
      <div className={`mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 ${className ?? ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noreferrer"
            aria-disabled={disabled}
            className={`rounded-full bg-[var(--color-park-bright)] px-4 py-2 text-sm font-medium text-[oklch(0.16_0.05_160)] ${disabled ? "pointer-events-none opacity-50" : ""}`}
          >
            Open Spotify
          </a>
          <span className="text-xs text-muted-foreground">Host-only playback</span>
        </div>
        {embedUrl && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">
              Spotify embed
            </summary>
            <iframe
              title="Spotify player"
              src={embedUrl}
              width="100%"
              height="152"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="mt-2 rounded-xl"
            />
          </details>
        )}
      </div>
    );
  }

  return (
    <div className={`mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void play()}
          disabled={disabled}
          className="rounded-full bg-[var(--color-park-bright)] px-4 py-2 text-sm font-medium text-[oklch(0.16_0.05_160)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {playback === "playing"
            ? "Playing"
            : playback === "loading"
              ? "Loading..."
              : "Play track"}
        </button>
        <span className="text-xs text-muted-foreground">
          {playback === "playing"
            ? "Audio is playing"
            : playback === "paused"
              ? "Paused"
              : playback === "error"
                ? "Audio failed"
                : "Tap once if autoplay is blocked"}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={src}
        controls
        preload="auto"
        className="mt-3 w-full"
        onPlay={() => setPlayback("playing")}
        onPause={() => setPlayback("paused")}
        onEnded={() => setPlayback("paused")}
        onCanPlay={() => {
          if (playback === "loading") setPlayback("idle");
        }}
        onError={() => {
          setPlayback("error");
          setError(
            "Audio file failed to load. Use Skip on the host and remove this track if it was custom.",
          );
        }}
      />
      {error && <p className="mt-2 text-xs text-red-200">{error}</p>}
    </div>
  );
}
