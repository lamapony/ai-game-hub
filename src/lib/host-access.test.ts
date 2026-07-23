import { describe, expect, test } from "bun:test";
import {
  buildHostAccessUrl,
  hostSecretFromAccessHash,
  normalizeHostAccessSecret,
  verifyHostAccessClient,
} from "./host-access";

describe("private backup host access", () => {
  test("keeps the host credential in the URL fragment and parses it exactly once", () => {
    const secret = `hs_${"a1".repeat(24)}`;
    const link = buildHostAccessUrl("https://party.example", "ab12", secret);
    const url = new URL(link);

    expect(url.origin).toBe("https://party.example");
    expect(url.pathname).toBe("/host/AB12");
    expect(url.search).toBe("");
    expect(url.pathname.includes(secret)).toBe(false);
    expect(hostSecretFromAccessHash(url.hash)).toBe(secret);
    expect(hostSecretFromAccessHash(`#host-access=${secret}&host-access=${secret}`)).toBeNull();
    expect(hostSecretFromAccessHash("#host-access=not-a-host-secret")).toBeNull();
    expect(normalizeHostAccessSecret(` ${secret} `)).toBe(secret);
  });

  test("verifies the fragment credential before a browser stores it", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input, init });
      return Response.json({ roomId: "room_1", code: "AB12" });
    };

    try {
      const access = await verifyHostAccessClient({ code: "ab12", hostSecret: "hs_12345678" });

      expect(access).toEqual({ roomId: "room_1", code: "AB12" });
      expect(String(calls[0]?.input)).toBe("/api/host-access");
      expect(calls[0]?.init?.method).toBe("POST");
      expect((calls[0]?.init?.headers as Record<string, string>)["x-host-secret"]).toBe(
        "hs_12345678",
      );
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ code: "ab12" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("turns a rejected credential into safe recovery guidance", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("host access denied", { status: 403 });
    let message = "";

    try {
      await verifyHostAccessClient({ code: "AB12", hostSecret: "hs_12345678" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(message).toContain("invalid or the room has expired");
    expect(message.includes("hs_12345678")).toBe(false);
  });

  test("turns a rejected fetch into safe recovery guidance", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Failed to fetch https://private.example?token=secret-sentinel");
    };
    let message = "";

    try {
      await verifyHostAccessClient({ code: "AB12", hostSecret: "hs_12345678" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(message).toContain("Check the connection");
    expect(message.includes("private.example")).toBe(false);
    expect(message.includes("secret-sentinel")).toBe(false);
    expect(message.includes("hs_12345678")).toBe(false);
  });
});
