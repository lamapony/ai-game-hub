import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoredPlayer } from "@/lib/player-action-client";
import { emptyRoomState, type RoomState, type WhoAmongState } from "@/lib/types";
import { WhoAmongHost } from "./HostView";
import { WhoAmongPlayer } from "./PlayerView";

const ada: StoredPlayer = { id: "p1", name: "Ada", teamId: "forest" };
const boris: StoredPlayer = { id: "p2", name: "Boris", teamId: "lake" };
const cleo: StoredPlayer = { id: "p3", name: "Cleo", teamId: "fire" };

function whoAmongState(
  phase: WhoAmongState["phase"],
  overrides: Partial<WhoAmongState> = {},
): RoomState {
  const base = emptyRoomState("Host");
  return {
    ...base,
    status: "playing",
    currentGame: "whoamong",
    players: [
      { ...ada, joinedAt: 1 },
      { ...boris, joinedAt: 2 },
      { ...cleo, joinedAt: 3 },
    ],
    whoamong: {
      phase,
      roundId: "wa_1",
      roundNumber: 5,
      totalRounds: 5,
      usedPromptIds: ["tongs-scepter"],
      promptId: "tongs-scepter",
      prompt: "Who among us uses the tongs as a scepter and expects tribute?",
      votes: { p1: "p2", p3: "p2" },
      exhibits: { p1: "because the tongs salute him" },
      provisionalStarIds: ["p2"],
      pleas: phase === "voting" ? {} : { p2: "I accept the tongs. I deny the crime." },
      voteEndsAt: Date.now() + 20_000,
      pleaEndsAt: Date.now() + 10_000,
      revealEndsAt: Date.now() + 8_000,
      roundResults:
        phase === "reveal" || phase === "results"
          ? [
              {
                promptId: "tongs-scepter",
                prompt: "Who among us uses the tongs as a scepter and expects tribute?",
                starIds: ["p2"],
                voteCounts: { p2: 2 },
                correctVoterIds: ["p1", "p3"],
                votes: { p1: "p2", p3: "p2" },
                exhibits: { p1: "because the tongs salute him" },
                pleas: { p2: "I accept the tongs. I deny the crime." },
                lastLash: true,
              },
            ]
          : [],
      ...overrides,
    },
  };
}

describe("Who Among Us docket views", () => {
  test("voting asks the room to file a charge and an exhibit", () => {
    const state = whoAmongState("voting");
    const hostHtml = renderToStaticMarkup(
      <WhoAmongHost roomId="room_1" state={state} onBackToHub={() => undefined} />,
    );
    const playerHtml = renderToStaticMarkup(
      <WhoAmongPlayer roomId="room_1" state={state} me={ada} />,
    );

    expect(hostHtml).toContain("Last Lash");
    expect(hostHtml).toContain("tongs as a scepter");
    expect(hostHtml).toContain("exhibit");
    expect(playerHtml).toContain("Rewrite exhibit");
    expect(playerHtml).toContain("Filed:");
    expect(playerHtml).toContain("Ada (you)");
  });

  test("plea lets only the accused testify", () => {
    const state = whoAmongState("plea");
    const hostHtml = renderToStaticMarkup(
      <WhoAmongHost roomId="room_1" state={state} onBackToHub={() => undefined} />,
    );
    const accusedHtml = renderToStaticMarkup(
      <WhoAmongPlayer roomId="room_1" state={state} me={boris} />,
    );
    const audienceHtml = renderToStaticMarkup(
      <WhoAmongPlayer roomId="room_1" state={state} me={ada} />,
    );

    expect(hostHtml).toContain("The accused may testify");
    expect(hostHtml).toContain("Boris");
    expect(accusedHtml).toContain("You are on the docket");
    expect(accusedHtml).toContain("Rewrite plea");
    expect(accusedHtml).toContain("I accept the tongs");
    expect(audienceHtml).toContain("The accused are testifying");
  });

  test("reveal reads the docket with the plea and exhibit", () => {
    const state = whoAmongState("reveal");
    const hostHtml = renderToStaticMarkup(
      <WhoAmongHost roomId="room_1" state={state} onBackToHub={() => undefined} />,
    );
    const starHtml = renderToStaticMarkup(
      <WhoAmongPlayer roomId="room_1" state={state} me={boris} />,
    );

    expect(hostHtml).toContain("Last Lash — the docket");
    expect(hostHtml).toContain("I accept the tongs. I deny the crime.");
    expect(hostHtml).toContain("because the tongs salute him");
    expect(starHtml).toContain("Last Lash star");
    expect(starHtml).toContain("+6 to team");
  });
});
