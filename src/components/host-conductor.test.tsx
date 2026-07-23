import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getExperienceRoute } from "@/experiences/catalog";
import { selectExperienceState, selectPartyActState } from "@/lib/party-controls";
import {
  QUICK_START_DURATIONS,
  QUICK_START_VENUES,
  buildQuickStartRoomState,
} from "@/lib/quick-start";
import { emptyRoomState, type RoomState } from "@/lib/types";
import { HostConductor } from "./host-conductor";

function smokeState(act: "grill" | "bar" = "grill", playerCount = 3): RoomState {
  const selected = selectExperienceState(
    emptyRoomState("Host"),
    "smoke-neon-norrebro",
    "normal",
    Date.now() - 67 * 60_000,
  );
  const withAct = act === "grill" ? selected : selectPartyActState(selected, act, Date.now());
  if (!withAct) throw new Error("failed to select test act");
  return {
    ...withAct,
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `player-${index}`,
      name: `Player ${index}`,
      teamId: index % 2 === 0 ? "forest" : "lake",
      joinedAt: index,
    })),
  };
}

function render(state: RoomState) {
  return renderToStaticMarkup(
    <HostConductor
      roomId="room-test"
      state={state}
      onLaunchGame={() => {}}
      onSelectExperience={() => {}}
      onSelectAct={() => {}}
      onFinishParty={() => {}}
      onPrepareAi={async () => {}}
      onBeginRouteStep={() => {}}
      onCompleteRouteStep={() => {}}
    />,
  );
}

