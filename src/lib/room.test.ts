import { describe, expect, test } from "bun:test";
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
  genId,
  getHostSecret,
  getOrCreatePlayer,
  updateRoomState,
} = await import("./room");

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
      data: { id: "room_1", code: "ABCD", state },
      error: null,
    };

    const room = await fetchRoomByCode("abcd");
    expect(room?.id).toBe("room_1");
    expect(room?.code).toBe("ABCD");
    expect(room?.state).toBe(state);
    expect(logEvents.some((entry) => entry.event === "room.fetch.success")).toBe(true);
    expect(
      mockRooms.filters.some((filter) => filter.field === "code" && filter.value === "ABCD"),
    ).toBe(true);

    mockRooms.maybeSingleResult = { data: null, error: null };
    expect(await fetchRoomByCode("missing")).toBeNull();
    expect(logEvents.some((entry) => entry.event === "room.fetch.not_found")).toBe(true);
  });

  test("fetchRoomByCode and updateRoomState surface Supabase errors", async () => {
    resetTestState();

    mockRooms.maybeSingleResult = {
      data: null,
      error: { message: "network unavailable" },
    };
    expect(await rejectedMessage(() => fetchRoomByCode("ABCD"))).toContain("network unavailable");

    mockRooms.updateResult = { data: null, error: { message: "write rejected" } };
    expect(
      await rejectedMessage(() => updateRoomState("room_1", emptyRoomState("Host"))),
    ).toContain("write rejected");
    expect(logEvents.some((entry) => entry.event === "room.fetch.failure")).toBe(true);
    expect(logEvents.some((entry) => entry.event === "room.update.failure")).toBe(true);
  });

  test("updateRoomState writes the complete state for the target room id", async () => {
    resetTestState();

    const state = emptyRoomState("Host");

    await updateRoomState("room_1", state);

    expect(mockRooms.updates.length).toBe(1);
    expect(mockRooms.updates[0]?.id).toBe("room_1");
    expect(mockRooms.updates[0]?.state).toBe(state);
    expect(logEvents.some((entry) => entry.event === "room.update.success")).toBe(true);
  });

  test("getOrCreatePlayer persists player identity and allows name/team updates", () => {
    resetTestState();

    const first = getOrCreatePlayer("ABCD", "Mila", "forest");
    const second = getOrCreatePlayer("ABCD", "Mila Prime", "lake");

    const stored = JSON.parse(localStorage.getItem("dimas:player:ABCD") ?? "{}") as typeof second;
    expect(/^p_[a-z0-9]{8}$/.test(first.id)).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Mila Prime");
    expect(second.teamId).toBe("lake");
    expect(stored.id).toBe(second.id);
    expect(stored.name).toBe(second.name);
    expect(stored.teamId).toBe(second.teamId);
  });
});
