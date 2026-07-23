// Client-side room helpers. All anonymous; host control gated by host_secret in localStorage.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  eventProfile,
  hostStorageKey,
  lastPlayerRoomStorageKey,
  playerStorageKey,
  playerStoragePrefix,
} from "./event-profile";
import { emitHostActionError } from "./host-action-errors";
import type { HostStateWriteGuard } from "./host-state-write-guard";
import type { HostCommand } from "./host-command";
import { isValidPlayerName, normalizePlayerName } from "./player-name";
import { migrateRoomState } from "./room-state-migration";
import { buildQuickStartRoomState, type QuickStartInput } from "./quick-start";
import { isRetryableError, retryOperation } from "./retry";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./room-code";
import {
  friendlyRoomLookupError,
  ROOM_NOT_FOUND_ERROR,
  ROOM_OFFLINE_ERROR,
} from "./room-entry-errors";
import {
  chooseMonotonicRoomSnapshot,
  roomConnectionStatusAfterRealtime,
  shouldResyncVisibleRoom,
  type RoomConnectionStatus,
} from "./room-connection";
import { logError, logInfo, logWarn } from "./structured-log";
import { type RoomRow, type RoomState, emptyRoomState } from "./types";

export function genCode(): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}
export function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function genHostSecret(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return `hs_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `${genId("hs")}_${genId("hs")}`;
}

function hostRoomCodeStorageKey(roomId: string) {
  return `${eventProfile.storagePrefix}:host-room:${roomId}`;
}

function rememberRoomCode(roomId: string, code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(hostRoomCodeStorageKey(roomId), code.toUpperCase());
}

export function storeHostSecret(code: string, roomId: string, hostSecret: string) {
  if (typeof window === "undefined") return;
  const normalizedCode = code.toUpperCase();
  localStorage.setItem(hostStorageKey(normalizedCode), hostSecret);
  rememberRoomCode(roomId, normalizedCode);
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

export async function createRoom(
  hostName: string,
  quickStart?: QuickStartInput,
): Promise<{ code: string; id: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const host_secret = genHostSecret();
    const state = quickStart
      ? buildQuickStartRoomState(hostName, quickStart)
      : emptyRoomState(hostName);
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, host_secret, state: state as never })
      .select("id, code")
      .single();
    if (!error && data) {
      storeHostSecret(data.code, data.id, host_secret);
      logInfo("room.create.success", {
        roomId: data.id,
        code: data.code,
        attempts: attempt + 1,
        teamCount: state.teams.length,
        quickStartVenue: state.quickStart?.venue,
        targetDurationMinutes: state.quickStart?.targetDurationMinutes,
        expectedPlayers: state.quickStart?.expectedPlayers,
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
    .select("id, code, state, updated_at")
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
    updatedAt: data.updated_at,
  };
}

export async function updateRoomState(
  id: string,
  state: RoomState,
  guard?: HostStateWriteGuard,
): Promise<boolean> {
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
        body: JSON.stringify({ roomId: id, state, ...(guard ? { guard } : {}) }),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      break;
    }
    if (response.ok) {
      if (guard) {
        const payload = (await response
          .clone()
          .json()
          .catch(() => ({}))) as { skipped?: unknown };
        if (payload.skipped === true) {
          logInfo("room.update.stale_skipped", {
            roomId: id,
            gameId: guard.gameId,
            roundId: guard.roundId,
          });
          return false;
        }
      }
      logInfo("room.update.success", {
        roomId: id,
        status: state.status,
        currentGame: state.currentGame ?? undefined,
        playerCount: state.players.length,
      });
      return true;
    }
    if (guard && response.status === 409) {
      logInfo("room.update.stale_skipped", {
        roomId: id,
        gameId: guard.gameId,
        roundId: guard.roundId,
      });
      return false;
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

export type HostCommandRoomSnapshot = {
  state: RoomState;
  updatedAt?: string;
};

async function requestHostCommand(
  id: string,
  command: HostCommand,
  commandId: string,
): Promise<HostCommandRoomSnapshot> {
  const secrets = hostSecretCandidates(id);
  if (secrets.length === 0) {
    const error = new Error("host authorization required");
    logError("room.host_command.failure", error, {
      roomId: id,
      commandId,
      commandType: command.type,
    });
    emitHostActionError(error);
    throw error;
  }

  let error: Error;
  try {
    return await retryOperation(
      async () => {
        let lastError: Error | null = null;
        for (const secret of secrets) {
          const response = await fetch("/api/host-command", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-host-secret": secret,
            },
            body: JSON.stringify({ roomId: id, commandId, command }),
          });

          if (response.ok) {
            const payload = (await response.json()) as { state?: unknown; updatedAt?: unknown };
            if (!payload.state || typeof payload.state !== "object") {
              throw new Error("host command returned an invalid room state");
            }
            const state = migrateRoomState(payload.state as RoomState);
            logInfo("room.host_command.success", {
              roomId: id,
              commandId,
              commandType: command.type,
            });
            return {
              state,
              updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : undefined,
            };
          }

          lastError = Object.assign(new Error(await response.text()), { status: response.status });
          if (response.status !== 403) throw lastError;
        }
        throw lastError ?? new Error("host command failed");
      },
      {
        attempts: 3,
        shouldRetry: (candidate) => {
          const status =
            candidate && typeof candidate === "object" && "status" in candidate
              ? Number((candidate as { status?: unknown }).status)
              : undefined;
          return status !== 409 && isRetryableError(candidate);
        },
        onRetry: (_candidate, attempt, delayMs) => {
          logWarn("room.host_command.retry", {
            roomId: id,
            commandId,
            commandType: command.type,
            attempt,
            delayMs,
          });
        },
      },
    );
  } catch (candidate) {
    error = candidate instanceof Error ? candidate : new Error(String(candidate));
  }

  logError("room.host_command.failure", error, {
    roomId: id,
    commandId,
    commandType: command.type,
  });
  emitHostActionError(error);
  throw error;
}

export async function sendHostCommandSnapshot(
  id: string,
  command: HostCommand,
  commandId = genId("cmd"),
): Promise<HostCommandRoomSnapshot> {
  return requestHostCommand(id, command, commandId);
}

export async function sendHostCommand(
  id: string,
  command: HostCommand,
  commandId = genId("cmd"),
): Promise<RoomState> {
  return (await requestHostCommand(id, command, commandId)).state;
}

export function getHostSecret(code: string): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(hostStorageKey(code));
}

/** Credentials for server functions that must derive party context from the authorized room. */
export function hostPromptAuth(roomId: string, code: string) {
  const hostSecret = getHostSecret(code);
  if (!hostSecret) throw new Error("host authorization required");
  return { roomId, hostSecret };
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
  const [connectionStatus, setConnectionStatus] = useState<RoomConnectionStatus>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const refreshRoom = useCallback(async () => {
    if (!code) return null;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setConnectionStatus("offline");
      setError(ROOM_OFFLINE_ERROR);
      return null;
    }
    try {
      const next = await fetchRoomByCode(code);
      setRoom((current) => (next ? chooseMonotonicRoomSnapshot(current, next) : null));
      setError(next ? null : ROOM_NOT_FOUND_ERROR);
      setLastSyncedAt(Date.now());
      setConnectionStatus(next ? "live" : "error");
      return next;
    } catch (candidate) {
      setError(friendlyRoomLookupError(candidate));
      setConnectionStatus("error");
      throw candidate;
    }
  }, [code]);

  useEffect(() => {
    if (!code) {
      setRoom(null);
      setLoading(false);
      setError(null);
      setConnectionStatus("error");
      return;
    }
    let cancelled = false;
    setRoom(null);
    setLoading(true);
    setError(null);
    setConnectionStatus("connecting");
    fetchRoomByCode(code)
      .then((r) => {
        if (cancelled) return;
        setRoom(r);
        setLastSyncedAt(Date.now());
        setLoading(false);
        setError(r ? null : ROOM_NOT_FOUND_ERROR);
        if (!r) setConnectionStatus("error");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(friendlyRoomLookupError(e));
        setLoading(false);
        setConnectionStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!room?.id) return;
    let active = true;
    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          if (!active) return;
          const next = payload.new as {
            id: string;
            code: string;
            state: RoomState;
            updated_at?: unknown;
          };
          const incoming: RoomRow = {
            id: next.id,
            code: next.code,
            state: migrateRoomState(next.state),
            updatedAt: typeof next.updated_at === "string" ? next.updated_at : "",
          };
          setRoom((current) => chooseMonotonicRoomSnapshot(current, incoming));
          setLastSyncedAt(Date.now());
          setConnectionStatus("live");
        },
      )
      .subscribe((status) => {
        if (!active) return;
        const online = typeof navigator === "undefined" || navigator.onLine;
        setConnectionStatus(roomConnectionStatusAfterRealtime(status, online));
        if (status === "SUBSCRIBED" && online) {
          void refreshRoom().catch(() => {});
        }
      });
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [refreshRoom, room?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const resync = () => {
      if (!navigator.onLine) {
        setConnectionStatus("offline");
        return;
      }
      setConnectionStatus("reconnecting");
      void refreshRoom().catch(() => {});
    };
    const handleVisibility = () => {
      if (shouldResyncVisibleRoom(navigator.onLine, document.visibilityState)) resync();
    };
    window.addEventListener("online", resync);
    window.addEventListener("offline", resync);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", resync);
      window.removeEventListener("offline", resync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshRoom]);

  return { room, loading, error, setRoom, connectionStatus, lastSyncedAt, refreshRoom };
}
export type { RoomConnectionStatus } from "./room-connection";

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
