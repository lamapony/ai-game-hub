import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { statusError } from "./player-auth.server";
import { migrateRoomState } from "./room-state-migration";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import {
  persistSoundscapeTopicsState,
  soundscapeTopicsForRound,
  type SoundscapeTopicsResult,
} from "./soundscape-topics";
import type { RoomState } from "./types";

type SoundscapeRoomSnapshot = {
  id: string;
  state: RoomState;
  updatedAt: string;
};

async function loadSoundscapeRoom(roomId: string): Promise<SoundscapeRoomSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, state, updated_at")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  return {
    id: data.id,
    state: migrateRoomState(data.state as unknown as RoomState),
    updatedAt: data.updated_at,
  };
}

async function writeSoundscapeRoom(snapshot: SoundscapeRoomSnapshot, state: RoomState) {
  if (snapshot.state === state) return true;
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .update({ state: state as never })
    .eq("id", snapshot.id)
    .eq("updated_at", snapshot.updatedAt)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function readSoundscapeTopics(roomId: string, roundId: string) {
  const snapshot = await loadSoundscapeRoom(roomId);
  return soundscapeTopicsForRound(snapshot.state, roundId);
}

export async function persistSoundscapeTopics(params: {
  roomId: string;
  roundId: string;
  topics: string[];
  fallback?: true;
  topicsEndsAt: number;
}): Promise<SoundscapeTopicsResult> {
  const updated = await updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSoundscapeRoom(params.roomId),
    applyUpdate: async (snapshot) => {
      const result = persistSoundscapeTopicsState(snapshot.state, params);
      if (!result) throw statusError("Soundscape topic round changed", 409);
      return { state: result.state, value: result.result };
    },
    writeSnapshot: writeSoundscapeRoom,
  });
  return updated.value;
}

export async function waitForSoundscapeTopics(roomId: string, roundId: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let delayMs = 100;
  while (Date.now() < deadline) {
    const result = await readSoundscapeTopics(roomId, roundId);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(1_000, delayMs * 2);
  }
  return null;
}
