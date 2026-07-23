import { isValidRoomCode } from "./room-code";
import { ROOM_NOT_FOUND_ERROR } from "./room-entry-errors";

export { ROOM_NOT_FOUND_ERROR } from "./room-entry-errors";

export type GuestRoomFailureKind = "invalid-code" | "not-found" | "unavailable";

export function guestRoomFailureKind(code: string, error: string | null): GuestRoomFailureKind {
  if (!isValidRoomCode(code)) return "invalid-code";
  return error === ROOM_NOT_FOUND_ERROR ? "not-found" : "unavailable";
}
