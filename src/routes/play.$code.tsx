import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRoom, getOrCreatePlayer, readStoredPlayer } from "@/lib/room";
import { normalizePlayerName, playerNameValidationMessage } from "@/lib/player-name";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { postPlayerAction, type StoredPlayer } from "@/lib/player-action-client";
import {
  computeTeamStandings,
  formatRussianPlace,
  formatRussianPoints,
  getWinningStandings,
} from "@/lib/host-controls";
import { playersOnTeam } from "@/lib/teams";
import { GameRulesBrowser } from "@/components/game-rules-ui";
import { PlayerDevicePreflight } from "@/components/player-device-preflight";
import { PartyFinaleNarrative } from "@/components/party-finale-narrative";
import { TapeReel } from "@/components/tape-reel";
import { ActivePlayerGameView } from "@/games/player-view-registry";
import { GrillOracleLifecyclePlayer } from "@/games/grilloracle/LifecyclePlayer";
import { SmokeScreenBackgroundPlayer } from "@/games/smokescreen/BackgroundPlayer";
import { ContrabandBackgroundPlayer } from "@/games/contraband/BackgroundPlayer";
import { TongsOfTruthBackgroundPlayer } from "@/games/tongsoftruth/BackgroundPlayer";
import type { RoomConnectionStatus } from "@/lib/room";
import { isValidRoomCode, normalizeRoomCodeInput } from "@/lib/room-code";
import { guestRoomFailureKind, type GuestRoomFailureKind } from "@/lib/guest-room-recovery";
import { MAX_ROOM_PLAYERS, roomHasPlayerCapacity } from "@/lib/room-capacity";

export const Route = createFileRoute("/play/$code")({
  component: PlayPage,
});

function PlayPage() {
  const { code: routeCode } = Route.useParams();
  const code = normalizeRoomCodeInput(routeCode);
  const codeValid = isValidRoomCode(routeCode);
  const { room, loading, error, setRoom, connectionStatus, refreshRoom } = useRoom(
    codeValid ? code : undefined,
  );
  const [me, setMe] = useState<StoredPlayer | null>(null);

  useEffect(() => {
    setMe(null);
    if (typeof window === "undefined" || !codeValid) return;
    const stored = readStoredPlayer(code);
    if (stored) setMe(getOrCreatePlayer(code, stored.name, stored.teamId));
  }, [code, codeValid]);

  if (codeValid && loading)
    return (
      <PlayShell connectionStatus={connectionStatus}>
        <div className="agh-player-loading">
          <span>Room signal</span>
          <strong>Finding the party…</strong>
        </div>
      </PlayShell>
    );
  if (!room) {
    const failureKind = guestRoomFailureKind(routeCode, error);
    return (
      <PlayShell>
        <GuestRoomRecovery code={code} failureKind={failureKind} onRetry={refreshRoom} />
      </PlayShell>
    );
  }

  if (!me) {
    return (
      <JoinForm
        code={code}
        room={room}
        connectionStatus={connectionStatus}
        onJoined={(player, state) => {
          setRoom({ ...room, state });
          setMe(player);
        }}
      />
    );
  }

  return (
    <PlayerScreen
      code={code}
      room={room}
      me={me}
      connectionStatus={connectionStatus}
      onTeamChange={setMe}
      onRoomState={(state) => setRoom({ ...room, state })}
    />
  );
}

