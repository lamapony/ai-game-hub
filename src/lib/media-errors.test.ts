import { describe, expect, test } from "bun:test";
import { friendlyMediaError, friendlyUploadError } from "./media-errors";

describe("friendlyMediaError", () => {
  test("explains denied microphone permission", () => {
    const error = new DOMException("Permission denied", "NotAllowedError");

    expect(friendlyMediaError(error, "microphone")).toContain("microphone");
    expect(friendlyMediaError(error, "microphone")).toContain("Allow access");
    expect(friendlyMediaError(error, "microphone")).toContain("Try again");
  });

  test("explains unavailable camera/microphone device", () => {
    const error = new DOMException("No device", "NotFoundError");

    expect(friendlyMediaError(error, "camera-microphone")).toContain("Device did not find");
    expect(friendlyMediaError(error, "camera-microphone")).toContain("camera and microphone");
  });

  test("keeps unknown media errors private", () => {
    const message = friendlyMediaError(
      new Error("weird browser failure at private-device-sentinel"),
      "camera",
    );

    expect(message).toContain("camera");
    expect(message).toContain("Try again");
    expect(message.includes("private-device-sentinel")).toBe(false);
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

  test("turns storage failures into a non-technical retry", () => {
    const message = friendlyUploadError(
      new Error("Supabase Storage bucket private-bucket-sentinel is missing"),
      "photo",
    );

    expect(message).toContain("temporarily unavailable");
    expect(message).toContain("Stay on this screen");
    expect(message.includes("Supabase")).toBe(false);
    expect(message.includes("private-bucket-sentinel")).toBe(false);
  });

  test("keeps unknown upload failures private", () => {
    const message = friendlyUploadError(new Error("unexpected private-upload-sentinel"), "audio");

    expect(message).toContain("Stay on this screen");
    expect(message.includes("private-upload-sentinel")).toBe(false);
  });
});
