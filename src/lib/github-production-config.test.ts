import { describe, expect, test } from "bun:test";
import {
  OPTIONAL_GITHUB_VARIABLES_FOR_DEPLOY,
  POST_DEPLOY_GITHUB_VARIABLES,
  REQUIRED_GITHUB_SECRETS_FOR_DEPLOY,
  REQUIRED_GITHUB_VARIABLES_FOR_DEPLOY,
  auditGitHubProductionConfig,
} from "./github-production-config";

describe("GitHub production config audit", () => {
  test("passes when required deploy variables and secrets are present", () => {
    const audit = auditGitHubProductionConfig({
      variables: REQUIRED_GITHUB_VARIABLES_FOR_DEPLOY,
      secrets: REQUIRED_GITHUB_SECRETS_FOR_DEPLOY,
    });

    expect(audit.ok).toBe(true);
    expect(audit.missingRequiredVariables.length).toBe(0);
    expect(audit.missingRequiredSecrets.length).toBe(0);
  });

  test("does not block first deploy on optional or post-deploy variables", () => {
    const audit = auditGitHubProductionConfig({
      variables: REQUIRED_GITHUB_VARIABLES_FOR_DEPLOY,
      secrets: REQUIRED_GITHUB_SECRETS_FOR_DEPLOY,
    });

    expect(audit.ok).toBe(true);
    expect(audit.missingPostDeployVariables.join(",")).toBe(POST_DEPLOY_GITHUB_VARIABLES.join(","));
    expect(audit.missingOptionalVariables.join(",")).toBe(
      OPTIONAL_GITHUB_VARIABLES_FOR_DEPLOY.join(","),
    );
  });

  test("reports missing required deploy keys without values", () => {
    const audit = auditGitHubProductionConfig({
      variables: REQUIRED_GITHUB_VARIABLES_FOR_DEPLOY.filter((key) => key !== "SUPABASE_URL"),
      secrets: REQUIRED_GITHUB_SECRETS_FOR_DEPLOY.filter((key) => key !== "OPENAI_API_KEY"),
    });

    expect(audit.ok).toBe(false);
    expect(audit.missingRequiredVariables.join(",")).toBe("SUPABASE_URL");
    expect(audit.missingRequiredSecrets.join(",")).toBe("OPENAI_API_KEY");
  });
});
