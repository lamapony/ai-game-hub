import { lazy, type ComponentType, type ReactNode } from "react";
import type { GameId, RoomState } from "@/lib/types";

export type HostGameViewProps = { roomId: string; code: string; state: RoomState };
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

export const HOST_GAME_VIEW_REGISTRY = {
  soundscape: {
    isReady: (state) => Boolean(state.soundscape),
    View: ({ roomId, code, state }) => <SoundscapeHost roomId={roomId} code={code} state={state} />,
  },
  challenge: {
    isReady: (state) => Boolean(state.challenge),
    View: ({ roomId, state }) => <ChallengeHost roomId={roomId} state={state} />,
  },
  phototunt: {
    isReady: (state) => Boolean(state.phototunt),
    View: ({ roomId, state }) => <PhotoHuntHost roomId={roomId} state={state} />,
  },
  trackguess: {
    isReady: (state) => Boolean(state.trackguess),
    View: ({ roomId, state }) => <TrackGuessHost roomId={roomId} state={state} />,
  },
  spectrumcourt: {
    isReady: (state) => Boolean(state.spectrumcourt),
    View: ({ roomId, state }) => <SpectrumCourtHost roomId={roomId} state={state} />,
  },
  whoamong: {
    isReady: (state) => Boolean(state.whoamong),
    View: ({ roomId, state }) => <WhoAmongHost roomId={roomId} state={state} />,
  },
  impostor: {
    isReady: (state) => Boolean(state.impostor),
    View: ({ roomId, state }) => <ImpostorHost roomId={roomId} state={state} />,
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
  return <View {...props} />;
}
