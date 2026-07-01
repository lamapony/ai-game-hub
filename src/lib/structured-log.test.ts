import { describe, expect, test } from "bun:test";
import { buildLogPayload, errorFields } from "./structured-log";

describe("structured logging", () => {
  test("redacts sensitive fields", () => {
    const payload = buildLogPayload("info", "test.event", {
      token: "secret-token",
      apiKey: "secret-key",
      normal: "visible",
    });

    expect(payload.token).toBe("[redacted]");
    expect(payload.apiKey).toBe("[redacted]");
    expect(payload.normal).toBe("visible");
  });

  test("truncates long strings", () => {
    const payload = buildLogPayload("warn", "test.event", {
      message: "x".repeat(600),
    });

    expect(String(payload.message).length).toBe(503);
  });

  test("normalizes Error objects without stack traces", () => {
    const payload = errorFields(new TypeError("bad input"));

    expect(payload.errorName).toBe("TypeError");
    expect(payload.errorMessage).toBe("bad input");
  });
});
