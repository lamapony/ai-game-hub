import { describe, expect, test } from "bun:test";
import { chatJSON } from "./ai-gateway.server";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_CHAT_MODEL;

function restoreGlobals() {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_CHAT_MODEL;
  else process.env.OPENAI_CHAT_MODEL = originalModel;
}

describe("chatJSON structured output", () => {
  test("prefers native json_schema with prompt metadata", async () => {
    try {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.OPENAI_CHAT_MODEL = "test-model";
      const requests: Array<Record<string, unknown>> = [];
      let usage: unknown;
      globalThis.fetch = (async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
        });
      }) as typeof fetch;

      const result = await chatJSON<{ ok: boolean }>({
        system: "system",
        user: "user",
        responseSchema: {
          name: "test_output",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
        prompt: { id: "test.prompt", version: 2, gameId: "challenge", actId: "grill" },
        onUsage: (value) => {
          usage = value;
        },
      });

      expect(result).toEqual({ ok: true });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.response_format).toEqual({
        type: "json_schema",
        json_schema: {
          name: "test_output",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
      });
      expect(usage).toEqual({
        model: "test-model",
        inputTokens: 12,
        outputTokens: 3,
        totalTokens: 15,
        providerRequests: 1,
      });
    } finally {
      restoreGlobals();
    }
  });

  test("falls back once to json_object for compatible providers", async () => {
    try {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.OPENAI_CHAT_MODEL = "test-model";
      const formats: unknown[] = [];
      let providerRequests = 0;
      globalThis.fetch = (async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { response_format?: unknown };
        formats.push(body.response_format);
        if (formats.length === 1) return new Response("unsupported", { status: 400 });
        return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
      }) as typeof fetch;

      const result = await chatJSON<{ ok: boolean }>({
        system: "system",
        user: "user",
        responseSchema: {
          name: "test_output",
          schema: { type: "object", properties: { ok: { type: "boolean" } } },
        },
        onUsage: (usage) => {
          providerRequests = usage.providerRequests;
        },
      });

      expect(result.ok).toBe(true);
      expect(formats).toHaveLength(2);
      expect((formats[0] as { type?: unknown }).type).toBe("json_schema");
      expect(formats[1]).toEqual({ type: "json_object" });
      expect(providerRequests).toBe(2);
    } finally {
      restoreGlobals();
    }
  });
});
