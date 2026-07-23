import { describe, expect, test } from "bun:test";
import {
  chooseMonotonicRoomSnapshot,
  roomConnectionStatusAfterRealtime,
  shouldResyncVisibleRoom,
} from "./room-connection";

describe("room reconnect policy", () => {
  test("treats a subscribed channel as live and all transient states as reconnecting", () => {
    expect(roomConnectionStatusAfterRealtime("SUBSCRIBED", true)).toBe("live");
    expect(roomConnectionStatusAfterRealtime("TIMED_OUT", true)).toBe("reconnecting");
    expect(roomConnectionStatusAfterRealtime("CHANNEL_ERROR", true)).toBe("reconnecting");
    expect(roomConnectionStatusAfterRealtime("CLOSED", true)).toBe("reconnecting");
  });

  test("offline wins and foregrounding triggers a fresh snapshot only when online", () => {
    expect(roomConnectionStatusAfterRealtime("SUBSCRIBED", false)).toBe("offline");
    expect(shouldResyncVisibleRoom(true, "visible")).toBe(true);
    expect(shouldResyncVisibleRoom(false, "visible")).toBe(false);
    expect(shouldResyncVisibleRoom(true, "hidden")).toBe(false);
  });
});

describe("room snapshot ordering", () => {
  const snapshot = (state: string, updatedAt?: string) => ({
    id: "room_1",
    state,
    updatedAt,
  });

  test("ignores delayed and duplicate revisions after a local host command result", () => {
    const revision = "2026-07-18T12:00:00.123456+00:00";
    const locallyApplied = snapshot("hub", revision);

    expect(
      chooseMonotonicRoomSnapshot(
        locallyApplied,
        snapshot("stale-active-game", "2026-07-18T12:00:00.123455+00:00"),
      ),
    ).toBe(locallyApplied);
    expect(
      chooseMonotonicRoomSnapshot(locallyApplied, snapshot("stale-active-game", revision)),
    ).toBe(locallyApplied);
  });

  test("accepts the committed newer revision, including sub-millisecond ordering", () => {
    const current = snapshot("active-game", "2026-07-18T12:00:00.123455+00:00");
    const committed = snapshot("hub", "2026-07-18T12:00:00.123456+00:00");

    expect(chooseMonotonicRoomSnapshot(current, committed)).toBe(committed);
  });

  test("keeps legacy arrival ordering until a valid revision has been observed", () => {
    const legacyCurrent = snapshot("one");
    const legacyIncoming = snapshot("two");
    const versioned = snapshot("three", "2026-07-18T12:00:01Z");

    expect(chooseMonotonicRoomSnapshot(legacyCurrent, legacyIncoming)).toBe(legacyIncoming);
    expect(chooseMonotonicRoomSnapshot(legacyIncoming, versioned)).toBe(versioned);
    expect(chooseMonotonicRoomSnapshot(versioned, legacyIncoming)).toBe(versioned);
  });
});
