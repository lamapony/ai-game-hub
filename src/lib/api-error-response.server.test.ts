import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { statusError } from "./player-auth.server";
import {
  publicApiErrorMessage,
  publicApiErrorResponse,
  publicApiErrorStatus,
} from "./api-error-response.server";

describe("public API error responses", () => {
  test("preserves an explicitly public domain conflict", async () => {
    const error = statusError("round mismatch", 409);
    const response = publicApiErrorResponse(error, { fallbackMessage: "action failed" });

    expect(response.status).toBe(409);
    expect(await response.text()).toBe("round mismatch");
  });

  test("hides an unknown Error message and embedded secret", async () => {
    const error = new Error("private relation at https://private.example?token=secret-sentinel");
    const response = publicApiErrorResponse(error, { fallbackMessage: "action failed" });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe("action failed");
    expect(body.includes("private.example")).toBe(false);
    expect(body.includes("secret-sentinel")).toBe(false);
  });

  test("keeps an internal error status without trusting its message", async () => {
    const error = { status: 409, message: "private postgres conflict sentinel" };
    const response = publicApiErrorResponse(error, { fallbackMessage: "write failed" });

    expect(response.status).toBe(409);
    expect(await response.text()).toBe("write failed");
  });

  test("rejects malformed statuses and bounds public copy", () => {
    expect(publicApiErrorStatus({ status: 200 })).toBe(500);
    expect(publicApiErrorStatus({ status: "503" })).toBe(503);
    expect(
      publicApiErrorMessage({ publicMessage: `safe\n${"x".repeat(300)}` }, "fallback").length,
    ).toBe(240);
  });

  test("API routes never return raw Error.message from a catch", () => {
    const apiRoutes = readdirSync("src/routes/api")
      .filter((path) => path.endsWith(".ts"))
      .map((path) => readFileSync(`src/routes/api/${path}`, "utf8"));

    for (const route of apiRoutes) {
      expect(route.includes("error instanceof Error ? error.message")).toBe(false);
      expect(route.includes("e instanceof Error ? e.message")).toBe(false);
      expect(/new Response\([^\n]*\.message/.test(route)).toBe(false);
    }
  });
});
