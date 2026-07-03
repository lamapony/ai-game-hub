import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRoom, useBroadcast, updateRoomState, getHostSecret, genId } from "@/lib/room";
import { supabase } from "@/integrations/supabase/client";
import { eventProfile } from "@/lib/event-profile";
import {
  launchChallengeState,
  launchPhotoHuntState,
  launchSoundscapeState,
  launchSpectrumCourtState,
  launchTrackGuessState,
  launchWhoAmongState,
} from "@/lib/game-state";
import { teamColorClasses } from "@/lib/team-style";
import {
  buildWinnerAnnouncement,
  canSkipCurrentPhase,
  computeTeamStandings,
  finishPartyState,
  forceBackToHubState,
  formatRussianPlace,
  formatRussianPoints,
  getWinningStandings,
  pauseRoomState,
  resetScoresState,
  resumePartyState,
  resumeRoomState,
  skipCurrentPhaseState,
} from "@/lib/host-controls";
import { speakerReadiness } from "@/lib/speaker-status";
import {
  addTeamToState,
  MAX_TEAMS,
  playersOnTeam,
  removeTeamFromState,
  renameTeamInState,
  suggestTeamName,
} from "@/lib/teams";
import type { GameId, RoomState } from "@/lib/types";
import { GameRulesDialogTrigger } from "@/components/game-rules-ui";
import { publicJoinUrl, publicSpeakerUrl } from "@/lib/public-site";

const SoundscapeHost = lazy(() =>
  import("@/games/soundscape/HostView").then((module) => ({
    default: module.SoundscapeHost,
  })),
);
const ChallengeHost = lazy(() =>
  import("@/games/challenge/HostView").then((module) => ({
    default: module.ChallengeHost,
  })),
);
const PhotoHuntHost = lazy(() =>
  import("@/games/phototunt/HostView").then((module) => ({
    default: module.PhotoHuntHost,
  })),
);
const TrackGuessHost = lazy(() =>
  import("@/games/trackguess/HostView").then((module) => ({
    default: module.TrackGuessHost,
  })),
);
const SpectrumCourtHost = lazy(() =>
  import("@/games/spectrumcourt/HostView").then((module) => ({
    default: module.SpectrumCourtHost,
  })),
);
const WhoAmongHost = lazy(() =>
  import("@/games/whoamong/HostView").then((module) => ({
    default: module.WhoAmongHost,
  })),
);

export const Route = createFileRoute("/host/$code")({
  component: HostPage,
});

function HostPage() {
  const { code } = Route.useParams();
  const { room, loading, error } = useRoom(code);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    setIsHost(!!getHostSecret(code));
  }, [code]);

  if (loading) return <Center>Loading room…</Center>;
  if (error || !room)
    return (
      <Center>
        Room not found.{" "}
        <Link to="/" className="underline ml-2">
          Home
        </Link>
      </Center>
    );
  if (!isHost)
    return (
      <Center>
        <div className="max-w-md text-center">
          <div className="text-white/70">You opened this room as a guest.</div>
          <p className="mt-2 text-sm text-white/50">
            If you are the host, open the link from the device that created the room.
          </p>
          <Link
            to="/play/$code"
            params={{ code }}
            className="inline-block mt-5 rounded-2xl bg-[var(--color-park-bright)] px-5 py-3 text-[oklch(0.18_0.05_160)] font-medium"
          >
            Join as player →
          </Link>
        </div>
      </Center>
    );

  return <HostInner roomId={room.id} code={room.code} state={room.state} />;
}