describe("host conductor dashboard", () => {
  test("keeps a story-first finale available when no points were recorded", () => {
    const html = render(smokeState("grill"));
    const triggerStart = html.indexOf('data-testid="party-finale-trigger"');
    const triggerEnd = html.indexOf("</button>", triggerStart);
    const trigger = html.slice(triggerStart, triggerEnd);

    expect(triggerStart === -1).toBe(false);
    expect(trigger).toContain('data-has-scores="false"');
    expect(trigger.includes("disabled")).toBe(false);
    expect(html).toContain('data-total-route-steps="');
    expect(html).toContain('data-next-route-step-kind="');
    expect(html).toContain('data-next-act-id="');
  });

  test("keeps one real callback through the venue handoff and into the verdict", () => {
    const grill = smokeState("grill", 8);
    grill.finale = {
      evidenceVersion: 1,
      evidenceCapturedAt: 10,
      evidence: [
        {
          id: "soundscape:grill_sound_1",
          gameId: "soundscape",
          title: "Soundscape: Tongs at dusk",
          detail: "The tongs became the evening's unofficial microphone.",
        },
      ],
    };

    const transition = selectPartyActState(grill, "transition", 20);
    if (!transition) throw new Error("transition act must exist");
    const transitionHtml = render(transition);
    expect(transitionHtml).toContain("Open the next act");
    expect(transitionHtml).toContain('data-target-step-id="seal-evidence"');
    expect(transitionHtml).toContain("the next location inherits the case");
    expect(transitionHtml).toContain("The tongs became the evening&#x27;s unofficial microphone");

    const finale = selectPartyActState(transition, "finale", 30);
    if (!finale) throw new Error("finale act must exist");
    const finaleHtml = render(finale);
    expect(finaleHtml).toContain("Show the finale");
    expect(finaleHtml).toContain('data-target-step-id="party-verdict"');
    expect(finaleHtml).toContain("survived the whole route");
    expect(finaleHtml).toContain("Bring it into “The party verdict” as Exhibit A");
  });

  test("puts the implemented background opener first in the grill route", () => {
    const html = render(smokeState("grill"));

    expect(html).toContain("Next recommended");
    expect(html).toContain("Start Smoke Screen");
    expect(html).toContain("Secret missions");
    expect(html).toContain("Act elapsed");
    expect(html).toContain("Run of show");
    expect(html.includes("Smoke Assign")).toBe(false);
  });

  test("queues secrets and only the immediate AI foreground during all 12 arrival cues", () => {
    let routesWithSoundscape = 0;
    let routesWithImpostor = 0;
    for (const venue of QUICK_START_VENUES) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const state = buildQuickStartRoomState(
          "Host",
          { venue, targetDurationMinutes, expectedPlayers: 8 },
          100,
        );
        state.players = Array.from({ length: 8 }, (_, index) => ({
          id: `${venue}-${targetDurationMinutes}-${index}`,
          name: `Player ${index + 1}`,
          teamId: state.teams[index % state.teams.length]!.id,
          joinedAt: index,
        }));
        const firstStep = getExperienceRoute(state.party!.experienceId, state.party!.contingency)
          .steps[0]!;
        expect(firstStep.kind).toBe("interlude");
        state.runOfShow!.activeStepId = firstStep.id;
        state.runOfShow!.activeStepStartedAt = 200;

        const foregroundAfterArrival = getExperienceRoute(
          state.party!.experienceId,
          state.party!.contingency,
        ).steps.find((step, index) => index > 0 && step.kind === "foreground-game");
        const immediateGameId =
          foregroundAfterArrival && "gameId" in foregroundAfterArrival
            ? foregroundAfterArrival.gameId
            : undefined;
        const expectedGames =
          immediateGameId === "soundscape" || immediateGameId === "impostor"
            ? `smokescreen,${immediateGameId}`
            : "smokescreen";
        if (expectedGames.includes("soundscape")) routesWithSoundscape += 1;
        if (expectedGames.includes("impostor")) routesWithImpostor += 1;
        const html = render(state);
        expect(html).toContain('data-auto-prewarm-game-id="smokescreen"');
        expect(html).toContain(`data-auto-prewarm-game-ids="${expectedGames}"`);
      }
    }
    expect(routesWithSoundscape).toBe(8);
    expect(routesWithImpostor).toBe(1);
  });

  test("automatically prepares the next photo task after the previous scripted game returns", () => {
    const state = buildQuickStartRoomState(
      "Host",
      { venue: "home", targetDurationMinutes: 120, expectedPlayers: 8 },
      100,
    );
    state.players = Array.from({ length: 8 }, (_, index) => ({
      id: `home-player-${index}`,
      name: `Player ${index + 1}`,
      teamId: state.teams[index % state.teams.length]!.id,
      joinedAt: index,
    }));
    const route = getExperienceRoute(state.party!.experienceId, state.party!.contingency);
    state.runOfShow!.completedStepIds = route.steps.slice(0, 3).map((step) => step.id);
    state.runOfShow!.activeStepId = undefined;
    state.runOfShow!.activeStepStartedAt = undefined;

    const html = render(state);
    expect(html).toContain('data-next-route-step-id="home-photo-120"');
    expect(html).toContain('data-auto-prewarm-game-id="phototunt"');
    expect(html).toContain('data-auto-prewarm-game-ids="phototunt"');
  });

  test("automatically prepares Challenge on all park and festival routes", () => {
    for (const venue of ["park", "festival"] as const) {
      for (const targetDurationMinutes of QUICK_START_DURATIONS) {
        const state = buildQuickStartRoomState(
          "Host",
          { venue, targetDurationMinutes, expectedPlayers: 8 },
          100,
        );
        state.players = Array.from({ length: 8 }, (_, index) => ({
          id: `${venue}-player-${targetDurationMinutes}-${index}`,
          name: `Player ${index + 1}`,
          teamId: state.teams[index % state.teams.length]!.id,
          joinedAt: index,
        }));
        const route = getExperienceRoute(state.party!.experienceId, state.party!.contingency);
        const challengeIndex = route.steps.findIndex(
          (step) => "gameId" in step && step.gameId === "challenge",
        );
        const challengeStep = route.steps[challengeIndex];
        if (!challengeStep) throw new Error(`${venue} route must include Challenge`);
        state.runOfShow!.completedStepIds = route.steps
          .slice(0, challengeIndex)
          .map((step) => step.id);
        state.runOfShow!.activeStepId = undefined;
        state.runOfShow!.activeStepStartedAt = undefined;

        const html = render(state);
        expect(html).toContain(`data-next-route-step-id="${challengeStep.id}"`);
        expect(html).toContain('data-auto-prewarm-game-id="challenge"');
        expect(html).toContain('data-auto-prewarm-game-ids="challenge"');
      }
    }
  });

  test("advances from a running Smoke Screen to Tongs of Truth without relaunching it", () => {
    const state = smokeState("grill");
    state.smokescreen = {
      runId: "smoke_1",
      status: "assigning",
      participantIds: state.players.map((player) => player.id),
      assignedPlayerIds: [],
      submittedVoterIds: [],
      startedAt: 1,
    };
    const html = render(state);

    expect(html).toContain("Start Tongs of Truth");
    expect(html.includes("Start Smoke Screen")).toBe(false);
  });

  test("advances from a running Tongs ritual to the foreground Oracle", () => {
    const state = smokeState("grill");
    state.smokescreen = {
      runId: "smoke_1",
      status: "active",
      participantIds: state.players.map((player) => player.id),
      assignedPlayerIds: state.players.map((player) => player.id),
      submittedVoterIds: [],
      startedAt: 1,
    };
    state.tongsoftruth = {
      runId: "tongs_1",
      status: "question",
      participantIds: state.players.map((player) => player.id),
      speakerOrder: state.players.map((player) => player.id),
      roundNumber: 1,
      totalRounds: state.players.length,
      currentRoundId: "tongs_1_r1",
      speakerPlayerId: state.players[0]!.id,
      speakerName: state.players[0]!.name,
      level: 1,
      roundResults: [],
    };

    const html = render(state);
    expect(html).toContain("Start Grill Oracle");
    expect(html.includes("Start Tongs of Truth")).toBe(false);
  });

  test("keeps compact Tongs active until its five-turn blitz finishes", () => {
    const selected = selectExperienceState(
      emptyRoomState("Host"),
      "smoke-neon-norrebro",
      "compact",
      Date.now(),
    );
    selected.players = Array.from({ length: 5 }, (_, index) => ({
      id: `player-${index}`,
      name: `Player ${index}`,
      teamId: index % 2 ? "lake" : "forest",
      joinedAt: index,
    }));
    selected.smokescreen = {
      runId: "smoke_1",
      status: "active",
      participantIds: selected.players.map((player) => player.id),
      assignedPlayerIds: selected.players.map((player) => player.id),
      submittedVoterIds: [],
      startedAt: 1,
    };
    selected.tongsoftruth = {
      runId: "tongs_1",
      status: "question",
      participantIds: selected.players.map((player) => player.id),
      speakerOrder: selected.players.map((player) => player.id),
      roundNumber: 1,
      totalRounds: 5,
      currentRoundId: "tongs_1_r1",
      speakerPlayerId: selected.players[0]!.id,
      speakerName: selected.players[0]!.name,
      level: 3,
      roundResults: [],
    };

    const html = render(selected);
    expect(html).toContain("compact blitz is live");
    expect(html.includes("Start Grill Oracle")).toBe(false);
  });

  test("changes the recommendation when the environment moves to the bar", () => {
    const html = render(smokeState("bar"));

    expect(html).toContain("Act II — Alibi");
    expect(html).toContain("Start Sommelier Charlatan");
    expect(html).toContain("Off-theme is still playable");
  });

  test("starts optional Contraband after Sommelier, then advances to the foreground toast", () => {
    const afterSommelier = smokeState("bar");
    afterSommelier.sommelier = {
      phase: "results",
      sessionId: "sommelier_1",
      participantIds: afterSommelier.players.map((player) => player.id),
      submittedPlayerIds: afterSommelier.players.map((player) => player.id),
      roundNumber: 3,
      totalRounds: 3,
      submittedVoterIds: [],
      roundResults: [],
    };

    expect(render(afterSommelier)).toContain("Start Contraband");

    afterSommelier.contraband = {
      runId: "contraband_1",
      status: "active",
      participantIds: afterSommelier.players.map((player) => player.id),
      assignedPlayerIds: afterSommelier.players.map((player) => player.id),
      resolvedPlayerIds: [],
      startedAt: 1,
      endsAt: Date.now() + 30 * 60_000,
    };
    const running = render(afterSommelier);
    expect(running).toContain("Start Toast Syndicate");
  });

  test("turns the bar Oracle route step into a reveal ritual after cross-act capture", () => {
    const html = render({
      ...smokeState("bar"),
      oracleMemory: {
        runId: "oracle_1",
        participantIds: ["player-0", "player-1", "player-2"],
        submittedPlayerIds: ["player-0", "player-1", "player-2"],
        verifiedPlayerIds: [],
        status: "sealed",
      },
    });

    expect(html).toContain("Testimony sealed");
    expect(html).toContain("Break the seal");
    expect(html).toContain("Start Sommelier Charlatan");
    expect(html.includes("Start Grill Oracle")).toBe(false);
  });

  test("shows an objective blocker instead of a dead launch button", () => {
    const html = render(smokeState("grill", 0));

    expect(html).toContain("needs 3 players");
    expect(html).toContain("disabled");
  });

  test("surfaces Cross only after prior bar callbacks and then leaves the finale available", () => {
    const state = smokeState("bar", 6);
    state.sommelier = {
      phase: "results",
      sessionId: "sommelier_1",
      participantIds: state.players.map((player) => player.id),
      submittedPlayerIds: state.players.map((player) => player.id),
      roundNumber: 3,
      totalRounds: 3,
      submittedVoterIds: [],
      roundResults: [],
    };
    state.contraband = {
      runId: "contraband_1",
      status: "results",
      participantIds: state.players.map((player) => player.id),
      assignedPlayerIds: state.players.map((player) => player.id),
      resolvedPlayerIds: state.players.map((player) => player.id),
      startedAt: 1,
    };
    state.toastsyndicate = {
      phase: "results",
      sessionId: "toast_1",
      roundId: "toast_1_r6",
      roundNumber: 6,
      totalRounds: 6,
      speakerPlayerId: state.players[0]!.id,
      speakerName: state.players[0]!.name,
      recordingSubmitted: true,
      submittedListenerIds: [],
      roundResults: [],
    };
    state.oracleMemory = {
      runId: "oracle_1",
      participantIds: state.players.map((player) => player.id),
      submittedPlayerIds: state.players.map((player) => player.id),
      verifiedPlayerIds: state.players.map((player) => player.id),
      status: "verified",
    };
    state.smokescreen = {
      runId: "smoke_1",
      status: "results",
      participantIds: state.players.map((player) => player.id),
      assignedPlayerIds: state.players.map((player) => player.id),
      submittedVoterIds: state.players.map((player) => player.id),
      startedAt: 1,
    };

    expect(render(state)).toContain("Start Cross Examination");

    state.crossexamination = {
      runId: "cross_1",
      status: "results",
      participantIds: state.players.map((player) => player.id),
      pairOrder: [],
      pairNumber: 3,
      totalPairs: 3,
      currentPairId: "cross_1_p3",
      submittedPlayerIds: [],
      predictionVoterIds: [],
      pairResults: [],
      completedAt: 10,
    };
    const completed = render(state);
    expect(completed.includes("Start Cross Examination")).toBe(false);
    expect(completed).toContain("Move on");
    expect(completed).toContain("The verdict");
  });

  test("carries the quick-start thread until the first real callback replaces it", () => {
    const state = buildQuickStartRoomState(
      "Host",
      {
        venue: "home",
        targetDurationMinutes: 180,
        expectedPlayers: 12,
        storySeed: "A birthday cake vanished before anyone arrived.",
      },
      Date.now(),
    );
    state.players = Array.from({ length: 8 }, (_, index) => ({
      id: `home-player-${index}`,
      name: `Home Player ${index}`,
      teamId: index % 2 ? "lake" : "forest",
      joinedAt: index,
    }));

    const arrival = render(state);
    expect(arrival).toContain("Inspect the premises");
    expect(arrival).toContain("Begin this moment");
    expect(arrival.includes("Moment complete")).toBe(false);
    expect(arrival).toContain('data-story-source="seed"');
    expect(arrival).toContain('data-target-step-id="home-arrival-180"');
    expect(arrival).toContain("Host opening line");
    expect(arrival).toContain("A birthday cake vanished before anyone arrived");

    state.runOfShow!.activeStepId = "home-arrival-180";
    state.runOfShow!.activeStepStartedAt = Date.now() - 2 * 60_000;
    const activeArrival = render(state);
    expect(activeArrival).toContain("Moment complete");
    expect(activeArrival).toContain("live for 0:02");
    expect(activeArrival.includes("Begin this moment")).toBe(false);

    state.runOfShow!.completedStepIds.push("home-arrival-180");
    state.runOfShow!.activeStepId = undefined;
    state.runOfShow!.activeStepStartedAt = undefined;
    const firstGame = render(state);
    expect(firstGame).toContain("Start Smoke Screen");
    expect(firstGame.includes("Moment complete")).toBe(false);
    expect(firstGame).toContain('data-story-source="seed"');
    expect(firstGame).toContain('data-target-step-id="home-smoke-assign-180"');

    state.finale = {
      evidenceVersion: 1,
      evidenceCapturedAt: Date.now(),
      evidence: [
        {
          id: "legacy:empty",
          gameId: "soundscape",
          title: "Legacy empty callback",
          detail: " ",
        },
      ],
    };
    const malformedEvidenceFallback = render(state);
    expect(malformedEvidenceFallback).toContain('data-story-source="seed"');
    expect(malformedEvidenceFallback).toContain("A birthday cake vanished before anyone arrived");

    state.runOfShow!.completedStepIds.push(
      "home-smoke-assign-180",
      "home-soundscape-180",
      "home-impostor-180",
      "home-photo-180",
    );
    state.finale = {
      evidenceVersion: 1,
      evidenceCapturedAt: Date.now(),
      evidence: [
        {
          id: "soundscape:home_sound_1",
          gameId: "soundscape",
          title: "Soundscape: Kitchen static",
          detail: "The kettle and the window became a shared soundtrack.",
        },
      ],
    };
    const connectedInterlude = render(state);
    expect(connectedInterlude).toContain('data-testid="route-story-callback"');
    expect(connectedInterlude).toContain('data-story-source="evidence"');
    expect(connectedInterlude).toContain("Host-ready story bridge");
    expect(connectedInterlude).toContain('data-target-step-id="home-kitchen-180"');
    expect(connectedInterlude).toContain("The kettle and the window");
    expect(connectedInterlude).toContain("is now Exhibit A");
    expect(connectedInterlude.includes("A birthday cake vanished before anyone arrived")).toBe(
      false,
    );

    state.runOfShow!.completedStepIds.push("home-kitchen-180");
    const connectedGame = render(state);
    expect(connectedGame).toContain("Start Spectrum Court");
    expect(connectedGame).toContain('data-target-step-id="home-spectrum-180"');
    expect(connectedGame).toContain("Spectrum Court” gives the room one chance");
    expect(connectedGame).toContain("The kettle and the window");
  });
});
