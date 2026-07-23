import type { DeviceCheckStatus, Player, PlayerDeviceCheck } from "./types";

export function deviceCheckStatusFromError(error: unknown): Exclude<DeviceCheckStatus, "ready"> {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return "unavailable";
  }
  return "error";
}

export function isPlayerDeviceReady(player: Player) {
  return player.deviceCheck?.camera === "ready" && player.deviceCheck.microphone === "ready";
}

export function playerDeviceCheckStatus(
  check: PlayerDeviceCheck | undefined,
): DeviceCheckStatus | "unchecked" {
  if (!check) return "unchecked";
  if (check.camera === "ready" && check.microphone === "ready") return "ready";
  if (check.camera === "denied" || check.microphone === "denied") return "denied";
  if (check.camera === "unavailable" || check.microphone === "unavailable") {
    return "unavailable";
  }
  return "error";
}

export function summarizePlayerDeviceChecks(players: Player[]) {
  const checked = players.filter((player) => !!player.deviceCheck).length;
  const ready = players.filter(isPlayerDeviceReady).length;
  return {
    total: players.length,
    checked,
    ready,
    blocked: checked - ready,
  };
}
