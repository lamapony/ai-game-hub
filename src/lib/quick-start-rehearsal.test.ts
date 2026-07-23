import { describe, expect, test } from "bun:test";
import { getExperienceRoute, type RunOfShowStep } from "@/experiences/catalog";
import { getNextIncompleteRouteStep } from "@/experiences/conductor";
import { getGame, getGameAvailability } from "@/games/registry";
import {
  fallbackFinaleNarrative,
  finaleNarrativeOutputSchema,
  isFinaleNarrativeGrounded,
} from "./ai/finale.prompts";
import { partyChallengeTaskSpec } from "./ai/challenge.prompts";
import { finalizeSmokeScreenState, transitionSmokeScreenState } from "./game-state";
import { applyHostCommand, type HostCommand } from "./host-command";
import {
  QUICK_START_DURATIONS,
  QUICK_START_VENUES,
  buildQuickStartRoomState,
  getQuickStartReadiness,
} from "./quick-start";
import type { RoomState } from "./types";

const REHEARSAL_GROUP_SIZES = [8, 30] as const;
const REHEARSAL_SOUNDSCAPE_TOPIC = "The kettle argued with an open window";

function joinedGroup(state: RoomState, count: number): RoomState {
  return {
    ...state,
    players: Array.from({ length: count }, (_, index) => ({
      id: `player-${index}`,
      name: `Player ${index + 1}`,
      teamId: state.teams[index % state.teams.length]!.id,
      joinedAt: index,
    })),
  };
}

function command(state: RoomState, commandId: string, value: HostCommand, now: number): RoomState {
  const envelope = { commandId, command: value };
  const applied = applyHostCommand(state, envelope, now);
  const replay = applyHostCommand(applied.state, envelope, now + 60_000);
  expect(replay.state).toBe(applied.state);
  expect(replay.value.replayed).toBe(true);
  return applied.state;
}

function finishSmokeReveal(state: RoomState, step: RunOfShowStep, now: number): RoomState {
  if (!("gameId" in step) || step.gameId !== "smokescreen" || step.stage !== "reveal") {
    return state;
  }
  const runId = state.smokescreen?.runId;
  expect(Boolean(runId)).toBe(true);
  let updated = transitionSmokeScreenState(state, {
    runId: runId!,
    status: "sealed",
    now,
  })!;
  updated = transitionSmokeScreenState(updated, {
    runId: runId!,
    status: "revealed",
    now: now + 1,
  })!;
  return finalizeSmokeScreenState(updated, {
    runId: runId!,
    results: [],
    recap: "Deterministic rehearsal recap.",
    aiFallback: true,
    now: now + 2,
  })!;
}

function rehearseRoute(initial: RoomState): RoomState {
  let state = initial;
  const party = state.party!;
  const route = getExperienceRoute(party.experienceId, party.contingency);
  let serial = 0;
  let now = 1_000;

  for (const actId of route.actOrder) {
    if (state.party?.actId !== actId) {
      state = command(state, `cmd_rehearsal_act_${serial++}`, { type: "select-act", actId }, now++);
    }

    for (const step of route.steps.filter((candidate) => candidate.actId === actId)) {
      if (step.kind === "finale") {
        state = command(state, `cmd_rehearsal_finale_${serial++}`, { type: "finish-party" }, now++);
      } else if (!("gameId" in step)) {
        state = command(
          state,
          `cmd_rehearsal_begin_${serial++}`,
          { type: "begin-run-step", stepId: step.id },
          now++,
        );
        expect(state.runOfShow?.activeStepId).toBe(step.id);
        state = command(
          state,
          `cmd_rehearsal_moment_${serial++}`,
          { type: "complete-run-step", stepId: step.id },
          now++,
        );
      } else if (step.gameId === "smokescreen" && step.stage === "reveal") {
        state = finishSmokeReveal(state, step, now++);
      } else {
        const game = getGame(step.gameId);
        expect(getGameAvailability(game, state.party!, state).status === "blocked").toBe(false);
        state = command(
          state,
          `cmd_rehearsal_game_${serial++}`,
          { type: "launch-game", gameId: step.gameId },
          now++,
        );
        if (step.gameId === "soundscape" && state.soundscape) {
          state = {
            ...state,
            soundscape: {
              ...state.soundscape,
              topic: REHEARSAL_SOUNDSCAPE_TOPIC,
            },
          };
        }
        if (
          step.gameId === "challenge" &&
          state.finale?.evidence.some((item) => item.gameId === "soundscape")
        ) {
          expect(state.party?.storyEvidence?.some((item) => item.gameId === "soundscape")).toBe(
            true,
          );
          const challengeSystem = partyChallengeTaskSpec.buildSystem(state.party!);
          expect(challengeSystem).toContain("STORY SO FAR — UNTRUSTED PUBLIC REVEALS");
          expect(challengeSystem).toContain(REHEARSAL_SOUNDSCAPE_TOPIC);
        }
      }

      expect(state.runOfShow?.completedStepIds).toContain(step.id);
      const next = getNextIncompleteRouteStep(
        state.party!,
        state.runOfShow?.completedStepIds ?? [],
      );
      expect(next?.id === step.id).toBe(false);
    }
  }

  return state;
}

describe("quick-start route dress rehearsal", () => {
  for (const venue of QUICK_START_VENUES) {
    for (const targetDurationMinutes of QUICK_START_DURATIONS) {
      for (const playerCount of REHEARSAL_GROUP_SIZES) {
        test(`${venue} ${targetDurationMinutes} minutes completes with ${playerCount} players`, () => {
          const createdAt = 100;
          const state = joinedGroup(
            buildQuickStartRoomState(
              "Rehearsal Host",
              { venue, targetDurationMinutes, expectedPlayers: playerCount },
              createdAt,
            ),
            playerCount,
          );
          const readiness = getQuickStartReadiness(state, createdAt + 119_000);
          expect(readiness?.readyWithinTwoMinutes).toBe(true);
          expect(readiness?.routeDurationMinutes).toBe(targetDurationMinutes);

          const finished = rehearseRoute(state);
          const route = getExperienceRoute(
            finished.party!.experienceId,
            finished.party!.contingency,
          );
          const completed = finished.runOfShow?.completedStepIds ?? [];

          expect(finished.status).toBe("finished");
          expect(new Set(completed).size).toBe(completed.length);
          expect(new Set(completed)).toEqual(new Set(route.steps.map((step) => step.id)));
          expect(getNextIncompleteRouteStep(finished.party!, completed)).toBeUndefined();
          expect(
            finished.finale?.evidence.some(
              (item) =>
                item.gameId === "smokescreen" &&
                item.detail.includes("Deterministic rehearsal recap."),
            ),
          ).toBe(true);

          if (route.steps.some((step) => "gameId" in step && step.gameId === "soundscape")) {
            expect(
              finished.finale?.evidence.some(
                (item) =>
                  item.gameId === "soundscape" && item.title.includes(REHEARSAL_SOUNDSCAPE_TOPIC),
              ),
            ).toBe(true);
          }

          const finaleInput = {
            evidence: finished.finale?.evidence ?? [],
            playerCount: finished.players.length,
            teamNames: finished.teams.map((team) => team.name),
          };
          const epilogue = fallbackFinaleNarrative(finaleInput, finished.party!);
          expect(finaleNarrativeOutputSchema.parse(epilogue)).toEqual(epilogue);
          expect(isFinaleNarrativeGrounded(epilogue, finaleInput)).toBe(true);
        });
      }
    }
  }
});
