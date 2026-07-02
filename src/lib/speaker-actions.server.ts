import { SPEAKER_NAMES, type RoomState } from "./types";

export type SpeakerStatusPayload = {
  slot?: number;
  connected?: boolean;
};

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function cleanSlot(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw statusError("valid speaker slot required", 400);
  }
  return value;
}

export function applySpeakerStatus(
  state: RoomState,
  payload: SpeakerStatusPayload,
  now = Date.now(),
): RoomState {
  const slot = cleanSlot(payload.slot);
  const connected = payload.connected === true;
  const slots = { ...(state.speakerSlots ?? {}) };
  const existing = slots[slot] ?? { connected: false, name: SPEAKER_NAMES[slot] };
  slots[slot] = {
    ...existing,
    connected,
    name: existing.name || SPEAKER_NAMES[slot],
    lastSeenAt: connected ? now : existing.lastSeenAt,
  };
  return { ...state, speakerSlots: slots };
}
