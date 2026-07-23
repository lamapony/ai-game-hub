import { randomUUID } from "node:crypto";
import type { Player, RoomState } from "./types";
import { cleanId, statusError } from "./player-auth.server";

export const RECORDINGS_BUCKET = "recordings";
export const UPLOAD_GRACE_MS = 30_000;
/** Covers a full event but expires well before the default 24-hour cleanup window. */
export const PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

export type PlayerUploadAction =
  | "soundscape-audio"
  | "challenge-video"
  | "photo"
  | "oracle-photo"
  | "toast-audio"
  | "stilllife-photo"
  | "sommelier-photo"
  | "contraband-audio"
  | "tongs-audio"
  | "cross-audio";
export type PlayerMediaKind =
  | "soundscape"
  | "challenge"
  | "photos"
  | "oracle"
  | "toastsyndicate"
  | "stilllife"
  | "sommelier"
  | "contraband"
  | "tongsoftruth"
  | "crossexamination";

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
  if (action === "oracle-photo") return "oracle";
  if (action === "toast-audio") return "toastsyndicate";
  if (action === "stilllife-photo") return "stilllife";
  if (action === "sommelier-photo") return "sommelier";
  if (action === "contraband-audio") return "contraband";
  if (action === "tongs-audio") return "tongsoftruth";
  if (action === "cross-audio") return "crossexamination";
  return "photos";
}

export function extensionForUpload(action: PlayerUploadAction, mimeType: unknown) {
  const mime = cleanMimeType(mimeType);
  const map =
    action === "soundscape-audio" ||
    action === "toast-audio" ||
    action === "contraband-audio" ||
    action === "tongs-audio" ||
    action === "cross-audio"
      ? AUDIO_MIME_EXT
      : action === "challenge-video"
        ? VIDEO_MIME_EXT
        : PHOTO_MIME_EXT;
  const extension = map[mime];
  if (!extension) throw statusError("mimeType not allowed", 400);
  return { mime, extension };
}

export function assertStorageObjectExists(exists: { data?: boolean | null; error?: unknown }) {
  if (exists.error) throw exists.error;
  if (!exists.data) throw statusError("storage object missing", 409);
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
  if (action === "cross-audio") {
    const run = state.crossexamination;
    if (!run || state.currentGame !== "crossexamination" || run.status !== "capturing") {
      throw statusError("Cross microphone is closed", 409);
    }
    if (run.currentPairId !== roundId) throw statusError("pair mismatch", 409);
    const pair = run.pairOrder[run.pairNumber - 1];
    if (!pair || ![pair.playerAId, pair.playerBId].includes(player.id)) {
      throw statusError("only the current accomplices can submit", 403);
    }
    if (run.submittedPlayerIds.includes(player.id)) {
      throw statusError("testimony already submitted", 409);
    }
    if (run.recordingEndsAt && now > run.recordingEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("Cross microphone is closed", 409);
    }
    return;
  }

  if (action === "tongs-audio") {
    const run = state.tongsoftruth;
    if (!run || run.status !== "recording") {
      throw statusError("Tongs microphone is closed", 409);
    }
    if (run.currentRoundId !== roundId) throw statusError("round mismatch", 409);
    if (run.speakerPlayerId !== player.id) {
      throw statusError("only the player holding the tongs can submit", 403);
    }
    if (run.recordingEndsAt && now > run.recordingEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("Tongs microphone is closed", 409);
    }
    return;
  }

  if (action === "contraband-audio") {
    const run = state.contraband;
    if (!run || run.status !== "awaiting-audio") {
      throw statusError("Contraband recording is closed", 409);
    }
    if (run.runId !== roundId) throw statusError("run mismatch", 409);
    if (run.activeAccusation?.accusedPlayerId !== player.id) {
      throw statusError("only the accused player can submit", 403);
    }
    if (
      run.activeAccusation.audioEndsAt &&
      now > run.activeAccusation.audioEndsAt + UPLOAD_GRACE_MS
    ) {
      throw statusError("Contraband recording is closed", 409);
    }
    return;
  }

  if (action === "sommelier-photo") {
    const sommelier = state.sommelier;
    if (state.currentGame !== "sommelier" || !sommelier || sommelier.phase !== "capture") {
      throw statusError("Sommelier capture is closed", 409);
    }
    if (sommelier.sessionId !== roundId) throw statusError("session mismatch", 409);
    if (!sommelier.participantIds.includes(player.id)) {
      throw statusError("player is not a drink owner in this session", 403);
    }
    if (sommelier.submittedPlayerIds.includes(player.id)) {
      throw statusError("drink photo already submitted", 409);
    }
    if (sommelier.captureEndsAt && now > sommelier.captureEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("Sommelier capture is closed", 409);
    }
    return;
  }

  if (action === "stilllife-photo") {
    const still = state.stilllife;
    if (state.currentGame !== "stilllife" || !still || still.phase !== "building") {
      throw statusError("Still Life capture is closed", 409);
    }
    if (still.roundId !== roundId) throw statusError("round mismatch", 409);
    if (!still.activeTeamIds.includes(player.teamId)) {
      throw statusError("player team is not in this Still Life round", 403);
    }
    if (still.submittedTeamIds.includes(player.teamId)) {
      throw statusError("team installation already submitted", 409);
    }
    if (still.buildingEndsAt && now > still.buildingEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("Still Life capture is closed", 409);
    }
    return;
  }

  if (action === "toast-audio") {
    const toast = state.toastsyndicate;
    if (state.currentGame !== "toastsyndicate" || !toast || toast.phase !== "recording") {
      throw statusError("toast recording is closed", 409);
    }
    if (toast.roundId !== roundId) throw statusError("round mismatch", 409);
    if (toast.speakerPlayerId !== player.id) throw statusError("only the speaker can submit", 403);
    if (toast.recordingSubmitted) throw statusError("toast recording already submitted", 409);
    if (toast.recordingEndsAt && now > toast.recordingEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("toast recording is closed", 409);
    }
    return;
  }

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

  if (action === "oracle-photo") {
    const oracle = state.grilloracle;
    if (state.currentGame !== "grilloracle" || !oracle || oracle.phase !== "capturing") {
      throw statusError("oracle capture is closed", 409);
    }
    if (oracle.roundId !== roundId) throw statusError("round mismatch", 409);
    if (!oracle.participantIds.includes(player.id)) {
      throw statusError("player is not in this oracle round", 403);
    }
    if (oracle.submittedPlayerIds.includes(player.id)) {
      throw statusError("oracle reading already captured", 409);
    }
    if (oracle.captureEndsAt && now > oracle.captureEndsAt + UPLOAD_GRACE_MS) {
      throw statusError("oracle capture is closed", 409);
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
