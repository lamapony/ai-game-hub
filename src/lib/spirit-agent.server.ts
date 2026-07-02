import { chatJSON } from "./ai-gateway.server";
import { buildGameGuideContext, buildSpiritContextText } from "./game-guide";
import type { RoomState } from "./types";

export type SpiritQuestionPreset = "how-to-play" | "round-count" | "what-now" | "custom";
export type SpiritProviderPreference = "auto" | "xai" | "openai";
export type SpiritAnswerSource = "xai" | "openai" | "fallback";

export type SpiritQuestionInput = {
  roomCode: string;
  state: RoomState;
  playerId: string;
  question: string;
  preset: SpiritQuestionPreset;
};

export type SpiritAnswer = {
  answer: string;
  source: SpiritAnswerSource;
  provider: "xai" | "openai" | "none";
  fallback: boolean;
};

type SpiritProviderConfig = {
  preference: SpiritProviderPreference;
  xaiConfigured: boolean;
  openaiConfigured: boolean;
  selected?: "xai" | "openai";
};

function envValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function spiritProviderConfig(
  env: Record<string, string | undefined> = process.env,
): SpiritProviderConfig {
  const rawPreference = envValue(env, "SPIRIT_PROVIDER") ?? "auto";
  const preference: SpiritProviderPreference =
    rawPreference === "xai" || rawPreference === "openai" ? rawPreference : "auto";
  const xaiConfigured = !!envValue(env, "XAI_API_KEY");
  const openaiConfigured = !!envValue(env, "OPENAI_API_KEY");
  const selected =
    preference === "xai"
      ? xaiConfigured
        ? "xai"
        : undefined
      : preference === "openai"
        ? openaiConfigured
          ? "openai"
          : undefined
        : xaiConfigured
          ? "xai"
          : openaiConfigured
            ? "openai"
            : undefined;

  return { preference, xaiConfigured, openaiConfigured, selected };
}

export function sanitizeSpiritQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function sanitizeSpiritAnswer(answer: string) {
  const clean = answer
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= 360) return clean;
  return `${clean.slice(0, 357).trimEnd()}...`;
}

function systemPrompt() {
  return [
    "You are the Park Spirit concierge for a live Jackbox-style event.",
    "Answer in English only.",
    "Tone: adult, sharp, intellectual, dryly sarcastic, but never cruel.",
    "Do not imitate a real person or copyrighted character.",
    "Do not use politics, sex, humiliation, protected-class jokes, or profanity as default material.",
    "This is not free chat. Answer only questions about the room, teams, what to do now, or the five games.",
    "If the question is unrelated, redirect to what the player should do next.",
    "Maximum two short sentences. No markdown. No lists unless the player explicitly asks for steps.",
    'Return strict JSON: {"answer":"..."}',
  ].join("\n");
}

export function buildSpiritUserPrompt(input: SpiritQuestionInput) {
  const question = sanitizeSpiritQuestion(input.question);
  const context = buildSpiritContextText(input);
  return [
    "Local event context:",
    context,
    "",
    `Question preset: ${input.preset}`,
    `Player question: ${question}`,
    "",
    "Answer as the Park Spirit concierge. Be useful first; style second.",
  ].join("\n");
}

function parseJsonAnswer(text: string): string | undefined {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");
  try {
    const parsed = JSON.parse(cleaned) as { answer?: unknown };
    return typeof parsed.answer === "string" ? parsed.answer : undefined;
  } catch {
    return undefined;
  }
}

function responseTextFromXai(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = record.output;
  if (!Array.isArray(output)) return undefined;
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("").trim() || undefined;
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function answerWithXai(
  input: SpiritQuestionInput,
  env: Record<string, string | undefined>,
): Promise<string> {
  const apiKey = envValue(env, "XAI_API_KEY");
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");
  const model = envValue(env, "XAI_CHAT_MODEL") ?? "grok-4.3";
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: buildSpiritUserPrompt(input) },
      ],
      response_format: { type: "json_object" },
      max_output_tokens: 140,
    }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(`xAI spirit response failed: ${res.status}`);
  const text = responseTextFromXai(data);
  const answer = text ? parseJsonAnswer(text) : undefined;
  if (!answer) throw new Error("xAI spirit response did not include an answer");
  return answer;
}

async function answerWithOpenAi(input: SpiritQuestionInput): Promise<string> {
  const result = await chatJSON<{ answer?: unknown }>({
    system: systemPrompt(),
    user: buildSpiritUserPrompt(input),
    temperature: 0.55,
  });
  if (typeof result.answer !== "string") {
    throw new Error("OpenAI spirit response did not include an answer");
  }
  return result.answer;
}

export function fallbackSpiritAnswer(input: SpiritQuestionInput) {
  const question = sanitizeSpiritQuestion(input.question).toLowerCase();
  const guide = buildGameGuideContext(input.state);
  const player = input.state.players.find((candidate) => candidate.id === input.playerId);
  const team = input.state.teams.find((candidate) => candidate.id === player?.teamId);

  if (input.preset === "round-count" || question.includes("round")) {
    return sanitizeSpiritAnswer(
      `${guide.nextGuide.title} is planned as ${guide.nextGuide.rounds}. The bureaucracy of fun insists this counts as clarity.`,
    );
  }

  if (input.preset === "how-to-play" || question.includes("how")) {
    return sanitizeSpiritAnswer(
      `For ${guide.nextGuide.title}: ${guide.nextGuide.howToPlay.join(" ")} Try competence first; irony can follow.`,
    );
  }

  if (input.preset === "what-now" || question.includes("now") || question.includes("first")) {
    if (!input.state.currentGame) {
      return sanitizeSpiritAnswer(
        `Stay with ${team?.name ?? "your team"} and watch the host screen. The likely next ordeal is ${guide.nextGuide.title}.`,
      );
    }
    return sanitizeSpiritAnswer(
      `You are in ${guide.nextGuide.title}, phase ${guide.currentPhase}. Do what your phone says; it is rarely poetic, but usually correct.`,
    );
  }

  return sanitizeSpiritAnswer(
    `Ask me about how to play, how many rounds, or what to do now. I am a park spirit, not a customer support department with leaves.`,
  );
}

export async function answerSpiritQuestion(
  input: SpiritQuestionInput,
  env: Record<string, string | undefined> = process.env,
): Promise<SpiritAnswer> {
  const fallback = fallbackSpiritAnswer(input);
  const config = spiritProviderConfig(env);
  if (!config.selected) {
    return { answer: fallback, source: "fallback", provider: "none", fallback: true };
  }

  if (config.selected === "xai") {
    try {
      const answer = await answerWithXai(input, env);
      return {
        answer: sanitizeSpiritAnswer(answer),
        source: "xai",
        provider: "xai",
        fallback: false,
      };
    } catch {
      if (config.preference === "auto" && config.openaiConfigured) {
        try {
          const answer = await answerWithOpenAi(input);
          return {
            answer: sanitizeSpiritAnswer(answer),
            source: "openai",
            provider: "openai",
            fallback: false,
          };
        } catch {
          return { answer: fallback, source: "fallback", provider: "none", fallback: true };
        }
      }
      return { answer: fallback, source: "fallback", provider: "none", fallback: true };
    }
  }

  try {
    const answer = await answerWithOpenAi(input);
    return {
      answer: sanitizeSpiritAnswer(answer),
      source: "openai",
      provider: "openai",
      fallback: false,
    };
  } catch {
    return { answer: fallback, source: "fallback", provider: "none", fallback: true };
  }
}
