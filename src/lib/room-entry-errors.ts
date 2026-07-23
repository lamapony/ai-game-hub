type ErrorRecord = Record<string, unknown>;

export const ROOM_NOT_FOUND_ERROR = "Room not found";
export const ROOM_OFFLINE_ERROR = "Device is offline";
export const ROOM_UNAVAILABLE_ERROR = "Room service unavailable";

export type RoomLookupFailureKind = "not-found" | "offline" | "unavailable";

const NETWORK_MARKERS = [
  "failed to fetch",
  "load failed",
  "networkerror",
  "network error",
  "network request failed",
  "connection refused",
  "connection reset",
  "offline",
];

const RATE_LIMIT_MARKERS = ["rate limit", "rate-limit", "too many requests", "too many rooms"];

const SERVICE_MARKERS = [
  "pgrst",
  "postgres",
  "schema cache",
  "relation",
  "column",
  "permission denied",
  "row-level security",
  "supabase",
  "service_role",
  "jwt",
  "database",
];

function errorRecord(error: unknown): ErrorRecord | null {
  return error !== null && typeof error === "object" ? (error as ErrorRecord) : null;
}

function errorFingerprint(error: unknown) {
  if (typeof error === "string") return error.toLowerCase();

  const record = errorRecord(error);
  if (!record) return "";

  return [record.name, record.message, record.code, record.status, record.statusCode]
    .filter(
      (value): value is string | number => typeof value === "string" || typeof value === "number",
    )
    .join(" ")
    .toLowerCase();
}

function errorStatus(error: unknown) {
  const record = errorRecord(error);
  if (!record) return null;

  for (const candidate of [record.status, record.statusCode]) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && /^\d{3}$/.test(candidate)) return Number(candidate);
  }

  return null;
}

function includesMarker(fingerprint: string, markers: readonly string[]) {
  return markers.some((marker) => fingerprint.includes(marker));
}

/**
 * Converts infrastructure failures into host-safe recovery guidance.
 * Raw backend messages must never reach the public room-creation screen.
 */
export function friendlyRoomCreationError(error: unknown) {
  const fingerprint = errorFingerprint(error);
  const status = errorStatus(error);

  if (status === 429 || includesMarker(fingerprint, RATE_LIMIT_MARKERS)) {
    return "Too many rooms are starting at once. Wait a few seconds and try again. Your setup is still here.";
  }

  if (includesMarker(fingerprint, NETWORK_MARKERS)) {
    return "Couldn’t reach the party service. Check your connection and try again. Your setup is still here.";
  }

  if ((status !== null && status >= 500) || includesMarker(fingerprint, SERVICE_MARKERS)) {
    return "Live rooms are temporarily unavailable. Nothing was created. Try again in a moment. Your setup is still here.";
  }

  return "Couldn’t create the room. Nothing was created. Your setup is still here. Try again.";
}

/** Keeps useRoom state useful to UI without storing raw infrastructure payloads. */
export function friendlyRoomLookupError(error: unknown) {
  const fingerprint = errorFingerprint(error);

  if (fingerprint === ROOM_NOT_FOUND_ERROR.toLowerCase()) return ROOM_NOT_FOUND_ERROR;
  if (includesMarker(fingerprint, NETWORK_MARKERS)) return ROOM_OFFLINE_ERROR;
  return ROOM_UNAVAILABLE_ERROR;
}

export function roomLookupFailureKind(error: string | null): RoomLookupFailureKind {
  if (error === ROOM_NOT_FOUND_ERROR) return "not-found";
  if (error === ROOM_OFFLINE_ERROR) return "offline";
  return "unavailable";
}

export function roomLookupRecoveryCopy(code: string, error: string | null) {
  const failureKind = roomLookupFailureKind(error);

  if (failureKind === "not-found") {
    return {
      failureKind,
      title: `Room ${code} is not live`,
      body: "Check the code on the host screen. If the host started a new room, open that link instead.",
    };
  }

  if (failureKind === "offline") {
    return {
      failureKind,
      title: "No room signal",
      body: "Reconnect this device, then check the same room again. You do not need to start over.",
    };
  }

  return {
    failureKind,
    title: `Couldn’t check room ${code}`,
    body: "The party service did not answer. Try the same room again in a moment.",
  };
}
