import { z } from "zod";
import { GAME_IDS } from "@/games/ids";
import { getGame, getGameAvailability, launchGame } from "@/games/registry";
import { getExperienceRoute } from "@/experiences/catalog";
import { getNextIncompleteRouteStep } from "@/experiences/conductor";
import { recordManualAiModeState, resetAiRuntimeState, setAiBudgetLimitState } from "./ai-budget";
import {
  AI_RUNTIME_MODES,
  CONTINGENCY_PLANS,
  EXPERIENCE_IDS,
  normalizePartyContext,
  PARTY_ACT_IDS,
} from "./party-context";
import {
  canSkipCurrentPhase,
  finishPartyState,
  forceBackToHubState,
  pauseRoomState,
  resetScoresState,
  resumePartyState,
  resumeRoomState,
  skipCurrentPhaseState,
} from "./host-controls";
import { capturePartyEvidenceState } from "./finale-narrative";
import { statusError } from "./player-auth.server";
import { selectExperienceState, selectPartyActState } from "./party-controls";
import {
  beginRunOfShowStepState,
  completeRunOfShowGameStepState,
  completeRunOfShowStepState,
} from "./run-of-show-progress";
import { addTeamToState, removeTeamFromState, renameTeamInState } from "./teams";
import { canRemovePlayerBeforeParty } from "./room-capacity";
import type { RoomState } from "./types";

export const RECENT_HOST_COMMAND_LIMIT = 64;

const commandIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, "commandId contains unsupported characters");

export const hostCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("select-experience"),
      experienceId: z.enum(EXPERIENCE_IDS),
      contingency: z.enum(CONTINGENCY_PLANS),
    })
    .strict(),
  z
    .object({
      type: z.literal("select-act"),
      actId: z.enum(PARTY_ACT_IDS),
    })
    .strict(),
  z
    .object({
      type: z.literal("launch-game"),
      gameId: z.enum(GAME_IDS),
    })
    .strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("resume") }).strict(),
  z.object({ type: z.literal("skip-phase") }).strict(),
  z.object({ type: z.literal("restart-game") }).strict(),
  z.object({ type: z.literal("force-hub") }).strict(),
  z.object({ type: z.literal("finish-party") }).strict(),
  z.object({ type: z.literal("resume-party") }).strict(),
  z.object({ type: z.literal("start-new-party") }).strict(),
  z
    .object({
      type: z.literal("begin-run-step"),
      stepId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal("complete-run-step"),
      stepId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z.object({ type: z.literal("reset-scores") }).strict(),
  z
    .object({
      type: z.literal("set-ai-mode"),
      mode: z.enum(AI_RUNTIME_MODES),
    })
    .strict(),
  z
    .object({
      type: z.literal("set-ai-budget"),
      limitCredits: z.number().int().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("add-team"),
      teamId: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal("rename-team"),
      teamId: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal("remove-team"),
      teamId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal("remove-player"),
      playerId: z.string().trim().min(1).max(128),
    })
    .strict(),
]);

export const hostCommandRequestSchema = z
  .object({
    roomId: z.string().trim().min(1).max(128).optional(),
    code: z.string().trim().min(1).max(16).optional(),
    hostSecret: z.string().trim().min(1).max(256).optional(),
    commandId: commandIdSchema,
    command: hostCommandSchema,
  })
  .strict()
  .refine((value) => Boolean(value.roomId || value.code), {
    message: "roomId or code required",
    path: ["roomId"],
  });

export type HostCommand = z.infer<typeof hostCommandSchema>;
export type SelectExperienceHostCommand = Extract<HostCommand, { type: "select-experience" }>;
export type SelectActHostCommand = Extract<HostCommand, { type: "select-act" }>;
export type LaunchGameHostCommand = Extract<HostCommand, { type: "launch-game" }>;
export type HostCommandRequest = z.infer<typeof hostCommandRequestSchema>;

export type HostCommandApplication = {
  state: RoomState;
  value: {
    commandId: string;
    commandType: HostCommand["type"];
    replayed: boolean;
  };
};

