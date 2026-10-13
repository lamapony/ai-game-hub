import assert from "node:assert/strict";
import { prewarmAiGame } from "../ai-prewarm.server";
import type { AuthorizedHostRoom } from "../host-auth.server";
import type { PartyRecordRow } from "../party-records";
import { emptyRoomState } from "../types";

process.env.OPENAI_API_KEY = "prewarm-fixture-key";
process.env.OPENAI_BASE_URL = "https://prewarm-fixture.invalid/v1";

async function verifyPreparationRace(mode: "success" | "failure" | "timeout" | "conflict") {
  const room: AuthorizedHostRoom = {
    id: "prewarm_concurrency",
    code: "TEST",
    state: emptyRoomState("Host"),
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
  room.state.players = Array.from({ length: 8 }, (_, index) => ({
    id: `player_${index}`,
    name: `Guest ${index}`,
    teamId: "forest",
    joinedAt: index,
  }));
  const records: PartyRecordRow[] = [];
  const initialState = room.state;
  let revision = 0;
  let providerRequests = 0;
  let writeConflicts = 0;
  let providerReleased = false;
  let releaseProvider!: () => void;
  let providerStarted!: () => void;
  const providerGate = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const providerEntered = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  const output = { topics: ["Provider topic one", "Provider topic two", "Provider topic three"] };
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/rest/v1/rooms")) {
      if (init?.method === "PATCH") {
        if (url.searchParams.get("updated_at") !== `eq.${room.updatedAt}`) {
          writeConflicts += 1;
          return Response.json([]);
        }
        room.state = JSON.parse(String(init.body)).state;
        room.updatedAt = new Date(Date.parse("2026-10-13T00:00:00Z") + ++revision).toISOString();
      }
      const staleBudgetRead = mode === "conflict" && providerRequests === 1 && !providerReleased;
      return Response.json([
        {
          id: room.id,
          state: staleBudgetRead ? initialState : room.state,
          updated_at: staleBudgetRead ? "2026-10-13T00:00:00.000Z" : room.updatedAt,
        },
      ]);
    }
    if (url.pathname.endsWith("/rest/v1/party_records")) {
      if (init?.method === "POST") {
        const insert = JSON.parse(String(init.body));
        if (records.some((record) => record.idempotency_key === insert.idempotency_key))
          return Response.json([]);
        const record = {
          id: `prepared_${records.length}`,
          created_at: room.updatedAt,
          revealed_at: null,
          ...insert,
        } as PartyRecordRow;
        records.push(record);
        return Response.json([record]);
      }
      const key = url.searchParams.get("idempotency_key");
      return Response.json(
        records.filter((record) => !key || key === `eq.${record.idempotency_key}`),
      );
    }
    if (url.hostname === "prewarm-fixture.invalid" && url.pathname.endsWith("/chat/completions")) {
      providerRequests += 1;
      providerStarted();
      await providerGate;
      if (mode === "failure") throw new Error("Controlled provider failure");
      return Response.json({
        choices: [{ message: { content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 12, completion_tokens: 12, total_tokens: 24 },
      });
    }
    throw new Error("Unexpected request in AI prewarm concurrency fixture");
  }) as typeof fetch;

  const request = () =>
    prewarmAiGame({ room: { ...room }, gameId: "soundscape", targetActId: "classic" });
  const first = request();
  let second: ReturnType<typeof request> | undefined;
  try {
    await providerEntered;
    if (mode === "timeout") {
      let fixtureTime = originalNow();
      Date.now = () => (fixtureTime += 46_000);
    }
    second = request();
    if (mode === "timeout") {
      await assert.rejects(
        second,
        (error: unknown) => (error as { status?: number }).status === 409,
      );
      assert.equal(records.length, 0, "a timed-out duplicate must not publish fallback");
      Date.now = originalNow;
      releaseProvider();
      assert.equal((await first).record.usedFallback, false);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      records.length,
      0,
      "a duplicate must not publish fallback while the provider is running",
    );
    if (mode === "conflict") assert.equal(writeConflicts, 3);
    releaseProvider();
    providerReleased = true;
    const [primary, duplicate] = await Promise.all([first, second]);
    assert.equal(providerRequests, 1);
    assert.equal(records.length, 1);
    assert.equal(primary.record.usedFallback, mode === "failure");
    assert.equal(duplicate.record.usedFallback, mode === "failure");
    if (mode === "success") assert.deepEqual(primary.record.output, output);
    assert.deepEqual(duplicate.record.output, primary.record.output);
  } finally {
    releaseProvider();
    Date.now = originalNow;
    await Promise.allSettled([first, ...(second ? [second] : [])]);
    globalThis.fetch = originalFetch;
  }
}

await verifyPreparationRace("success");
await verifyPreparationRace("failure");
await verifyPreparationRace("conflict");
await verifyPreparationRace("timeout");
console.log("Concurrent AI preparation verified");
