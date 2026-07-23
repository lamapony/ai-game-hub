import { describe, expect, test } from "bun:test";
import {
  friendlyRoomCreationError,
  friendlyRoomLookupError,
  roomLookupRecoveryCopy,
  ROOM_NOT_FOUND_ERROR,
  ROOM_OFFLINE_ERROR,
  ROOM_UNAVAILABLE_ERROR,
} from "./room-entry-errors";

describe("friendlyRoomCreationError", () => {
  test("turns browser network failures into connection recovery guidance", () => {
    const message = friendlyRoomCreationError(new TypeError("Failed to fetch"));

    expect(message).toContain("Check your connection");
    expect(message).toContain("setup is still here");
    expect(message.includes("Failed to fetch")).toBe(false);
  });

  test("asks the host to pause briefly after rate limiting", () => {
    const message = friendlyRoomCreationError({
      status: 429,
      message: "rate limit from private upstream",
    });

    expect(message).toContain("Wait a few seconds");
    expect(message).toContain("setup is still here");
    expect(message.includes("private upstream")).toBe(false);
  });

  test("turns schema failures into a temporary availability message", () => {
    const message = friendlyRoomCreationError({
      code: "42P01",
      message: 'relation "public.rooms" does not exist',
    });

    expect(message).toContain("temporarily unavailable");
    expect(message).toContain("Nothing was created");
    expect(message.includes("public.rooms")).toBe(false);
  });

  test("does not reveal an unknown raw error or embedded secret", () => {
    const message = friendlyRoomCreationError(
      new Error("Unexpected https://private.example?token=secret-sentinel"),
    );

    expect(message).toContain("Couldn’t create the room");
    expect(message).toContain("setup is still here");
    expect(message.includes("private.example")).toBe(false);
    expect(message.includes("secret-sentinel")).toBe(false);
    expect(message.toLowerCase().includes("token")).toBe(false);
  });

  test("recognizes string status codes without exposing their payload", () => {
    const message = friendlyRoomCreationError({
      statusCode: "503",
      message: "internal trace id: trace-sentinel",
    });

    expect(message).toContain("temporarily unavailable");
    expect(message.includes("trace-sentinel")).toBe(false);
  });
});

describe("room lookup recovery", () => {
  test("preserves only the public not-found sentinel", () => {
    expect(friendlyRoomLookupError(ROOM_NOT_FOUND_ERROR)).toBe(ROOM_NOT_FOUND_ERROR);
    expect(roomLookupRecoveryCopy("AB12", ROOM_NOT_FOUND_ERROR).failureKind).toBe("not-found");
  });

  test("maps network failures to an offline retry without raw details", () => {
    const error = friendlyRoomLookupError(
      new Error("Failed to fetch https://private.example?token=secret-sentinel"),
    );
    const copy = roomLookupRecoveryCopy("AB12", error);

    expect(error).toBe(ROOM_OFFLINE_ERROR);
    expect(copy.failureKind).toBe("offline");
    expect(copy.body).toContain("same room again");
    expect(copy.body.includes("private.example")).toBe(false);
  });

  test("maps unknown backend failures to a safe service retry", () => {
    const error = friendlyRoomLookupError({
      code: "PGRST204",
      message: "schema cache leaked-relation-sentinel",
    });
    const copy = roomLookupRecoveryCopy("AB12", error);

    expect(error).toBe(ROOM_UNAVAILABLE_ERROR);
    expect(copy.failureKind).toBe("unavailable");
    expect(copy.body).toContain("Try the same room again");
    expect(copy.body.includes("leaked-relation-sentinel")).toBe(false);
  });
});
