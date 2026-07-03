import { describe, expect, test } from "bun:test";
import { friendlyMediaError, friendlyUploadError } from "./media-errors";

describe("friendlyMediaError", () => {
  test("explains denied microphone permission", () => {
    const error = new DOMException("Permission denied", "NotAllowedError");

    expect(friendlyMediaError(error, "microphone")).toContain("microphone");
    expect(friendlyMediaError(error, "microphone")).toContain("Allow access");
  });

  test("explains unavailable camera/microphone device", () => {
    const error = new DOMException("No device", "NotFoundError");

    expect(friendlyMediaError(error, "camera-microphone")).toContain("Device did not find");
    expect(friendlyMediaError(error, "camera-microphone")).toContain("camera and microphone");
  });

  test("keeps unknown media errors visible", () => {
    expect(friendlyMediaError(new Error("weird browser failure"), "camera")).toContain(
      "weird browser failure",
    );
  });
});

describe("friendlyUploadError", () => {
  test("maps network upload failures to retry guidance", () => {
    const message = friendlyUploadError(new Error("Network request failed"), "video");

    expect(message).toContain("video");
    expect(message).toContain("network dropped");
  });

  test("maps missing signed url to retry guidance", () => {
    const message = friendlyUploadError(new Error("no signed url"), "photo");

    expect(message).toContain("photo");
    expect(message).toContain("Try sending again");
  });

  test("maps oversize payloads to shorter recording guidance", () => {
    const message = friendlyUploadError(new Error("413 Payload Too Large"), "audio");

    expect(message).toContain("sound");
    expect(message).toContain("file too large");
  });
});
