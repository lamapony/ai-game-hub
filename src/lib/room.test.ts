import { describe, expect, test } from "bun:test";
import { ROOM_STATE_SCHEMA_VERSION } from "./party-context";
import type { RoomState } from "./types";
import { emptyRoomState } from "./types";

type SupabaseError = { message: string; status?: number };
type QueryResult<T> = { data: T | null; error: SupabaseError | null };

type InsertPayload = {
  code: string;
  host_secret: string;
  state: RoomState;
};

type RoomRecord = {
  id: string;
  code: string;
  state: RoomState;
  updated_at: string;
};

const mockRooms = {
  insertResults: [] as QueryResult<{ id: string; code: string }>[],
  maybeSingleResult: { data: null, error: null } as QueryResult<RoomRecord>,
  updateResult: { data: null, error: null } as QueryResult<null>,
  inserts: [] as InsertPayload[],
  updates: [] as { id: string; state: RoomState }[],
  selects: [] as string[],
  filters: [] as { field: string; value: string }[],
};

class RoomsQueryBuilder {
  private insertPayload: InsertPayload | null = null;
  private updatePayload: { state: RoomState } | null = null;
  private roomId: string | null = null;

  insert(payload: InsertPayload) {
    this.insertPayload = payload;
    mockRooms.inserts.push(payload);
    return this;
  }

  update(payload: { state: RoomState }) {
    this.updatePayload = payload;
    return this;
  }

  select(columns: string) {
    mockRooms.selects.push(columns);
    return this;
  }

  eq(field: string, value: string) {
    mockRooms.filters.push({ field, value });
    if (field === "id") this.roomId = value;
    return this;
  }

  async single(): Promise<QueryResult<{ id: string; code: string }>> {
    if (!this.insertPayload) throw new Error("single() called without insert payload");
    const queued = mockRooms.insertResults.shift();
    if (queued) return queued;
    return {
      data: { id: `room_${this.insertPayload.code}`, code: this.insertPayload.code },
      error: null,
    };
  }

  async maybeSingle(): Promise<QueryResult<RoomRecord>> {
    return mockRooms.maybeSingleResult;
  }

  then<TResult1 = QueryResult<null>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    if (this.updatePayload && this.roomId) {
      mockRooms.updates.push({ id: this.roomId, state: this.updatePayload.state });
    }
    return Promise.resolve(mockRooms.updateResult).then(onfulfilled, onrejected);
  }
}

const bunMock = (await import("bun:test")) as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
};

const logEvents: {
  level: "info" | "warn" | "error";
  event: string;
  error?: unknown;
  fields: Record<string, unknown>;
}[] = [];

const mockFetch = {
  calls: [] as { input: string | URL | Request; init?: RequestInit }[],
  response: new Response("ok", { status: 200 }),
  responses: [] as Response[],
};

bunMock.mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table !== "rooms") throw new Error(`Unexpected table: ${table}`);
      return new RoomsQueryBuilder();
    },
  },
}));

bunMock.mock.module("./structured-log", () => ({
  logInfo(event: string, fields: Record<string, unknown> = {}) {
    logEvents.push({ level: "info", event, fields });
  },
  logWarn(event: string, fields: Record<string, unknown> = {}) {
    logEvents.push({ level: "warn", event, fields });
  },
  logError(event: string, error: unknown, fields: Record<string, unknown> = {}) {
    logEvents.push({ level: "error", event, error, fields });
  },
}));

const {
  createRoom,
  fetchRoomByCode,
  genCode,
  genHostSecret,
  genId,
  getHostSecret,
  getOrCreatePlayer,
  readStoredPlayer,
  sendHostCommand,
  sendHostCommandSnapshot,
  storeHostSecret,
  storedPlayerResumes,
  updateRoomState,
} = await import("./room");
const { HOST_ACTION_ERROR_EVENT } = await import("./host-action-errors");

function installMemoryStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
  Object.defineProperty(globalThis, "fetch", {
    value: async (input: string | URL | Request, init?: RequestInit) => {
      mockFetch.calls.push({ input, init });
      return mockFetch.responses.shift() ?? mockFetch.response;
    },
    configurable: true,
  });
}

