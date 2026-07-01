// Server-only helper to call OpenAI or an OpenAI-compatible provider directly.
import { isRetryableStatus, retryOperation } from "./retry";
import { logError, logInfo, logWarn } from "./structured-log";

class RetryableHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Retryable HTTP ${status}`);
    this.name = "RetryableHttpError";
  }
}

function baseUrl(): string {
  return process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
}

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY missing");
  return k;
}

type ContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function retryAttempts() {
  const raw = Number(process.env.OPENAI_RETRY_ATTEMPTS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(5, Math.floor(raw)) : 3;
}

function retryableStatusFromError(error: unknown) {
  return error instanceof RetryableHttpError ? error.status : undefined;
}

async function aiFetchWithRetry(
  url: string,
  init: RequestInit,
  fields: Record<string, string | number | boolean>,
) {
  try {
    return await retryOperation(
      async () => {
        const response = await fetch(url, init);
        if (isRetryableStatus(response.status)) {
          const body = await response.text().catch(() => "");
          throw new RetryableHttpError(response.status, body);
        }
        return response;
      },
      {
        attempts: retryAttempts(),
        baseDelayMs: 500,
        maxDelayMs: 3000,
        shouldRetry: (error) => error instanceof TypeError || error instanceof RetryableHttpError,
        onRetry: (error, attempt, delayMs) => {
          logWarn("ai.retry", {
            ...fields,
            attempt,
            delayMs,
            status: retryableStatusFromError(error),
          });
        },
      },
    );
  } catch (error) {
    if (error instanceof RetryableHttpError) {
      return new Response(error.body, { status: error.status });
    }
    throw error;
  }
}

export async function chatJSON<T>(opts: {
  model?: string;
  system: string;
  user: string | ContentPart[];
  temperature?: number;
}): Promise<T> {
  const startedAt = Date.now();
  const hasImages = Array.isArray(opts.user) && opts.user.some((part) => part.type === "image_url");
  const requestedModel = opts.model ?? "";
  const model = requestedModel.startsWith("google/")
    ? hasImages
      ? process.env.OPENAI_VISION_MODEL
      : process.env.OPENAI_CHAT_MODEL
    : requestedModel;
  const effectiveModel =
    model ||
    (hasImages
      ? (process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_CHAT_MODEL)
      : process.env.OPENAI_CHAT_MODEL) ||
    "gpt-4o-mini";

  const res = await aiFetchWithRetry(
    `${baseUrl()}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key()}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        temperature: opts.temperature ?? 0.85,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_object" },
      }),
    },
    { operation: "chat_json", model: effectiveModel, hasImages },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const error = new Error(`AI provider ${res.status}: ${t.slice(0, 300)}`);
    logError("ai.chat_json.failure", new Error(`AI provider ${res.status}`), {
      durationMs: Date.now() - startedAt,
      status: res.status,
      model: effectiveModel,
      hasImages,
    });
    throw error;
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "{}";
  // Strip ```json fences if present.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");
  try {
    const parsed = JSON.parse(cleaned) as T;
    logInfo("ai.chat_json.success", {
      durationMs: Date.now() - startedAt,
      status: res.status,
      model: effectiveModel,
      hasImages,
      outputChars: text.length,
    });
    return parsed;
  } catch (error) {
    logError("ai.chat_json.parse_failure", error, {
      durationMs: Date.now() - startedAt,
      status: res.status,
      model: effectiveModel,
      hasImages,
      outputChars: text.length,
    });
    throw error;
  }
}

export async function ttsMp3(text: string, voice = "alloy"): Promise<ArrayBuffer> {
  const startedAt = Date.now();
  const model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
  const res = await aiFetchWithRetry(
    `${baseUrl()}/audio/speech`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key()}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: "mp3",
      }),
    },
    { operation: "tts", model, voice, textChars: text.length },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const error = new Error(`TTS ${res.status}: ${t.slice(0, 300)}`);
    logError("ai.tts.failure", new Error(`TTS ${res.status}`), {
      durationMs: Date.now() - startedAt,
      status: res.status,
      model,
      voice,
      textChars: text.length,
    });
    throw error;
  }
  const buffer = await res.arrayBuffer();
  logInfo("ai.tts.success", {
    durationMs: Date.now() - startedAt,
    status: res.status,
    model,
    voice,
    textChars: text.length,
    outputBytes: buffer.byteLength,
  });
  return buffer;
}

export async function transcribeAudio(file: Blob, filename = "recording.webm"): Promise<string> {
  const startedAt = Date.now();
  const model = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
  const fd = new FormData();
  fd.append("model", model);
  fd.append("file", file, filename);
  const res = await aiFetchWithRetry(
    `${baseUrl()}/audio/transcriptions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: fd,
    },
    { operation: "stt", model, fileBytes: file.size },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const error = new Error(`STT ${res.status}: ${t.slice(0, 300)}`);
    logError("ai.stt.failure", new Error(`STT ${res.status}`), {
      durationMs: Date.now() - startedAt,
      status: res.status,
      model,
      fileBytes: file.size,
    });
    throw error;
  }
  const data = await res.json();
  const text = (data?.text as string) ?? "";
  logInfo("ai.stt.success", {
    durationMs: Date.now() - startedAt,
    status: res.status,
    model,
    fileBytes: file.size,
    textChars: text.length,
  });
  return text;
}
