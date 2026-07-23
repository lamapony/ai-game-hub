import { getExperienceRoute } from "@/experiences/catalog";
import { GAME_IDS } from "@/games/ids";
import { getGame, type GameCapability } from "@/games/registry";
import {
  QUICK_START_PROFILES,
  quickStartContingency,
  validateQuickStartInput,
  type QuickStartInput,
  type QuickStartVenue,
} from "./quick-start";
import type { GameId } from "./types";

export type QuickStartEquipmentNeed = "camera" | "microphone" | "playback";

export type QuickStartEquipmentRequirement = {
  id: QuickStartEquipmentNeed;
  label: string;
  momentCount: number;
  instruction: string;
};

export type QuickStartBrief = {
  venue: QuickStartVenue;
  emoji: string;
  title: string;
  targetDurationMinutes: number;
  routeDurationMinutes: number;
  expectedPlayers: number;
  storySeed?: string;
  gameMoments: number;
  distinctGames: number;
  guidedBreaks: number;
  hasFinale: boolean;
  equipment: QuickStartEquipmentRequirement[];
  essentials: readonly string[];
  recoveryPromise: string;
};

const VENUE_ESSENTIALS: Record<QuickStartVenue, readonly string[]> = {
  park: [
    "Agree on one visible meetup point and a weather fallback.",
    "A power bank and one portable speaker help, but neither is required to create the room.",
  ],
  bar: [
    "Choose one table or base where phones can stay clear of drinks.",
    "Use a corner where short recordings are possible; the program never requires alcohol.",
  ],
  home: [
    "Make ordinary rooms and objects available as the stage; no special props are required.",
    "Use the host phone or one speaker for group reveals.",
  ],
  festival: [
    "Choose an unmistakable regroup point before anyone starts moving.",
    "Bring power banks and keep mobile data available when venue Wi-Fi becomes decorative.",
  ],
};

function isGameId(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}

function equipmentRequirement(
  id: QuickStartEquipmentNeed,
  momentCount: number,
): QuickStartEquipmentRequirement {
  if (id === "camera") {
    return {
      id,
      label: "Camera",
      momentCount,
      instruction: `${momentCount} ${momentCount === 1 ? "moment uses" : "moments use"} photos or short video. Players check permission after joining.`,
    };
  }
  if (id === "microphone") {
    return {
      id,
      label: "Microphone",
      momentCount,
      instruction: `${momentCount} ${momentCount === 1 ? "moment uses" : "moments use"} short recordings. A quieter corner is enough.`,
    };
  }
  return {
    id,
    label: "Audio playback",
    momentCount,
    instruction: `${momentCount} ${momentCount === 1 ? "moment benefits" : "moments benefit"} from a host phone or portable speaker.`,
  };
}

export function buildQuickStartBrief(input: QuickStartInput): QuickStartBrief {
  const setup = validateQuickStartInput(input);
  const profile = QUICK_START_PROFILES[setup.venue];
  const route = getExperienceRoute(
    profile.experienceId,
    quickStartContingency(setup.targetDurationMinutes),
  );
  const gameSteps = route.steps.filter(
    (step): step is typeof step & { gameId: string } => "gameId" in step,
  );
  const gameIds = gameSteps.map((step) => step.gameId).filter(isGameId);
  const games = gameIds.map(getGame);
  const countMoments = (capabilities: readonly GameCapability[]) =>
    games.filter((game) =>
      capabilities.some((capability) => game.capabilities.includes(capability)),
    ).length;
  const cameraMoments = countMoments(["camera", "vision"]);
  const microphoneMoments = countMoments(["microphone", "stt"]);
  const playbackMoments = countMoments(["speakers"]);
  const equipment = [
    cameraMoments > 0 ? equipmentRequirement("camera", cameraMoments) : undefined,
    microphoneMoments > 0 ? equipmentRequirement("microphone", microphoneMoments) : undefined,
    playbackMoments > 0 ? equipmentRequirement("playback", playbackMoments) : undefined,
  ].filter((item): item is QuickStartEquipmentRequirement => Boolean(item));

  return {
    venue: setup.venue,
    emoji: profile.emoji,
    title: profile.title,
    targetDurationMinutes: setup.targetDurationMinutes,
    routeDurationMinutes: route.steps.reduce((total, step) => total + step.durationMinutes, 0),
    expectedPlayers: setup.expectedPlayers,
    storySeed: setup.storySeed,
    gameMoments: gameSteps.length,
    distinctGames: new Set(gameIds).size,
    guidedBreaks: route.steps.filter((step) => step.kind === "interlude").length,
    hasFinale: route.steps.some((step) => step.kind === "finale"),
    equipment,
    essentials: [
      `Ask ${setup.expectedPlayers} guests to bring a charged browser phone; no app or account is needed.`,
      "Keep one trusted second phone or laptop available as the backup host.",
      ...VENUE_ESSENTIALS[setup.venue],
    ],
    recoveryPromise:
      "Camera, microphone and AI are checked in the room. If one fails, the host can use a fallback or skip the moment without losing the route or finale.",
  };
}
