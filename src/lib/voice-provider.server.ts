import type { VoiceProviderId } from "./types";

export type VoiceProviderPreference = "auto" | VoiceProviderId;

export type VoiceSession = {
  provider: VoiceProviderId;
  model: string;
  transport: "webrtc" | "websocket";
  clientSecret: string;
  connectUrl: string;
  protocol?: string;
  expiresAt?: number;
};

export type VoiceProviderConfig = {
  preference: VoiceProviderPreference;
  openaiConfigured: boolean;
  xaiConfigured: boolean;
  selected?: VoiceProviderId;
};

function envValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function voiceProviderConfig(
  env: Record<string, string | undefined> = process.env,
): VoiceProviderConfig {
  const rawPreference = envValue(env, "VOICE_PROVIDER") ?? "auto";
  const preference: VoiceProviderPreference =
    rawPreference === "xai" || rawPreference === "openai" ? rawPreference : "auto";
  const openaiConfigured = !!envValue(env, "OPENAI_API_KEY");
  const xaiConfigured = !!envValue(env, "XAI_API_KEY");
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

  return { preference, openaiConfigured, xaiConfigured, selected };
}

function tokenFromResponse(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.value === "string") return record.value;
  if (typeof record.client_secret === "string") return record.client_secret;
  const nested = record.client_secret;
  if (
    nested &&
    typeof nested === "object" &&
    typeof (nested as { value?: unknown }).value === "string"
  ) {
    return (nested as { value: string }).value;
  }
  if (typeof record.secret === "string") return record.secret;
  return undefined;
}

function expiresAtFromResponse(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const direct = record.expires_at;
  if (typeof direct === "number") return direct * 1000;
  const nested = record.client_secret;
  if (nested && typeof nested === "object") {
    const expiresAt = (nested as { expires_at?: unknown }).expires_at;
    if (typeof expiresAt === "number") return expiresAt * 1000;
  }
  return undefined;
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function createOpenAiVoiceSession(env: Record<string, string | undefined>) {
  const apiKey = envValue(env, "OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const model = envValue(env, "OPENAI_REALTIME_MODEL") ?? "gpt-realtime-2";
  const body = {
    session: {
      type: "realtime",
      model,
      instructions:
        "You are an English-speaking virtual event host. Dry, sharp, adult, never cruel. Keep spoken turns short.",
      audio: {
        output: { voice: envValue(env, "OPENAI_REALTIME_VOICE") ?? "marin" },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "ai-game-hub-host",
    },
    body: JSON.stringify(body),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(`OpenAI realtime token failed: ${res.status}`);
  const clientSecret = tokenFromResponse(data);
  if (!clientSecret) throw new Error("OpenAI realtime token response did not include a secret");

  return {
    provider: "openai",
    model,
    transport: "webrtc",
    clientSecret,
    connectUrl: "https://api.openai.com/v1/realtime/calls",
    expiresAt: expiresAtFromResponse(data),
  } satisfies VoiceSession;
}

async function createXaiVoiceSession(env: Record<string, string | undefined>) {
  const apiKey = envValue(env, "XAI_API_KEY");
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");
  const model = envValue(env, "XAI_REALTIME_MODEL") ?? "grok-voice-latest";

  const res = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(`xAI realtime token failed: ${res.status}`);
  const clientSecret = tokenFromResponse(data);
  if (!clientSecret) throw new Error("xAI realtime token response did not include a secret");

  return {
    provider: "xai",
    model,
    transport: "websocket",
    clientSecret,
    connectUrl: `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`,
    protocol: `xai-client-secret.${clientSecret}`,
    expiresAt: expiresAtFromResponse(data),
  } satisfies VoiceSession;
}

export async function createVoiceSession(
  env: Record<string, string | undefined> = process.env,
): Promise<VoiceSession> {
  const config = voiceProviderConfig(env);
  if (!config.selected) {
    throw new Error("No realtime voice provider configured");
  }
  if (config.selected === "xai") {
    try {
      return await createXaiVoiceSession(env);
    } catch (error) {
      if (config.preference === "auto" && config.openaiConfigured) {
        return createOpenAiVoiceSession(env);
      }
      throw error;
    }
  }

  return createOpenAiVoiceSession(env);
}
