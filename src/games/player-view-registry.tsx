import { lazy, type ComponentType, type ReactNode } from "react";
import type { StoredPlayer } from "@/lib/player-action-client";
import type { GameId, RoomState } from "@/lib/types";

export type PlayerGameViewProps = { roomId: string; state: RoomState; me: StoredPlayer };
type PlayerGameViewDefinition = {
  View: ComponentType<PlayerGameViewProps>;
  isReady: (state: RoomState) => boolean;
};

const SoundscapePlayer = lazy(() =>
  import("@/games/soundscape/PlayerView").then((module) => ({
    default: module.SoundscapePlayer,
  })),
);
const ChallengePlayer = lazy(() =>
  import("@/games/challenge/PlayerView").then((module) => ({ default: module.ChallengePlayer })),
);
const PhotoHuntPlayer = lazy(() =>
  import("@/games/phototunt/PlayerView").then((module) => ({ default: module.PhotoHuntPlayer })),
);
const TrackGuessPlayer = lazy(() =>
  import("@/games/trackguess/PlayerView").then((module) => ({
    default: module.TrackGuessPlayer,
  })),
);
const SpectrumCourtPlayer = lazy(() =>
  import("@/games/spectrumcourt/PlayerView").then((module) => ({
    default: module.SpectrumCourtPlayer,
  })),
);
const WhoAmongPlayer = lazy(() =>
  import("@/games/whoamong/PlayerView").then((module) => ({ default: module.WhoAmongPlayer })),
);
const ImpostorPlayer = lazy(() =>
  import("@/games/impostor/PlayerView").then((module) => ({ default: module.ImpostorPlayer })),
);
const GrillOraclePlayer = lazy(() =>
  import("@/games/grilloracle/PlayerView").then((module) => ({
    default: module.GrillOraclePlayer,
  })),
);
const ToastSyndicatePlayer = lazy(() =>
  import("@/games/toastsyndicate/PlayerView").then((module) => ({
    default: module.ToastSyndicatePlayer,
  })),
);
const StillLifePlayer = lazy(() =>
  import("@/games/stilllife/PlayerView").then((module) => ({
    default: module.StillLifePlayer,
  })),
);
const SommelierPlayer = lazy(() =>
  import("@/games/sommelier/PlayerView").then((module) => ({
    default: module.SommelierPlayer,
  })),
);
const CrossExaminationPlayer = lazy(() =>
  import("@/games/crossexamination/PlayerView").then((module) => ({
    default: module.CrossExaminationPlayer,
  })),
);

export const PLAYER_GAME_VIEW_REGISTRY = {
  soundscape: {
    isReady: (state) => Boolean(state.soundscape),
    View: ({ roomId, state, me }) => <SoundscapePlayer roomId={roomId} state={state} me={me} />,
  },
  challenge: {
    isReady: (state) => Boolean(state.challenge),
    View: ({ roomId, state, me }) => <ChallengePlayer roomId={roomId} state={state} me={me} />,
  },
  phototunt: {
    isReady: (state) => Boolean(state.phototunt),
    View: ({ roomId, state, me }) => <PhotoHuntPlayer roomId={roomId} state={state} me={me} />,
  },
  trackguess: {
    isReady: (state) => Boolean(state.trackguess),
    View: ({ roomId, state, me }) => <TrackGuessPlayer roomId={roomId} state={state} me={me} />,
  },
  spectrumcourt: {
    isReady: (state) => Boolean(state.spectrumcourt),
    View: ({ roomId, state, me }) => <SpectrumCourtPlayer roomId={roomId} state={state} me={me} />,
  },
  whoamong: {
    isReady: (state) => Boolean(state.whoamong),
    View: ({ roomId, state, me }) => <WhoAmongPlayer roomId={roomId} state={state} me={me} />,
  },
  impostor: {
    isReady: (state) => Boolean(state.impostor),
    View: ({ roomId, state, me }) => <ImpostorPlayer roomId={roomId} state={state} me={me} />,
  },
  grilloracle: {
    isReady: (state) => Boolean(state.grilloracle),
    View: ({ roomId, state, me }) => <GrillOraclePlayer roomId={roomId} state={state} me={me} />,
  },
  smokescreen: {
    isReady: () => false,
    View: () => null,
  },
  contraband: {
    isReady: () => false,
    View: () => null,
  },
  tongsoftruth: {
    isReady: () => false,
    View: () => null,
  },
  crossexamination: {
    isReady: (state) => Boolean(state.crossexamination),
    View: ({ roomId, state, me }) => (
      <CrossExaminationPlayer roomId={roomId} state={state} me={me} />
    ),
  },
  toastsyndicate: {
    isReady: (state) => Boolean(state.toastsyndicate),
    View: ({ roomId, state, me }) => <ToastSyndicatePlayer roomId={roomId} state={state} me={me} />,
  },
  stilllife: {
    isReady: (state) => Boolean(state.stilllife),
    View: ({ roomId, state, me }) => <StillLifePlayer roomId={roomId} state={state} me={me} />,
  },
  sommelier: {
    isReady: (state) => Boolean(state.sommelier),
    View: ({ roomId, state, me }) => <SommelierPlayer roomId={roomId} state={state} me={me} />,
  },
} satisfies Record<GameId, PlayerGameViewDefinition>;

export function ActivePlayerGameView({
  fallback = null,
  ...props
}: PlayerGameViewProps & { fallback?: ReactNode }) {
  const gameId = props.state.currentGame;
  if (!gameId) return fallback;
  const definition = PLAYER_GAME_VIEW_REGISTRY[gameId];
  if (!definition.isReady(props.state)) return fallback;
  const View = definition.View;
  return (
    <div data-testid="active-player-game" data-game-id={gameId}>
      <View {...props} />
    </div>
  );
}
