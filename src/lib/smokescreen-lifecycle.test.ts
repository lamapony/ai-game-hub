import { describe, expect, test } from "bun:test";
import type { SmokeScreenGuessRecord, SmokeScreenMissionRecord } from "@/games/smokescreen/model";
import {
  sameSmokeScreenGuesses,
  scoreSmokeScreen,
  smokeScreenDetectivePoints,
  smokeScreenRequestSchema,
  validateSmokeScreenGuesses,
} from "./smokescreen-lifecycle";
import type { Player } from "./types";

const players: Player[] = [
  { id: "p1", name: "One", teamId: "forest", joinedAt: 1 },
  { id: "p2", name: "Two", teamId: "lake", joinedAt: 2 },
  { id: "p3", name: "Three", teamId: "fire", joinedAt: 3 },
];

function mission(tier: 1 | 2 | 3): SmokeScreenMissionRecord {
  return {
    version: 1,
    assignedAt: 10,
    mission: {
      tier,
      text: `Mission ${tier}`,
      detection_hint: `Hint ${tier}`,
    },
  };
}

function ballot(
  guesses: Array<{ missionId: string; ownerPlayerId: string }>,
): SmokeScreenGuessRecord {
  return { version: 1, guesses, submittedAt: 20 };
}

function thrownMessage(run: () => void) {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("Smoke Screen lifecycle contract", () => {
  test("accepts strict host and player actions only", () => {
    expect(
      smokeScreenRequestSchema.safeParse({
        roomId: "room_1",
        runId: "smoke_1",
        action: "seal",
        allowIncomplete: false,
      }).success,
    ).toBe(true);
    expect(
      smokeScreenRequestSchema.safeParse({
        roomId: "room_1",
        runId: "smoke_1",
        action: "vote",
        playerId: "p1",
        guesses: [{ missionId: "mission_1", ownerPlayerId: "p2" }],
        leakedScore: 999,
      }).success,
    ).toBe(false);
  });

  test("requires one valid suspect for every anonymous mission", () => {
    expect(
      thrownMessage(() =>
        validateSmokeScreenGuesses({
          missionIds: ["m1", "m2"],
          participantIds: players.map((player) => player.id),
          guesses: [
            { missionId: "m1", ownerPlayerId: "p1" },
            { missionId: "m2", ownerPlayerId: "p2" },
          ],
        }),
      ),
    ).toBe("");
    expect(
      thrownMessage(() =>
        validateSmokeScreenGuesses({
          missionIds: ["m1", "m2"],
          participantIds: players.map((player) => player.id),
          guesses: [{ missionId: "m1", ownerPlayerId: "p1" }],
        }),
      ),
    ).toContain("exactly one guess");
    expect(
      thrownMessage(() =>
        validateSmokeScreenGuesses({
          missionIds: ["m1"],
          participantIds: players.map((player) => player.id),
          guesses: [{ missionId: "m1", ownerPlayerId: "outsider" }],
        }),
      ),
    ).toContain("outside");
  });

  test("locks ballots by semantic content rather than array order", () => {
    const left = [
      { missionId: "m1", ownerPlayerId: "p2" },
      { missionId: "m2", ownerPlayerId: "p1" },
    ];
    expect(sameSmokeScreenGuesses(left, [...left].reverse())).toBe(true);
    expect(sameSmokeScreenGuesses(left, [{ missionId: "m1", ownerPlayerId: "p3" }, left[1]!])).toBe(
      false,
    );
  });

  test("awards an owner jackpot only when completed and nobody else identifies them", () => {
    const results = scoreSmokeScreen({
      missions: [
        { missionId: "m1", owner: players[0]!, record: mission(1) },
        { missionId: "m2", owner: players[1]!, record: mission(2) },
        { missionId: "m3", owner: players[2]!, record: mission(3) },
      ],
      guesses: [
        {
          voterPlayerId: "p1",
          record: ballot([
            { missionId: "m1", ownerPlayerId: "p1" },
            { missionId: "m2", ownerPlayerId: "p2" },
            { missionId: "m3", ownerPlayerId: "p1" },
          ]),
        },
        {
          voterPlayerId: "p2",
          record: ballot([
            { missionId: "m1", ownerPlayerId: "p1" },
            { missionId: "m2", ownerPlayerId: "p2" },
            { missionId: "m3", ownerPlayerId: "p2" },
          ]),
        },
      ],
      completedMissionIds: ["m1", "m2", "m3"],
    });

    expect(results.map((result) => [result.missionId, result.caught, result.ownerPoints])).toEqual([
      ["m1", true, 0],
      ["m2", true, 0],
      ["m3", false, 15],
    ]);
    expect(results[0]?.correctDetectiveIds).toEqual(["p2"]);
    expect(results[1]?.correctDetectiveIds).toEqual(["p1"]);
    expect(
      smokeScreenDetectivePoints(
        results,
        players.map((player) => player.id),
      ),
    ).toEqual([
      { playerId: "p1", points: 2 },
      { playerId: "p2", points: 2 },
      { playerId: "p3", points: 0 },
    ]);
  });
});
