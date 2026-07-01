import { describe, expect, test } from "bun:test";
import { friendlyMediaError, friendlyUploadError } from "./media-errors";

describe("friendlyMediaError", () => {
  test("explains denied microphone permission", () => {
    const error = new DOMException("Permission denied", "NotAllowedError");

    expect(friendlyMediaError(error, "microphone")).toContain("микрофону");
    expect(friendlyMediaError(error, "microphone")).toContain("Разреши доступ");
  });

  test("explains unavailable camera/microphone device", () => {
    const error = new DOMException("No device", "NotFoundError");

    expect(friendlyMediaError(error, "camera-microphone")).toContain("Устройство не нашло");
    expect(friendlyMediaError(error, "camera-microphone")).toContain("камере и микрофону");
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

    expect(message).toContain("видео");
    expect(message).toContain("пропала сеть");
  });

  test("maps missing signed url to retry guidance", () => {
    const message = friendlyUploadError(new Error("no signed url"), "photo");

    expect(message).toContain("кадр");
    expect(message).toContain("Попробуй отправить ещё раз");
  });

  test("maps oversize payloads to shorter recording guidance", () => {
    const message = friendlyUploadError(new Error("413 Payload Too Large"), "audio");

    expect(message).toContain("звук");
    expect(message).toContain("файл слишком большой");
  });
});
