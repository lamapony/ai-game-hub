// Server-only helper to call OpenAI or an OpenAI-compatible provider directly.
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

export async function chatJSON<T>(opts: {
  model?: string;
  system: string;
  user: string | ContentPart[];
  temperature?: number;
}): Promise<T> {
  const hasImages = Array.isArray(opts.user) && opts.user.some((part) => part.type === "image_url");
  const requestedModel = opts.model ?? "";
  const model = requestedModel.startsWith("google/")
    ? hasImages
      ? process.env.OPENAI_VISION_MODEL
      : process.env.OPENAI_CHAT_MODEL
    : requestedModel;

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key()}`,
    },
    body: JSON.stringify({
      model:
        model ||
        (hasImages
          ? (process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_CHAT_MODEL)
          : process.env.OPENAI_CHAT_MODEL) ||
        "gpt-4o-mini",
      temperature: opts.temperature ?? 0.85,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI provider ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "{}";
  // Strip ```json fences if present.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");
  return JSON.parse(cleaned) as T;
}

export async function ttsMp3(text: string, voice = "alloy"): Promise<ArrayBuffer> {
  const res = await fetch(`${baseUrl()}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key()}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      input: text,
      voice,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TTS ${res.status}: ${t.slice(0, 300)}`);
  }
  return await res.arrayBuffer();
}

export async function transcribeAudio(file: Blob, filename = "recording.webm"): Promise<string> {
  const fd = new FormData();
  fd.append("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe");
  fd.append("file", file, filename);
  const res = await fetch(`${baseUrl()}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`STT ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data?.text as string) ?? "";
}
