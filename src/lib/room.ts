// Client-side room helpers. All anonymous; host control gated by host_secret in localStorage.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  eventProfile,
  hostStorageKey,
  lastPlayerRoomStorageKey,
  playerStorageKey,
  playerStoragePrefix,
} from "./event-profile";
import { emitHostActionError } from "./host-action-errors";
import { isValidPlayerName, normalizePlayerName } from "./player-name";
import { migrateRoomState } from "./room-state-migration";
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

function hostRoomCodeStorageKey(roomId: string) {
  return `${eventProfile.storagePrefix}:host-room:${roomId}`;
}

function rememberRoomCode(roomId: string, code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(hostRoomCodeStorageKey(roomId), code.toUpperCase());
}

function rememberPlayerRoom(code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(lastPlayerRoomStorageKey(), code.toUpperCase());
}

export function hostSecretCandidates(roomId: string) {
  if (typeof window === "undefined") return [];
  const candidates: string[] = [];
  const rememberedCode = localStorage.getItem(hostRoomCodeStorageKey(roomId));
  if (rememberedCode) {
    const secret = getHostSecret(rememberedCode);
    if (secret) candidates.push(secret);
  }
  const hostPrefix = `${eventProfile.storagePrefix}:host:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(hostPrefix)) continue;
    const secret = localStorage.getItem(key);
    if (secret && !candidates.includes(secret)) candidates.push(secret);
  }
  return candidates;
}

function genPlayerSecret() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return `ps_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `${genId("ps")}_${genId("ps")}`;
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
      rememberRoomCode(data.id, data.code);
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
  rememberRoomCode(data.id, data.code);
  return {
    id: data.id,
    code: data.code,
    state: migrateRoomState(data.state as unknown as RoomState),
  };
}

export async function updateRoomState(id: string, state: RoomState): Promise<void> {
  const secrets = hostSecretCandidates(id);
  if (secrets.length === 0) {
    const error = new Error("host authorization required");
    logError("room.update.failure", error, {
      roomId: id,
      status: state.status,
      currentGame: state.currentGame ?? undefined,
    });
    emitHostActionError(error);
    throw error;
  }

  let lastError: Error | null = null;
  for (const secret of secrets) {
    let response: Response;
    try {
      response = await fetch("/api/host-state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-host-secret": secret,
        },
        body: JSON.stringify({ roomId: id, state }),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      break;
    }
    if (response.ok) {
      logInfo("room.update.success", {
        roomId: id,
        status: state.status,
        currentGame: state.currentGame ?? undefined,
        playerCount: state.players.length,
      });
      return;
    }
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }

  const error = lastError ?? new Error("host state failed");
  logError("room.update.failure", error, {
    roomId: id,
    status: state.status,
    currentGame: state.currentGame ?? undefined,
  });
  emitHostActionError(error);
  throw error;
}

export function getHostSecret(code: string): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(hostStorageKey(code));
}

export type LocalStoredPlayer = {
  id: string;
  name: string;
  teamId: string;
  secret?: string;
  updatedAt?: number;
};

function parseStoredPlayer(raw: string | null): LocalStoredPlayer | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as {
    id?: unknown;
    name?: unknown;
    teamId?: unknown;
    secret?: unknown;
    updatedAt?: unknown;
  };
  const id = typeof parsed.id === "string" ? parsed.id : "";
  const name = normalizePlayerName(parsed.name);
  const teamId = typeof parsed.teamId === "string" ? parsed.teamId : "";
  if (!id || !teamId || !isValidPlayerName(name)) return null;
  return {
    id,
    name,
    teamId,
    secret: typeof parsed.secret === "string" ? parsed.secret : undefined,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
  };
}

export function readStoredPlayer(code: string): LocalStoredPlayer | null {
  if (typeof window === "undefined") return null;
  const key = playerStorageKey(code);
  const raw = localStorage.getItem(key);
  try {
    return parseStoredPlayer(raw);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function storedPlayerResumes(limit = 3): Array<LocalStoredPlayer & { code: string }> {
  if (typeof window === "undefined") return [];
  const prefix = playerStoragePrefix();
  const latestCode = localStorage.getItem(lastPlayerRoomStorageKey())?.toUpperCase();
  const byCode = new Map<string, LocalStoredPlayer & { code: string }>();

  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  for (const key of keys) {
    if (!key?.startsWith(prefix)) continue;
    const code = key.slice(prefix.length).toUpperCase();
    const player = readStoredPlayer(code);
    if (player) byCode.set(code, { ...player, code });
  }

  return [...byCode.values()]
    .sort((a, b) => {
      if (latestCode && a.code === latestCode) return -1;
      if (latestCode && b.code === latestCode) return 1;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    })
    .slice(0, limit);
}

export function getOrCreatePlayer(
  code: string,
  name?: string,
  teamId?: string,
): { id: string; name: string; teamId: string; secret: string } {
  const key = playerStorageKey(code);
  if (typeof window === "undefined") {
    return { id: "ssr", name: name ?? "", teamId: teamId ?? "", secret: "ssr-player-secret" };
  }
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const p = JSON.parse(raw) as {
        id: string;
        name: string;
        teamId: string;
        secret?: string;
        updatedAt?: number;
      };
      const normalizedName = normalizePlayerName(name);
      if (typeof p.id !== "string" || !p.id || typeof p.teamId !== "string" || !p.teamId) {
        throw new Error("invalid local player record");
      }
      if (normalizedName && p.name !== normalizedName) p.name = normalizedName;
      if (teamId && p.teamId !== teamId) p.teamId = teamId;
      if (!p.secret) p.secret = genPlayerSecret();
      p.updatedAt = Date.now();
      localStorage.setItem(key, JSON.stringify(p));
      rememberPlayerRoom(code);
      return { id: p.id, name: p.name, teamId: p.teamId, secret: p.secret };
    } catch {
      localStorage.removeItem(key);
    }
  }
  const normalizedName = normalizePlayerName(name);
  const p = {
    id: genId("p"),
    name: normalizedName,
    teamId: teamId ?? "forest",
    secret: genPlayerSecret(),
    updatedAt: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(p));
  rememberPlayerRoom(code);
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
          setRoom({ id: next.id, code: next.code, state: migrateRoomState(next.state) });
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
