import { describe, expect, test } from "bun:test";
import { serializeDotEnv, validateProductionEnv } from "./production-env";

const completeEnv = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "publishable",
  VITE_SUPABASE_PROJECT_ID: "project",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  CLEANUP_SECRET: "cleanup",
  OPENAI_API_KEY: "openai",
};

describe("production env validation", () => {
  test("reports missing required deploy configuration without exposing values", () => {
    const result = validateProductionEnv({
      ...completeEnv,
      OPENAI_API_KEY: "",
      CLOUDFLARE_API_TOKEN: undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.missing.join(",")).toBe("OPENAI_API_KEY");
  });

  test("fills optional OpenAI runtime defaults", () => {
    const result = validateProductionEnv(completeEnv);

    expect(result.ok).toBe(true);
    expect(result.runtimeEnv.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(result.runtimeEnv.OPENAI_CHAT_MODEL).toBe("gpt-4o-mini");
    expect(result.runtimeEnv.OPENAI_RETRY_ATTEMPTS).toBe("3");
  });

  test("serializes dotenv values with quoting", () => {
    const output = serializeDotEnv({
      SIMPLE: "abc",
      SPACED: "hello world",
    });

    expect(output).toContain('SIMPLE="abc"');
    expect(output).toContain('SPACED="hello world"');
  });
});
