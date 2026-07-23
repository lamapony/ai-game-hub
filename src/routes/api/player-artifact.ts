import { createFileRoute } from "@tanstack/react-router";
import { publicApiErrorResponse, publicApiErrorStatus } from "@/lib/api-error-response.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  cleanId,
  playerSecretHashFromRequest,
  requireAuthorizedPlayer,
  statusError,
} from "@/lib/player-auth.server";
import {
  assertPlayerMayUpload,
  assertPlayerStoragePath,
  assertStorageObjectExists,
  cleanRoundId,
  mediaKindForAction,
  PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS,
  RECORDINGS_BUCKET,
} from "@/lib/player-media.server";
import { logError, logInfo, logWarn } from "@/lib/structured-log";
import { migrateRoomState } from "@/lib/room-state-migration";
import type { RoomState } from "@/lib/types";

const SOUND_VOTING_MS = 30_000;
const SOUND_VOTE_CATEGORIES = new Set(["atmosphere", "laughs", "creative"]);

type ArtifactBody = {
  roomId?: unknown;
  action?: unknown;
  playerId?: unknown;
  playerSecret?: unknown;
  playerSecretHash?: unknown;
  roundId?: unknown;
  storagePath?: unknown;
  transcript?: unknown;
  durationSeconds?: unknown;
  targetTeamId?: unknown;
  category?: unknown;
};

function cleanText(value: unknown, field: string, maxLength: number, required = true) {
  const text = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  if (required && !text) throw statusError(`${field} required`, 400);
  return text;
}

function cleanNumber(value: unknown, field: string, min: number, max: number, fallback = 0) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

async function signedRecordingUrl(storagePath: string, expiresIn: number) {
  const exists = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).exists(storagePath);
  assertStorageObjectExists(exists);

  const signed = await supabaseAdmin.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}

async function fetchRoom(roomId: string) {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, state")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  return { id: data.id, state: migrateRoomState(data.state as unknown as RoomState) };
}

