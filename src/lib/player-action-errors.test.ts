import { describe, expect, test } from "bun:test";
import { friendlyPlayerActionError } from "./player-action-errors";

describe("friendlyPlayerActionError", () => {
  test("maps network failures to retry guidance", () => {
    const message = friendlyPlayerActionError(new Error("Failed to fetch"), "vote");

    expect(message).toContain("vote");
    expect(message).toContain("network dropped");
  });

  test("explains stale round actions", () => {
    const message = friendlyPlayerActionError(new Error("track guess voting is closed"), "guess");

    expect(message).toContain("round moved on");
    expect(message).toContain("host screen");
  });

  test("explains lost player sessions", () => {
    const message = friendlyPlayerActionError(new Error("player authorization required"), "answer");

    expect(message).toContain("lost its player session");
    expect(message).toContain("Rejoin");
  });
});
