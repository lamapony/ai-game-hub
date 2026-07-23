import { describe, expect, test } from "bun:test";
import { withRoomActionQueue } from "./room-action-queue.server";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("withRoomActionQueue", () => {
  test("serializes actions for the same room and reports queue wait", async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const events: string[] = [];
    let clock = 100;

    const first = withRoomActionQueue(
      "room_1",
      async () => {
        events.push("first:start");
        firstStarted.resolve();
        await releaseFirst.promise;
        events.push("first:end");
        return "first";
      },
      () => clock,
    );
    await firstStarted.promise;

    const second = withRoomActionQueue(
      "room_1",
      async () => {
        events.push("second:start");
        return "second";
      },
      () => clock,
    );
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    clock = 145;
    releaseFirst.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second:start"]);
    expect(firstResult).toEqual({ value: "first", queueWaitMs: 0 });
    expect(secondResult).toEqual({ value: "second", queueWaitMs: 45 });
  });

  test("allows different rooms to mutate concurrently", async () => {
    const roomAStarted = deferred();
    const roomBStarted = deferred();
    const release = deferred();

    const roomA = withRoomActionQueue("room_a", async () => {
      roomAStarted.resolve();
      await release.promise;
      return "a";
    });
    const roomB = withRoomActionQueue("room_b", async () => {
      roomBStarted.resolve();
      await release.promise;
      return "b";
    });

    await Promise.all([roomAStarted.promise, roomBStarted.promise]);
    release.resolve();
    expect((await Promise.all([roomA, roomB])).map((result) => result.value)).toEqual(["a", "b"]);
  });

  test("releases the next action after a failure and removes an idle queue", async () => {
    const firstStarted = deferred();
    const rejectFirst = deferred();
    const failure = new Error("write failed");
    let clock = 10;

    const first = withRoomActionQueue(
      "room_failure",
      async () => {
        firstStarted.resolve();
        await rejectFirst.promise;
        throw failure;
      },
      () => clock,
    );
    await firstStarted.promise;
    const second = withRoomActionQueue(
      "room_failure",
      async () => "recovered",
      () => clock,
    );

    clock = 25;
    rejectFirst.resolve();
    expect(await first.catch((error) => error)).toBe(failure);
    expect(await second).toEqual({ value: "recovered", queueWaitMs: 15 });

    clock = 40;
    expect(
      await withRoomActionQueue(
        "room_failure",
        async () => "fresh",
        () => clock,
      ),
    ).toEqual({
      value: "fresh",
      queueWaitMs: 0,
    });
  });
});
