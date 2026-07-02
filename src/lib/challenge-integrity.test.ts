import { describe, expect, test } from "bun:test";
import {
  canAcceptChallengeJudgePayload,
  normalizeChallengeJudgePayload,
  type ChallengeJudgePayload,
} from "./challenge-integrity";
import type { RoomState } from "./types";

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [
      { id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 },
      { id: "p2", name: "Bo", teamId: "lake", joinedAt: 2 },
    ],
    currentGame: "challenge",
    challenge: {
      phase: "recording",
      roundId: "ch_1",
      operatorId: "p1",
      operatorName: "Ada",
      task: "Read the sky as peer review feedback.",
      recordingEndsAt: 10_000,
    },
    speakerSlots: {
      1: { connected: true, name: "Main Stage" },
      2: { connected: false, name: "Oak Spirit" },
      3: { connected: false, name: "The Wind" },
      4: { connected: false, name: "Squirrel Gossip" },
      5: { connected: false, name: "Forest Echo" },
    },
    ...overrides,
  };
}

const payload: ChallengeJudgePayload = {
  roundId: "ch_1",
  operatorId: "p1",
  frames: ["data:image/jpeg;base64,aaa"],
  transcript: "A rigorous but windy scene.",
  videoUrl: "https://example.test/clip.webm",
  operatorName: "Ada",
  task: "Read the sky as peer review feedback.",
};

describe("challenge judge payload integrity", () => {
  test("normalizes payloads and caps frame count", () => {
    const normalized = normalizeChallengeJudgePayload({
      ...payload,
      frames: ["1", "2", "3", "4", "5", "6", "7", 8],
    });

    expect(normalized?.operatorId).toBe("p1");
    expect(normalized?.frames).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  test("accepts only the active operator submission for the active recording round", () => {
    expect(canAcceptChallengeJudgePayload(roomState(), payload)).toBe(true);
    expect(canAcceptChallengeJudgePayload(roomState(), { ...payload, roundId: "old" })).toBe(false);
    expect(canAcceptChallengeJudgePayload(roomState(), { ...payload, operatorId: "p2" })).toBe(
      false,
    );
    expect(canAcceptChallengeJudgePayload(roomState(), { ...payload, task: "wrong task" })).toBe(
      false,
    );
    expect(
      canAcceptChallengeJudgePayload(
        roomState({ challenge: { ...roomState().challenge!, phase: "briefing" } }),
        payload,
      ),
    ).toBe(false);
  });
});
