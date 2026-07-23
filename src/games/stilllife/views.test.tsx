import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoredPlayer } from "@/lib/player-action-client";
import { emptyRoomState, type RoomState, type StillLifeResultEntry } from "@/lib/types";
import { StillLifeHost } from "./HostView";
import { StillLifePlayer } from "./PlayerView";

const forestPlayer: StoredPlayer = { id: "p1", name: "Fern", teamId: "forest" };
const lakePlayer: StoredPlayer = { id: "p2", name: "Lars", teamId: "lake" };

function judgment(teamId: "forest" | "lake", teamName: "Forest" | "Lake"): StillLifeResultEntry {
  return {
    teamId,
    teamName,
    compositionScore: 8,
    dramaScore: 7,
    materialScore: 5,
    points: 20,
    catalogTitle: `${teamName} Lot`,
    auctionPriceDkk: 4_200,
    critique: `${teamName} weaponized the picnic table.`,
    audienceVotes: 0,
    aiFallback: false,
    manualOverride: false,
  };
}

function stillLifeState(phase: "building" | "voting" | "results"): RoomState {
  const base = emptyRoomState("Host");
  const judgments = [judgment("forest", "Forest"), judgment("lake", "Lake")];
  return {
    ...base,
    status: "playing",
    currentGame: "stilllife",
    teams: base.teams.slice(0, 2),
    players: [
      { ...forestPlayer, joinedAt: 1 },
      { ...lakePlayer, joinedAt: 2 },
    ],
    stilllife: {
      phase,
      sessionId: "still_session_1",
      roundId: "still_round_1",
      roundNumber: 1,
      totalRounds: 2,
      activeTeamIds: ["forest", "lake"],
      headline: "The Last Cucumber Abandons the Burning Yacht",
      buildingEndsAt: Date.now() + 300_000,
      votingEndsAt: Date.now() + 45_000,
      submittedTeamIds: phase === "building" ? [] : ["forest", "lake"],
      submittedVoterIds: [],
      judgments: phase === "building" ? undefined : judgments,
      result:
        phase === "results"
          ? {
              roundId: "still_round_1",
              headline: "The Last Cucumber Abandons the Burning Yacht",
              entries: judgments,
              winningTeamIds: ["forest"],
            }
          : undefined,
      roundResults: [],
    },
  };
}

describe("Still Life host and two-player ritual", () => {
  test("shows one shared physical brief to host and both teams", () => {
    const state = stillLifeState("building");
    const hostHtml = renderToStaticMarkup(
      <StillLifeHost roomId="room_1" code="ABCD" state={state} />,
    );
    const forestHtml = renderToStaticMarkup(
      <StillLifePlayer roomId="room_1" state={state} me={forestPlayer} />,
    );
    const lakeHtml = renderToStaticMarkup(
      <StillLifePlayer roomId="room_1" state={state} me={lakePlayer} />,
    );

    for (const html of [hostHtml, forestHtml, lakeHtml]) {
      expect(html).toContain("The Last Cucumber Abandons the Burning Yacht");
    }
    expect(hostHtml).toContain("Forest");
    expect(hostHtml).toContain("Lake");
    expect(forestHtml).toContain("Photograph team lot");
    expect(lakeHtml).toContain("Photograph team lot");
  });

  test("each player can vote only for the other team's lot", () => {
    const state = stillLifeState("voting");
    const forestHtml = renderToStaticMarkup(
      <StillLifePlayer roomId="room_1" state={state} me={forestPlayer} />,
    );
    const lakeHtml = renderToStaticMarkup(
      <StillLifePlayer roomId="room_1" state={state} me={lakePlayer} />,
    );

    expect(forestHtml).toContain("Lake Lot");
    expect(forestHtml.includes("Forest Lot")).toBe(false);
    expect(lakeHtml).toContain("Forest Lot");
    expect(lakeHtml.includes("Lake Lot")).toBe(false);
  });

  test("publishes the same server result to host and both players", () => {
    const state = stillLifeState("results");
    const hostHtml = renderToStaticMarkup(
      <StillLifeHost roomId="room_1" code="ABCD" state={state} />,
    );
    const forestHtml = renderToStaticMarkup(
      <StillLifePlayer roomId="room_1" state={state} me={forestPlayer} />,
    );
    const lakeHtml = renderToStaticMarkup(
      <StillLifePlayer roomId="room_1" state={state} me={lakePlayer} />,
    );

    expect(hostHtml).toContain("Forest");
    expect(hostHtml).toContain("Forest Lot");
    expect(hostHtml).toContain("8/10");
    expect(forestHtml).toContain("Your lot sold");
    expect(lakeHtml).toContain("The art survived you");
  });
});
