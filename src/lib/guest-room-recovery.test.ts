import { describe, expect, test } from "bun:test";
import { guestRoomFailureKind, ROOM_NOT_FOUND_ERROR } from "./guest-room-recovery";

describe("guest room recovery", () => {
  test("rejects malformed and ambiguous room codes before lookup", () => {
    expect(guestRoomFailureKind("ABC", null)).toBe("invalid-code");
    expect(guestRoomFailureKind("O0I1", null)).toBe("invalid-code");
    expect(guestRoomFailureKind("ABCDE", null)).toBe("invalid-code");
  });

  test("distinguishes a missing room from a temporary lookup failure", () => {
    expect(guestRoomFailureKind("AB2Z", ROOM_NOT_FOUND_ERROR)).toBe("not-found");
    expect(guestRoomFailureKind("AB2Z", "Failed to fetch")).toBe("unavailable");
    expect(guestRoomFailureKind("AB2Z", null)).toBe("unavailable");
  });
});
