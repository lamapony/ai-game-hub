import { describe, expect, test } from "bun:test";
import { friendlyHostActionError } from "./host-action-errors";

describe("friendlyHostActionError", () => {
  test("maps network failures to retry guidance", () => {
    const message = friendlyHostActionError(new Error("Failed to fetch"), "round update");

    expect(message).toContain("round update");
    expect(message).toContain("network dropped");
  });

  test("explains lost host access", () => {
    const message = friendlyHostActionError(new Error("host authorization required"));

    expect(message).toContain("lost host access");
    expect(message).toContain("original host device");
  });

  test("keeps unknown server messages visible", () => {
    const message = friendlyHostActionError(new Error("write rejected"), "team edit");

    expect(message).toContain("team edit");
    expect(message).toContain("write rejected");
  });
});
