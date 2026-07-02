import { describe, expect, test } from "bun:test";
import { createVoiceSession, voiceProviderConfig } from "./voice-provider.server";

const originalFetch = globalThis.fetch;

describe("voice provider adapter", () => {
  test("auto prefers xAI when both providers are configured", () => {
    const config = voiceProviderConfig({
      VOICE_PROVIDER: "auto",
      OPENAI_API_KEY: "openai",
      XAI_API_KEY: "xai",
    });

    expect(config.selected).toBe("xai");
    expect(config.openaiConfigured).toBe(true);
    expect(config.xaiConfigured).toBe(true);
  });

  test("auto falls back to OpenAI when xAI is not configured", () => {
    const config = voiceProviderConfig({
      VOICE_PROVIDER: "auto",
      OPENAI_API_KEY: "openai",
    });

    expect(config.selected).toBe("openai");
  });

  test("auto retries OpenAI when xAI session creation fails", async () => {
    try {
      const calls: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        calls.push(String(input));
        if (String(input).includes("api.x.ai")) {
          return Response.json({ error: "invalid xAI key" }, { status: 400 });
        }
        return Response.json({ client_secret: { value: "openai-secret", expires_at: 456 } });
      }) as typeof fetch;

      const session = await createVoiceSession({
        VOICE_PROVIDER: "auto",
        OPENAI_API_KEY: "openai",
        XAI_API_KEY: "xai",
        OPENAI_REALTIME_MODEL: "gpt-realtime-2",
        XAI_REALTIME_MODEL: "grok-voice-latest",
      });

      expect(calls).toEqual([
        "https://api.x.ai/v1/realtime/client_secrets",
        "https://api.openai.com/v1/realtime/client_secrets",
      ]);
      expect(session.provider).toBe("openai");
      expect(session.transport).toBe("webrtc");
      expect(session.clientSecret).toBe("openai-secret");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("creates normalized xAI websocket sessions", async () => {
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.x.ai/v1/realtime/client_secrets");
        expect(init?.method).toBe("POST");
        return Response.json({ value: "xai-secret", expires_at: 123 });
      }) as typeof fetch;

      const session = await createVoiceSession({
        VOICE_PROVIDER: "xai",
        XAI_API_KEY: "xai",
        XAI_REALTIME_MODEL: "grok-voice-latest",
      });

      expect(session.provider).toBe("xai");
      expect(session.transport).toBe("websocket");
      expect(session.clientSecret).toBe("xai-secret");
      expect(session.protocol).toBe("xai-client-secret.xai-secret");
      expect(session.connectUrl).toContain("grok-voice-latest");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("creates normalized OpenAI WebRTC sessions", async () => {
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.openai.com/v1/realtime/client_secrets");
        expect(init?.method).toBe("POST");
        return Response.json({ client_secret: { value: "openai-secret", expires_at: 456 } });
      }) as typeof fetch;

      const session = await createVoiceSession({
        VOICE_PROVIDER: "openai",
        OPENAI_API_KEY: "openai",
        OPENAI_REALTIME_MODEL: "gpt-realtime-2",
      });

      expect(session.provider).toBe("openai");
      expect(session.transport).toBe("webrtc");
      expect(session.clientSecret).toBe("openai-secret");
      expect(session.connectUrl).toBe("https://api.openai.com/v1/realtime/calls");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
