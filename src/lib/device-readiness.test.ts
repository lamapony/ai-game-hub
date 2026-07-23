import { describe, expect, test } from "bun:test";
import {
  deviceCheckStatusFromError,
  isPlayerDeviceReady,
  playerDeviceCheckStatus,
  summarizePlayerDeviceChecks,
} from "./device-readiness";
import type { Player } from "./types";

function player(id: string, status?: "ready" | "denied" | "unavailable" | "error"): Player {
  return {
    id,
    name: id,
    teamId: "forest",
    joinedAt: 1,
    ...(status ? { deviceCheck: { camera: status, microphone: status, checkedAt: 100 } } : {}),
  };
}

describe("player device readiness", () => {
  test("classifies permission, missing-device and unknown failures", () => {
    expect(deviceCheckStatusFromError(new DOMException("denied", "NotAllowedError"))).toBe(
      "denied",
    );
    expect(deviceCheckStatusFromError(new DOMException("missing", "NotFoundError"))).toBe(
      "unavailable",
    );
    expect(deviceCheckStatusFromError(new Error("camera crashed"))).toBe("error");
  });

  test("counts only players with both camera and microphone ready", () => {
    const mixed: Player = {
      ...player("mixed"),
      deviceCheck: { camera: "ready", microphone: "denied", checkedAt: 100 },
    };
    const players = [player("ready", "ready"), player("blocked", "denied"), mixed, player("new")];

    expect(isPlayerDeviceReady(players[0]!)).toBe(true);
    expect(isPlayerDeviceReady(mixed)).toBe(false);
    expect(playerDeviceCheckStatus(mixed.deviceCheck)).toBe("denied");
    expect(playerDeviceCheckStatus(undefined)).toBe("unchecked");
    expect(summarizePlayerDeviceChecks(players)).toEqual({
      total: 4,
      checked: 3,
      ready: 1,
      blocked: 2,
    });
  });
});