function GuestRoomRecovery({
  code,
  failureKind,
  onRetry,
}: {
  code: string;
  failureKind: GuestRoomFailureKind;
  onRetry: () => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const [draftCode, setDraftCode] = useState(code);
  const [retrying, setRetrying] = useState(false);
  const draftReady = isValidRoomCode(draftCode);

  useEffect(() => setDraftCode(code), [code]);

  const copy =
    failureKind === "invalid-code"
      ? {
          title: "Check the room code",
          body: "Use the 4 characters on the host screen. Codes skip I, O, 0 and 1.",
        }
      : failureKind === "not-found"
        ? {
            title: `Room ${code} is not live`,
            body: "Check the host screen, fix the code below, or ask the host to keep the room open.",
          }
        : {
            title: `Couldn’t check room ${code}`,
            body: "Your code may be fine. Check your signal and try again. You do not need to start over.",
          };

  async function submitRecovery() {
    const normalizedCode = normalizeRoomCodeInput(draftCode);
    if (!isValidRoomCode(normalizedCode) || retrying) return;
    if (normalizedCode !== code || failureKind === "invalid-code") {
      await navigate({ to: "/play/$code", params: { code: normalizedCode }, replace: true });
      return;
    }
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      // useRoom owns the user-facing failure state.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      data-testid="guest-room-recovery"
      data-failure-kind={failureKind}
      className="agh-player-recovery"
    >
      <div className="agh-player-room-mark">
        <span>Room signal</span>
        <strong>{code || "????"}</strong>
      </div>
      <div className="agh-player-recovery-copy">
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <form
        className="agh-player-recovery-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitRecovery();
        }}
      >
        <label htmlFor="guest-room-recovery-code">Enter the four characters</label>
        <input
          id="guest-room-recovery-code"
          data-testid="guest-room-recovery-code"
          aria-describedby="guest-room-recovery-help"
          aria-invalid={draftCode.length > 0 && !draftReady}
          value={draftCode}
          onChange={(event) => setDraftCode(normalizeRoomCodeInput(event.target.value))}
          placeholder="ABCD"
          inputMode="text"
          enterKeyHint="go"
          autoCapitalize="characters"
          autoFocus
          spellCheck={false}
        />
        <p id="guest-room-recovery-help" className={draftReady ? "is-ready" : ""}>
          {draftReady ? "Code ready." : "Codes skip I, O, 0 and 1."}
        </p>
        <button
          data-testid="guest-room-recovery-submit"
          type="submit"
          disabled={!draftReady || retrying}
        >
          <span>
            {retrying ? "Checking…" : draftCode === code ? "Check again" : `Try ${draftCode}`}
          </span>
          <b aria-hidden>↗</b>
        </button>
      </form>
      <Link to="/" className="agh-player-home-link">
        Back to AI Game Hub
      </Link>
    </div>
  );
}

