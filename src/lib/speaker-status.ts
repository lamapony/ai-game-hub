import type { RoomState } from "./types";

export const SPEAKER_HEARTBEAT_MS = 10_000;
export const SPEAKER_STALE_MS = 30_000;

export type SpeakerSlot = RoomState["speakerSlots"][number];
export type SpeakerReadiness = "host" | "ready" | "stale" | "offline";

export function speakerReadiness(
  slot: number,
  speaker: SpeakerSlot | undefined,
  now = Date.now(),
): {
  status: SpeakerReadiness;
  label: string;
  ageMs?: number;
} {
  if (slot === 1) {
    return { status: "host", label: "ведущий", ageMs: 0 };
  }

  if (!speaker?.connected) {
    return { status: "offline", label: "офлайн" };
  }

  if (typeof speaker.lastSeenAt !== "number") {
    return { status: "stale", label: "проверь" };
  }

  const ageMs = Math.max(0, now - speaker.lastSeenAt);
  if (ageMs > SPEAKER_STALE_MS) {
    return { status: "stale", label: "проверь", ageMs };
  }

  return { status: "ready", label: "на связи", ageMs };
}

export function formatSpeakerHeartbeatAge(ageMs: number | undefined) {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs)) return "нет heartbeat";
  if (ageMs < 2_000) return "только что";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)} сек назад`;
  return `${Math.round(ageMs / 60_000)} мин назад`;
}
