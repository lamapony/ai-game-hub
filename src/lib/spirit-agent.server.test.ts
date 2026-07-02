import { describe, expect, test } from "bun:test";
import {
  answerSpiritQuestion,
  buildSpiritUserPrompt,
  fallbackSpiritAnswer,
  sanitizeSpiritAnswer,
  sanitizeSpiritQuestion,
  spiritProviderConfig,
  type SpiritQuestionInput,
} from "./spirit-agent.server";
import { emptyRoomState } from "./types";

const originalFetch = globalThis.fetch;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
const originalOpenAiChatModel = process.env.OPENAI_CHAT_MODEL;

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function input(question = "What should I do now?"): SpiritQuestionInput {
  return {
    roomCode: "C6SK",
    state: {
      ...emptyRoomState("Host"),
      players: [{ id: "p1", name: "Ada", teamId: "forest", joinedAt: 1 }],
    },
    playerId: "p1",
    question,
    preset: "what-now",
  };
}

function restoreTestState() {
  globalThis.fetch = originalFetch;
  restoreEnvValue("OPENAI_API_KEY", originalOpenAiKey);
  restoreEnvValue("OPENAI_BASE_URL", originalOpenAiBaseUrl);
  restoreEnvValue("OPENAI_CHAT_MODEL", originalOpenAiChatModel);
}

describe("spirit agent", () => {
  test("selects xAI first in auto mode when configured", () => {
    const config = spiritProviderConfig({
      SPIRIT_PROVIDER: "auto",
      XAI_API_KEY: "xai",
      OPENAI_API_KEY: "openai",
    });

    expect(config.selected).toBe("xai");
    expect(config.xaiConfigured).toBe(true);
    expect(config.openaiConfigured).toBe(true);
  });

  test("sanitizes questions and answers for a short concierge exchange", () => {
    expect(sanitizeSpiritQuestion("  How\n\nmany    rounds?  ")).toBe("How many rounds?");
    expect(sanitizeSpiritAnswer("**Hello**\n\n# there")).toBe("Hello there");
  });

  test("builds a prompt with local room context and strict concierge boundaries", () => {
    const prompt = buildSpiritUserPrompt(input("How do we play?"));

    expect(prompt).toContain("Room code: C6SK");
    expect(prompt).toContain("Player question: How do we play?");
    expect(prompt).toContain("Game guide:");
  });

  test("returns useful local fallback answers without an AI provider", async () => {
    const answer = await answerSpiritQuestion(input("How many rounds?"), {});

    expect(answer.source).toBe("fallback");
    expect(answer.provider).toBe("none");
    expect(answer.answer).toContain("planned as");
  });

  test("uses xAI Responses API when available", async () => {
    try {
      globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
        expect(String(request)).toBe("https://api.x.ai/v1/responses");
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe("grok-4.3");
        expect(body.store).toBe(false);
        return Response.json({
          output: [
            {
              content: [{ type: "output_text", text: '{"answer":"Stay with your team."}' }],
            },
          ],
        });
      }) as typeof fetch;

      const answer = await answerSpiritQuestion(input(), {
        SPIRIT_PROVIDER: "xai",
        XAI_API_KEY: "xai",
        XAI_CHAT_MODEL: "grok-4.3",
      });

      expect(answer.source).toBe("xai");
      expect(answer.provider).toBe("xai");
      expect(answer.answer).toBe("Stay with your team.");
    } finally {
      restoreTestState();
    }
  });

  test("auto falls back to OpenAI-compatible chat when xAI fails", async () => {
    process.env.OPENAI_API_KEY = "openai";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_CHAT_MODEL = "gpt-4o-mini";

    try {
      const calls: string[] = [];
      globalThis.fetch = (async (request: RequestInfo | URL) => {
        calls.push(String(request));
        if (String(request).includes("api.x.ai")) {
          return Response.json({ error: "bad xAI key" }, { status: 400 });
        }
        return Response.json({
          choices: [{ message: { content: '{"answer":"OpenAI fallback is awake."}' } }],
        });
      }) as typeof fetch;

      const answer = await answerSpiritQuestion(input(), {
        SPIRIT_PROVIDER: "auto",
        XAI_API_KEY: "xai",
        OPENAI_API_KEY: "openai",
        XAI_CHAT_MODEL: "grok-4.3",
      });

      expect(calls).toEqual([
        "https://api.x.ai/v1/responses",
        "https://api.openai.com/v1/chat/completions",
      ]);
      expect(answer.source).toBe("openai");
      expect(answer.answer).toBe("OpenAI fallback is awake.");
    } finally {
      restoreTestState();
    }
  });

  test("fallback answers redirect unrelated custom questions", () => {
    const answer = fallbackSpiritAnswer({
      ...input("Who should I vote for in politics?"),
      preset: "custom",
    });

    expect(answer).toContain("Ask me about how to play");
  });
});
