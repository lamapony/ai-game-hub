import { describe, expect, test } from "bun:test";
import { friendlyPlayerActionError } from "./player-action-errors";

describe("friendlyPlayerActionError", () => {
  test("explains a full room without exposing a server error", () => {
    const message = friendlyPlayerActionError(new Error("room is full (30 players)"), "join");

    expect(message).toContain("30 players");
    expect(message).toContain("host");
    expect(message.includes("Could not send")).toBe(false);
  });

  test("maps network failures to retry guidance", () => {
    const message = friendlyPlayerActionError(new Error("Failed to fetch"), "vote");

    expect(message).toContain("vote");
    expect(message).toContain("network dropped");
  });

  test("uses the requested player-facing recovery verb", () => {
    const message = friendlyPlayerActionError(new Error("Failed to fetch"), "secret", "load");

    expect(message).toContain("Could not load secret");
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

  test("keeps unknown server messages private", () => {
    const message = friendlyPlayerActionError(
      new Error("write rejected at private-relation-sentinel"),
      "answer",
    );

    expect(message).toContain("Try again");
    expect(message).toContain("host screen");
    expect(message.includes("private-relation-sentinel")).toBe(false);
  });
});
