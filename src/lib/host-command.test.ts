import { describe, expect, test } from "bun:test";
import {
  RECENT_HOST_COMMAND_LIMIT,
  applyHostCommand,
  hostCommandRequestSchema,
  hostCommandRequiresScoreBoundary,
  mergeRecentHostCommandIds,
} from "./host-command";
import { emptyRoomState } from "./types";
import { buildQuickStartRoomState } from "./quick-start";
import { contextForExperience } from "@/experiences/catalog";

const commandId = "cmd_12345678";

function rejectedStatus(run: () => unknown) {
  try {
    run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("host command foundation", () => {
  test("accepts only typed commands addressed to a room", () => {
    const valid = hostCommandRequestSchema.safeParse({
      roomId: "room_1",
      commandId,
      command: {
        type: "select-experience",
        experienceId: "smoke-neon-norrebro",
        contingency: "normal",
      },
    });
    expect(valid.success).toBe(true);
    expect(
      hostCommandRequestSchema.safeParse({
        roomId: "room_1",
        commandId: "cmd_route_1234",
        command: { type: "complete-run-step", stepId: "home-arrival-180" },
      }).success,
    ).toBe(true);
    expect(
      hostCommandRequestSchema.safeParse({
        roomId: "room_1",
        commandId: "cmd_begin_route_1234",
        command: { type: "begin-run-step", stepId: "home-arrival-180" },
      }).success,
    ).toBe(true);

    expect(
      hostCommandRequestSchema.safeParse({
        commandId,
        command: { type: "select-act", actId: "bar" },
      }).success,
    ).toBe(false);
    expect(
      hostCommandRequestSchema.safeParse({
        roomId: "room_1",
        commandId,
        command: { type: "select-act", actId: "bar", score: 999 },
      }).success,
    ).toBe(false);
  });

  test("selects an experience using server time and records the command", () => {
    const result = applyHostCommand(
      emptyRoomState("Host"),
      {
        commandId,
        command: {
          type: "select-experience",
          experienceId: "smoke-neon-norrebro",
          contingency: "normal",
        },
      },
      1234,
    );

    expect(result.state.party).toEqual({
      experienceId: "smoke-neon-norrebro",
      actId: "grill",
      venue: "grill-site",
      contingency: "normal",
      uiLocale: "en",
      contentLocale: "ru",
      sessionStartedAt: 1234,
      actStartedAt: 1234,
    });
    expect(result.state.recentHostCommandIds).toEqual([commandId]);
    expect(result.value.replayed).toBe(false);
  });

  test("re-delivery is idempotent and does not reset the act clock", () => {
    const envelope = {
      commandId,
      command: { type: "select-act", actId: "bar" } as const,
    };
    const smokeNeon = applyHostCommand(
      emptyRoomState("Host"),
      {
        commandId: "cmd_experience_1",
        command: {
          type: "select-experience",
          experienceId: "smoke-neon-norrebro",
          contingency: "normal",
        },
      },
      100,
    ).state;
    const first = applyHostCommand(smokeNeon, envelope, 200);
    const replay = applyHostCommand(first.state, envelope, 999);

    expect(first.state.party?.actId).toBe("bar");
    expect(first.state.party?.actStartedAt).toBe(200);
    expect(replay.state).toBe(first.state);
    expect(replay.state.party?.actStartedAt).toBe(200);
    expect(replay.value.replayed).toBe(true);
  });

  test("rejects acts outside the selected experience route", () => {
    expect(
      rejectedStatus(() =>
        applyHostCommand(
          emptyRoomState("Host"),
          { commandId, command: { type: "select-act", actId: "transition" } },
          100,
        ),
      ),
    ).toBe(409);
  });

  test("launches a registered game from the latest server state with a deterministic run id", () => {
    const state = emptyRoomState("Host");
    state.players = [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }];
    const envelope = {
      commandId: "cmd_oracle_1234",
      command: { type: "launch-game", gameId: "grilloracle" } as const,
    };
    const first = applyHostCommand(state, envelope, 10_000);
    const replay = applyHostCommand(first.state, envelope, 90_000);

    expect(first.state.currentGame).toBe("grilloracle");
    expect(first.state.grilloracle?.roundId.startsWith("oracle_cmd_oracle_1234_")).toBe(true);
    expect(first.state.grilloracle?.participantIds).toEqual(["p1"]);
    expect(first.state.grilloracle?.captureEndsAt).toBe(910_000);
    expect(replay.state).toBe(first.state);
    expect(replay.value.replayed).toBe(true);
  });

  test("advances a scripted route through host moments and foreground launches", () => {
    const state = buildQuickStartRoomState(
      "Host",
      { venue: "home", targetDurationMinutes: 180, expectedPlayers: 12 },
      100,
    );
    state.players = [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }];

    const afterArrival = applyHostCommand(
      state,
      {
        commandId: "cmd_home_arrival",
        command: { type: "complete-run-step", stepId: "home-arrival-180" },
      },
      200,
    ).state;
    const afterSoundscapeLaunch = applyHostCommand(
      afterArrival,
      {
        commandId: "cmd_home_soundscape",
        command: { type: "launch-game", gameId: "soundscape" },
      },
      300,
    ).state;

    expect(afterArrival.runOfShow?.completedStepIds).toEqual(["home-arrival-180"]);
    expect(afterSoundscapeLaunch.runOfShow?.completedStepIds).toEqual([
      "home-arrival-180",
      "home-soundscape-180",
    ]);
    expect(
      rejectedStatus(() =>
        applyHostCommand(
          state,
          {
            commandId: "cmd_skip_game_step",
            command: { type: "complete-run-step", stepId: "home-soundscape-180" },
          },
          400,
        ),
      ),
    ).toBe(409);
  });

  test("starts the next timed cue once with server time and clears it on completion", () => {
    const state = buildQuickStartRoomState(
      "Host",
      { venue: "home", targetDurationMinutes: 180, expectedPlayers: 12 },
      100,
    );
    const first = applyHostCommand(
      state,
      {
        commandId: "cmd_begin_home_arrival",
        command: { type: "begin-run-step", stepId: "home-arrival-180" },
      },
      200,
    ).state;
    const retry = applyHostCommand(
      first,
      {
        commandId: "cmd_begin_home_retry",
        command: { type: "begin-run-step", stepId: "home-arrival-180" },
      },
      999,
    ).state;
    const completed = applyHostCommand(
      retry,
      {
        commandId: "cmd_complete_home_arrival",
        command: { type: "complete-run-step", stepId: "home-arrival-180" },
      },
      1_000,
    ).state;

    expect(first.runOfShow?.activeStepId).toBe("home-arrival-180");
    expect(first.runOfShow?.activeStepStartedAt).toBe(200);
    expect(first.quickStart?.startedAt).toBe(200);
    expect(retry.runOfShow?.activeStepStartedAt).toBe(200);
    expect(retry.quickStart?.startedAt).toBe(200);
    expect(completed.runOfShow?.completedStepIds).toEqual(["home-arrival-180"]);
    expect(completed.runOfShow?.activeStepId).toBeUndefined();
    expect(completed.runOfShow?.activeStepStartedAt).toBeUndefined();
    expect(completed.quickStart?.startedAt).toBe(200);
  });

  test("rejects starting a game or a future interlude as a timed host cue", () => {
    const state = buildQuickStartRoomState(
      "Host",
      { venue: "home", targetDurationMinutes: 180, expectedPlayers: 12 },
      100,
    );

    expect(
      rejectedStatus(() =>
        applyHostCommand(
          state,
          {
            commandId: "cmd_begin_game_step",
            command: { type: "begin-run-step", stepId: "home-soundscape-180" },
          },
          200,
        ),
      ),
    ).toBe(409);
    expect(
      rejectedStatus(() =>
        applyHostCommand(
          state,
          {
            commandId: "cmd_begin_future_step",
            command: { type: "begin-run-step", stepId: "home-snack-reset-180" },
          },
          200,
        ),
      ),
    ).toBe(409);
  });

  test("rejects launch when the latest room no longer meets game eligibility", () => {
    expect(
      rejectedStatus(() =>
        applyHostCommand(
          emptyRoomState("Host"),
          {
            commandId: "cmd_oracle_empty",
            command: { type: "launch-game", gameId: "grilloracle" },
          },
          100,
        ),
      ),
    ).toBe(409);
  });

  test("launches Smoke Screen as a background run without replacing the foreground game", () => {
    const state = emptyRoomState("Host");
    state.players = [
      { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
      { id: "p3", name: "Three", teamId: "fire", joinedAt: 3 },
    ];
    state.currentGame = "challenge";
    state.challenge = {
      phase: "briefing",
      roundId: "challenge_1",
      operatorId: "p1",
      operatorName: "One",
    };

    const result = applyHostCommand(
      state,
      {
        commandId: "cmd_smokescreen_1",
        command: { type: "launch-game", gameId: "smokescreen" },
      },
      5_000,
    );

    expect(result.state.currentGame).toBe("challenge");
    expect(result.state.challenge?.roundId).toBe("challenge_1");
    expect(result.state.smokescreen?.runId.startsWith("smoke_cmd_smokescreen_1_")).toBe(true);
    expect(result.state.smokescreen?.participantIds).toEqual(["p1", "p2", "p3"]);
  });

  test("keeps revealed story evidence across hub cleanup, the next launch and the finale", () => {
    const state = emptyRoomState("Host");
    state.party = contextForExperience("park-story", "normal");
    state.players = [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }];
    state.status = "playing";
    state.currentGame = "challenge";
    state.challenge = {
      phase: "results",
      roundId: "challenge_story_1",
      operatorId: "p1",
      operatorName: "Ada",
      result: {
        score: 9,
        feedback: "Ada promoted the picnic blanket to supporting actor.",
        videoUrl: "https://private.invalid/DO_NOT_KEEP_VIDEO",
      },
    };

    const afterHub = applyHostCommand(
      state,
      { commandId: "cmd_story_hub_1", command: { type: "force-hub" } },
      1_000,
    ).state;
    expect(afterHub.challenge).toBeUndefined();
    expect(afterHub.finale?.evidence.map((item) => item.gameId)).toEqual(["challenge"]);
    expect(afterHub.party?.storyEvidence?.map((item) => item.gameId)).toEqual(["challenge"]);
    expect(JSON.stringify(afterHub.finale).includes("DO_NOT_KEEP_VIDEO")).toBe(false);

    afterHub.currentGame = "phototunt";
    afterHub.phototunt = {
      phase: "results",
      roundId: "photo_story_1",
      results: [
        {
          playerId: "p1",
          playerName: "Ada",
          teamId: "forest",
          photoUrl: "https://private.invalid/DO_NOT_KEEP_PHOTO",
          rank: 1,
          points: 10,
          comment: "A coaster became municipal architecture.",
        },
      ],
    };
    const nextGame = applyHostCommand(
      afterHub,
      { commandId: "cmd_story_track_2", command: { type: "launch-game", gameId: "trackguess" } },
      2_000,
    ).state;
    expect(nextGame.phototunt).toBeUndefined();
    expect(nextGame.finale?.evidence.map((item) => item.gameId)).toEqual([
      "challenge",
      "phototunt",
    ]);
    expect(nextGame.party?.storyEvidence?.map((item) => item.gameId)).toEqual([
      "challenge",
      "phototunt",
    ]);
    expect(JSON.stringify(nextGame.finale).includes("DO_NOT_KEEP_PHOTO")).toBe(false);

    nextGame.trackguess!.roundResults = [
      {
        trackId: "track_story_1",
        title: "Synthetic Sunset",
        genre: "disco",
        isAi: true,
        correctPlayerIds: ["p1"],
      },
    ];
    const finished = applyHostCommand(
      nextGame,
      { commandId: "cmd_story_finale_3", command: { type: "finish-party" } },
      3_000,
    ).state;
    expect(finished.finale?.evidence.map((item) => item.gameId)).toEqual([
      "challenge",
      "phototunt",
      "trackguess",
    ]);
    expect(finished.finale?.evidenceCapturedAt).toBe(3_000);
  });

  test("applies emergency controls to the latest server snapshot without losing score or players", () => {
    const state = emptyRoomState("Host");
    state.players = [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }];
    state.teams[0]!.score = 17;
    state.currentGame = "challenge";
    state.status = "playing";
    state.challenge = {
      phase: "recording",
      roundId: "challenge_live",
      operatorId: "p1",
      operatorName: "Ada",
      recordingEndsAt: 10_000,
    };

    const paused = applyHostCommand(
      state,
      { commandId: "cmd_pause_live", command: { type: "pause" } },
      2_000,
    ).state;
    const manual = applyHostCommand(
      paused,
      {
        commandId: "cmd_manual_live",
        command: { type: "set-ai-mode", mode: "manual" },
      },
      2_100,
    ).state;
    const automatic = applyHostCommand(
      manual,
      {
        commandId: "cmd_auto_live",
        command: { type: "set-ai-mode", mode: "auto" },
      },
      5_100,
    ).state;

    expect(paused.paused).toEqual({ startedAt: 2_000 });
    expect(manual.party?.aiMode).toBe("manual");
    expect(manual.aiRuntime?.manualFallbackActivations).toBe(1);
    expect(manual.aiRuntime?.manualFallbackStartedAt).toBe(2_100);
    expect(automatic.aiRuntime?.manualFallbackTotalMs).toBe(3_000);
    expect(automatic.aiRuntime?.manualFallbackStartedAt).toBeUndefined();
    expect(manual.teams[0]?.score).toBe(17);
    expect(manual.players.map((player) => player.id)).toEqual(["p1"]);
    expect(manual.challenge?.roundId).toBe("challenge_live");
  });

  test("server-authoritative team commands preserve late joins", () => {
    const state = emptyRoomState("Host");
    state.players = [{ id: "late", name: "Late Guest", teamId: "forest", joinedAt: 99 }];

    const result = applyHostCommand(
      state,
      {
        commandId: "cmd_add_team_live",
        command: { type: "add-team", teamId: "team_new", name: "Night Shift" },
      },
      100,
    );

    expect(result.state.players.some((player) => player.id === "late")).toBe(true);
    expect(result.state.teams.some((team) => team.id === "team_new")).toBe(true);
  });

  test("lets the host remove a duplicate lobby identity but not an active player", () => {
    const lobby = emptyRoomState("Host");
    lobby.players = [
      { id: "keep", name: "Ada", teamId: "forest", joinedAt: 1 },
      { id: "duplicate", name: "Ada old phone", teamId: "forest", joinedAt: 2 },
    ];

    const removed = applyHostCommand(
      lobby,
      {
        commandId: "cmd_remove_duplicate",
        command: { type: "remove-player", playerId: "duplicate" },
      },
      100,
    ).state;

    expect(removed.players.map((player) => player.id)).toEqual(["keep"]);
    expect(
      rejectedStatus(() =>
        applyHostCommand(
          { ...lobby, status: "playing" },
          {
            commandId: "cmd_remove_active_player",
            command: { type: "remove-player", playerId: "duplicate" },
          },
          200,
        ),
      ),
    ).toBe(409);
    expect(
      rejectedStatus(() =>
        applyHostCommand(
          {
            ...lobby,
            quickStart: {
              venue: "park",
              targetDurationMinutes: 120,
              expectedPlayers: 8,
              configuredAt: 1,
              startedAt: 2,
            },
          },
          {
            commandId: "cmd_remove_after_first_cue",
            command: { type: "remove-player", playerId: "duplicate" },
          },
          300,
        ),
      ),
    ).toBe(409);
  });

  test("rejects malformed emergency commands", () => {
    expect(
      hostCommandRequestSchema.safeParse({
        roomId: "room_1",
        commandId,
        command: { type: "set-ai-mode", mode: "offline" },
      }).success,
    ).toBe(false);
    expect(
      hostCommandRequestSchema.safeParse({
        roomId: "room_1",
        commandId,
        command: { type: "pause", state: "client-snapshot" },
      }).success,
    ).toBe(false);
  });

  test("sets a server-authoritative AI cap and clears usage only for a new party", () => {
    const capped = applyHostCommand(
      emptyRoomState("Host"),
      {
        commandId: "cmd_budget_120",
        command: { type: "set-ai-budget", limitCredits: 120 },
      },
      100,
    ).state;
    capped.aiRuntime = {
      ...capped.aiRuntime!,
      usedCredits: 17,
      providerRequests: 4,
    };
    const reset = applyHostCommand(
      capped,
      { commandId: "cmd_new_party_budget", command: { type: "start-new-party" } },
      200,
    ).state;

    expect(capped.aiRuntime?.limitCredits).toBe(120);
    expect(reset.aiRuntime?.limitCredits).toBe(120);
    expect(reset.aiRuntime?.usedCredits).toBe(0);
    expect(reset.aiRuntime?.providerRequests).toBe(0);
    expect(
      hostCommandRequestSchema.safeParse({
        roomId: "room_1",
        commandId,
        command: { type: "set-ai-budget", limitCredits: 999 },
      }).success,
    ).toBe(false);
  });

  test("a new party resets the route to its first act and restarts readiness timing", () => {
    const state = buildQuickStartRoomState(
      "Host",
      {
        venue: "bar",
        targetDurationMinutes: 240,
        expectedPlayers: 18,
        storySeed: "A promotion party and the suspicious gold coaster",
      },
      100,
    );
    state.status = "finished";
    state.quickStart = { ...state.quickStart!, startedAt: 200, finishedAt: 900 };
    state.party = {
      ...state.party!,
      actId: "finale",
      actStartedAt: 500,
      storyEvidence: [
        {
          id: "challenge:r1",
          gameId: "challenge",
          title: "The gold coaster",
          detail: "It became public evidence.",
        },
      ],
    };
    state.runOfShow!.completedStepIds = ["bar-arrival-180"];
    state.finale = {
      evidenceVersion: 1,
      evidenceCapturedAt: 500,
      evidence: [],
    };
    state.oracleMemory = {
      runId: "old_oracle",
      participantIds: ["p1"],
      submittedPlayerIds: ["p1"],
      verifiedPlayerIds: ["p1"],
      status: "verified",
    };
    state.smokescreen = {
      runId: "old_smoke",
      status: "results",
      participantIds: ["p1"],
      assignedPlayerIds: ["p1"],
      submittedVoterIds: ["p1"],
      startedAt: 100,
      results: [],
      recap: "Old party evidence.",
    };

    const reset = applyHostCommand(
      state,
      { commandId: "cmd_restart_route", command: { type: "start-new-party" } },
      1_000,
    ).state;

    expect(reset.party?.actId).toBe("bar");
    expect(reset.party?.sessionStartedAt).toBe(1_000);
    expect(reset.party?.actStartedAt).toBe(1_000);
    expect(reset.runOfShow?.completedStepIds).toEqual([]);
    expect(reset.quickStart?.configuredAt).toBe(1_000);
    expect(reset.quickStart?.startedAt).toBeUndefined();
    expect(reset.quickStart?.finishedAt).toBeUndefined();
    expect(reset.quickStart?.storySeed).toBe("A promotion party and the suspicious gold coaster");
    expect(reset.party?.storySeed).toBe("A promotion party and the suspicious gold coaster");
    expect(reset.party?.storyEvidence).toBeUndefined();
    expect(reset.finale).toBeUndefined();
    expect(reset.oracleMemory).toBeUndefined();
    expect(reset.smokescreen).toBeUndefined();
  });

  test("classifies every command that must persist a score-cycle boundary", () => {
    expect(hostCommandRequiresScoreBoundary({ type: "start-new-party" })).toBe(true);
    expect(hostCommandRequiresScoreBoundary({ type: "reset-scores" })).toBe(true);
    expect(hostCommandRequiresScoreBoundary({ type: "resume-party" })).toBe(false);
    expect(hostCommandRequiresScoreBoundary({ type: "finish-party" })).toBe(false);
  });

  test("persists finish time for the report and clears it when the party resumes", () => {
    const state = buildQuickStartRoomState(
      "Host",
      { venue: "park", targetDurationMinutes: 120, expectedPlayers: 8 },
      100,
    );
    state.quickStart!.startedAt = 200;
    state.status = "playing";

    const finished = applyHostCommand(
      state,
      { commandId: "cmd_finish_timed_party", command: { type: "finish-party" } },
      7_200_200,
    ).state;
    const resumed = applyHostCommand(
      finished,
      { commandId: "cmd_resume_timed_party", command: { type: "resume-party" } },
      7_300_000,
    ).state;

    expect(finished.quickStart?.startedAt).toBe(200);
    expect(finished.quickStart?.finishedAt).toBe(7_200_200);
    expect(resumed.quickStart?.startedAt).toBe(200);
    expect(resumed.quickStart?.finishedAt).toBeUndefined();
  });

  test("keeps a bounded deduplicated receipt window", () => {
    const oldIds = Array.from(
      { length: RECENT_HOST_COMMAND_LIMIT },
      (_, index) => `cmd_${String(index).padStart(8, "0")}`,
    );
    const merged = mergeRecentHostCommandIds(oldIds, [oldIds[5]!, "cmd_99999999"]);

    expect(merged?.length).toBe(RECENT_HOST_COMMAND_LIMIT);
    expect(merged?.[0]).toBe(oldIds[1]);
    expect(merged?.at(-1)).toBe("cmd_99999999");
    expect(merged?.filter((id) => id === oldIds[5]).length).toBe(1);
  });
});
