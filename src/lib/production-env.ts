export const REQUIRED_PRODUCTION_ENV = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLEANUP_SECRET",
  "OPENAI_API_KEY",
] as const;

export const RUNTIME_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLEANUP_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_CHAT_MODEL",
  "OPENAI_VISION_MODEL",
  "OPENAI_TTS_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "OPENAI_RETRY_ATTEMPTS",
] as const;

const OPTIONAL_DEFAULTS: Record<string, string> = {
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_CHAT_MODEL: "gpt-4o-mini",
  OPENAI_VISION_MODEL: "gpt-4o-mini",
  OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
  OPENAI_TRANSCRIBE_MODEL: "gpt-4o-mini-transcribe",
  OPENAI_RETRY_ATTEMPTS: "3",
};

export type ProductionEnvValidation = {
  ok: boolean;
  missing: string[];
  runtimeEnv: Record<string, string>;
};

function valueOf(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function validateProductionEnv(
  env: Record<string, string | undefined>,
): ProductionEnvValidation {
  const missing = REQUIRED_PRODUCTION_ENV.filter((key) => !valueOf(env, key));
  const runtimeEnv: Record<string, string> = {};

  for (const key of RUNTIME_ENV_KEYS) {
    const value = valueOf(env, key) ?? OPTIONAL_DEFAULTS[key];
    if (value) runtimeEnv[key] = value;
  }

  return {
    ok: missing.length === 0,
    missing,
    runtimeEnv,
  };
}

function quoteEnvValue(value: string) {
  return JSON.stringify(value);
}

export function serializeDotEnv(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${quoteEnvValue(value)}`)
    .join("\n")
    .concat("\n");
}
