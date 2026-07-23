import { describe, expect, test } from "bun:test";
import {
  roomStateConflictError,
  type RoomStateSnapshot,
  updateRoomStateWithOptimisticRetry,
} from "./room-state-retry.server";
import { emptyRoomState, type RoomState } from "./types";

function stateWithVotes(votes: Record<string, string> = {}): RoomState {
  return {
    ...emptyRoomState("Host"),
    status: "playing",
    currentGame: "whoamong",
    whoamong: {
      phase: "voting",
      roundId: "wa_1",
      roundNumber: 1,
      totalRounds: 5,
      usedPromptIds: [],
      prompt: "Who keeps the group chat alive?",
      votes,
    },
  };
}

async function rejectedStatus(run: () => Promise<unknown>) {
  try {
    await run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("updateRoomStateWithOptimisticRetry", () => {
  test("re-reads state after a write conflict before applying the action again", async () => {
    const snapshots: RoomStateSnapshot[] = [
      { id: "room_1", code: "ABCD", updatedAt: "t1", state: stateWithVotes() },
      { id: "room_1", code: "ABCD", updatedAt: "t2", state: stateWithVotes({ p1: "p2" }) },
    ];
    const writtenStates: RoomState[] = [];

    const result = await updateRoomStateWithOptimisticRetry({
      loadSnapshot: async () => snapshots.shift()!,
      applyUpdate: async (snapshot) => {
        const whoamong = snapshot.state.whoamong!;
        const nextState = {
          ...snapshot.state,
          whoamong: {
            ...whoamong,
            votes: { ...(whoamong.votes ?? {}), p3: "p1" },
          },
        };
        return { state: nextState, value: nextState.whoamong!.votes };
      },
      writeSnapshot: async (_snapshot, state) => {
        writtenStates.push(state);
        return writtenStates.length === 2;
      },
    });

    expect(result.attempts).toBe(2);
    expect(result.value).toEqual({ p1: "p2", p3: "p1" });
    expect(writtenStates[0]?.whoamong?.votes).toEqual({ p3: "p1" });
    expect(writtenStates[1]?.whoamong?.votes).toEqual({ p1: "p2", p3: "p1" });
  });

  test("surfaces persistent conflicts as 409", async () => {
    const status = await rejectedStatus(() =>
      updateRoomStateWithOptimisticRetry({
        loadSnapshot: async () => ({
          id: "room_1",
          updatedAt: "t1",
          state: stateWithVotes(),
        }),
        applyUpdate: async (snapshot) => ({ state: snapshot.state, value: null }),
        writeSnapshot: async () => false,
        maxAttempts: 2,
      }),
    );

    expect(status).toBe(409);
    expect((roomStateConflictError() as { status?: number }).status).toBe(409);
  });

  test("awaits conflict backoff before loading the next snapshot", async () => {
    const events: string[] = [];
    let writes = 0;

    const result = await updateRoomStateWithOptimisticRetry({
      loadSnapshot: async () => {
        events.push("load");
        return { id: "room_1", updatedAt: `t${writes}`, state: stateWithVotes() };
      },
      applyUpdate: async (snapshot) => ({ state: snapshot.state, value: "ok" }),
      writeSnapshot: async () => {
        writes += 1;
        events.push("write");
        return writes === 2;
      },
      onConflict: async () => {
        events.push("backoff-start");
        await Promise.resolve();
        events.push("backoff-end");
      },
    });

    expect(result.attempts).toBe(2);
    expect(events).toEqual(["load", "write", "backoff-start", "backoff-end", "load", "write"]);
  });
});
