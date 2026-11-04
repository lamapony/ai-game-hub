import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { contextForExperience } from "@/experiences/catalog";
import { emptyRoomState } from "@/lib/types";
import { SmokeScreenBackgroundHost } from "./BackgroundHost";
import { SmokeScreenBackgroundPlayer } from "./BackgroundPlayer";

function sealedHomeState() {
  const state = emptyRoomState("Host");
  state.party = contextForExperience("house-party", "compact");
  state.players = [
    { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
    { id: "p2", name: "Max", teamId: "lake", joinedAt: 2 },
    { id: "p3", name: "Lena", teamId: "fire", joinedAt: 3 },
  ];
  state.smokescreen = {
    runId: "smoke_home",
    status: "sealed",
    participantIds: state.players.map((player) => player.id),
    assignedPlayerIds: state.players.map((player) => player.id),
    submittedVoterIds: [],
    startedAt: 1,
  };
  return state;
}

describe("venue-neutral Smoke Screen views", () => {
  test("single-act host can open the reveal without a fake bar transition", () => {
    const html = renderToStaticMarkup(
      <SmokeScreenBackgroundHost roomId="room_home" state={sealedHomeState()} />,
    );

    expect(html).toContain("Reveal anonymously");
    expect(html.includes("opens in the bar act")).toBe(false);
  });

  test("revealed host does not render a leaked live histogram", () => {
    const state = sealedHomeState();
    state.smokescreen = {
      ...state.smokescreen!,
      status: "revealed",
      revealedAt: 2,
      guessTally: { m1: { p2: 1 } },
    };
    const html = renderToStaticMarkup(
      <SmokeScreenBackgroundHost roomId="room_home" state={state} />,
    );

    expect(html).toContain("Verdict open");
    expect(html.includes("Max 1")).toBe(false);
    expect(html.includes("no votes yet")).toBe(false);
  });

  test("results host shows the locked histogram", () => {
    const state = sealedHomeState();
    state.smokescreen = {
      ...state.smokescreen!,
      status: "results",
      completedAt: 3,
      recap: "The smoke cleared.",
      guessTally: { m1: { p2: 2 } },
      results: [
        {
          missionId: "m1",
          ownerPlayerId: "p1",
          tier: 1,
          completed: true,
          caught: false,
          correctDetectiveIds: [],
          ownerPoints: 5,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <SmokeScreenBackgroundHost roomId="room_home" state={state} />,
    );

    expect(html).toContain("Max 2");
  });

  test("sealed player copy promises a later reveal, not a different venue", () => {
    const html = renderToStaticMarkup(
      <SmokeScreenBackgroundPlayer
        roomId="room_home"
        state={sealedHomeState()}
        me={{ id: "p1", name: "Ada", teamId: "forest", secret: "player-secret" }}
      />,
    );

    expect(html).toContain("It returns later without your name");
    expect(html.includes("returns in the bar")).toBe(false);
  });
});
