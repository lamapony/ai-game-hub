// Client-side room helpers. All anonymous; host control gated by host_secret in localStorage.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hostStorageKey, playerStorageKey } from "./event-profile";
import { logError, logInfo, logWarn } from "./structured-log";
import { type RoomRow, type RoomState, emptyRoomState } from "./types";

export function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
export function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createRoom(hostName: string): Promise<{ code: string; id: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const host_secret = genId("hs");
    const state = emptyRoomState(hostName);
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, host_secret, state: state as never })
      .select("id, code")
      .single();
    if (!error && data) {
      localStorage.setItem(hostStorageKey(code), host_secret);
      logInfo("room.create.success", {
        roomId: data.id,
        code: data.code,
        attempts: attempt + 1,
        teamCount: state.teams.length,
      });
      return { code: data.code, id: data.id };
    }
    if (error && !`${error.message}`.toLowerCase().includes("duplicate")) {
      logError("room.create.failure", error, { attempt: attempt + 1 });
      throw error;
    }
    logWarn("room.create.duplicate_code", { attempt: attempt + 1 });
  }
  logError("room.create.exhausted", new Error("Could not allocate room code"), { attempts: 5 });
  throw new Error("Could not allocate room code");
}

export async function fetchRoomByCode(code: string): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, code, state")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) {
    logError("room.fetch.failure", error, { code: code.toUpperCase() });
    throw error;
  }
  if (!data) {
    logWarn("room.fetch.not_found", { code: code.toUpperCase() });
    return null;
  }
  logInfo("room.fetch.success", { roomId: data.id, code: data.code });
  return { id: data.id, code: data.code, state: data.state as unknown as RoomState };
}

export async function updateRoomState(id: string, state: RoomState): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ state: state as never })
    .eq("id", id);
  if (error) {
    logError("room.update.failure", error, {
      roomId: id,
      status: state.status,
      currentGame: state.currentGame ?? undefined,
    });
    throw error;
  }
  logInfo("room.update.success", {
    roomId: id,
    status: state.status,
    currentGame: state.currentGame ?? undefined,
    playerCount: state.players.length,
  });
}

export function getHostSecret(code: string): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(hostStorageKey(code));
}

export function getOrCreatePlayer(
  code: string,
  name?: string,
  teamId?: string,
): { id: string; name: string; teamId: string } {
  const key = playerStorageKey(code);
  if (typeof window === "undefined") return { id: "ssr", name: name ?? "", teamId: teamId ?? "" };
  const raw = localStorage.getItem(key);
  if (raw) {
    const p = JSON.parse(raw);
    if (name && p.name !== name) p.name = name;
    if (teamId && p.teamId !== teamId) p.teamId = teamId;
    localStorage.setItem(key, JSON.stringify(p));
    return p;
  }
  const p = { id: genId("p"), name: name ?? "Player", teamId: teamId ?? "forest" };
  localStorage.setItem(key, JSON.stringify(p));
  return p;
}

export function useRoom(code: string | undefined) {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setLoading(true);
    fetchRoomByCode(code)
      .then((r) => {
        if (cancelled) return;
        setRoom(r);
        setLoading(false);
        if (!r) setError("Room not found");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!room?.id) return;
    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          const next = payload.new as { id: string; code: string; state: RoomState };
          setRoom({ id: next.id, code: next.code, state: next.state });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id]);

  return { room, loading, error, setRoom };
}

// Broadcast channel for ephemeral speaker cues (no DB writes).
export type BroadcastEvent =
  | { type: "test-tone"; slot: number }
  | { type: "speak"; slot: number; text: string }
  | { type: "stop"; slot?: number };

export function useBroadcast(roomId: string | undefined, onEvent?: (e: BroadcastEvent) => void) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!roomId) return;
    const ch = supabase.channel(`bcast:${roomId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "evt" }, (msg) => {
      handlerRef.current?.(msg.payload as BroadcastEvent);
    }).subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [roomId]);

  return {
    send: (e: BroadcastEvent) => {
      channelRef.current?.send({ type: "broadcast", event: "evt", payload: e });
    },
  };
}
