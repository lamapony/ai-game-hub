import { describe, expect, test } from "bun:test";
import { emptyRoomState } from "./types";

type QueryResult<T> = { data: T | null; error: { message: string } | null };

const mockRooms = {
  result: {
    data: {
      id: "room_1",
      code: "ABCD",
      host_secret: "secret",
      state: emptyRoomState("Host"),
    },
    error: null,
  } as QueryResult<{
    id: string;
    code: string;
    host_secret: string;
    state: ReturnType<typeof emptyRoomState>;
  }>,
  updates: [] as { id: string; state: ReturnType<typeof emptyRoomState> }[],
};

class RoomsQueryBuilder {
  private updatePayload: { state: ReturnType<typeof emptyRoomState> } | null = null;
  private id: string | null = null;

  select() {
    return this;
  }

  update(payload: { state: ReturnType<typeof emptyRoomState> }) {
    this.updatePayload = payload;
    return this;
  }

  eq(field: string, value: string) {
    if (field === "id") this.id = value;
    return this;
  }

  async maybeSingle() {
    return mockRooms.result;
  }

  then<TResult1 = QueryResult<null>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    if (this.updatePayload && this.id) {
      mockRooms.updates.push({ id: this.id, state: this.updatePayload.state });
    }
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

const bunMock = (await import("bun:test")) as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
};

bunMock.mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table !== "rooms") throw new Error(`Unexpected table: ${table}`);
      return new RoomsQueryBuilder();
    },
  },
}));

const { authorizeHostRoom, hostSecretFromRequest, writeAuthorizedRoomState } =
  await import("./host-auth.server");

async function rejectedStatus(run: () => Promise<unknown>) {
  try {
    await run();
    return 0;
  } catch (error) {
    return Number((error as { status?: number }).status ?? 500);
  }
}

describe("host auth server helpers", () => {
  test("authorizes rooms with a matching host secret", async () => {
    const room = await authorizeHostRoom({ code: "abcd", hostSecret: "secret" });

    expect(room.id).toBe("room_1");
    expect(room.code).toBe("ABCD");
    expect(room.state.hostName).toBe("Host");
  });

  test("rejects missing and invalid host secrets", async () => {
    expect(await rejectedStatus(() => authorizeHostRoom({ code: "ABCD", hostSecret: "" }))).toBe(
      401,
    );
    expect(
      await rejectedStatus(() => authorizeHostRoom({ code: "ABCD", hostSecret: "wrong" })),
    ).toBe(403);
  });

  test("reads host secret from header before body", () => {
    const request = new Request("https://example.test", {
      headers: { "x-host-secret": "header-secret" },
    });

    expect(hostSecretFromRequest(request, { hostSecret: "body-secret" })).toBe("header-secret");
  });

  test("writes authorized room state with the service role client", async () => {
    mockRooms.updates = [];
    const state = emptyRoomState("Next");

    await writeAuthorizedRoomState("room_1", state);

    expect(mockRooms.updates[0]?.id).toBe("room_1");
    expect(mockRooms.updates[0]?.state.hostName).toBe("Next");
  });
});
