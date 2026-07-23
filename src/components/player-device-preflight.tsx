import { useState } from "react";
import { deviceCheckStatusFromError, playerDeviceCheckStatus } from "@/lib/device-readiness";
import { friendlyMediaError } from "@/lib/media-errors";
import { friendlyPlayerActionError } from "@/lib/player-action-errors";
import { postPlayerAction, type StoredPlayer } from "@/lib/player-action-client";
import type { DeviceCheckStatus, PlayerDeviceCheck, RoomState } from "@/lib/types";

const STATUS_COPY: Record<DeviceCheckStatus | "unchecked", { title: string; detail: string }> = {
  unchecked: {
    title: "Camera + mic not checked",
    detail: "A 10-second check now prevents a permissions ambush halfway through the party.",
  },
  ready: {
    title: "Camera + mic ready",
    detail: "No recording was kept. This phone is ready for the media rounds.",
  },
  denied: {
    title: "Access blocked",
    detail: "Allow camera and microphone in site settings, then try the check again.",
  },
  unavailable: {
    title: "Camera or mic unavailable",
    detail: "Close other apps using them, or open the room in another browser.",
  },
  error: {
    title: "Device check failed",
    detail: "Try again. If it repeats, use another phone for camera and audio rounds.",
  },
};

export function PlayerDevicePreflight({
  roomId,
  player,
  current,
  onRoomState,
}: {
  roomId: string;
  player: StoredPlayer;
  current?: PlayerDeviceCheck;
  onRoomState: (state: RoomState) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [localCheck, setLocalCheck] = useState<PlayerDeviceCheck | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const check = localCheck ?? current;
  const status = playerDeviceCheckStatus(check);
  const copy = STATUS_COPY[status];

  async function runCheck() {
    if (checking) return;
    setChecking(true);
    setMessage(null);
    setSaveError(null);
    let stream: MediaStream | undefined;
    let resultStatus: DeviceCheckStatus = "error";

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        resultStatus = "unavailable";
        setMessage(
          "This browser cannot open camera and microphone. Use Safari or Chrome over HTTPS.",
        );
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: { ideal: "environment" } },
        });
        resultStatus =
          stream.getAudioTracks().length > 0 && stream.getVideoTracks().length > 0
            ? "ready"
            : "unavailable";
        if (resultStatus !== "ready") {
          setMessage("The browser opened media, but did not expose both a camera and microphone.");
        }
      }
    } catch (error) {
      resultStatus = deviceCheckStatusFromError(error);
      setMessage(friendlyMediaError(error, "camera-microphone"));
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }

    try {
      const response = await postPlayerAction(roomId, {
        action: "device-check",
        playerId: player.id,
        cameraStatus: resultStatus,
        microphoneStatus: resultStatus,
      });
      onRoomState(response.state);
      setLocalCheck(
        response.state.players.find((candidate) => candidate.id === player.id)?.deviceCheck,
      );
    } catch (error) {
      setSaveError(
        `The check ran, but the host did not receive it. ${friendlyPlayerActionError(error, "device check")}`,
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <section data-testid="device-preflight" data-status={status} className="agh-device-preflight">
      <div className="agh-device-preflight-meta">
        <span>Camera + microphone</span>
        <b>{status}</b>
      </div>
      <strong>{copy.title}</strong>
      <p>{copy.detail}</p>
      <button
        data-testid="device-preflight-check"
        type="button"
        disabled={checking}
        onClick={() => void runCheck()}
      >
        {checking ? "Checking…" : status === "unchecked" ? "Check this phone" : "Run check again"}
      </button>
      {message && (
        <p data-testid="device-preflight-message" className="agh-device-preflight-message">
          {message}
        </p>
      )}
      {saveError && (
        <p data-testid="device-preflight-save-error" className="agh-device-preflight-error">
          {saveError}
        </p>
      )}
    </section>
  );
}
