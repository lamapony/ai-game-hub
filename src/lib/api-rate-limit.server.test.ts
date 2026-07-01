import { describe, expect, test } from "bun:test";
import { checkRateLimit, clientRateLimitKey, rateLimitResponse } from "./api-rate-limit.server";

describe("api rate limiting", () => {
  test("allows requests until the fixed window limit is reached", () => {
    const key = `test:${crypto.randomUUID()}`;

    expect(checkRateLimit(key, { limit: 2, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000, now: 200 }).allowed).toBe(true);

    const denied = checkRateLimit(key, { limit: 2, windowMs: 1000, now: 300 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(1);
  });

  test("resets the bucket after the window expires", () => {
    const key = `test:${crypto.randomUUID()}`;

    expect(checkRateLimit(key, { limit: 1, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(checkRateLimit(key, { limit: 1, windowMs: 1000, now: 200 }).allowed).toBe(false);
    expect(checkRateLimit(key, { limit: 1, windowMs: 1000, now: 1200 }).allowed).toBe(true);
  });

  test("extracts client identity from Cloudflare and proxy headers", () => {
    const direct = new Request("https://example.test", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    });
    const forwarded = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.2, 198.51.100.7" },
    });

    expect(clientRateLimitKey(direct)).toBe("203.0.113.1");
    expect(clientRateLimitKey(forwarded)).toBe("203.0.113.2");
  });

  test("returns standard 429 headers", () => {
    const response = rateLimitResponse({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: 10_000,
      retryAfterSeconds: 7,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBe("10");
  });
});
