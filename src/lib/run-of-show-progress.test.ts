import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import {
  finalizeSmokeScreenState,
  markGrillOracleVerifiedState,
  nextTongsRoundState,
  transitionSmokeScreenState,
} from "./game-state";
import { applyHostCommand } from "./host-command";
import { selectPartyActState } from "./party-controls";
import { buildQuickStartRoomState } from "./quick-start";
import { emptyRoomState, type RoomState } from "./types";

function players(state: RoomState, count: number) {
  state.players = Array.from({ length: count }, (_, index) => ({
    id: `player-${index}`,
    name: `Player ${index + 1}`,
    teamId: state.teams[index % state.teams.length]!.id,
    joinedAt: index,
  }));
  return state;
}

describe("run-of-show lifecycle progress", () => {
  test("Smoke Screen results close the later reveal step without relaunching the run", () => {
    let state = players(
      buildQuickStartRoomState(
        "Host",
        { venue: "bar", targetDurationMinutes: 120, expectedPlayers: 8 },
        100,
      ),
      8,
    );
    state = applyHostCommand(
      state,
      {
        commandId: "cmd_smoke_assign_progress",
        command: { type: "launch-game", gameId: "smokescreen" },
      },
      200,
    ).state;

    expect(state.runOfShow?.completedStepIds).toContain("bar-smoke-120");
    const runId = state.smokescreen!.runId;
    state = transitionSmokeScreenState(state, { runId, status: "sealed", now: 300 })!;
    state = transitionSmokeScreenState(state, { runId, status: "revealed", now: 400 })!;
    state = finalizeSmokeScreenState(state, {
      runId,
      results: [],
      recap: "The room has seen enough.",
      aiFallback: true,
      now: 500,
    })!;

    expect(state.runOfShow?.completedStepIds).toContain("bar-smoke-reveal-120");
    expect(state.smokescreen?.status).toBe("results");
  });

  test("the final compact Tongs result closes the deferred blitz step", () => {
    const state = players(emptyRoomState("Host"), 8);
    state.party = contextForExperience("smoke-neon-norrebro", "compact");
    const launched = applyHostCommand(
      state,
      {
        commandId: "cmd_compact_tongs_progress",
        command: { type: "launch-game", gameId: "tongsoftruth" },
      },
      100,
    ).state;

    expect((launched.runOfShow?.completedStepIds ?? []).includes("compact-tongs")).toBe(false);
    const run = launched.tongsoftruth!;
    const atLastReveal: RoomState = {
      ...launched,
      tongsoftruth: {
        ...run,
        status: "reveal",
        roundNumber: run.totalRounds,
      },
    };
    const finished = nextTongsRoundState(atLastReveal, run.runId, 200)!;

    expect(finished.tongsoftruth?.status).toBe("results");
    expect(finished.runOfShow?.completedStepIds).toContain("compact-tongs");
  });

  test("verifying the last Oracle prediction closes the bar verification step", () => {
    let state = players(emptyRoomState("Host"), 2);
    state.party = contextForExperience("smoke-neon-norrebro", "normal");
    state = selectPartyActState(state, "bar", 100)!;
    state.oracleMemory = {
      runId: "oracle-progress",
      participantIds: ["player-0", "player-1"],
      submittedPlayerIds: ["player-0", "player-1"],
      verifiedPlayerIds: [],
      status: "revealed",
    };

    state = markGrillOracleVerifiedState(state, "oracle-progress", "player-0")!;
    expect((state.runOfShow?.completedStepIds ?? []).includes("oracle-verify")).toBe(false);
    state = markGrillOracleVerifiedState(state, "oracle-progress", "player-1")!;

    expect(state.oracleMemory?.status).toBe("verified");
    expect(state.runOfShow?.completedStepIds).toContain("oracle-verify");
  });

  test("finishing the party records the scripted finale exactly once", () => {
    let state = players(
      buildQuickStartRoomState(
        "Host",
        { venue: "home", targetDurationMinutes: 120, expectedPlayers: 8 },
        100,
      ),
      8,
    );
    state = selectPartyActState(state, "finale", 200)!;
    const envelope = {
      commandId: "cmd_finish_route_progress",
      command: { type: "finish-party" } as const,
    };
    const finished = applyHostCommand(state, envelope, 300);
    const replay = applyHostCommand(finished.state, envelope, 999);

    expect(finished.state.status).toBe("finished");
    expect(finished.state.runOfShow?.completedStepIds).toEqual(["home-finale-120"]);
    expect(replay.state).toBe(finished.state);
  });
});
