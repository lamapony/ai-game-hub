import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { contextForExperience } from "@/experiences/catalog";
import type { PromptSpec } from "./prompt-contract";
import { runPromptSpec } from "./prompt-runtime.server";

const spec: PromptSpec<{ seed: number }, { value: string }> = {
  id: "test.manual-runtime",
  version: 1,
  gameId: "challenge",
  outputSchema: z.object({ value: z.string() }).strict(),
  jsonSchema: {
    name: "test_manual_runtime",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { value: { type: "string" } },
      required: ["value"],
    },
  },
  buildSystem: () => "system",
  buildUser: ({ seed }) => `seed ${seed}`,
  fallback: ({ seed }) => ({ value: `fallback-${seed}` }),
};

describe("prompt runtime emergency mode", () => {
  test("manual mode skips the provider and returns the schema-checked fallback", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    let providerCalls = 0;
    try {
      process.env.OPENAI_API_KEY = "test-key";
      globalThis.fetch = (async () => {
        providerCalls += 1;
        return Response.json({ choices: [{ message: { content: '{"value":"provider"}' } }] });
      }) as typeof fetch;
      const context = {
        ...contextForExperience("smoke-neon-norrebro", "normal"),
        aiMode: "manual" as const,
      };

      const result = await runPromptSpec({ spec, input: { seed: 7 }, context });

      expect(result).toEqual({ output: { value: "fallback-7" }, usedFallback: true });
      expect(providerCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