async function submitSoundscapeClip(state: RoomState, roomId: string, body: ArtifactBody) {
  const playerSecretHash = body.playerSecretHash as string | undefined;
  const player = requireAuthorizedPlayer(state, body.playerId, playerSecretHash);
  const roundId = cleanRoundId(body.roundId);
  assertPlayerMayUpload(state, "soundscape-audio", player, roundId);
  const storagePath = assertPlayerStoragePath({
    storagePath: body.storagePath,
    roomId,
    kind: mediaKindForAction("soundscape-audio"),
    roundId,
    playerId: player.id,
  });
  const audioUrl = await signedRecordingUrl(storagePath, PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS);

  const { data, error } = await supabaseAdmin
    .from("submissions")
    .insert({
      room_id: roomId,
      round_id: roundId,
      team_id: player.teamId,
      player_id: player.id,
      player_name: player.name,
      audio_url: audioUrl,
      transcript: cleanText(body.transcript, "transcript", 2000, false),
      duration_seconds: cleanNumber(body.durationSeconds, "durationSeconds", 0, 60),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { ok: true, id: data.id };
}

async function submitSoundscapeVote(state: RoomState, roomId: string, body: ArtifactBody) {
  const playerSecretHash = body.playerSecretHash as string | undefined;
  const player = requireAuthorizedPlayer(state, body.playerId, playerSecretHash);
  const roundId = cleanRoundId(body.roundId);
  const targetTeamId = cleanId(body.targetTeamId, "targetTeamId");
  const category = cleanText(body.category, "category", 32);
  const soundscape = state.soundscape;
  if (state.currentGame !== "soundscape" || !soundscape || soundscape.phase !== "voting") {
    throw statusError("soundscape voting is closed", 409);
  }
  if (soundscape.roundId !== roundId) throw statusError("round mismatch", 409);
  if (soundscape.voteOpenAt && Date.now() > soundscape.voteOpenAt + SOUND_VOTING_MS) {
    throw statusError("soundscape voting is closed", 409);
  }
  if (!SOUND_VOTE_CATEGORIES.has(category)) throw statusError("category invalid", 400);
  if (targetTeamId === player.teamId) throw statusError("cannot vote for own team", 403);
  if (!state.teams.some((team) => team.id === targetTeamId) || !soundscape.mixes?.[targetTeamId]) {
    throw statusError("target team unavailable", 409);
  }

  const existing = await supabaseAdmin
    .from("votes")
    .select("id")
    .eq("room_id", roomId)
    .eq("round_id", roundId)
    .eq("voter_player_id", player.id)
    .eq("category", category)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data?.id) {
    const { error } = await supabaseAdmin
      .from("votes")
      .update({ target_team_id: targetTeamId })
      .eq("id", existing.data.id);
    if (error) throw error;
    return { ok: true, id: existing.data.id };
  }

  const { data, error } = await supabaseAdmin
    .from("votes")
    .insert({
      room_id: roomId,
      round_id: roundId,
      target_team_id: targetTeamId,
      voter_player_id: player.id,
      category,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { ok: true, id: data.id };
}

async function submitChallengeVideo(state: RoomState, roomId: string, body: ArtifactBody) {
  const playerSecretHash = body.playerSecretHash as string | undefined;
  const player = requireAuthorizedPlayer(state, body.playerId, playerSecretHash);
  const roundId = cleanRoundId(body.roundId);
  assertPlayerMayUpload(state, "challenge-video", player, roundId);
  const challenge = state.challenge!;
  const storagePath = assertPlayerStoragePath({
    storagePath: body.storagePath,
    roomId,
    kind: mediaKindForAction("challenge-video"),
    roundId,
    playerId: player.id,
  });
  const videoUrl = await signedRecordingUrl(storagePath, PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS);

  const existing = await supabaseAdmin
    .from("challenges")
    .select("id, video_url")
    .eq("room_id", roomId)
    .eq("round_id", roundId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id)
    return { ok: true, id: existing.data.id, videoUrl: existing.data.video_url };

  const { data, error } = await supabaseAdmin
    .from("challenges")
    .insert({
      room_id: roomId,
      round_id: roundId,
      task: challenge.task ?? "",
      operator_id: player.id,
      operator_name: player.name,
      video_url: videoUrl,
      transcript: cleanText(body.transcript, "transcript", 4000, false),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { ok: true, id: data.id, videoUrl };
}

async function submitPhoto(state: RoomState, roomId: string, body: ArtifactBody) {
  const playerSecretHash = body.playerSecretHash as string | undefined;
  const player = requireAuthorizedPlayer(state, body.playerId, playerSecretHash);
  const roundId = cleanRoundId(body.roundId);
  assertPlayerMayUpload(state, "photo", player, roundId);
  const storagePath = assertPlayerStoragePath({
    storagePath: body.storagePath,
    roomId,
    kind: mediaKindForAction("photo"),
    roundId,
    playerId: player.id,
  });
  const photoUrl = await signedRecordingUrl(storagePath, PLAYER_ARTIFACT_SIGNED_URL_TTL_SECONDS);

  const existing = await supabaseAdmin
    .from("photos")
    .select("id, photo_url")
    .eq("room_id", roomId)
    .eq("round_id", roundId)
    .eq("player_id", player.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id)
    return { ok: true, id: existing.data.id, photoUrl: existing.data.photo_url };

  const { data, error } = await supabaseAdmin
    .from("photos")
    .insert({
      room_id: roomId,
      round_id: roundId,
      player_id: player.id,
      player_name: player.name,
      team_id: player.teamId,
      photo_url: photoUrl,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { ok: true, id: data.id, photoUrl };
}

async function handleArtifact(state: RoomState, roomId: string, body: ArtifactBody) {
  if (body.action === "soundscape-submission") return submitSoundscapeClip(state, roomId, body);
  if (body.action === "soundscape-vote") return submitSoundscapeVote(state, roomId, body);
  if (body.action === "challenge-submission") return submitChallengeVideo(state, roomId, body);
  if (body.action === "photo-submission") return submitPhoto(state, roomId, body);
  throw statusError("unknown player artifact action", 400);
}

export const Route = createFileRoute("/api/player-artifact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json().catch(() => ({}))) as ArtifactBody;
        if (typeof body.roomId !== "string" || typeof body.action !== "string") {
          logWarn("api.player_artifact.invalid", {
            durationMs: Date.now() - startedAt,
            status: 400,
          });
          return new Response("roomId and action required", { status: 400 });
        }

        try {
          body.playerSecretHash = playerSecretHashFromRequest(request, body);
          const room = await fetchRoom(body.roomId);
          const result = await handleArtifact(room.state, room.id, body);
          logInfo("api.player_artifact.success", {
            durationMs: Date.now() - startedAt,
            status: 200,
            roomId: room.id,
            action: body.action,
            playerId: typeof body.playerId === "string" ? body.playerId : undefined,
          });
          return Response.json(result);
        } catch (error) {
          const status = publicApiErrorStatus(error);
          logError("api.player_artifact.failure", error, {
            durationMs: Date.now() - startedAt,
            status,
            action: body.action,
          });
          return publicApiErrorResponse(error, {
            fallbackMessage: "player artifact failed",
            status,
          });
        }
      },
    },
  },
});
