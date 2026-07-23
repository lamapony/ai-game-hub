import { describe, expect, test } from "bun:test";
import {
  isValidRoomCode,
  normalizeRoomCodeInput,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./room-code";

describe("room code input", () => {
  test("normalizes pasted separators, case and excess input", () => {
    expect(normalizeRoomCodeInput(" a-b c d ")).toBe("ABCD");
    expect(normalizeRoomCodeInput("abcde")).toBe("ABCD");
  });

  test("accepts exactly the unambiguous generated alphabet", () => {
    expect(ROOM_CODE_LENGTH).toBe(4);
    expect(/[IO01]/.test(ROOM_CODE_ALPHABET)).toBe(false);
    expect(isValidRoomCode("ab2z")).toBe(true);
    expect(isValidRoomCode("ABOZ")).toBe(false);
    expect(isValidRoomCode("AB1Z")).toBe(false);
    expect(isValidRoomCode("ABC")).toBe(false);
    expect(isValidRoomCode("ABCDE")).toBe(false);
  });
});
