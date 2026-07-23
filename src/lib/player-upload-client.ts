import { supabase } from "@/integrations/supabase/client";
import { isRetryableError, retryOperation } from "./retry";
import { playerSecretFor } from "./player-action-client";

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

export type PlayerUploadTargetRequest = {
  action: PlayerUploadAction;
  playerId: string;
  roundId: string;
  mimeType: string;
};

export type PlayerUploadTarget = {
  bucket: "recordings";
  path: string;
  token: string;
};

async function createPlayerUploadTarget(roomId: string, payload: PlayerUploadTargetRequest) {
  const playerSecret = playerSecretFor(payload.playerId);
  const response = await fetch("/api/player-upload-target", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(playerSecret ? { "x-player-secret": playerSecret } : {}),
    },
    body: JSON.stringify({ roomId, ...payload }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as PlayerUploadTarget;
}

export async function uploadPlayerMedia(
  roomId: string,
  payload: PlayerUploadTargetRequest,
  blob: Blob,
) {
  const target = await createPlayerUploadTarget(roomId, payload);
  const upload = await retryOperation(
    async () => {
      const result = await supabase.storage
        .from(target.bucket)
        .uploadToSignedUrl(target.path, target.token, blob, {
          contentType: payload.mimeType,
        });
      if (result.error && isRetryableError(result.error)) throw result.error;
      return result;
    },
    { shouldRetry: (error) => isRetryableError(error) },
  );
  if (upload.error) throw upload.error;
  return target.path;
}