function JoinForm({
  code,
  room,
  connectionStatus,
  onJoined,
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  connectionStatus: RoomConnectionStatus;
  onJoined: (player: StoredPlayer, state: import("@/lib/types").RoomState) => void;
}) {
  const state = room.state;
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function joinTeam(teamId: string) {
    if (submitting || !teamId) return;
    const validation = playerNameValidationMessage(name);
    if (validation) {
      setNameTouched(true);
      setJoinError(validation);
      return;
    }
    setJoiningTeamId(teamId);
    setSubmitting(true);
    setJoinError(null);
    const finalName = normalizePlayerName(name);
    const player = getOrCreatePlayer(code, finalName, teamId);
    try {
      const result = await postPlayerAction(room.id, {
        action: "join",
        playerId: player.id,
        name: player.name,
        teamId,
      });
      onJoined({ ...player, ...result.player, secret: player.secret }, result.state);
    } catch (e) {
      console.error(e);
      setJoinError(friendlyPlayerActionError(e, "join"));
    } finally {
      setSubmitting(false);
      setJoiningTeamId(null);
    }
  }

  const nameError = playerNameValidationMessage(name);
  const visibleNameError = nameTouched ? nameError : null;

  if (!roomHasPlayerCapacity(state.players.length)) {
    return (
      <PlayShell connectionStatus={connectionStatus}>
        <div
          data-testid="room-capacity-full"
          data-player-count={state.players.length}
          data-player-limit={MAX_ROOM_PLAYERS}
          className="agh-player-capacity"
        >
          <div className="agh-player-capacity-count">
            <strong>{state.players.length}</strong>
            <span>of {MAX_ROOM_PLAYERS} players</span>
          </div>
          <h1>Room is full.</h1>
          <p>
            Ask the host to remove a duplicate or inactive phone. This screen unlocks as soon as a
            place opens.
          </p>
          <Link to="/" className="agh-player-home-link">
            Back to AI Game Hub
          </Link>
        </div>
      </PlayShell>
    );
  }

  return (
    <PlayShell connectionStatus={connectionStatus}>
      <section className="agh-player-ticket">
        <div className="agh-player-ticket-code">
          <span>Room code</span>
          <strong>{code}</strong>
        </div>
        <header className="agh-player-ticket-intro">
          <h1>ENTER THE STORY.</h1>
          <p>Your name is how the room remembers what happens next.</p>
        </header>
        <div className="agh-player-name-field">
          <label htmlFor="player-name">What should your friends call you?</label>
          <input
            id="player-name"
            data-testid="player-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setJoinError(null);
            }}
            onBlur={() => setNameTouched(true)}
            placeholder="Your name"
            maxLength={32}
            autoComplete="name"
            required
            aria-invalid={!!visibleNameError}
          />
          <p className={joinError || visibleNameError ? "is-error" : ""}>
            {joinError ?? visibleNameError ?? "Required. Use the name your friends will recognize."}
          </p>
        </div>
        <div className="agh-player-team-choice">
          <div className="agh-player-team-heading">
            <strong>Choose your side.</strong>
            <span>One tap joins the room</span>
          </div>
          {state.teams.length === 0 ? (
            <p className="agh-player-team-empty">
              The host has not created teams yet. Ask them to add one.
            </p>
          ) : (
            <div className="agh-player-team-list">
              {state.teams.map((t, index) => {
                const members = playersOnTeam(state, t.id);
                const joining = joiningTeamId === t.id;
                return (
                  <button
                    key={t.id}
                    data-testid={`join-team-${t.id}`}
                    type="button"
                    onClick={() => void joinTeam(t.id)}
                    disabled={submitting}
                    className={joining ? "is-joining" : ""}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{t.name}</strong>
                      <small>
                        {members.length === 0
                          ? "Empty. Be first to join."
                          : `${members.length} on team · ${members.map((m) => m.name).join(", ")}`}
                      </small>
                    </div>
                    <b aria-hidden>{joining ? "…" : "↗"}</b>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </PlayShell>
  );
}

function PlayerScreen({
  code,
  room,
  me,
  connectionStatus,
  onTeamChange,
  onRoomState,
}: {
  code: string;
  room: { id: string; code: string; state: import("@/lib/types").RoomState };
  me: StoredPlayer;
  connectionStatus: RoomConnectionStatus;
  onTeamChange: (p: StoredPlayer) => void;
  onRoomState: (state: import("@/lib/types").RoomState) => void;
}) {
  const state = room.state;
  const team = state.teams.find((t) => t.id === me.teamId);
  const isWinner =
    state.status === "finished" &&
    getWinningStandings(computeTeamStandings(state)).some(
      (standing) => standing.team.id === me.teamId,
    );

  // ensure player exists in state list (handles room state lost after reset)
  useEffect(() => {
    const statePlayer = state.players.find((p) => p.id === me.id);
    if (statePlayer?.secretHash) return;
    postPlayerAction(room.id, {
      action: "ensure-player",
      playerId: me.id,
      name: me.name,
      teamId: me.teamId,
    })
      .then((result) => onRoomState(result.state))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, me.id]);

  return (
    <PlayShell
      celebratory={isWinner}
      connectionStatus={connectionStatus}
      playerId={me.id}
      teamId={me.teamId}
      gameId={state.currentGame}
      paused={Boolean(state.paused)}
    >
      <div className="agh-player-runtime">
        <section
          data-testid="player-session"
          data-player-id={me.id}
          data-team-id={me.teamId}
          data-game-id={state.currentGame ?? ""}
          data-paused={state.paused ? "true" : "false"}
          className="agh-player-session"
        >
          <div className="agh-player-session-meta">
            <span>Player ticket</span>
            <strong>{state.paused ? "Hold" : "Live"}</strong>
          </div>
          <div className="agh-player-session-identity">
            <div>
              <span>{team?.name ?? "Team"}</span>
              <strong>{me.name}</strong>
            </div>
            <div className="agh-player-session-room">
              <span>Room</span>
              <strong>{code}</strong>
            </div>
          </div>
          {state.currentGame && team && (
            <div className="agh-player-session-score">
              <span>Team score</span>
              <strong>{formatRussianPoints(team.score)}</strong>
            </div>
          )}
        </section>

        <div className="agh-player-live-stage">
          <Suspense fallback={<PlayerGameLoading />}>
            {state.status !== "finished" && state.smokescreen?.participantIds.includes(me.id) && (
              <SmokeScreenBackgroundPlayer roomId={room.id} state={state} me={me} />
            )}
            {state.status !== "finished" && state.contraband?.participantIds.includes(me.id) && (
              <ContrabandBackgroundPlayer roomId={room.id} state={state} me={me} />
            )}
            {state.status !== "finished" && state.tongsoftruth?.participantIds.includes(me.id) && (
              <TongsOfTruthBackgroundPlayer roomId={room.id} state={state} me={me} />
            )}
            {state.status === "finished" ? (
              <PlayerFinale state={state} me={me} />
            ) : state.paused ? (
              <PausedPanel />
            ) : (
              <ActivePlayerGameView
                roomId={room.id}
                state={state}
                me={me}
                fallback={
                  state.oracleMemory?.participantIds.includes(me.id) ? (
                    <GrillOracleLifecyclePlayer roomId={room.id} state={state} me={me} />
                  ) : (
                    <WaitingPanel
                      room={room}
                      me={me}
                      code={code}
                      onTeamChange={onTeamChange}
                      onRoomState={onRoomState}
                    />
                  )
                }
              />
            )}
          </Suspense>
        </div>
      </div>
    </PlayShell>
  );
}

function PlayerGameLoading() {
  return (
    <div className="agh-player-state-panel">
      <span>Next cue</span>
      <strong>Preparing round…</strong>
      <p>The screen will appear in a few seconds.</p>
    </div>
  );
}

function PausedPanel() {
  return (
    <div data-testid="player-paused" className="agh-player-state-panel is-paused">
      <span>Paused by host</span>
      <strong>Hold the scene.</strong>
      <p>The round is paused. Keep this screen open; the next cue will arrive here.</p>
    </div>
  );
}

function WaitingPanel({
  room,
  me,
  code,
  onTeamChange,
  onRoomState,
}: {
  room: { id: string; state: import("@/lib/types").RoomState };
  me: StoredPlayer;
  code: string;
  onTeamChange: (p: StoredPlayer) => void;
  onRoomState: (state: import("@/lib/types").RoomState) => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const state = room.state;

  async function switchTeam(teamId: string) {
    if (switching || teamId === me.teamId) return;
    setSwitching(true);
    setSwitchError(null);
    const player = getOrCreatePlayer(code, me.name, teamId);
    try {
      const result = await postPlayerAction(room.id, {
        action: "switch-team",
        playerId: me.id,
        name: player.name,
        teamId,
      });
      onRoomState(result.state);
      onTeamChange({ ...me, ...result.player, teamId, secret: me.secret });
    } catch (e) {
      console.error(e);
      setSwitchError(friendlyPlayerActionError(e, "team switch"));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div
      data-testid="player-joined"
      data-player-id={me.id}
      data-team-id={me.teamId}
      className="agh-player-waiting"
    >
      <div className="agh-player-waiting-head">
        <span>Room lobby</span>
        <strong>Waiting for the host.</strong>
        <p>Your name is on the list. The first cue will take over this screen.</p>
      </div>
      <GameRulesBrowser />
      <div className="agh-player-waiting-signal" aria-label="Waiting for the live cue">
        <span />
        <span />
        <span />
      </div>

      <PlayerDevicePreflight
        roomId={room.id}
        player={me}
        current={state.players.find((player) => player.id === me.id)?.deviceCheck}
        onRoomState={onRoomState}
      />

      {state.teams.some((team) => team.score > 0) && (
        <div className="agh-player-waiting-scores">
          <TeamStandingsList state={state} highlightTeamId={me.teamId} compact />
        </div>
      )}

      <div className="agh-player-switcher">
        <div className="agh-player-switcher-heading">Switch team</div>
        <div className="agh-player-switcher-list">
          {state.teams.map((t) => {
            const active = me.teamId === t.id;
            const members = playersOnTeam(state, t.id);
            return (
              <button
                key={t.id}
                data-testid={`switch-team-${t.id}`}
                data-active={active ? "true" : "false"}
                type="button"
                disabled={switching || active}
                onClick={() => void switchTeam(t.id)}
                className={active ? "is-active" : ""}
              >
                <strong>{t.name}</strong>
                <span>{members.length === 0 ? "empty" : `${members.length} players`}</span>
                <b aria-hidden>{active ? "Yours" : "↗"}</b>
              </button>
            );
          })}
        </div>
        {switchError && <p className="agh-player-switcher-error">{switchError}</p>}
      </div>
    </div>
  );
}

function TeamStandingsList({
  state,
  highlightTeamId,
  compact,
}: {
  state: import("@/lib/types").RoomState;
  highlightTeamId?: string;
  compact?: boolean;
}) {
  const standings = computeTeamStandings(state);
  const hasScores = standings.some((standing) => standing.team.score > 0);
  if (!hasScores) return null;

  return (
    <div className="agh-player-standings">
      <div>Team scores</div>
      <div>
        {standings.map((standing) => {
          const active = highlightTeamId === standing.team.id;
          return (
            <div
              key={standing.team.id}
              className={`${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`}
            >
              <span>{String(standing.place).padStart(2, "0")}</span>
              <strong>{standing.team.name}</strong>
              <b>{standing.team.score}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerFinale({
  state,
  me,
}: {
  state: import("@/lib/types").RoomState;
  me: { id: string; name: string; teamId: string };
}) {
  const standings = computeTeamStandings(state);
  const winners = getWinningStandings(standings);
  const myStanding = standings.find((standing) => standing.team.id === me.teamId);
  const isWinner = winners.some((standing) => standing.team.id === me.teamId);
  const winnerNames = winners.map((standing) => standing.team.name).join(" and ");

  return (
    <div
      data-testid="player-party-finale"
      data-total-score={state.teams.reduce((total, team) => total + team.score, 0)}
      className="agh-player-finale"
      data-winner={isWinner}
    >
      <div className="agh-player-finale-head">
        <TapeReel label="LAST REEL" />
        <div>
          <span>PARTY FINALE</span>
          <h2>{isWinner ? "YOUR SIGNAL WON." : "THE NIGHT IS ON RECORD."}</h2>
        </div>
      </div>
      {myStanding && (
        <div className="agh-player-finale-place">
          You placed {formatRussianPlace(myStanding.place)}
        </div>
      )}
      <p className="agh-player-finale-winner">
        {winners.length === 1 ? `Team ${winnerNames} won!` : `Tie: ${winnerNames}!`}
      </p>
      {isWinner && (
        <p className="agh-player-finale-note">
          You are on the winning team. The archive will be unbearable about it.
        </p>
      )}

      {state.finale?.narrative && <PartyFinaleNarrative state={state} />}

      <div className="agh-player-finale-standings">
        <TeamStandingsList state={state} highlightTeamId={me.teamId} />
      </div>

      <p className="agh-player-finale-wait">Waiting for the host's next move…</p>
    </div>
  );
}

function PlayShell({
  children,
  celebratory,
  connectionStatus,
  playerId,
  teamId,
  gameId,
  paused,
}: {
  children: ReactNode;
  celebratory?: boolean;
  connectionStatus?: RoomConnectionStatus;
  playerId?: string;
  teamId?: string;
  gameId?: string | null;
  paused?: boolean;
}) {
  return (
    <main
      data-testid="player-shell"
      data-connection-status={connectionStatus ?? "unknown"}
      data-player-id={playerId ?? ""}
      data-team-id={teamId ?? ""}
      data-game-id={gameId ?? ""}
      data-paused={paused ? "true" : "false"}
      className={`agh-player-shell ${celebratory ? "is-celebratory" : ""}`}
    >
      <header className="agh-player-masthead">
        <Link to="/" className="agh-player-brand" aria-label="AI Game Hub home">
          <strong>AI GAME HUB</strong>
          <span>Live party operating system</span>
        </Link>
        <div className="agh-player-signal">
          <span>Player signal</span>
          <strong>{connectionStatus === "live" ? "Live" : "Stand by"}</strong>
        </div>
      </header>
      {connectionStatus && connectionStatus !== "live" && (
        <div className="agh-player-connection">
          {connectionStatus === "offline"
            ? "You are offline. Keep this tab open. The room will resync when the network returns."
            : connectionStatus === "error"
              ? "Room sync failed. Check the network; retry happens when this tab becomes active."
              : "Reconnecting to the room…"}
        </div>
      )}
      <div className="agh-player-shell-content">{children}</div>
    </main>
  );
}
