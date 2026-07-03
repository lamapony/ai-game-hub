import { useEffect, useRef, useState } from "react";
import { updateRoomState } from "@/lib/room";
import { teamColorClasses, formatClock } from "@/lib/team-style";
import {
  TRACK_GUESS_GUESS_MS,
  TRACK_GUESS_LISTEN_MS,
  TRACK_GUESS_REVEAL_MS,
} from "@/lib/host-controls";
import type { RoomState, TrackGuessState } from "@/lib/types";
import { pickTrackFromPool, TRACK_CATALOG, SPOTIFY_REAL_SUGGESTIONS, type CatalogTrack } from "./catalog";
import {
  customTrackToCatalogTrack,
  isSpotifyUrl,
  loadCustomRealTracks,
  makeCustomTrackId,
  saveCustomRealTracks,
  type CustomRealTrack,
} from "./custom-tracks";
import { scoreTrackGuessRound } from "./scoring";

function speak(text: string) {
  const a = new Audio(`/api/speak?text=${encodeURIComponent(text)}`);
  a.play().catch(() => {});
}

export function TrackGuessHost({ roomId, state }: { roomId: string; state: RoomState }) {
  const tg = state.trackguess!;
  const [now, setNow] = useState(Date.now());
  const [customTracks, setCustomTracks] = useState<CustomRealTrack[]>(() => loadCustomRealTracks());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const introSpokenRef = useRef(false);
  const scoredRoundRef = useRef<string | null>(null);
  const advancedRoundRef = useRef<string | null>(null);
  const customTrackPool = customTracks.map(customTrackToCatalogTrack);
  const trackPool = [...TRACK_CATALOG, ...customTrackPool];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!state.paused) return;
    audioRef.current?.pause();
  }, [state.paused]);

  const update = (patch: Partial<TrackGuessState>) =>
    updateRoomState(roomId, { ...state, trackguess: { ...tg, ...patch } });

  function saveTracks(next: CustomRealTrack[]) {
    setCustomTracks(next);
    saveCustomRealTracks(next);
  }

  function roundTrackPatch(track: CatalogTrack, nowMs: number): Partial<TrackGuessState> {
    return {
      phase: "listening",
      trackId: track.id,
      trackTitle: track.title,
      trackArtist: track.artist,
      trackGenre: track.genre,
      trackUrl: track.url,
      trackSourceLabel: track.sourceLabel,
      trackSourceUrl: track.sourceUrl,
      trackArtworkUrl: track.artworkUrl,
      usedTrackIds: [...tg.usedTrackIds, track.id],
      guesses: {},
      isAi: track.isAi,
      listeningEndsAt: nowMs + TRACK_GUESS_LISTEN_MS,
      guessEndsAt: undefined,
      revealEndsAt: undefined,
    };
  }

  function pickHostTrack() {
    const freshCustomTracks = customTrackPool.filter(
      (track) => !tg.usedTrackIds.includes(track.id),
    );
    return freshCustomTracks.length > 0
      ? pickTrackFromPool(freshCustomTracks, tg.usedTrackIds)
      : pickTrackFromPool(trackPool, tg.usedTrackIds);
  }

  function startRound(nowMs = Date.now()) {
    const track = pickHostTrack();
    void update(roundTrackPatch(track, nowMs));
  }

  // Briefing intro
  useEffect(() => {
    if (state.paused) return;
    if (tg.phase !== "briefing") return;
    if (introSpokenRef.current) return;
    introSpokenRef.current = true;
    speak(
      `Real or AI. ${tg.totalRounds} tracks. Listen carefully and guess whether it's a live recording or AI-generated.`,
    );
  }, [state.paused, tg.phase, tg.totalRounds]);

  // Play audio during listening
  useEffect(() => {
    if (state.paused || tg.phase !== "listening" || !tg.trackUrl) return;
    const audio = new Audio(tg.trackUrl);
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [state.paused, tg.phase, tg.trackUrl, tg.roundNumber]);

  // listening → guessing
  useEffect(() => {
    if (state.paused) return;
    if (tg.phase !== "listening") return;
    if (!tg.listeningEndsAt || now < tg.listeningEndsAt) return;
    audioRef.current?.pause();
    void update({
      phase: "guessing",
      guessEndsAt: Date.now() + TRACK_GUESS_GUESS_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, tg.phase, tg.listeningEndsAt, now]);

  // guessing → reveal
  useEffect(() => {
    if (state.paused) return;
    if (tg.phase !== "guessing") return;
    if (!tg.guessEndsAt || now < tg.guessEndsAt) return;
    const key = `${tg.roundId}:${tg.roundNumber}:${tg.trackId}`;
    if (scoredRoundRef.current === key) return;
    scoredRoundRef.current = key;

    const { teams, roundResult } = scoreTrackGuessRound(state, tg);
    if (!roundResult) return;

    const revealEndsAt = Date.now() + TRACK_GUESS_REVEAL_MS;
    speak(
      roundResult.isAi
        ? `That was an AI track: ${roundResult.title}.`
        : `That was a real track: ${roundResult.title}.`,
    );

    void updateRoomState(roomId, {
      ...state,
      teams,
      trackguess: {
        ...tg,
        phase: "reveal",
        isAi: roundResult.isAi,
        roundResults: [...(tg.roundResults ?? []), roundResult],
        revealEndsAt,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, tg.phase, tg.guessEndsAt, now]);

  // reveal → next round or results
  useEffect(() => {
    if (state.paused) return;
    if (tg.phase !== "reveal") return;
    if (!tg.revealEndsAt || now < tg.revealEndsAt) return;

    const advanceKey = `${tg.roundId}:advance:${tg.roundNumber}`;
    if (advancedRoundRef.current === advanceKey) return;
    advancedRoundRef.current = advanceKey;

    if (tg.roundNumber >= tg.totalRounds) {
      void update({ phase: "results" });
      return;
    }

    const track = pickHostTrack();
    void updateRoomState(roomId, {
      ...state,
      trackguess: {
        ...tg,
        roundNumber: tg.roundNumber + 1,
        ...roundTrackPatch(track, Date.now()),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.paused, tg.phase, tg.revealEndsAt, tg.roundNumber, now]);

  return (
    <div className="rounded-3xl border border-white/10 bg-card p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Real or AI?
          </div>
          <h2 className="font-display text-3xl mt-1">
            Round {Math.min(tg.roundNumber, tg.totalRounds)} / {tg.totalRounds}
          </h2>
        </div>
        <PhasePill phase={tg.phase} />
      </header>

      {tg.phase === "briefing" && (
        <Panel title="Getting ready">
          <p className="text-muted-foreground">
            First track coming up. Players listen on their phones and tap &quot;Real&quot; or
            &quot;AI&quot;.
          </p>
          <TrackVault
            tracks={customTracks}
            onSave={saveTracks}
            disabled={!!state.paused || tg.phase !== "briefing"}
          />
          <button
            type="button"
            onClick={() => startRound()}
            className="mt-4 rounded-2xl bg-[var(--color-park-bright)] px-5 py-3 text-sm font-medium text-[oklch(0.16_0.05_160)]"
          >
            Start first track
          </button>
        </Panel>
      )}

      {(tg.phase === "listening" || tg.phase === "guessing" || tg.phase === "reveal") && (
        <Panel title={tg.phase === "reveal" ? (tg.trackTitle ?? "Track") : "Mystery track"}>
          <div className="text-sm text-muted-foreground">{tg.trackGenre}</div>
          {tg.phase === "listening" && tg.listeningEndsAt && (
            <div className="mt-3 font-display text-4xl tabular-nums">
              {formatClock(Math.max(0, tg.listeningEndsAt - now))}
            </div>
          )}
          {tg.phase === "guessing" && tg.guessEndsAt && (
            <>
              <div className="mt-2 text-xs uppercase tracking-widest text-[var(--color-park-bright)]">
                Voting
              </div>
              <div className="font-display text-4xl tabular-nums">
                {formatClock(Math.max(0, tg.guessEndsAt - now))}
              </div>
              <GuessTally state={state} tg={tg} />
            </>
          )}
          {tg.phase === "reveal" && typeof tg.isAi === "boolean" && (
            <div
              className={`mt-4 rounded-2xl border p-4 ${tg.isAi ? "border-violet-400/40 bg-violet-500/10" : "border-[var(--color-park-bright)]/40 bg-[var(--color-park-bright)]/10"}`}
            >
              <div className="text-xs uppercase tracking-widest opacity-70">
                {tg.isAi ? "🤖 AI track" : "🎸 Real track"}
              </div>
              <div className="font-display text-2xl mt-1">{tg.trackTitle}</div>
              {tg.trackArtist && <div className="text-sm opacity-70">{tg.trackArtist}</div>}
              {tg.trackSourceUrl && (
                <a
                  href={tg.trackSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-[var(--color-park-bright)] hover:underline"
                >
                  {tg.trackSourceLabel ?? "Source"}
                </a>
              )}
              <RevealTally state={state} tg={tg} />
            </div>
          )}
          {tg.trackUrl && tg.phase === "listening" && (
            <audio src={tg.trackUrl} controls className="mt-4 w-full max-w-md" />
          )}
        </Panel>
      )}

      {tg.phase === "results" && (
        <Panel title="Results">
          <div className="space-y-2">
            {(tg.roundResults ?? []).map((r, i) => (
              <div
                key={`${r.trackId}-${i}`}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
              >
                <span>
                  {i + 1}. {r.title}
                  {r.artist ? <span className="opacity-60"> · {r.artist}</span> : null}{" "}
                  <span className="opacity-60">({r.isAi ? "AI" : "real"})</span>
                </span>
                <span className="opacity-70">{r.correctPlayerIds.length} guessed right</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-2">
            {[...state.teams]
              .sort((a, b) => b.score - a.score)
              .map((t) => {
                const c = teamColorClasses(t.color);
                return (
                  <div key={t.id} className={`rounded-2xl border px-3 py-2 ${c.chip}`}>
                    <div className="font-medium">{t.name}</div>
                    <div className="font-display text-2xl tabular-nums">{t.score}</div>
                  </div>
                );
              })}
          </div>
          <button
            type="button"
            onClick={() =>
              updateRoomState(roomId, {
                ...state,
                status: "lobby",
                currentGame: null,
                trackguess: undefined,
              })
            }
            className="mt-4 rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm"
          >
            ↺ Back to lobby
          </button>
        </Panel>
      )}
    </div>
  );
}

function PhasePill({ phase }: { phase: TrackGuessState["phase"] }) {
  const label = {
    briefing: "Start",
    listening: "Listening",
    guessing: "Voting",
    reveal: "Answer",
    results: "Results",
  }[phase];
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-widest">
      {label}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="font-display text-xl">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function TrackVault({
  tracks,
  onSave,
  disabled,
}: {
  tracks: CustomRealTrack[];
  onSave: (tracks: CustomRealTrack[]) => void;
  disabled?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("");
  const [url, setUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Quick Spotify suggestions (real tracks directly in the app)
  const quickSuggestions = SPOTIFY_REAL_SUGGESTIONS;

  function loadSuggestion(sug: { title: string; artist: string; genre: string; search: string; why: string }) {
    setTitle(sug.title);
    setArtist(sug.artist);
    setGenre(sug.genre);
    setSourceUrl(""); // Paste the Spotify link after selecting
    setError(null);
  }

  function addTrack() {
    const nextTitle = title.trim();
    const nextUrl = url.trim();
    if (!nextTitle || !nextUrl) {
      setError("Title and audio URL are required.");
      return;
    }
    if (isSpotifyUrl(nextUrl)) {
      setError("Use Spotify as the source link, not the audio URL.");
      return;
    }
    try {
      const parsed = new URL(nextUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      setError("Audio URL must be a valid http(s) link.");
      return;
    }

    const track: CustomRealTrack = {
      id: makeCustomTrackId(),
      title: nextTitle,
      artist: artist.trim() || "Unknown artist",
      genre: genre.trim() || "Real music",
      url: nextUrl,
      sourceUrl: sourceUrl.trim() || undefined,
    };
    onSave([...tracks, track]);
    setTitle("");
    setArtist("");
    setGenre("");
    setUrl("");
    setSourceUrl("");
    setError(null);
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Real track vault
          </div>
          <div className="text-sm text-muted-foreground">
            {tracks.length} custom {tracks.length === 1 ? "track" : "tracks"}
          </div>
        </div>
      </div>

      {/* Quick add Spotify tracks directly in the app */}
      {quickSuggestions.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Quick Spotify suggestions (real tracks)</div>
          <div className="flex flex-wrap gap-1.5">
            {quickSuggestions.map((sug, idx) => (
              <button
                key={idx}
                type="button"
                disabled={disabled}
                onClick={() => loadSuggestion(sug)}
                className="text-[10px] rounded-full border border-white/20 bg-white/5 px-2 py-0.5 hover:bg-white/10 disabled:opacity-40"
                title={sug.why}
              >
                {sug.artist} — {sug.title.split("(")[0].trim()}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Click to prefill → paste Spotify link in source + provide audio URL</div>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {track.title} <span className="opacity-60">· {track.artist}</span>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSave(tracks.filter((candidate) => candidate.id !== track.id))}
                className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-white disabled:opacity-40"
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          disabled={disabled}
          placeholder="Track title"
          className="rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm outline-none focus:border-[var(--color-park-bright)]/50"
        />
        <input
          value={artist}
          onChange={(event) => setArtist(event.target.value)}
          disabled={disabled}
          placeholder="Artist"
          className="rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm outline-none focus:border-[var(--color-park-bright)]/50"
        />
        <input
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
          disabled={disabled}
          placeholder="Genre"
          className="rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm outline-none focus:border-[var(--color-park-bright)]/50"
        />
        <input
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          disabled={disabled}
          placeholder="Spotify/source link"
          className="rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm outline-none focus:border-[var(--color-park-bright)]/50"
        />
        <input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
          disabled={disabled}
          placeholder="Direct audio URL"
          className="sm:col-span-2 rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm outline-none focus:border-[var(--color-park-bright)]/50"
        />
      </div>
      {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
      <button
        type="button"
        disabled={disabled}
        onClick={addTrack}
        className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium uppercase tracking-wide text-white hover:bg-white/15 disabled:opacity-40"
      >
        Add real track
      </button>
    </div>
  );
}

function GuessTally({ state, tg }: { state: RoomState; tg: TrackGuessState }) {
  const voted = Object.keys(tg.guesses ?? {}).length;
  return (
    <p className="text-sm text-muted-foreground mt-2">
      {voted} of {state.players.length} voted
    </p>
  );
}

function RevealTally({ state, tg }: { state: RoomState; tg: TrackGuessState }) {
  const last = tg.roundResults?.[tg.roundResults.length - 1];
  if (!last) return null;
  const names = last.correctPlayerIds
    .map((id) => state.players.find((p) => p.id === id)?.name)
    .filter(Boolean);
  return (
    <p className="text-sm mt-2 opacity-80">
      {names.length > 0 ? `Got it right: ${names.join(", ")}` : "Nobody guessed — it happens!"}
    </p>
  );
}
