import { describe, expect, test } from "bun:test";
import { mapAllSettledBounded } from "./async-pool";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("bounded async pool", () => {
  test("runs only the allowed number of tasks and preserves input order", async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const running = mapAllSettledBounded([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await gates[item]!.promise;
      active -= 1;
      if (item === 2) throw new Error("team mix failed");
      return `mix-${item}`;
    });

    await flushMicrotasks();
    expect(started).toEqual([0, 1]);
    gates[0]!.resolve();
    await flushMicrotasks();
    expect(started).toEqual([0, 1, 2]);
    gates[1]!.resolve();
    await flushMicrotasks();
    expect(started).toEqual([0, 1, 2, 3]);
    gates[2]!.resolve();
    gates[3]!.resolve();

    const results = await running;
    expect(maximumActive).toBe(2);
    expect(results[0]).toEqual({ status: "fulfilled", value: "mix-0" });
    expect(results[1]).toEqual({ status: "fulfilled", value: "mix-1" });
    expect(results[2]?.status).toBe("rejected");
    expect(results[3]).toEqual({ status: "fulfilled", value: "mix-3" });
  });

  test("handles an empty queue and clamps invalid concurrency", async () => {
    expect(await mapAllSettledBounded([], 2, async () => "unused")).toEqual([]);
    let active = 0;
    let maximumActive = 0;
    const results = await mapAllSettledBounded([1, 2], 0, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return item;
    });
    expect(maximumActive).toBe(1);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
  });
});
