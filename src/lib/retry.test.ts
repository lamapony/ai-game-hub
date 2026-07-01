import { describe, expect, test } from "bun:test";
import { isRetryableError, isRetryableStatus, retryDelayMs, retryOperation } from "./retry";

describe("retry helpers", () => {
  test("marks transient HTTP statuses as retryable", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
  });

  test("marks network-like errors as retryable", () => {
    expect(isRetryableError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableError({ statusCode: 503 })).toBe(true);
    expect(isRetryableError({ statusCode: 403 })).toBe(false);
  });

  test("uses capped exponential delays", () => {
    expect(retryDelayMs(1, 100, 1000)).toBe(100);
    expect(retryDelayMs(2, 100, 1000)).toBe(200);
    expect(retryDelayMs(8, 100, 1000)).toBe(1000);
  });

  test("retries transient failures and returns the successful result", async () => {
    let attempts = 0;
    let slept = 0;

    const result = await retryOperation(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new TypeError("fetch failed");
        return "ok";
      },
      {
        attempts: 3,
        baseDelayMs: 10,
        sleep: async (ms) => {
          slept += ms;
        },
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(slept).toBe(30);
  });

  test("does not retry non-transient failures", async () => {
    let attempts = 0;

    try {
      await retryOperation(
        async () => {
          attempts += 1;
          throw { statusCode: 403 };
        },
        { attempts: 3, sleep: async () => {} },
      );
    } catch {
      // expected
    }

    expect(attempts).toBe(1);
  });
});
