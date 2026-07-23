import { describe, expect, test } from "bun:test";
import {
  assertPlayerMayUpload,
  assertPlayerStoragePath,
  assertStorageObjectExists,
  extensionForUpload,
  PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS,
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
  test("keeps artifact links long enough for an event but shorter than cleanup retention", () => {
    expect(PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS).toBe(6 * 60 * 60);
    expect(PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS < 24 * 60 * 60).toBe(true);
  });

  test("allows only expected media mime types per upload action", () => {
    expect(extensionForUpload("soundscape-audio", "audio/webm;codecs=opus").extension).toBe("webm");
    expect(extensionForUpload("challenge-video", "video/mp4").extension).toBe("mp4");
    expect(extensionForUpload("photo", "image/jpeg").extension).toBe("jpg");
    expect(extensionForUpload("oracle-photo", "image/jpeg").extension).toBe("jpg");
    expect(extensionForUpload("toast-audio", "audio/mp4").extension).toBe("mp4");
    expect(extensionForUpload("stilllife-photo", "image/jpeg").extension).toBe("jpg");
    expect(extensionForUpload("sommelier-photo", "image/jpeg").extension).toBe("jpg");
    expect(extensionForUpload("contraband-audio", "audio/webm").extension).toBe("webm");
    expect(extensionForUpload("tongs-audio", "audio/mp4").extension).toBe("mp4");
    expect(extensionForUpload("cross-audio", "audio/webm").extension).toBe("webm");
    expect(rejectedStatus(() => extensionForUpload("photo", "image/png"))).toBe(400);
  });

  test("allows an Oracle photo only for an unfinished participant in the active round", () => {
    const state = roomState({
      currentGame: "grilloracle",
      grilloracle: {
        phase: "capturing",
        roundId: "oracle_1",
        participantIds: ["p1"],
        submittedPlayerIds: [],
        captureEndsAt: 20_000,
      },
    });

    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "oracle-photo", player(), "oracle_1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "oracle-photo", player({ id: "p2" }), "oracle_1", 10_000),
      ),
    ).toBe(403);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          {
            ...state,
            grilloracle: { ...state.grilloracle!, submittedPlayerIds: ["p1"] },
          },
          "oracle-photo",
          player(),
          "oracle_1",
          10_000,
        ),
      ),
    ).toBe(409);
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

  test("authorizes Toast audio only for the current speaker", () => {
    const state = roomState({
      players: [player(), player({ id: "p2", teamId: "lake" })],
      currentGame: "toastsyndicate",
      toastsyndicate: {
        phase: "recording",
        sessionId: "toast",
        roundId: "toast_r1",
        roundNumber: 1,
        totalRounds: 6,
        speakerPlayerId: "p1",
        speakerName: "Ada",
        recordingSubmitted: false,
        submittedListenerIds: [],
        roundResults: [],
        recordingEndsAt: 20_000,
      },
    });
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "toast-audio", player(), "toast_r1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "toast-audio", player({ id: "p2" }), "toast_r1", 10_000),
      ),
    ).toBe(403);
  });

  test("authorizes one Still Life photo per active team", () => {
    const state = roomState({
      players: [player(), player({ id: "p2", teamId: "lake" })],
      currentGame: "stilllife",
      stilllife: {
        phase: "building",
        sessionId: "still",
        roundId: "still_r1",
        roundNumber: 1,
        totalRounds: 2,
        activeTeamIds: ["forest", "lake"],
        headline: "The last cucumber leaves",
        submittedTeamIds: [],
        submittedVoterIds: [],
        roundResults: [],
        buildingEndsAt: 20_000,
      },
    });
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "stilllife-photo", player(), "still_r1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          { ...state, stilllife: { ...state.stilllife!, submittedTeamIds: ["forest"] } },
          "stilllife-photo",
          player(),
          "still_r1",
          10_000,
        ),
      ),
    ).toBe(409);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          state,
          "stilllife-photo",
          player({ teamId: "sun" }),
          "still_r1",
          10_000,
        ),
      ),
    ).toBe(403);
  });

  test("authorizes one Sommelier photo per selected owner during capture", () => {
    const state = roomState({
      players: [player(), player({ id: "p2", teamId: "lake" })],
      currentGame: "sommelier",
      sommelier: {
        phase: "capture",
        sessionId: "somm_1",
        participantIds: ["p1"],
        submittedPlayerIds: [],
        captureEndsAt: 20_000,
        roundNumber: 0,
        totalRounds: 1,
        submittedVoterIds: [],
        roundResults: [],
      },
    });
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "sommelier-photo", player(), "somm_1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          state,
          "sommelier-photo",
          player({ id: "p2", teamId: "lake" }),
          "somm_1",
          10_000,
        ),
      ),
    ).toBe(403);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          { ...state, sommelier: { ...state.sommelier!, submittedPlayerIds: ["p1"] } },
          "sommelier-photo",
          player(),
          "somm_1",
          10_000,
        ),
      ),
    ).toBe(409);
  });

  test("authorizes Contraband audio only for the accused during the live window", () => {
    const state = roomState({
      players: [player(), player({ id: "p2", teamId: "lake" })],
      contraband: {
        runId: "cargo_1",
        status: "awaiting-audio",
        participantIds: ["p1", "p2"],
        assignedPlayerIds: ["p1", "p2"],
        resolvedPlayerIds: [],
        startedAt: 1,
        endsAt: 50_000,
        activeAccusation: {
          accusationId: "case_1",
          accuserPlayerId: "p2",
          accusedPlayerId: "p1",
          createdAt: 2,
          audioEndsAt: 20_000,
        },
      },
    });
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "contraband-audio", player(), "cargo_1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          state,
          "contraband-audio",
          player({ id: "p2", teamId: "lake" }),
          "cargo_1",
          10_000,
        ),
      ),
    ).toBe(403);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "contraband-audio", player(), "cargo_1", 51_000),
      ),
    ).toBe(409);
  });

  test("authorizes Tongs audio only for the current speaker and round", () => {
    const state = roomState({
      players: [player(), player({ id: "p2", teamId: "lake" })],
      tongsoftruth: {
        runId: "tongs_1",
        status: "recording",
        participantIds: ["p1", "p2"],
        speakerOrder: ["p1", "p2"],
        roundNumber: 1,
        totalRounds: 2,
        currentRoundId: "tongs_1_r1",
        speakerPlayerId: "p1",
        speakerName: "Ada",
        level: 1,
        question: "Which plan burned first?",
        recordingEndsAt: 20_000,
        roundResults: [],
      },
    });
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "tongs-audio", player(), "tongs_1_r1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          state,
          "tongs-audio",
          player({ id: "p2", teamId: "lake" }),
          "tongs_1_r1",
          10_000,
        ),
      ),
    ).toBe(403);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "tongs-audio", player(), "tongs_1_r2", 10_000),
      ),
    ).toBe(409);
  });

  test("authorizes Cross audio independently for the two current accomplices", () => {
    const state = roomState({
      players: [player(), player({ id: "p2", teamId: "lake" }), player({ id: "p3" })],
      currentGame: "crossexamination",
      crossexamination: {
        runId: "cross_1",
        status: "capturing",
        participantIds: ["p1", "p2", "p3"],
        pairOrder: [
          {
            pairId: "cross_1_p1",
            playerAId: "p1",
            playerAName: "Ada",
            playerBId: "p2",
            playerBName: "Bo",
          },
        ],
        pairNumber: 1,
        totalPairs: 1,
        currentPairId: "cross_1_p1",
        submittedPlayerIds: [],
        predictionVoterIds: [],
        pairResults: [],
        recordingEndsAt: 20_000,
      },
    });
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "cross-audio", player(), "cross_1_p1", 10_000),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          state,
          "cross-audio",
          player({ id: "p2", teamId: "lake" }),
          "cross_1_p1",
          10_000,
        ),
      ),
    ).toBe(0);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(state, "cross-audio", player({ id: "p3" }), "cross_1_p1", 10_000),
      ),
    ).toBe(403);
    expect(
      rejectedStatus(() =>
        assertPlayerMayUpload(
          {
            ...state,
            crossexamination: { ...state.crossexamination!, submittedPlayerIds: ["p1"] },
          },
          "cross-audio",
          player(),
          "cross_1_p1",
          10_000,
        ),
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
      assertPlayerStoragePath({
        storagePath: "room_1/oracle/oracle_1/p1-123.jpg",
        roomId: "room_1",
        kind: "oracle",
        roundId: "oracle_1",
        playerId: "p1",
      }),
    ).toBe("room_1/oracle/oracle_1/p1-123.jpg");
    expect(
      assertPlayerStoragePath({
        storagePath: "room_1/crossexamination/cross_1_p1/p1-123.webm",
        roomId: "room_1",
        kind: "crossexamination",
        roundId: "cross_1_p1",
        playerId: "p1",
      }),
    ).toBe("room_1/crossexamination/cross_1_p1/p1-123.webm");

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
