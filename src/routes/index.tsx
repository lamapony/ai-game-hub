import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { eventProfile } from "@/lib/event-profile";
import { QuickStartBriefCard } from "@/components/quick-start-brief-card";
import { PARTY_STORY_SEED_MAX_LENGTH } from "@/lib/party-context";
import { createRoom, storedPlayerResumes } from "@/lib/room";
import { isValidRoomCode, normalizeRoomCodeInput } from "@/lib/room-code";
import { friendlyRoomCreationError } from "@/lib/room-entry-errors";
import {
  QUICK_START_DURATIONS,
  QUICK_START_MAX_PLAYERS,
  QUICK_START_MIN_PLAYERS,
  QUICK_START_PROFILES,
  QUICK_START_VENUES,
  type QuickStartDuration,
  type QuickStartVenue,
} from "@/lib/quick-start";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Game Hub · live party operating system" },
      {
        name: "description",
        content: eventProfile.seo.description,
      },
      { property: "og:title", content: "AI Game Hub" },
      {
        property: "og:description",
        content: eventProfile.seo.ogDescription,
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [hostName, setHostName] = useState(eventProfile.defaultHostName);
  const [venue, setVenue] = useState<QuickStartVenue>("park");
  const [duration, setDuration] = useState<QuickStartDuration>(180);
  const [expectedPlayers, setExpectedPlayers] = useState(12);
  const [storySeed, setStorySeed] = useState("");
  const [resume, setResume] = useState<ReturnType<typeof storedPlayerResumes>[number] | null>(null);

  useEffect(() => {
    setResume(storedPlayerResumes(1)[0] ?? null);
  }, []);

  async function onCreate() {
    setCreateError(null);
    setCreating(true);
    try {
      const { code } = await createRoom(hostName, {
        venue,
        targetDurationMinutes: duration,
        expectedPlayers,
        storySeed,
      });
      navigate({ to: "/host/$code", params: { code } });
    } catch (e) {
      setCreateError(friendlyRoomCreationError(e));
      setCreating(false);
    }
  }

  function onJoin() {
    const code = normalizeRoomCodeInput(joinCode);
    if (!isValidRoomCode(code)) {
      setJoinError("Enter all 4 characters. Codes never use I, O, 0 or 1.");
      return;
    }
    setJoinError(null);
    navigate({ to: "/play/$code", params: { code } });
  }

  const joinCodeReady = isValidRoomCode(joinCode);

  return (
    <main id="top" className="agh-landing">
      <header className="agh-masthead">
        <a className="agh-brand" href="#top" aria-label="AI Game Hub home">
          <span className="agh-brand-name">AI GAME HUB</span>
          <span className="agh-brand-role">
            LIVE PARTY
            <br />
            OPERATING SYSTEM
          </span>
        </a>
        <nav aria-label="Choose how to enter" className="agh-entry-nav">
          <a data-testid="landing-host-entry" href="#quick-start">
            Host a party
          </a>
          <a data-testid="landing-guest-entry" href="#join-room">
            Join with code
          </a>
        </nav>
      </header>

      <section className="agh-hero" aria-labelledby="landing-title">
        <div className="agh-hero-title-block">
          <h1 id="landing-title" className="agh-display agh-hero-title">
            THE NIGHT
            <br />
            HAS A PLOT.
          </h1>
          <p className="agh-hero-venue-line">PARK / BAR / HOME / FESTIVAL</p>
        </div>
        <div className="agh-hero-copy">
          <p>
            Pick the world. AI turns the people, objects and accidents already there into one
            connected 2–4 hour story.
          </p>
          <dl className="agh-hero-facts">
            <div>
              <dt>People</dt>
              <dd>8–30</dd>
            </div>
            <div>
              <dt>Setup</dt>
              <dd>2 min</dd>
            </div>
            <div>
              <dt>Developer</dt>
              <dd>Not needed</dd>
            </div>
          </dl>
        </div>
        <a className="agh-primary-link" href="#quick-start">
          Build the night <span aria-hidden="true">↗</span>
        </a>
        <div className="agh-story-track" aria-label="How the party story moves">
          <span>Notice something</span>
          <span aria-hidden="true">/</span>
          <span>Hide something</span>
          <span aria-hidden="true">/</span>
          <span>Carry it across the night</span>
          <span aria-hidden="true">/</span>
          <span>Reveal everything</span>
        </div>
      </section>

      {resume && (
        <section className="agh-resume" aria-label="Resume active room">
          <div>
            <span>Still playing</span>
            <strong>
              {resume.name} · room {resume.code}
            </strong>
          </div>
          <p>Reopen the same player identity without joining again.</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/play/$code", params: { code: resume.code } })}
          >
            Resume <span aria-hidden="true">↗</span>
          </button>
        </section>
      )}

      <section id="quick-start" className="agh-setup" aria-labelledby="quick-start-title">
        <header className="agh-setup-heading">
          <h2 id="quick-start-title" className="agh-display">
            BUILD THE NIGHT.
          </h2>
          <p>
            Choose the physical world first. The system writes games from what people can touch,
            hear and accidentally reveal.
          </p>
        </header>

        <fieldset className="agh-venue-fieldset">
          <legend>01 / Where is the party?</legend>
          <div className="agh-venue-options">
            {QUICK_START_VENUES.map((id, index) => {
              const profile = QUICK_START_PROFILES[id];
              return (
                <button
                  key={id}
                  data-testid={`quick-start-venue-${id}`}
                  data-venue={id}
                  type="button"
                  aria-pressed={venue === id}
                  onClick={() => setVenue(id)}
                  className={venue === id ? "is-selected" : undefined}
                >
                  <span className="agh-venue-number">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{profile.title}</strong>
                  <span>{profile.promise}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="agh-setup-controls">
          <fieldset className="agh-duration-fieldset">
            <legend>02 / How long?</legend>
            <div>
              {QUICK_START_DURATIONS.map((minutes) => (
                <button
                  key={minutes}
                  data-testid={`quick-start-duration-${minutes}`}
                  type="button"
                  aria-pressed={duration === minutes}
                  onClick={() => setDuration(minutes)}
                  className={duration === minutes ? "is-selected" : undefined}
                >
                  <strong>{minutes / 60}</strong>
                  <span>hours</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="agh-text-control">
            <span>03 / Host name</span>
            <input
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
              maxLength={40}
            />
          </label>

          <label className="agh-crowd-control">
            <span>
              <b>04 / Expected crowd</b>
              <strong>{expectedPlayers}</strong>
            </span>
            <input
              data-testid="quick-start-expected-players"
              type="range"
              min={QUICK_START_MIN_PLAYERS}
              max={QUICK_START_MAX_PLAYERS}
              value={expectedPlayers}
              onChange={(event) => setExpectedPlayers(Number(event.target.value))}
            />
            <small>
              <span>{QUICK_START_MIN_PLAYERS}</span>
              <span>{QUICK_START_MAX_PLAYERS}</span>
            </small>
          </label>
        </div>

        <label className="agh-story-control">
          <span>
            <b>05 / What makes tonight specific?</b>
            <small>
              {storySeed.length}/{PARTY_STORY_SEED_MAX_LENGTH}
            </small>
          </span>
          <input
            data-testid="quick-start-story-seed"
            value={storySeed}
            onChange={(event) => setStorySeed(event.target.value)}
            maxLength={PARTY_STORY_SEED_MAX_LENGTH}
            placeholder="Mira's birthday · the missing tongs · very competitive friends"
          />
          <small>
            Public to the room and used as AI flavor. Add one occasion, object or running joke:
            never a secret or sensitive note.
          </small>
        </label>

        <QuickStartBriefCard
          context="landing"
          input={{ venue, targetDurationMinutes: duration, expectedPlayers, storySeed }}
        />

        <div className="agh-create-row">
          <div>
            <span>Ready to assemble</span>
            <strong>{QUICK_START_PROFILES[venue].title}</strong>
            <small>
              {duration / 60} hours · {expectedPlayers} people · {QUICK_START_PROFILES[venue].stage}
            </small>
          </div>
          <button
            data-testid="quick-start-create"
            onClick={onCreate}
            disabled={creating || !hostName.trim()}
          >
            {creating ? "Assembling route…" : "Create live route"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        {createError && (
          <p className="agh-form-error" role="alert">
            {createError}
          </p>
        )}
      </section>

      <section id="join-room" className="agh-join" aria-labelledby="join-room-title">
        <div className="agh-join-copy">
          <h2 id="join-room-title" className="agh-display">
            JOIN THE ROOM.
          </h2>
          <p>Four characters from the host screen. No download, account or app.</p>
        </div>
        <form
          className="agh-join-form"
          onSubmit={(event) => {
            event.preventDefault();
            onJoin();
          }}
        >
          <input
            data-testid="landing-room-code"
            aria-label="Room code"
            aria-describedby="landing-room-code-help"
            aria-invalid={joinCode.length > 0 && !joinCodeReady}
            value={joinCode}
            onChange={(event) => {
              setJoinCode(normalizeRoomCodeInput(event.target.value));
              setJoinError(null);
            }}
            placeholder="ABCD"
            inputMode="text"
            enterKeyHint="go"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button data-testid="landing-room-code-submit" type="submit" disabled={!joinCodeReady}>
            Enter <span aria-hidden="true">↗</span>
          </button>
          <p id="landing-room-code-help" data-testid="landing-room-code-help">
            {joinCodeReady
              ? "Code ready. Press Enter or your keyboard's Go key."
              : "Codes skip I, O, 0 and 1."}
          </p>
          {joinError && <p className="agh-join-error">{joinError}</p>}
        </form>
      </section>

      <footer className="agh-footer">
        <strong>AI GAME HUB</strong>
        <span>People become the cast. The venue becomes the evidence.</span>
      </footer>
    </main>
  );
}
