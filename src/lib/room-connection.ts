export type RoomConnectionStatus = "connecting" | "live" | "reconnecting" | "offline" | "error";

type VersionedRoomSnapshot = {
  id: string;
  updatedAt?: string;
};

function validRevision(value: string | undefined) {
  if (!value) return null;
  const epochMs = Date.parse(value);
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
  const subMillisecond = fraction.padEnd(9, "0").slice(3, 9);
  return Number.isFinite(epochMs) ? { epochMs, subMillisecond } : null;
}

/**
 * Keeps room state monotonic when an HTTP refresh and Supabase realtime UPDATEs
 * complete out of order. Equal revisions are deliberately ignored: a host
 * command may already have applied its returned state locally while retaining
 * the pre-command revision until the committed UPDATE arrives.
 *
 * Unversioned snapshots retain the legacy last-arrival-wins behavior only when
 * both sides are unversioned. Once a valid revision has been observed, an
 * unversioned payload can no longer replace it.
 */
export function chooseMonotonicRoomSnapshot<T extends VersionedRoomSnapshot>(
  current: T | null,
  incoming: T,
): T {
  if (!current || current.id !== incoming.id) return incoming;

  const currentRevision = validRevision(current.updatedAt);
  const incomingRevision = validRevision(incoming.updatedAt);
  if (!currentRevision && !incomingRevision) return incoming;
  if (!currentRevision) return incoming;
  if (!incomingRevision) return current;
  if (incomingRevision.epochMs !== currentRevision.epochMs) {
    return incomingRevision.epochMs > currentRevision.epochMs ? incoming : current;
  }

  if (incomingRevision.subMillisecond === currentRevision.subMillisecond) return current;
  return incomingRevision.subMillisecond > currentRevision.subMillisecond ? incoming : current;
}

export function roomConnectionStatusAfterRealtime(
  realtimeStatus: string,
  online: boolean,
): RoomConnectionStatus {
  if (!online) return "offline";
  return realtimeStatus === "SUBSCRIBED" ? "live" : "reconnecting";
}

export function shouldResyncVisibleRoom(online: boolean, visibilityState: string) {
  return online && visibilityState === "visible";
}
