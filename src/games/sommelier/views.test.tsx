import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoredPlayer } from "@/lib/player-action-client";
import {
  emptyRoomState,
  type RoomState,
  type SommelierPublicProfile,
  type SommelierRoundResult,
  type SommelierState,
} from "@/lib/types";
import { SommelierHost } from "./HostView";
import { SommelierPlayer } from "./PlayerView";

const ada: StoredPlayer = { id: "p1", name: "Ada", teamId: "forest" };
const boris: StoredPlayer = { id: "p2", name: "Boris", teamId: "lake" };
const cleo: StoredPlayer = { id: "p3", name: "Cleo", teamId: "sunset" };

const profile: SommelierPublicProfile = {
  drink_guess: "A lager with committee-approved foam",
  tasting_notes: "Cold citrus, brave condensation and a finish that asks who is paying.",
  owner_profile:
    "This owner orders quickly, then audits everyone else's choices. They call it decisiveness. The bar calls it free consulting.",
  pretentiousness: 7,
  pairing_advice: "Pair with warm bar light and a menu nobody intends to read.",
};

function result(): SommelierRoundResult {
  return {
    entryId: "8474f5fb-0fb0-4f4a-a925-5c3a3cb31a77",
    ownerPlayerId: ada.id,
    ownerPlayerName: ada.name,
    ownerTeamId: ada.teamId,
    profile,
    correctGuesserIds: [boris.id],
    ballotCount: 2,
    ownerPoints: 0,
    guesserPoints: { [boris.id]: 3 },
    aiFallback: false,
  };
}

function sommelierState(phase: "capture" | "voting" | "reveal"): RoomState {
  const base = emptyRoomState("Host");
  const reveal = phase === "reveal" ? result() : undefined;
  const sommelier: SommelierState = {
    phase,
    sessionId: "sommelier_session_1",
    participantIds: [ada.id, boris.id, cleo.id],
    submittedPlayerIds: phase === "capture" ? [] : [ada.id, boris.id, cleo.id],
    submittedVoterIds: phase === "voting" ? [boris.id] : [],
    roundNumber: phase === "capture" ? 0 : 1,
    totalRounds: phase === "capture" ? 0 : 1,
    captureEndsAt: Date.now() + 240_000,
    votingEndsAt: phase === "voting" ? Date.now() + 45_000 : undefined,
    currentEntryId: phase === "capture" ? undefined : "8474f5fb-0fb0-4f4a-a925-5c3a3cb31a77",
    currentProfile: phase === "capture" ? undefined : profile,
    result: reveal,
    roundResults: reveal ? [reveal] : [],
  };

  return {
    ...base,
    status: "playing",
    currentGame: "sommelier",
    players: [
      { ...ada, joinedAt: 1 },
      { ...boris, joinedAt: 2 },
      { ...cleo, joinedAt: 3 },
    ],
    sommelier,
  };
}

describe("Sommelier host and three-player ritual", () => {
  test("separates selected drink capture from the audience", () => {
    const state = sommelierState("capture");
    const hostHtml = renderToStaticMarkup(
      <SommelierHost roomId="room_1" code="ABCD" state={state} />,
    );
    const selectedHtml = renderToStaticMarkup(
      <SommelierPlayer roomId="room_1" state={state} me={ada} />,
    );
    const audienceState = {
      ...state,
      sommelier: { ...state.sommelier!, participantIds: [ada.id, boris.id] },
    };
    const audienceHtml = renderToStaticMarkup(
      <SommelierPlayer roomId="room_1" state={audienceState} me={cleo} />,
    );

    expect(hostHtml).toContain("Ada");
    expect(hostHtml).toContain("Boris");
    expect(selectedHtml).toContain("Photograph your drink. Only the drink.");
    expect(audienceHtml).toContain("You are a future suspect");
  });

  test("publishes the AI profile without leaking the owner before reveal", () => {
    const state = sommelierState("voting");
    const screens = [
      renderToStaticMarkup(<SommelierHost roomId="room_1" code="ABCD" state={state} />),
      renderToStaticMarkup(<SommelierPlayer roomId="room_1" state={state} me={ada} />),
      renderToStaticMarkup(<SommelierPlayer roomId="room_1" state={state} me={boris} />),
      renderToStaticMarkup(<SommelierPlayer roomId="room_1" state={state} me={cleo} />),
    ];

    for (const html of screens) {
      expect(html).toContain(profile.drink_guess);
      expect(html).toContain("This owner orders quickly");
      expect(html).toContain("free consulting.");
      expect(html.includes(ada.name)).toBe(false);
    }
  });

  test("reveals the same owner and deterministic score to the room", () => {
    const state = sommelierState("reveal");
    const hostHtml = renderToStaticMarkup(
      <SommelierHost roomId="room_1" code="ABCD" state={state} />,
    );
    const ownerHtml = renderToStaticMarkup(
      <SommelierPlayer roomId="room_1" state={state} me={ada} />,
    );
    const guesserHtml = renderToStaticMarkup(
      <SommelierPlayer roomId="room_1" state={state} me={boris} />,
    );

    expect(hostHtml).toContain(ada.name);
    expect(hostHtml).toContain("Found by Boris · +3 each");
    expect(ownerHtml).toContain(ada.name);
    expect(ownerHtml).toContain("0");
    expect(guesserHtml).toContain("+3");
    expect(guesserHtml).toContain("Uncomfortably accurate");
  });
});
