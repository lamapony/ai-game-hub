import { describe, expect, test } from "bun:test";
import {
  assertPlayerMayUpload,
  assertPlayerStoragePath,
  assertStorageObjectExists,
  extensionForUpload,
} from "./player-media.server";
import type { Player, RoomState } from "./types";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    name: "Ada",
    teamId: "forest",
    joinedAt: 1,
    secretHash: "hash-p1",
    ...overrides,
  };
}

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    hostName: "Host",
    status: "playing",
    teams: [
      { id: "forest", name: "Forest", color: "green", score: 0 },
      { id: "lake", name: "Lake", color: "blue", score: 0 },
    ],
    players: [player()],
    currentGame: null,
    speakerSlots: {},
    ...overrides,
  };
}

function rejectedStatus(run: () => unknown) {
  try {
    run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

function caughtError(run: () => unknown) {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

describe("player media server helpers", () => {
  test("allows only expected media mime types per upload action", () => {
    expect(extensionForUpload("soundscape-audio", "audio/webm;codecs=opus").extension).toBe("webm");
    expect(extensionForUpload("challenge-video", "video/mp4").extension).toBe("mp4");
    expect(extensionForUpload("photo", "image/jpeg").extension).toBe("jpg");
    expect(rejectedStatus(() => extensionForUpload("photo", "image/png"))).toBe(400);
  });

  test("authorizes uploads only during the matching active phase", () => {
    const state = roomState({
      currentGame: "challenge",
      challenge: {
        phase: "recording",
        roundId: "ch_1",
        task: "Dance",
        operatorId: "p1",
        operatorName: "Ada",
        recordingEndsAt: 20_000,
      },
    });

    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "challenge-video", player(), "ch_1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "challenge-video", player({ id: "p2" }), "ch_1", 10_000),
      ),
    ).toBe(403);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "challenge-video", player(), "wrong_round", 10_000),
      ),
    ).toBe(409);
  });

  test("rejects storage paths outside the authorized player namespace", () => {
    expect(
      assertPlayerStoragePath({
        storagePath: "room_1/photos/ph_1/p1-123.jpg",
        roomId: "room_1",
        kind: "photos",
        roundId: "ph_1",
        playerId: "p1",
      }),
    ).toBe("room_1/photos/ph_1/p1-123.jpg");

    expect(
      rejectedStatus(() =>
        assertPlayerStoragePath({
          storagePath: "room_1/photos/ph_1/p2-123.jpg",
          roomId: "room_1",
          kind: "photos",
          roundId: "ph_1",
          playerId: "p1",
        }),
      ),
    ).toBe(403);
    expect(
      rejectedStatus(() =>
        assertPlayerStoragePath({
          storagePath: "room_1/photos/ph_1/p1-../secret.jpg",
          roomId: "room_1",
          kind: "photos",
          roundId: "ph_1",
          playerId: "p1",
        }),
      ),
    ).toBe(400);
  });

  test("does not mask storage exists errors as missing uploads", () => {
    const storageError = new Error("storage temporarily unavailable");
    expect(caughtError(() => assertStorageObjectExists({ data: false, error: storageError }))).toBe(
      storageError,
    );

    expect(rejectedStatus(() => assertStorageObjectExists({ data: false, error: null }))).toBe(409);
    expect(caughtError(() => assertStorageObjectExists({ data: true, error: null }))).toBeNull();
  });
});