function resetMockRooms() {
  mockRooms.insertResults = [];
  mockRooms.maybeSingleResult = { data: null, error: null };
  mockRooms.updateResult = { data: null, error: null };
  mockRooms.inserts = [];
  mockRooms.updates = [];
  mockRooms.selects = [];
  mockRooms.filters = [];
  logEvents.length = 0;
}

function resetTestState() {
  installMemoryStorage();
  resetMockRooms();
  mockFetch.calls = [];
  mockFetch.response = new Response("ok", { status: 200 });
  mockFetch.responses = [];
}

function installHostSecret(roomId = "room_1", code = "ABCD", secret = "secret") {
  localStorage.setItem(`dimas:host-room:${roomId}`, code);
  localStorage.setItem(`dimas:host:${code}`, secret);
}

async function rejectedMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "";
  } catch (error) {
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    return String(error instanceof Error ? error.message : error);
  }
}

describe("room helpers", () => {
  test("generates short public codes and prefixed ids", () => {
    resetTestState();

    const code = genCode();
    const id = genId("room");

    expect(code.length).toBe(4);
    expect(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code)).toBe(true);
    expect(/^room_[a-z0-9]{8}$/.test(id)).toBe(true);
    expect(/^hs_[a-f0-9]{48}$/.test(genHostSecret())).toBe(true);
  });

  test("stores verified host access for both room code and room id lookup", () => {
    resetTestState();

    storeHostSecret("ab12", "room_1", "hs_12345678");

    expect(getHostSecret("AB12")).toBe("hs_12345678");
    expect(localStorage.getItem("dimas:host-room:room_1")).toBe("AB12");
  });

  test("createRoom retries duplicate room codes and stores the host secret", async () => {
    resetTestState();

    mockRooms.insertResults.push({
      data: null,
      error: { message: "duplicate key value violates unique constraint rooms_code_key" },
    });

    const room = await createRoom("Dimas");

    expect(mockRooms.inserts.length).toBe(2);
    expect(mockRooms.inserts[0]?.state.hostName).toBe("Dimas");
    expect(room.code).toBe(mockRooms.inserts[1]?.code);
    expect(room.id).toBe(`room_${mockRooms.inserts[1]?.code}`);
    expect(getHostSecret(room.code)).toBe(mockRooms.inserts[1]?.host_secret);
    expect(logEvents.some((entry) => entry.event === "room.create.duplicate_code")).toBe(true);
    expect(
      logEvents.some(
        (entry) => entry.event === "room.create.success" && entry.fields.roomId === room.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(logEvents).includes("host_secret")).toBe(false);
  });

  test("createRoom atomically persists the selected quick-start program", async () => {
    resetTestState();

    const room = await createRoom("Maya", {
      venue: "home",
      targetDurationMinutes: 240,
      expectedPlayers: 16,
    });
    const inserted = mockRooms.inserts[0]?.state;

    expect(room.id).toBe(`room_${room.code}`);
    expect(inserted?.hostName).toBe("Maya");
    expect(inserted?.party?.experienceId).toBe("house-party");
    expect(inserted?.party?.contingency).toBe("extended");
    expect(inserted?.quickStart?.venue).toBe("home");
    expect(inserted?.quickStart?.targetDurationMinutes).toBe(240);
    expect(inserted?.quickStart?.expectedPlayers).toBe(16);
    const successFields = logEvents.find((entry) => entry.event === "room.create.success")?.fields;
    expect(successFields?.quickStartVenue).toBe("home");
    expect(successFields?.targetDurationMinutes).toBe(240);
    expect(successFields?.expectedPlayers).toBe(16);
  });

  test("createRoom fails immediately on non-duplicate insert errors", async () => {
    resetTestState();

    mockRooms.insertResults.push({
      data: null,
      error: { message: "permission denied" },
    });

    expect(await rejectedMessage(() => createRoom("Dimas"))).toContain("permission denied");
    expect(mockRooms.inserts.length).toBe(1);
    expect(logEvents.some((entry) => entry.event === "room.create.failure")).toBe(true);
  });

  test("fetchRoomByCode uppercases codes and maps missing rooms to null", async () => {
    resetTestState();

    const state = emptyRoomState("Host");
    mockRooms.maybeSingleResult = {
      data: { id: "room_1", code: "ABCD", state, updated_at: "2026-07-18T12:00:00Z" },
      error: null,
    };

    const room = await fetchRoomByCode("abcd");
    expect(room?.id).toBe("room_1");
    expect(room?.code).toBe("ABCD");
    expect(room?.state).toBe(state);
    expect(room?.updatedAt).toBe("2026-07-18T12:00:00Z");
    expect(mockRooms.selects).toContain("id, code, state, updated_at");
    expect(logEvents.some((entry) => entry.event === "room.fetch.success")).toBe(true);
    expect(
      mockRooms.filters.some((filter) => filter.field === "code" && filter.value === "ABCD"),
    ).toBe(true);

    mockRooms.maybeSingleResult = { data: null, error: null };
    expect(await fetchRoomByCode("missing")).toBeNull();
    expect(logEvents.some((entry) => entry.event === "room.fetch.not_found")).toBe(true);
  });

  test("fetchRoomByCode normalizes legacy room metadata at the read boundary", async () => {
    resetTestState();

    const current = emptyRoomState("Legacy Host");
    const { schemaVersion: _schemaVersion, party: _party, ...legacy } = current;
    mockRooms.maybeSingleResult = {
      data: {
        id: "room_legacy",
        code: "BAR1",
        state: { ...legacy, venue: "bar" },
        updated_at: "2026-07-18T12:00:00Z",
      },
      error: null,
    };

    const room = await fetchRoomByCode("bar1");

    expect(room?.state.schemaVersion).toBe(ROOM_STATE_SCHEMA_VERSION);
    expect(room?.state.party?.actId).toBe("bar");
    expect(room?.state.party?.venue).toBe("bar");
    expect(room?.state.hostName).toBe("Legacy Host");
  });

  test("fetchRoomByCode and updateRoomState surface Supabase errors", async () => {
    resetTestState();

    mockRooms.maybeSingleResult = {
      data: null,
      error: { message: "network unavailable" },
    };
    expect(await rejectedMessage(() => fetchRoomByCode("ABCD"))).toContain("network unavailable");

    installHostSecret();
    mockFetch.response = new Response("write rejected", { status: 500 });
    expect(
      await rejectedMessage(() => updateRoomState("room_1", emptyRoomState("Host"))),
    ).toContain("write rejected");
    expect(logEvents.some((entry) => entry.event === "room.fetch.failure")).toBe(true);
    expect(logEvents.some((entry) => entry.event === "room.update.failure")).toBe(true);
  });

  test("updateRoomState emits a host action error event on write failure", async () => {
    resetTestState();
    installHostSecret();

    const messages: string[] = [];
    const listener = (event: Event) => {
      messages.push((event as CustomEvent<{ message?: string }>).detail?.message ?? "");
    };
    window.addEventListener(HOST_ACTION_ERROR_EVENT, listener);
    mockFetch.response = new Response("write rejected", { status: 500 });

    try {
      await rejectedMessage(() => updateRoomState("room_1", emptyRoomState("Host")));
    } finally {
      window.removeEventListener(HOST_ACTION_ERROR_EVENT, listener);
    }

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("pause the party");
    expect(messages[0]?.includes("write rejected")).toBe(false);
  });

  test("updateRoomState writes the complete state for the target room id", async () => {
    resetTestState();
    installHostSecret();

    const state = emptyRoomState("Host");

    await updateRoomState("room_1", state);

    expect(mockFetch.calls.length).toBe(1);
    expect(String(mockFetch.calls[0]?.input)).toBe("/api/host-state");
    expect((mockFetch.calls[0]?.init?.headers as Record<string, string>)["x-host-secret"]).toBe(
      "secret",
    );
    expect(JSON.parse(String(mockFetch.calls[0]?.init?.body))).toEqual({
      roomId: "room_1",
      state,
    });
    expect(logEvents.some((entry) => entry.event === "room.update.success")).toBe(true);
  });

  test("updateRoomState treats a guarded stale round as a safe no-op", async () => {
    resetTestState();
    installHostSecret();
    mockFetch.response = Response.json({ skipped: true });

    const state = emptyRoomState("Host");
    const written = await updateRoomState("room_1", state, {
      gameId: "challenge",
      roundId: "ch_old",
    });

    expect(written).toBe(false);
    expect(JSON.parse(String(mockFetch.calls[0]?.init?.body))).toEqual({
      roomId: "room_1",
      state,
      guard: { gameId: "challenge", roundId: "ch_old" },
    });
    expect(logEvents.some((entry) => entry.event === "room.update.stale_skipped")).toBe(true);
    expect(logEvents.some((entry) => entry.event === "room.update.failure")).toBe(false);
  });

  test("sendHostCommand sends a typed command instead of a room snapshot", async () => {
    resetTestState();
    installHostSecret();
    const state = {
      ...emptyRoomState("Host"),
      recentHostCommandIds: ["cmd_12345678"],
    };
    mockFetch.response = Response.json({ state });

    const result = await sendHostCommand(
      "room_1",
      { type: "select-act", actId: "bar" },
      "cmd_12345678",
    );

    expect(result).toEqual(state);
    expect(String(mockFetch.calls[0]?.input)).toBe("/api/host-command");
    expect(JSON.parse(String(mockFetch.calls[0]?.init?.body))).toEqual({
      roomId: "room_1",
      commandId: "cmd_12345678",
      command: { type: "select-act", actId: "bar" },
    });
    expect(String(mockFetch.calls[0]?.init?.body).includes("teams")).toBe(false);
    expect(logEvents.some((entry) => entry.event === "room.host_command.success")).toBe(true);
  });

  test("sendHostCommandSnapshot exposes the committed room revision", async () => {
    resetTestState();
    installHostSecret();
    const state = emptyRoomState("Host");
    mockFetch.response = Response.json({
      state,
      updatedAt: "2026-07-18T12:00:00.123456+00:00",
    });

    const result = await sendHostCommandSnapshot(
      "room_1",
      { type: "force-hub" },
      "cmd_committed_revision",
    );

    expect(result.state).toEqual(state);
    expect(result.updatedAt).toBe("2026-07-18T12:00:00.123456+00:00");
  });

  test("sendHostCommand retries a transient response with the same idempotency key", async () => {
    resetTestState();
    installHostSecret();
    const state = emptyRoomState("Host");
    mockFetch.responses = [
      new Response("temporarily unavailable", { status: 503 }),
      Response.json({ state }),
    ];

    await sendHostCommand("room_1", { type: "pause" }, "cmd_retry_same_key");

    expect(mockFetch.calls).toHaveLength(2);
    const first = JSON.parse(String(mockFetch.calls[0]?.init?.body));
    const second = JSON.parse(String(mockFetch.calls[1]?.init?.body));
    expect(first.commandId).toBe("cmd_retry_same_key");
    expect(second.commandId).toBe(first.commandId);
    expect(logEvents.some((entry) => entry.event === "room.host_command.retry")).toBe(true);
  });

  test("getOrCreatePlayer persists player identity and allows name/team updates", () => {
    resetTestState();

    const first = getOrCreatePlayer("ABCD", "Mila", "forest");
    const second = getOrCreatePlayer("ABCD", "Mila Prime", "lake");

    const stored = JSON.parse(localStorage.getItem("dimas:player:ABCD") ?? "{}") as typeof second;
    expect(/^p_[a-z0-9]{8}$/.test(first.id)).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.secret).toBe(first.secret);
    expect(second.secret.length > 16).toBe(true);
    expect(second.name).toBe("Mila Prime");
    expect(second.teamId).toBe("lake");
    expect(stored.id).toBe(second.id);
    expect(stored.secret).toBe(second.secret);
    expect(stored.name).toBe(second.name);
    expect(stored.teamId).toBe(second.teamId);
    expect(localStorage.getItem("dimas:last-player-room")).toBe("ABCD");
    const resume = storedPlayerResumes(1)[0];
    expect(resume?.code).toBe("ABCD");
    expect(resume?.id).toBe(second.id);
    expect(resume?.name).toBe("Mila Prime");
    expect(resume?.teamId).toBe("lake");
  });

  test("stored player recovery ignores invalid or generic local records", () => {
    resetTestState();

    localStorage.setItem(
      "dimas:player:ABCD",
      JSON.stringify({ id: "p1", name: "Player 1", teamId: "forest", secret: "ps_secret" }),
    );
    localStorage.setItem("dimas:player:WXYZ", "{broken");

    expect(readStoredPlayer("ABCD")).toBeNull();
    expect(readStoredPlayer("WXYZ")).toBeNull();
    expect(localStorage.getItem("dimas:player:ABCD")).not.toBeNull();
    expect(localStorage.getItem("dimas:player:WXYZ")).toBeNull();
    expect(storedPlayerResumes()).toEqual([]);
  });
});