function HostInner({ roomId, code, state }: { roomId: string; code: string; state: RoomState }) {
  const { send } = useBroadcast(roomId);

  const totalPlayers = state.players.length;
  const joinUrl = publicJoinUrl(code);
  const speakerUrlFor = (slot: number) => publicSpeakerUrl(code, slot);

  function testSpeaker(slot: number) {
    if (slot === 1) {
      // host laptop = slot 1: play locally
      const a = new Audio(`/api/speak?text=${encodeURIComponent("Main speaker online.")}`);
      a.play().catch(() => {});
    } else {
      send({ type: "test-tone", slot });
    }
  }

  async function launchSoundscape() {
    await updateRoomState(roomId, launchSoundscapeState(state, genId("snd")));
  }

  async function launchChallenge() {
    const next = launchChallengeState(state, genId("ch"));
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  async function launchPhotoHunt() {
    const next = launchPhotoHuntState(state, genId("ph"));
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  async function launchTrackGuess() {
    const next = launchTrackGuessState(state, genId("tg"));
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  async function launchSpectrumCourt() {
    const next = launchSpectrumCourtState(state, genId("sc"));
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  async function launchWhoAmong() {
    const next = launchWhoAmongState(state, genId("wa"));
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  async function resetGame() {
    await updateRoomState(roomId, forceBackToHubState(state));
  }

  async function togglePause() {
    await updateRoomState(
      roomId,
      state.paused ? resumeRoomState(state, Date.now()) : pauseRoomState(state, Date.now()),
    );
  }

  async function skipPhase() {
    await updateRoomState(roomId, skipCurrentPhaseState(state, Date.now()));
  }

  async function restartCurrentGame() {
    if (state.currentGame === "soundscape") await launchSoundscape();
    if (state.currentGame === "challenge") await launchChallenge();
    if (state.currentGame === "phototunt") await launchPhotoHunt();
    if (state.currentGame === "trackguess") await launchTrackGuess();
    if (state.currentGame === "spectrumcourt") await launchSpectrumCourt();
    if (state.currentGame === "whoamong") await launchWhoAmong();
  }

  async function forceBackToHub() {
    await updateRoomState(roomId, forceBackToHubState(state));
  }

  async function finishParty() {
    await updateRoomState(roomId, finishPartyState(state));
  }

  async function resumeParty() {
    await updateRoomState(roomId, resumePartyState(state));
  }

  async function startNewParty() {
    await updateRoomState(roomId, resetScoresState(resumePartyState(state)));
  }

  async function resetScores() {
    if (!window.confirm("Reset all team scores? This cannot be undone.")) return;
    await updateRoomState(roomId, resetScoresState(state));
  }

  async function addTeam(name: string) {
    const next = addTeamToState(state, name, genId("team"));
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  async function renameTeam(teamId: string, name: string) {
    const next = renameTeamInState(state, teamId, name);
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  async function removeTeam(teamId: string) {
    const next = removeTeamFromState(state, teamId);
    if (!next) return;
    await updateRoomState(roomId, next);
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="park-gradient">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">Host</div>
            <h1 className="font-display text-2xl sm:text-3xl text-white">{eventProfile.title}</h1>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/70">Code</div>
            <div className="font-display text-3xl sm:text-5xl text-white tracking-[0.2em] tabular-num">
              {code}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <section>
          {state.currentGame && (
            <HostControlBar
              state={state}
              canSkip={canSkipCurrentPhase(state)}
              onTogglePause={togglePause}
              onSkip={skipPhase}
              onRestart={restartCurrentGame}
              onBackToHub={forceBackToHub}
            />
          )}

          {state.status === "finished" ? (
            <PartyFinale state={state} onResumeParty={resumeParty} onNewParty={startNewParty} />
          ) : state.currentGame ? (
            <Suspense fallback={<HostGameLoading />}>
              {state.currentGame === "soundscape" && state.soundscape ? (
                <SoundscapeHost roomId={roomId} code={code} state={state} />
              ) : state.currentGame === "challenge" && state.challenge ? (
                <ChallengeHost roomId={roomId} state={state} />
              ) : state.currentGame === "phototunt" && state.phototunt ? (
                <PhotoHuntHost roomId={roomId} state={state} />
              ) : state.currentGame === "trackguess" && state.trackguess ? (
                <TrackGuessHost roomId={roomId} state={state} />
              ) : state.currentGame === "spectrumcourt" && state.spectrumcourt ? (
                <SpectrumCourtHost roomId={roomId} state={state} />
              ) : state.currentGame === "whoamong" && state.whoamong ? (
                <WhoAmongHost roomId={roomId} state={state} />
              ) : (
                <HostGameLoading />
              )}
            </Suspense>
          ) : (
            <Lobby
              totalPlayers={totalPlayers}
              code={code}
              joinUrl={joinUrl}
              onLaunchSoundscape={launchSoundscape}
              onLaunchChallenge={launchChallenge}
              onLaunchPhotoHunt={launchPhotoHunt}
              onLaunchTrackGuess={launchTrackGuess}
              onLaunchSpectrumCourt={launchSpectrumCourt}
              onLaunchWhoAmong={launchWhoAmong}
              onFinishParty={finishParty}
              speakerUrlFor={speakerUrlFor}
              onTestSpeaker={testSpeaker}
              onAddTeam={addTeam}
              onRenameTeam={renameTeam}
              onRemoveTeam={removeTeam}
              state={state}
            />
          )}
        </section>

        <aside className="space-y-4">
          <Scoreboard state={state} onResetScores={resetScores} />
          <PlayersList state={state} />
          <button
            onClick={resetGame}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-2 text-xs text-white/60 hover:text-white"
          >
            ↺ Reset to lobby
          </button>
        </aside>
      </div>
    </main>
  );
}

function HostGameLoading() {
  return (
    <div className="rounded-3xl border border-white/10 bg-card p-8 text-center">
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Game</div>
      <div className="font-display mt-2 text-3xl">Preparing round screen…</div>
    </div>
  );
}

function formatRoundPhaseLabel(game: GameId | null | undefined, phase: string | null | undefined) {
  if (!game || !phase) return null;
  const labels: Partial<Record<GameId, Record<string, string>>> = {
    soundscape: {
      idle: "Paused",
      topics: "Theme",
      recording: "Recording",
      mixing: "Mix",
      playback: "Playback",
      voting: "Voting",
      results: "Results",
    },
    challenge: {
      briefing: "Briefing",
      recording: "Recording",
      judging: "Judging",
      results: "Verdict",
    },
    phototunt: {
      briefing: "Briefing",
      hunting: "Hunt",
      judging: "Judging",
      results: "Results",
    },
    trackguess: {
      briefing: "Start",
      listening: "Listening",
      guessing: "Voting",
      reveal: "Answer",
      results: "Results",
    },
    spectrumcourt: {
      briefing: "Start",
      clue: "Clue",
      guessing: "Guessing",
      appeal: "Appeal",
      reveal: "Reveal",
      results: "Results",
    },
    whoamong: {
      briefing: "Start",
      voting: "Voting",
      reveal: "Reveal",
      results: "Results",
    },
  };
  return labels[game]?.[phase] ?? phase;
}

function HostControlBar({
  state,
  canSkip,
  onTogglePause,
  onSkip,
  onRestart,
  onBackToHub,
}: {
  state: RoomState;
  canSkip: boolean;
  onTogglePause: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onBackToHub: () => void;
}) {
  const gameLabel = {
    soundscape: "Soundscape Battle",
    challenge: "Challenge",
    phototunt: "Photo Hunt",
    trackguess: "Real or AI?",
    spectrumcourt: "Spectrum Court",
    whoamong: "Who Among Us",
  }[state.currentGame ?? "soundscape"];
  const phase =
    state.currentGame === "soundscape"
      ? state.soundscape?.phase
      : state.currentGame === "challenge"
        ? state.challenge?.phase
        : state.currentGame === "phototunt"
          ? state.phototunt?.phase
          : state.currentGame === "trackguess"
            ? state.trackguess?.phase
            : state.currentGame === "spectrumcourt"
              ? state.spectrumcourt?.phase
              : state.currentGame === "whoamong"
                ? state.whoamong?.phase
                : null;
  const phaseLabel = formatRoundPhaseLabel(state.currentGame, phase);

  return (
    <div className="mb-4 rounded-3xl border border-white/10 bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Round controls
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-display text-xl">{gameLabel}</span>
            {phaseLabel && (
              <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                {phaseLabel}
              </span>
            )}
            {state.paused && (
              <span className="rounded-full bg-[var(--color-park-bright)]/20 px-2.5 py-1 text-xs text-[var(--color-park-bright)]">
                paused
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            onClick={onTogglePause}
            className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
          >
            {state.paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={onSkip}
            disabled={!canSkip}
            className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Skip phase
          </button>
          <button
            onClick={onRestart}
            className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
          >
            Restart
          </button>
          <button
            onClick={onBackToHub}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 hover:text-white"
          >
            To hub
          </button>
        </div>
      </div>
    </div>
  );
}

function speak(text: string) {
  const a = new Audio(`/api/speak?text=${encodeURIComponent(text)}`);
  a.play().catch(() => {});
}

function Lobby({
  totalPlayers,
  code,
  joinUrl,
  onLaunchSoundscape,
  onLaunchChallenge,
  onLaunchPhotoHunt,
  onLaunchTrackGuess,
  onLaunchSpectrumCourt,
  onLaunchWhoAmong,
  onFinishParty,
  speakerUrlFor,
  onTestSpeaker,
  onAddTeam,
  onRenameTeam,
  onRemoveTeam,
  state,
}: {
  totalPlayers: number;
  code: string;
  joinUrl: string;
  onLaunchSoundscape: () => void;
  onLaunchChallenge: () => void;
  onLaunchPhotoHunt: () => void;
  onLaunchTrackGuess: () => void;
  onLaunchSpectrumCourt: () => void;
  onLaunchWhoAmong: () => void;
  onFinishParty: () => void;
  speakerUrlFor: (n: number) => string;
  onTestSpeaker: (n: number) => void;
  onAddTeam: (name: string) => Promise<void>;
  onRenameTeam: (teamId: string, name: string) => Promise<void>;
  onRemoveTeam: (teamId: string) => Promise<void>;
  state: import("@/lib/types").RoomState;
}) {
  const [copied, setCopied] = useState(false);
  const [fullscreenQr, setFullscreenQr] = useState(false);

  const extrasConnected = [2, 3, 4, 5].filter(
    (s) => speakerReadiness(s, state.speakerSlots?.[s]).status === "ready",
  ).length;
  const hasPlayers = totalPlayers > 0;
  const canChallenge = totalPlayers >= 2;
  const canPhoto = totalPlayers >= 1;
  const canSoundscape = totalPlayers >= 1;
  const canTrackGuess = totalPlayers >= 1;
  const activeTeamCount = state.teams.filter((team) =>
    state.players.some((player) => player.teamId === team.id),
  ).length;
  const canSpectrumCourt = activeTeamCount >= 2;
  const canWhoAmong = totalPlayers >= 3;
  const hasScores = state.teams.some((team) => team.score > 0);

  function copyLink() {
    navigator.clipboard?.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (fullscreenQr) {
    return (
      <SetupFullscreen
        code={code}
        joinUrl={joinUrl}
        totalPlayers={totalPlayers}
        onClose={() => setFullscreenQr(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-card/40 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">{totalPlayers}</span>{" "}
          {totalPlayers === 1 ? "player" : "players"}
        </div>
        <button
          type="button"
          onClick={() => setFullscreenQr(true)}
          className="rounded-full bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] text-sm font-medium px-4 py-2"
        >
          Full-screen QR
        </button>
      </div>

      <TeamManager
        state={state}
        onAddTeam={onAddTeam}
        onRenameTeam={onRenameTeam}
        onRemoveTeam={onRemoveTeam}
      />

      <section className="rounded-3xl border bg-card border-border p-5">
        <header className="mb-3">
          <h3 className="font-display text-xl">Players</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Scan the QR to enter the lobby</p>
        </header>
        <div className="rounded-2xl bg-white p-4 text-center">
          <div className="inline-block rounded-xl bg-white p-2 ring-1 ring-black/10">
            <QRCodeSVG value={joinUrl} size={220} level="M" includeMargin={false} />
          </div>
          <div className="mt-2 font-display text-3xl tracking-[0.25em] tabular-nums text-black">
            {code}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 break-all">{joinUrl}</p>
          <div className="mt-3 flex gap-2 justify-center">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-full bg-black/5 text-black text-xs px-3 py-1.5"
            >
              {copied ? "✓ copied" : "Copy link"}
            </button>
          </div>
        </div>
      </section>

      <details className="rounded-3xl border bg-card border-border p-5 group">
        <summary className="cursor-pointer font-display text-xl list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span>Speakers</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground rounded-full bg-white/5 px-2 py-0.5">
            optional
          </span>
        </summary>
        <p className="text-xs text-muted-foreground mt-3">
          Only needed for Soundscape Battle. Use Bluetooth from the host phone or separate speaker
          phones.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onTestSpeaker(1)}
            className="rounded-full bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] text-sm font-medium px-4 py-2"
          >
            🔊 Test main speaker
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[2, 3, 4, 5].map((slot) => (
            <SpeakerQrCard
              key={slot}
              slot={slot}
              url={speakerUrlFor(slot)}
              state={state}
              onTest={() => onTestSpeaker(slot)}
            />
          ))}
        </div>
      </details>

      <div className={`rounded-3xl park-gradient p-6 text-white ${hasPlayers ? "" : "opacity-70"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/80">Start</div>
            <h3 className="font-display text-2xl mt-0.5">What are we playing first?</h3>
          </div>
          <button
            type="button"
            onClick={onFinishParty}
            disabled={!hasScores}
            className="rounded-2xl border border-white/25 bg-white/15 px-5 py-3 text-sm font-medium hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            🏆 Party finale
          </button>
        </div>

        {!hasPlayers && (
          <p className="mt-3 text-white/80 text-sm">Have at least one friend scan the QR first.</p>
        )}

        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <GameCard
            gameId="soundscape"
            emoji="🎚️"
            title="Soundscape Battle"
            time="~7 minutes"
            desc="Teams capture park sounds; AI builds a 60-second mix across the speakers."
            disabled={!canSoundscape}
            disabledHint={
              !canSoundscape
                ? "needs ≥ 1 player"
                : extrasConnected === 0
                  ? "works without extra speakers"
                  : undefined
            }
            onClick={onLaunchSoundscape}
          />
          <GameCard
            gameId="challenge"
            emoji="🎬"
            title="Park Spirit Challenge"
            time="~3 minutes per round"
            desc="One player films while others act out a scene. AI scores it 1–10."
            disabled={!canChallenge}
            disabledHint={!canChallenge ? "needs ≥ 2 players" : undefined}
            onClick={onLaunchChallenge}
          />
          <GameCard
            gameId="phototunt"
            emoji="📸"
            title="Photo Hunt"
            time="~2 minutes per round"
            desc="AI gives an absurd prompt. Everyone gets 60 seconds for one shot."
            disabled={!canPhoto}
            disabledHint={!canPhoto ? "needs ≥ 1 player" : undefined}
            onClick={onLaunchPhotoHunt}
          />
          <GameCard
            gameId="trackguess"
            emoji="🎧"
            title="Real or AI?"
            time="~5 rounds"
            desc="Listen to a track and guess whether it is real or AI-generated."
            disabled={!canTrackGuess}
            disabledHint={!canTrackGuess ? "needs ≥ 1 player" : undefined}
            onClick={onLaunchTrackGuess}
          />
          <GameCard
            gameId="spectrumcourt"
            emoji="⚖️"
            title="Spectrum Court"
            time="~4 rounds"
            desc="One team gives a clue for a hidden point on a scale; others debate and place a marker."
            disabled={!canSpectrumCourt}
            disabledHint={!canSpectrumCourt ? "needs ≥ 2 active teams" : undefined}
            onClick={onLaunchSpectrumCourt}
          />
          <GameCard
            gameId="whoamong"
            emoji="🕵️"
            title="Who Among Us"
            time="~5 rounds"
            desc="A pointed question appears — secretly vote for the player who fits best."
            disabled={!canWhoAmong}
            disabledHint={!canWhoAmong ? "needs ≥ 3 players" : undefined}
            onClick={onLaunchWhoAmong}
          />
        </div>
      </div>
    </div>
  );
}

function SetupFullscreen({
  code,
  joinUrl,
  totalPlayers,
  onClose,
}: {
  code: string;
  joinUrl: string;
  totalPlayers: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 park-gradient overflow-auto">
      <div className="min-h-dvh px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
                {eventProfile.title}
              </div>
              <h2 className="font-display text-4xl sm:text-5xl text-white mt-1 tracking-[0.2em]">
                {code}
              </h2>
              <p className="text-sm text-white/70 mt-2">
                {totalPlayers} {totalPlayers === 1 ? "player" : "players"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 hover:bg-white/15 text-white text-sm px-4 py-2"
            >
              Close
            </button>
          </div>

          <div className="max-w-lg mx-auto">
            <section className="rounded-3xl bg-white p-6 sm:p-10 text-center">
              <div className="text-xs uppercase tracking-widest text-black/50 mb-3">Players</div>
              <QRCodeSVG value={joinUrl} size={320} level="M" includeMargin={false} />
              <div className="mt-4 font-display text-4xl tracking-[0.25em] tabular-nums text-black">
                {code}
              </div>
              <p className="mt-4 text-sm text-black/60 break-all">{joinUrl}</p>
              <p className="mt-2 text-sm text-black/60">
                Scan with the camera — name and team stay on the phone
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeakerQrCard({
  slot,
  url,
  state,
  onTest,
  compact,
}: {
  slot: number;
  url: string;
  state: import("@/lib/types").RoomState;
  onTest: () => void;
  compact?: boolean;
}) {
  const sp = state.speakerSlots?.[slot];
  const readiness = speakerReadiness(slot, sp);
  const ready = readiness.status === "ready";
  const readyClass =
    readiness.status === "ready"
      ? "bg-[var(--color-park-bright)]/20 text-[var(--color-park-bright)]"
      : readiness.status === "stale"
        ? "bg-amber-300/15 text-amber-100"
        : "bg-white/5 text-white/50";

  if (!url) return null;

  return (
    <div
      className={`rounded-2xl border p-3 text-center ${compact ? "bg-white/95 border-white/20" : "bg-background/40 border-border"}`}
    >
      <div
        className={`inline-block rounded-lg p-1.5 ${compact ? "bg-white" : "bg-white ring-1 ring-black/10"}`}
      >
        <QRCodeSVG value={url} size={compact ? 88 : 100} level="M" includeMargin={false} />
      </div>
      <div className={`mt-2 text-xs font-medium truncate ${compact ? "text-black" : ""}`}>
        {sp?.name ?? `Speaker ${slot}`}
      </div>
      <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${readyClass}`}>
          {readiness.label}
        </span>
        {ready && (
          <button
            type="button"
            onClick={onTest}
            className="text-[10px] rounded-full bg-white/10 hover:bg-white/20 px-2 py-0.5"
          >
            🔊 test
          </button>
        )}
      </div>
    </div>
  );
}

function TeamManager({
  state,
  onAddTeam,
  onRenameTeam,
  onRemoveTeam,
}: {
  state: RoomState;
  onAddTeam: (name: string) => Promise<void>;
  onRenameTeam: (teamId: string, name: string) => Promise<void>;
  onRemoveTeam: (teamId: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = state.teams.length < MAX_TEAMS;

  async function submitNewTeam(name: string) {
    if (!canAdd || busy) return;
    setBusy(true);
    try {
      await onAddTeam(name.trim() || suggestTeamName(state.teams));
      setNewName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-card border-border p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl">Teams</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Players choose a team on their phones — names update live
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {state.teams.length}/{MAX_TEAMS}
        </span>
      </header>

      <div className="space-y-2">
        {state.teams.map((t) => {
          const c = teamColorClasses(t.color);
          const members = playersOnTeam(state, t.id);
          const canRemove = state.teams.length > 1 && members.length === 0;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${c.chip}`}
            >
              <span className={`size-3 shrink-0 rounded-full ${c.bg}`} />
              <input
                key={`${t.id}:${t.name}`}
                defaultValue={t.name}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== t.name) void onRenameTeam(t.id, next);
                }}
                className="min-w-0 flex-1 bg-transparent font-medium outline-none"
              />
              <span className="hidden sm:inline text-[10px] uppercase tracking-wide opacity-70 shrink-0">
                {members.length === 0
                  ? "empty"
                  : `${members.length} ${members.length === 1 ? "player" : "players"}`}
              </span>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => void onRemoveTeam(t.id)}
                  className="shrink-0 rounded-full bg-black/10 hover:bg-black/20 size-7 text-sm"
                  aria-label={`Remove ${t.name}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canAdd ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitNewTeam(newName);
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={suggestTeamName(state.teams)}
            className="min-w-0 flex-1 rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-[var(--color-park-bright)]/50"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            + Add
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Maximum {MAX_TEAMS} teams.</p>
      )}

      {canAdd && (
        <div className="mt-3 flex flex-wrap gap-2">
          {["Foxes", "Hedgehogs", "Owls", "Wolves"].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={
                busy || state.teams.some((t) => t.name.toLowerCase() === preset.toLowerCase())
              }
              onClick={() => void submitNewTeam(preset)}
              className="rounded-full border border-border bg-background/40 px-3 py-1 text-xs hover:bg-background/70 disabled:opacity-40"
            >
              + {preset}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitNewTeam(suggestTeamName(state.teams))}
            className="rounded-full border border-border bg-background/40 px-3 py-1 text-xs hover:bg-background/70 disabled:opacity-50"
          >
            + Quick team
          </button>
        </div>
      )}
    </section>
  );
}

function GameCard({
  gameId,
  emoji,
  title,
  time,
  desc,
  disabled,
  disabledHint,
  onClick,
}: {
  gameId: GameId;
  emoji: string;
  title: string;
  time: string;
  desc: string;
  disabled?: boolean;
  disabledHint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/15 p-4 disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl">{emoji}</div>
        <div className="flex items-center gap-2 shrink-0">
          <GameRulesDialogTrigger gameId={gameId} />
          <div className="text-[10px] uppercase tracking-widest text-white/60">{time}</div>
        </div>
      </div>
      <div className="font-display text-xl mt-2">{title}</div>
      <p className="text-sm text-white/75 mt-1">{desc}</p>
      {disabled && disabledHint && <div className="mt-2 text-xs text-white/55">{disabledHint}</div>}
    </button>
  );
}

function Scoreboard({
  state,
  onResetScores,
}: {
  state: import("@/lib/types").RoomState;
  onResetScores: () => void;
}) {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  const hasScores = state.teams.some((team) => team.score > 0);
  return (
    <div className="rounded-3xl bg-card p-4 border">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Score</div>
        {hasScores && (
          <button
            type="button"
            onClick={onResetScores}
            className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Reset score
          </button>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map((t) => {
          const c = teamColorClasses(t.color);
          const count = state.players.filter((p) => p.teamId === t.id).length;
          return (
            <div
              key={t.id}
              className={`flex items-center justify-between rounded-2xl px-3 py-2 border ${c.chip}`}
            >
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] uppercase tracking-wide opacity-70">
                  {count} {count === 1 ? "player" : "players"}
                </div>
              </div>
              <div className="font-display text-2xl tabular-num">{t.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayersList({ state }: { state: import("@/lib/types").RoomState }) {
  return (
    <div className="rounded-3xl bg-card p-4 border">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Players ({state.players.length})
      </div>
      <div className="space-y-1 max-h-64 overflow-auto pr-1">
        {state.players.length === 0 && (
          <div className="text-xs text-muted-foreground">No one yet. Show the code to friends.</div>
        )}

        {state.players.map((p) => {
          const team = state.teams.find((t) => t.id === p.teamId);
          const c = team ? teamColorClasses(team.color) : null;
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className={`size-2 rounded-full ${c?.bg ?? "bg-white/30"}`} />
              <span>{p.name}</span>
              <span className="text-muted-foreground text-xs ml-auto">{team?.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PartyFinale({
  state,
  onResumeParty,
  onNewParty,
}: {
  state: RoomState;
  onResumeParty: () => void;
  onNewParty: () => void;
}) {
  const announcedRef = useRef(false);
  const standings = computeTeamStandings(state);
  const winners = getWinningStandings(standings);
  const podiumPlaces = [2, 1, 3] as const;

  useEffect(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    speak(buildWinnerAnnouncement(standings));
  }, [standings]);

  return (
    <div className="rounded-3xl border border-white/10 bg-card overflow-hidden">
      <div className="park-gradient px-6 py-10 text-center text-white">
        <div className="text-5xl">🎉</div>
        <div className="mt-3 text-xs uppercase tracking-[0.3em] text-white/70">Party finale</div>
        {winners.length === 1 ? (
          <>
            <h2 className="font-display text-4xl sm:text-5xl mt-3">Winners!</h2>
            <div
              className={`mt-4 inline-flex items-center gap-3 rounded-2xl border px-6 py-3 ${teamColorClasses(winners[0]!.team.color).chip}`}
            >
              <span
                className={`size-4 rounded-full ${teamColorClasses(winners[0]!.team.color).bg}`}
              />
              <span className="font-display text-3xl">{winners[0]!.team.name}</span>
              <span className="font-display text-2xl tabular-nums opacity-90">
                {winners[0]!.team.score}
              </span>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-4xl sm:text-5xl mt-3">Tie!</h2>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {winners.map((standing) => {
                const c = teamColorClasses(standing.team.color);
                return (
                  <div
                    key={standing.team.id}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 ${c.chip}`}
                  >
                    <span className={`size-3 rounded-full ${c.bg}`} />
                    <span className="font-display text-2xl">{standing.team.name}</span>
                    <span className="font-display text-xl tabular-nums">{standing.team.score}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="mt-4 text-sm text-white/75">
          {state.players.length} {state.players.length === 1 ? "player" : "players"} ·{" "}
          {formatRussianPoints(winners[0]?.team.score ?? 0)} for the leaders
        </p>
      </div>

      <div className="px-6 py-8">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground text-center mb-6">
          Podium
        </div>
        <div className="flex items-end justify-center gap-3 sm:gap-5 min-h-[12rem]">
          {podiumPlaces.map((place) => {
            const teams = standings.filter((standing) => standing.place === place);
            const height =
              place === 1 ? "h-36 sm:h-44" : place === 2 ? "h-28 sm:h-32" : "h-20 sm:h-24";
            const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
            return (
              <div key={place} className="flex-1 max-w-[10rem] flex flex-col items-center gap-2">
                {teams.length > 0 ? (
                  teams.map((standing) => {
                    const c = teamColorClasses(standing.team.color);
                    return (
                      <div key={standing.team.id} className="w-full text-center">
                        <div className="text-2xl">{medal}</div>
                        <div
                          className={`mt-1 rounded-xl border px-2 py-1 text-sm font-medium ${c.chip}`}
                        >
                          {standing.team.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {standing.team.score} · {standing.playerCount}{" "}
                          {standing.playerCount === 1
                            ? "player"
                            : standing.playerCount < 5
                              ? "players"
                              : "players"}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground">—</div>
                )}
                <div
                  className={`w-full rounded-t-2xl bg-gradient-to-t from-white/10 to-white/5 border border-white/10 ${height}`}
                />
                <div className="text-xs text-muted-foreground">{formatRussianPlace(place)}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Full standings
          </div>
          <div className="space-y-2">
            {standings.map((standing) => {
              const c = teamColorClasses(standing.team.color);
              const isWinner = winners.some((winner) => winner.team.id === standing.team.id);
              return (
                <div
                  key={standing.team.id}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 border ${c.chip} ${isWinner ? "ring-2 ring-[var(--color-park-bright)]/40" : ""}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-display text-xl tabular-nums opacity-70 w-8 shrink-0">
                      {standing.place}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{standing.team.name}</div>
                      <div className="text-[10px] uppercase tracking-wide opacity-70">
                        {standing.playerCount}{" "}
                        {standing.playerCount === 1
                          ? "player"
                          : standing.playerCount < 5
                            ? "players"
                            : "players"}
                      </div>
                    </div>
                  </div>
                  <div className="font-display text-2xl tabular-nums shrink-0">
                    {standing.team.score}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={onResumeParty}
            className="rounded-2xl bg-[var(--color-park-bright)] text-[oklch(0.16_0.05_160)] px-6 py-3 font-medium hover:opacity-90"
          >
            One more game
          </button>
          <button
            type="button"
            onClick={onNewParty}
            className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-white/80 hover:text-white hover:bg-white/10"
          >
            New party
          </button>
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center text-white/80 px-6 park-gradient">
      {children}
    </div>
  );
}

// reference to satisfy TS unused-import check (broadcast used inside HostView later)
void useBroadcast;
void supabase;
