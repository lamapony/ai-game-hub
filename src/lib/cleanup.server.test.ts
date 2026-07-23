import { describe, expect, test } from "bun:test";

type QueryResult = {
  data?: Array<{ id: string }> | null;
  count?: number | null;
  error: null | { code: string; message: string };
};

const mockState = {
  oldRoomIds: ["room_old"],
  counts: {
    party_records: 2,
    score_events: 3,
    challenges: 0,
    photos: 0,
    submissions: 0,
    votes: 0,
  } as Record<string, number>,
  missingTables: [] as string[],
  missingOnDeleteTables: [] as string[],
  deletedTables: [] as string[],
  deletedRoomIds: [] as string[],
  storageFiles: [{ name: "clip.webm", id: "object-1", metadata: { size: 12 } }],
  removedStoragePaths: [] as string[],
};

class QueryBuilder {
  private mode: "select" | "delete" = "select";
  private head = false;
  private inValues: string[] = [];

  constructor(private readonly table: string) {}

  select(_columns: string, options?: { count?: string; head?: boolean }) {
    this.mode = "select";
    this.head = options?.head ?? false;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  in(_field: string, values: string[]) {
    this.inValues = values;
    return this;
  }

  lt(_field: string, _value: string) {
    return this;
  }

  order(_field: string, _options: { ascending: boolean }) {
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    let result: QueryResult;
    if (this.mode === "delete") {
      if (mockState.missingOnDeleteTables.includes(this.table)) {
        result = {
          data: null,
          error: {
            code: "PGRST205",
            message: `Could not find the table 'public.${this.table}' in the schema cache`,
          },
        };
        return Promise.resolve(result).then(onfulfilled, onrejected);
      }
      mockState.deletedTables.push(this.table);
      if (this.table === "rooms") mockState.deletedRoomIds.push(...this.inValues);
      result = { data: null, error: null };
    } else if (this.table === "rooms" && !this.head) {
      result = { data: mockState.oldRoomIds.map((id) => ({ id })), error: null };
    } else if (mockState.missingTables.includes(this.table)) {
      result = {
        data: null,
        error: {
          code: "PGRST205",
          message: `Could not find the table 'public.${this.table}' in the schema cache`,
        },
      };
    } else {
      result = { data: null, count: mockState.counts[this.table] ?? 0, error: null };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

const bunMock = (await import("bun:test")) as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
};

bunMock.mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      return new QueryBuilder(table);
    },
    storage: {
      from(bucket: string) {
        if (bucket !== "recordings") throw new Error(`Unexpected bucket: ${bucket}`);
        return {
          async list(prefix: string) {
            return {
              data: prefix === "room_old" || prefix === "room_smoke" ? mockState.storageFiles : [],
              error: null,
            };
          },
          async remove(paths: string[]) {
            mockState.removedStoragePaths.push(...paths);
            return { data: [], error: null };
          },
        };
      },
    },
  },
}));

const { cleanupOldRooms, cleanupRoomById } = await import("./cleanup.server");

describe("cleanup private party memory", () => {
  test("counts and deletes private records and score events before their room", async () => {
    mockState.deletedTables = [];
    mockState.deletedRoomIds = [];
    mockState.missingTables = [];
    mockState.missingOnDeleteTables = [];
    mockState.removedStoragePaths = [];

    const result = await cleanupOldRooms({
      retentionHours: 24,
      now: new Date("2026-07-15T12:00:00.000Z"),
    });

    expect(result.roomsMatched).toBe(1);
    expect(result.roomsDeleted).toBe(1);
    expect(result.rowsDeleted.party_records).toBe(2);
    expect(result.rowsDeleted.score_events).toBe(3);
    expect(result.storageObjectsMatched).toBe(1);
    expect(result.storageObjectsDeleted).toBe(1);
    expect(mockState.removedStoragePaths).toEqual(["room_old/clip.webm"]);
    expect(mockState.deletedTables.includes("party_records")).toBe(true);
    expect(mockState.deletedTables.includes("score_events")).toBe(true);
    expect(
      mockState.deletedTables.indexOf("party_records") < mockState.deletedTables.indexOf("rooms"),
    ).toBe(true);
    expect(
      mockState.deletedTables.indexOf("score_events") < mockState.deletedTables.indexOf("rooms"),
    ).toBe(true);
  });

  test("targeted cleanup only deletes the explicitly named room", async () => {
    mockState.deletedTables = [];
    mockState.deletedRoomIds = [];
    mockState.missingTables = ["party_records", "score_events"];
    mockState.missingOnDeleteTables = [];
    mockState.removedStoragePaths = [];

    const result = await cleanupRoomById("room_smoke");

    expect(result.roomsMatched).toBe(1);
    expect(result.roomsDeleted).toBe(1);
    expect(result.rowsDeleted.party_records).toBe(0);
    expect(result.rowsDeleted.score_events).toBe(0);
    expect(mockState.deletedRoomIds).toEqual(["room_smoke"]);
    expect(mockState.removedStoragePaths).toEqual(["room_smoke/clip.webm"]);
  });

  test("targeted cleanup tolerates a table disappearing between count and delete", async () => {
    mockState.deletedTables = [];
    mockState.deletedRoomIds = [];
    mockState.missingTables = [];
    mockState.missingOnDeleteTables = ["party_records"];
    mockState.removedStoragePaths = [];

    const result = await cleanupRoomById("room_smoke");

    expect(result.roomsDeleted).toBe(1);
    expect(mockState.deletedRoomIds).toEqual(["room_smoke"]);
  });
});
