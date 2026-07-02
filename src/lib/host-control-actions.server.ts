import {
  launchChallengeState,
  launchPhotoHuntState,
  launchSoundscapeState,
  launchSpectrumCourtState,
  launchTrackGuessState,
} from "./game-state";
import {
  forceBackToHubState,
  pauseRoomState,
  resumeRoomState,
  skipCurrentPhaseState,
} from "./host-controls";
import { addTeamToState, removeTeamFromState, renameTeamInState } from "./teams";
import type { GameId, RoomState } from "./types";

export type HostControlAction =
  | "launch-game"
  | "pause-toggle"
  | "skip-phase"
  | "restart-game"
  | "force-back-to-hub"
  | "add-team"
  | "rename-team"
  | "remove-team";

export type HostControlActionPayload = {
  action: HostControlAction;
  gameId?: GameId;
  teamId?: string;
  name?: string;
};

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function assertGameId(value: unknown): asserts value is GameId {
  if (
    value !== "soundscape" &&
    value !== "challenge" &&
    value !== "phototunt" &&
    value !== "trackguess" &&
    value !== "spectrumcourt"
  ) {
    throw statusError("valid gameId required", 400);
  }
}

function launchGameState(state: RoomState, gameId: GameId): RoomState {
  const roundId = id(
    gameId === "soundscape"
      ? "snd"
      : gameId === "challenge"
        ? "ch"
        : gameId === "phototunt"
          ? "ph"
          : gameId === "trackguess"
            ? "tg"
            : "sc",
  );
  const next =
    gameId === "soundscape"
      ? launchSoundscapeState(state, roundId)
      : gameId === "challenge"
        ? launchChallengeState(state, roundId)
        : gameId === "phototunt"
          ? launchPhotoHuntState(state, roundId)
          : gameId === "trackguess"
            ? launchTrackGuessState(state, roundId)
            : launchSpectrumCourtState(state, roundId);
  if (!next) throw statusError(`Cannot launch ${gameId} with current players/teams`, 409);
  return next;
}

function restartCurrentGameState(state: RoomState): RoomState {
  if (!state.currentGame) throw statusError("no active game to restart", 409);
  return launchGameState(state, state.currentGame);
}

export async function applyHostControlAction(
  state: RoomState,
  payload: HostControlActionPayload,
  now = Date.now(),
): Promise<RoomState> {
  if (payload.action === "launch-game") {
    assertGameId(payload.gameId);
    return launchGameState(state, payload.gameId);
  }

  if (payload.action === "pause-toggle") {
    return state.paused ? resumeRoomState(state, now) : pauseRoomState(state, now);
  }

  if (payload.action === "skip-phase") {
    return skipCurrentPhaseState(state, now);
  }

  if (payload.action === "restart-game") {
    return restartCurrentGameState(state);
  }

  if (payload.action === "force-back-to-hub") {
    return forceBackToHubState(state);
  }

  if (payload.action === "add-team") {
    const next = addTeamToState(state, payload.name ?? "", id("team"));
    if (!next) throw statusError("cannot add team", 409);
    return next;
  }

  if (payload.action === "rename-team") {
    if (!payload.teamId) throw statusError("teamId required", 400);
    const next = renameTeamInState(state, payload.teamId, payload.name ?? "");
    if (!next) throw statusError("cannot rename team", 409);
    return next;
  }

  if (payload.action === "remove-team") {
    if (!payload.teamId) throw statusError("teamId required", 400);
    const next = removeTeamFromState(state, payload.teamId);
    if (!next) throw statusError("cannot remove team", 409);
    return next;
  }

  return state;
}
