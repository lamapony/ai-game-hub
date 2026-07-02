import { describe, expect, test } from "bun:test";
import { applySpeakerStatus } from "./speaker-actions.server";
import { emptyRoomState } from "./types";

async function rejectedStatus(run: () => unknown) {
  try {
    run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("speaker server actions", () => {
  test("marks a speaker connected and preserves its configured name", () => {
    const state = emptyRoomState("Host");
    const next = applySpeakerStatus(
      {
        ...state,
        speakerSlots: {
          ...state.speakerSlots,
          2: { connected: false, name: "Custom Oak" },
        },
      },
      { slot: 2, connected: true },
      1234,
    );

    expect(next.speakerSlots[2]?.connected).toBe(true);
    expect(next.speakerSlots[2]?.name).toBe("Custom Oak");
    expect(next.speakerSlots[2]?.lastSeenAt).toBe(1234);
  });

  test("marks a speaker disconnected without erasing last seen time", () => {
    const state = emptyRoomState("Host");
    const next = applySpeakerStatus(
      {
        ...state,
        speakerSlots: {
          ...state.speakerSlots,
          3: { connected: true, name: "Wind", lastSeenAt: 1000 },
        },
      },
      { slot: 3, connected: false },
      2000,
    );

    expect(next.speakerSlots[3]?.connected).toBe(false);
    expect(next.speakerSlots[3]?.lastSeenAt).toBe(1000);
  });

  test("rejects invalid speaker slots", async () => {
    expect(
      await rejectedStatus(() => applySpeakerStatus(emptyRoomState("Host"), { slot: 9 })),
    ).toBe(400);
  });
});
