import { getQuickStartReadiness, type QuickStartReadiness } from "./quick-start";
import type { RoomState } from "./types";

export const QUICK_START_LAUNCH_COACH_STATES = [
  "repair-program",
  "repair-capacity",
  "checking-backend",
  "repair-backend",
  "invite-guests",
  "ready-to-start",
] as const;

export type QuickStartLaunchCoachState = (typeof QUICK_START_LAUNCH_COACH_STATES)[number];
export type QuickStartLaunchCoachAction =
  "home" | "live-safety" | "players" | "show-qr" | "start" | "wait";
export type QuickStartLaunchCoachTone = "blocked" | "waiting" | "ready";
export type QuickStartLaunchBackendStatus = "checking" | "ready" | "degraded" | "error";
export const QUICK_START_LAUNCH_SIGNALS = [
  "REBUILD.",
  "CHECK.",
  "FIX.",
  "REDUCE.",
  "INVITE.",
  "START.",
] as const;
export type QuickStartLaunchSignal = (typeof QUICK_START_LAUNCH_SIGNALS)[number];

export type QuickStartLaunchCoach = {
  state: QuickStartLaunchCoachState;
  tone: QuickStartLaunchCoachTone;
  signal: QuickStartLaunchSignal;
  title: string;
  detail: string;
  action: QuickStartLaunchCoachAction;
  actionLabel: string;
};

export function getCurrentQuickStartLaunchSignal(
  state: RoomState,
  backendStatus: QuickStartLaunchBackendStatus,
): QuickStartLaunchSignal | undefined {
  if (!state.quickStart || state.quickStart.startedAt !== undefined) return undefined;
  const readiness = getQuickStartReadiness(state);
  return readiness ? buildQuickStartLaunchCoach(readiness, backendStatus).signal : undefined;
}

export function buildQuickStartLaunchCoach(
  readiness: QuickStartReadiness,
  backendStatus: QuickStartLaunchBackendStatus,
): QuickStartLaunchCoach {
  if (!readiness.routeMatchesPromise) {
    return {
      state: "repair-program",
      tone: "blocked",
      signal: "REBUILD.",
      title: "Rebuild this room before inviting guests",
      detail: `The route is ${readiness.routeDurationMinutes} minutes, not the promised duration. Create a fresh Quick Start so the evening does not drift later.`,
      action: "home",
      actionLabel: "Create a fresh room",
    };
  }

  if (backendStatus === "checking") {
    return {
      state: "checking-backend",
      tone: "waiting",
      signal: "CHECK.",
      title: "Keep this tab open for the live check",
      detail:
        "Private story memory, scoring, uploads and AI are being checked before guests arrive.",
      action: "wait",
      actionLabel: "Checking the live service…",
    };
  }

  if (backendStatus !== "ready") {
    return {
      state: "repair-backend",
      tone: "blocked",
      signal: "FIX.",
      title: "Fix the live service before starting",
      detail:
        "Open Live safety and press Retry after the named check is fixed. Guests already in the room will not lose their place.",
      action: "live-safety",
      actionLabel: "Open Live safety",
    };
  }

  if (!readiness.withinPlayerCapacity) {
    return {
      state: "repair-capacity",
      tone: "blocked",
      signal: "REDUCE.",
      title: "Remove duplicate phones before starting",
      detail: `This lobby has ${readiness.joinedPlayers}/${readiness.maximumPlayers} player identities. Remove duplicates or inactive phones from Players until the count is ${readiness.maximumPlayers} or lower.`,
      action: "players",
      actionLabel: "Review player list",
    };
  }

  const missingPlayers = Math.max(0, readiness.minimumPlayers - readiness.joinedPlayers);
  if (missingPlayers > 0) {
    return {
      state: "invite-guests",
      tone: "waiting",
      signal: "INVITE.",
      title:
        missingPlayers === 1
          ? "Invite one more guest to unlock the start"
          : `Invite ${missingPlayers} more guests to unlock the start`,
      detail:
        readiness.joinedPlayers === 0
          ? `Show the room QR now. The route unlocks at ${readiness.minimumPlayers}; later arrivals can still join.`
          : `${readiness.joinedPlayers} joined. Keep the QR visible; nobody needs an app or account.`,
      action: "show-qr",
      actionLabel: "Show full-screen QR",
    };
  }

  const elapsedSeconds = Math.floor(readiness.elapsedMs / 1_000);
  const capacityDetail =
    readiness.joinedPlayers === readiness.maximumPlayers
      ? `Room is exactly ${readiness.joinedPlayers}/${readiness.maximumPlayers}; every place is accounted for.`
      : "Extra guests can join after the story begins.";
  return {
    state: "ready-to-start",
    tone: "ready",
    signal: "START.",
    title: "The room is ready. Open with the arrival cue.",
    detail: readiness.readyWithinTwoMinutes
      ? `All required checks passed in ${elapsedSeconds} seconds. ${capacityDetail}`
      : `All required checks passed. ${capacityDetail}`,
    action: "start",
    actionLabel: "Start the party",
  };
}
