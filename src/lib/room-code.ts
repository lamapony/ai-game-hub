export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

function cleanRoomCodeInput(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, "");
}

/** Normalize what a guest can reasonably paste while keeping ambiguous characters visible. */
export function normalizeRoomCodeInput(value: string): string {
  return cleanRoomCodeInput(value).slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(cleanRoomCodeInput(value));
}
