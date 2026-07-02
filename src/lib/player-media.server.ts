import { randomUUID } from "node:crypto";
import type { Player, RoomState } from "./types";
import { cleanId, statusError } from "./player-auth.server";

export const RECORDINGS_BUCKET = "recordings";
export const UPLOAD_GRACE_MS = 30_000;

export type PlayerUploadAction = "soundscape-audio" | "challenge-video" | "photo";
export type PlayerMediaKind = "soundscape" | "challenge" | "photos";

const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "video/webm": "webm",
};

const VIDEO_MIME_EXT: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
};

const PHOTO_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
};

export function cleanMimeType(value: unknown) {
  if (typeof value !== "string") throw statusError("mimeType required", 400);
  const mime = value.trim().toLowerCase().split(";")[0] ?? "";
  if (!mime) throw statusError("mimeType required", 400);
  return mime;
}

export function mediaKindForAction(action: PlayerUploadAction): PlayerMediaKind {
  if (action === "soundscape-audio") return "soundscape";
  if (action === "challenge-video") return "challenge";
  return "photos";
}

export function extensionForUpload(action: PlayerUploadAction, mimeType: unknown) {
  const mime = cleanMimeType(mimeType);
  const map =
    action === "soundscape-audio"
      ? AUDIO_MIME_EXT
      : action === "challenge-video"
        ? VIDEO_MIME_EXT
        : PHOTO_MIME_EXT;
  const extension = map[mime];
  if (!extension) throw statusError("mimeType not allowed", 400);
  return { mime, extension };
}

export function buildPlayerUploadPath(params: {
  roomId: string;
  action: PlayerUploadAction;
  roundId: string;
  playerId: string;
  extension: string;
  now?: number;
}) {
  const kind = mediaKindForAction(params.action);
  return `${params.roomId}/${kind}/${params.roundId}/${params.playerId}-${params.now ?? Date.now()}-${randomUUID()}.${params.extension}`;
}

export function expectedPlayerStoragePrefix(params: {
  roomId: string;
  kind: PlayerMediaKind;
  roundId: string;
  playerId: string;
}) {
  return `${params.roomId}/${params.kind}/${params.roundId}/${params.playerId}-`;
}

export function assertPlayerStoragePath(params: {
  storagePath: unknown;
  roomId: string;
  kind: PlayerMediaKind;
  roundId: string;
  playerId: string;
}) {
  if (typeof params.storagePath !== "string") throw statusError("storagePath required", 400);
  const storagePath = params.storagePath.trim();
  if (!storagePath || storagePath.length > 512 || storagePath.includes("..")) {
    throw statusError("storagePath invalid", 400);
  }
  const prefix = expectedPlayerStoragePrefix(params);
  if (!storagePath.startsWith(prefix)) throw statusError("storagePath not authorized", 403);
  return storagePath;
}

export function assertPlayerMayUpload(
  state: RoomState,
  action: PlayerUploadAction,
  player: Player,
  roundId: string,
  now = Date.now(),
) {
  if (action === "soundscape-audio") {
    const soundscape = state.soundscape;
    if (state.currentGame !== "soundscape" || !soundscape || soundscape.phase !== "recording") {
      throw statusError("soundscape recording is closed", 409);
    }
    if (soundscape.roundId !== roundId) throw statusError("round mismatch", 409);
    if (soundscape.recordingEndsAt && now > soundscape.recordingEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("soundscape recording is closed", 409);
    }
    return;
  }

  if (action === "challenge-video") {
    const challenge = state.challenge;
    if (state.currentGame !== "challenge" || !challenge || challenge.phase !== "recording") {
      throw statusError("challenge recording is closed", 409);
    }
    if (challenge.roundId !== roundId) throw statusError("round mismatch", 409);
    if (challenge.operatorId !== player.id) throw statusError("only operator can submit", 403);
    if (challenge.recordingEndsAt && now > challenge.recordingEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("challenge recording is closed", 409);
    }
    return;
  }

  const phototunt = state.phototunt;
  if (state.currentGame !== "phototunt" || !phototunt || phototunt.phase !== "hunting") {
    throw statusError("photo hunt is closed", 409);
  }
  if (phototunt.roundId !== roundId) throw statusError("round mismatch", 409);
  if (phototunt.hunterIds?.length && !phototunt.hunterIds.includes(player.id)) {
    throw statusError("player is not in this hunt", 403);
  }
  if (phototunt.huntEndsAt && now > phototunt.huntEndsAt + UPLOAD_GRACE_MS) {
    throw statusError("photo hunt is closed", 409);
  }
}

export function cleanRoundId(value: unknown) {
  return cleanId(value, "roundId");
}
