export const REQUIRED_GITHUB_VARIABLES_FOR_DEPLOY = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
] as const;

export const OPTIONAL_GITHUB_VARIABLES_FOR_DEPLOY = [
  "OPENAI_BASE_URL",
  "OPENAI_CHAT_MODEL",
  "OPENAI_VISION_MODEL",
  "OPENAI_TTS_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "OPENAI_RETRY_ATTEMPTS",
] as const;

export const POST_DEPLOY_GITHUB_VARIABLES = ["CLEANUP_URL"] as const;

export const REQUIRED_GITHUB_SECRETS_FOR_DEPLOY = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLEANUP_SECRET",
  "OPENAI_API_KEY",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "VERCEL_TOKEN",
] as const;

export type GitHubProductionConfigAudit = {
  ok: boolean;
  missingRequiredVariables: string[];
  missingRequiredSecrets: string[];
  missingPostDeployVariables: string[];
  missingOptionalVariables: string[];
};

function missingFrom(required: readonly string[], present: Iterable<string>) {
  const presentSet = new Set(present);
  return required.filter((key) => !presentSet.has(key));
}

export function auditGitHubProductionConfig({
  variables,
  secrets,
}: {
  variables: Iterable<string>;
  secrets: Iterable<string>;
}): GitHubProductionConfigAudit {
  const missingRequiredVariables = missingFrom(REQUIRED_GITHUB_VARIABLES_FOR_DEPLOY, variables);
  const missingRequiredSecrets = missingFrom(REQUIRED_GITHUB_SECRETS_FOR_DEPLOY, secrets);
  const missingPostDeployVariables = missingFrom(POST_DEPLOY_GITHUB_VARIABLES, variables);
  const missingOptionalVariables = missingFrom(OPTIONAL_GITHUB_VARIABLES_FOR_DEPLOY, variables);

  return {
    ok: missingRequiredVariables.length === 0 && missingRequiredSecrets.length === 0,
    missingRequiredVariables,
    missingRequiredSecrets,
    missingPostDeployVariables,
    missingOptionalVariables,
  };
}