export function mergeRecentHostCommandIds(
  ...sources: Array<readonly string[] | undefined>
): string[] | undefined {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const id of source ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.length > 0 ? ids.slice(-RECENT_HOST_COMMAND_LIMIT) : undefined;
}

function commandConflict(message: string) {
  return statusError(message, 409);
}

function commandSeed(commandId: string) {
  let hash = 2166136261;
  for (let index = 0; index < commandId.length; index++) {
    hash ^= commandId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function commandRoundId(prefix: string, commandId: string) {
  const seed = commandSeed(commandId).toString(36);
  return `${prefix}_${commandId.slice(0, 64)}_${seed}`;
}

function applyCommand(
  state: RoomState,
  command: HostCommand,
  now: number,
  commandId: string,
): RoomState {
  if (command.type === "select-experience") {
    if (
      state.party?.experienceId === command.experienceId &&
      state.party.contingency === command.contingency
    ) {
      return state;
    }
    return selectExperienceState(state, command.experienceId, command.contingency, now);
  }

  if (command.type === "select-act") {
    if (state.party?.actId === command.actId) return state;
    const next = selectPartyActState(state, command.actId, now);
    if (!next) {
      throw commandConflict(`act ${command.actId} is not available in the selected experience`);
    }
    return next;
  }

  if (command.type === "pause") return pauseRoomState(state, now);
  if (command.type === "resume") return resumeRoomState(state, now);
  if (command.type === "skip-phase") {
    if (!canSkipCurrentPhase(state)) throw commandConflict("the current phase cannot be skipped");
    return skipCurrentPhaseState(state, now);
  }
  if (command.type === "force-hub") return forceBackToHubState(state, now);
  if (command.type === "finish-party") {
    const finishedState = finishPartyState(state, now);
    const finished = finishedState.quickStart
      ? {
          ...finishedState,
          quickStart: {
            ...finishedState.quickStart,
            finishedAt: now,
          },
        }
      : finishedState;
    const party = normalizePartyContext(state.party, state.venue);
    const finale = getExperienceRoute(party.experienceId, party.contingency).steps.find(
      (step) => step.actId === party.actId && step.kind === "finale",
    );
    return finale ? completeRunOfShowStepState(finished, finale.id) : finished;
  }
  if (command.type === "resume-party") {
    const resumed = resumePartyState(state);
    return resumed.quickStart
      ? { ...resumed, quickStart: { ...resumed.quickStart, finishedAt: undefined } }
      : resumed;
  }
  if (command.type === "start-new-party") {
    const reset = resetAiRuntimeState(resetScoresState(resumePartyState(state)));
    const party = normalizePartyContext(reset.party, reset.venue);
    const selected = selectExperienceState(reset, party.experienceId, party.contingency, now);
    const storySeed = reset.quickStart?.storySeed ?? party.storySeed;
    return {
      ...selected,
      party: selected.party
        ? {
            ...selected.party,
            sessionStartedAt: now,
            ...(storySeed ? { storySeed } : {}),
          }
        : selected.party,
      quickStart: reset.quickStart
        ? {
            ...reset.quickStart,
            configuredAt: now,
            startedAt: undefined,
            finishedAt: undefined,
          }
        : undefined,
    };
  }
  if (command.type === "begin-run-step") {
    const party = normalizePartyContext(state.party, state.venue);
    const progress =
      state.runOfShow?.experienceId === party.experienceId &&
      state.runOfShow.contingency === party.contingency
        ? state.runOfShow
        : undefined;
    const step = getNextIncompleteRouteStep(party, progress?.completedStepIds ?? []);
    if (
      !step ||
      step.id !== command.stepId ||
      step.actId !== party.actId ||
      step.kind !== "interlude"
    ) {
      throw commandConflict("that route moment is not ready to begin");
    }
    if (progress?.activeStepId && progress.activeStepId !== step.id) {
      throw commandConflict("another route moment is already active");
    }
    return beginRunOfShowStepState(state, step.id, now);
  }
  if (command.type === "complete-run-step") {
    const party = normalizePartyContext(state.party, state.venue);
    const step = getExperienceRoute(party.experienceId, party.contingency).steps.find(
      (candidate) => candidate.id === command.stepId,
    );
    if (!step || step.actId !== party.actId || "gameId" in step) {
      throw commandConflict("that route moment is not available in the current act");
    }
    return completeRunOfShowStepState(state, step.id);
  }
  if (command.type === "reset-scores") return resetScoresState(state);
  if (command.type === "set-ai-mode") {
    const party = normalizePartyContext(state.party, state.venue);
    return {
      ...state,
      party: { ...party, aiMode: command.mode },
      aiRuntime: recordManualAiModeState(state, command.mode, now),
    };
  }
  if (command.type === "set-ai-budget") {
    return setAiBudgetLimitState(state, command.limitCredits);
  }
  if (command.type === "add-team") {
    const next = addTeamToState(state, command.name, command.teamId);
    if (!next) throw commandConflict("team could not be added");
    return next;
  }
  if (command.type === "rename-team") {
    const next = renameTeamInState(state, command.teamId, command.name);
    if (!next) throw commandConflict("team could not be renamed");
    return next;
  }
  if (command.type === "remove-team") {
    const next = removeTeamFromState(state, command.teamId);
    if (!next) throw commandConflict("team could not be removed");
    return next;
  }
  if (command.type === "remove-player") {
    if (!canRemovePlayerBeforeParty(state)) {
      throw commandConflict("players can be removed only before the party starts");
    }
    if (!state.players.some((player) => player.id === command.playerId)) {
      throw commandConflict("player could not be removed");
    }
    return {
      ...state,
      players: state.players.filter((player) => player.id !== command.playerId),
    };
  }

  const gameId = command.type === "restart-game" ? state.currentGame : command.gameId;
  if (!gameId) throw commandConflict("there is no active game to restart");

  const game = getGame(gameId);
  const party = normalizePartyContext(state.party, state.venue);
  const availability = getGameAvailability(game, party, state);
  if (availability.status === "blocked") {
    throw commandConflict(availability.reason ?? `${gameId} is not available`);
  }
  const seed = commandSeed(commandId);
  const launchSource = capturePartyEvidenceState(state, now);
  const launched = launchGame(launchSource, gameId, {
    roundId: commandRoundId(game.roundIdPrefix, commandId),
    random: seed / 0x1_0000_0000,
    now,
  });
  if (!launched) throw commandConflict(`${gameId} could not be launched`);
  const completesRouteStepOnLaunch =
    command.type === "launch-game" &&
    (game.format === "foreground" ||
      !(gameId === "tongsoftruth" && party.contingency === "compact"));
  if (!completesRouteStepOnLaunch) return launched;
  return completeRunOfShowGameStepState(launched, gameId);
}

/** Score resets need an idempotent ledger reconciliation before the host can launch again. */
export function hostCommandRequiresScoreBoundary(command: HostCommand) {
  return command.type === "start-new-party" || command.type === "reset-scores";
}

/**
 * Applies a validated host command to the latest server snapshot.
 * Recent command ids make network retries idempotent without trusting a client-supplied state.
 */
export function applyHostCommand(
  state: RoomState,
  envelope: { commandId: string; command: HostCommand },
  now: number,
): HostCommandApplication {
  if (state.recentHostCommandIds?.includes(envelope.commandId)) {
    return {
      state,
      value: {
        commandId: envelope.commandId,
        commandType: envelope.command.type,
        replayed: true,
      },
    };
  }

  const updated = applyCommand(state, envelope.command, now, envelope.commandId);
  const recentHostCommandIds = mergeRecentHostCommandIds(state.recentHostCommandIds, [
    envelope.commandId,
  ]);

  return {
    state: { ...updated, recentHostCommandIds },
    value: {
      commandId: envelope.commandId,
      commandType: envelope.command.type,
      replayed: false,
    },
  };
}
