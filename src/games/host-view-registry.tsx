import { lazy, type ComponentType, type ReactNode } from "react";
import type { GameId, RoomState } from "@/lib/types";

export type HostGameViewProps = {
  roomId: string;
  code: string;
  state: RoomState;
  onBackToHub: () => void | Promise<void>;
};
type HostGameViewDefinition = {
  View: ComponentType<HostGameViewProps>;
  isReady: (state: RoomState) => boolean;
};

const SoundscapeHost = lazy(() =>
  import("@/games/soundscape/HostView").then((module) => ({ default: module.SoundscapeHost })),
);
const ChallengeHost = lazy(() =>
  import("@/games/challenge/HostView").then((module) => ({ default: module.ChallengeHost })),
);
const PhotoHuntHost = lazy(() =>
  import("@/games/phototunt/HostView").then((module) => ({ default: module.PhotoHuntHost })),
);
const TrackGuessHost = lazy(() =>
  import("@/games/trackguess/HostView").then((module) => ({ default: module.TrackGuessHost })),
);
const SpectrumCourtHost = lazy(() =>
  import("@/games/spectrumcourt/HostView").then((module) => ({
    default: module.SpectrumCourtHost,
  })),
);
const WhoAmongHost = lazy(() =>
  import("@/games/whoamong/HostView").then((module) => ({ default: module.WhoAmongHost })),
);
const ImpostorHost = lazy(() =>
  import("@/games/impostor/HostView").then((module) => ({ default: module.ImpostorHost })),
);
const GrillOracleHost = lazy(() =>
  import("@/games/grilloracle/HostView").then((module) => ({
    default: module.GrillOracleHost,
  })),
);
const ToastSyndicateHost = lazy(() =>
  import("@/games/toastsyndicate/HostView").then((module) => ({
    default: module.ToastSyndicateHost,
  })),
);
const StillLifeHost = lazy(() =>
  import("@/games/stilllife/HostView").then((module) => ({
    default: module.StillLifeHost,
  })),
);
const SommelierHost = lazy(() =>
  import("@/games/sommelier/HostView").then((module) => ({
    default: module.SommelierHost,
  })),
);
const CrossExaminationHost = lazy(() =>
  import("@/games/crossexamination/HostView").then((module) => ({
    default: module.CrossExaminationHost,
  })),
);

export const HOST_GAME_VIEW_REGISTRY = {
  soundscape: {
    isReady: (state) => Boolean(state.soundscape),
    View: ({ roomId, code, state, onBackToHub }) => (
      <SoundscapeHost roomId={roomId} code={code} state={state} onBackToHub={onBackToHub} />
    ),
  },
  challenge: {
    isReady: (state) => Boolean(state.challenge),
    View: ({ roomId, code, state, onBackToHub }) => (
      <ChallengeHost roomId={roomId} code={code} state={state} onBackToHub={onBackToHub} />
    ),
  },
  phototunt: {
    isReady: (state) => Boolean(state.phototunt),
    View: ({ roomId, code, state, onBackToHub }) => (
      <PhotoHuntHost roomId={roomId} code={code} state={state} onBackToHub={onBackToHub} />
    ),
  },
  trackguess: {
    isReady: (state) => Boolean(state.trackguess),
    View: ({ roomId, state, onBackToHub }) => (
      <TrackGuessHost roomId={roomId} state={state} onBackToHub={onBackToHub} />
    ),
  },
  spectrumcourt: {
    isReady: (state) => Boolean(state.spectrumcourt),
    View: ({ roomId, state, onBackToHub }) => (
      <SpectrumCourtHost roomId={roomId} state={state} onBackToHub={onBackToHub} />
    ),
  },
  whoamong: {
    isReady: (state) => Boolean(state.whoamong),
    View: ({ roomId, state, onBackToHub }) => (
      <WhoAmongHost roomId={roomId} state={state} onBackToHub={onBackToHub} />
    ),
  },
  impostor: {
    isReady: (state) => Boolean(state.impostor),
    View: ({ roomId, code, state, onBackToHub }) => (
      <ImpostorHost roomId={roomId} code={code} state={state} onBackToHub={onBackToHub} />
    ),
  },
  grilloracle: {
    isReady: (state) => Boolean(state.grilloracle),
    View: ({ roomId, code, state }) => (
      <GrillOracleHost roomId={roomId} code={code} state={state} />
    ),
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
    View: ({ roomId, code, state }) => (
      <CrossExaminationHost roomId={roomId} code={code} state={state} />
    ),
  },
  toastsyndicate: {
    isReady: (state) => Boolean(state.toastsyndicate),
    View: ({ roomId, code, state }) => (
      <ToastSyndicateHost roomId={roomId} code={code} state={state} />
    ),
  },
  stilllife: {
    isReady: (state) => Boolean(state.stilllife),
    View: ({ roomId, code, state }) => <StillLifeHost roomId={roomId} code={code} state={state} />,
  },
  sommelier: {
    isReady: (state) => Boolean(state.sommelier),
    View: ({ roomId, code, state }) => <SommelierHost roomId={roomId} code={code} state={state} />,
  },
} satisfies Record<GameId, HostGameViewDefinition>;

export function ActiveHostGameView({
  fallback = null,
  ...props
}: HostGameViewProps & { fallback?: ReactNode }) {
  const gameId = props.state.currentGame;
  if (!gameId) return fallback;
  const definition = HOST_GAME_VIEW_REGISTRY[gameId];
  if (!definition.isReady(props.state)) return fallback;
  const View = definition.View;
  return (
    <div data-testid="active-host-game" data-game-id={gameId}>
      <View {...props} />
    </div>
  );
}
