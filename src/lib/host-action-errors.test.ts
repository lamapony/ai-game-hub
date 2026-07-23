import { describe, expect, test } from "bun:test";
import { friendlyHostActionError } from "./host-action-errors";

describe("friendlyHostActionError", () => {
  test("maps network failures to retry guidance", () => {
    const message = friendlyHostActionError(new Error("Failed to fetch"), "round update");

    expect(message).toContain("round update");
    expect(message).toContain("network dropped");
  });

  test("uses the requested host-facing recovery verb", () => {
    const message = friendlyHostActionError(new Error("Failed to fetch"), "AI game", "prepare");

    expect(message).toContain("Could not prepare AI game");
  });

  test("explains lost host access", () => {
    const message = friendlyHostActionError(new Error("host authorization required"));

    expect(message).toContain("lost host access");
    expect(message).toContain("original host device");
  });

  test("turns a phase conflict into current-panel guidance", () => {
    const message = friendlyHostActionError(new Error("round mismatch: private-run-sentinel"));

    expect(message).toContain("party step changed");
    expect(message).toContain("current game panel");
    expect(message.includes("private-run-sentinel")).toBe(false);
  });

  test("keeps unknown server messages private", () => {
    const message = friendlyHostActionError(
      new Error("write rejected at private-relation-sentinel"),
      "team edit",
    );

    expect(message).toContain("team edit");
    expect(message).toContain("pause the party");
    expect(message.includes("private-relation-sentinel")).toBe(false);
  });
});
