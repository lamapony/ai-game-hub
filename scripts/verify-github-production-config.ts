import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { auditGitHubProductionConfig } from "../src/lib/github-production-config";

const execFileAsync = promisify(execFile);

type GhNamedItem = {
  name: string;
};

function repoArg() {
  const explicit = process.argv.find((arg) => arg.startsWith("--repo="))?.slice("--repo=".length);
  return explicit || process.env.GITHUB_REPOSITORY;
}

async function currentRepo() {
  const configured = repoArg();
  if (configured) return configured;
  const { stdout } = await execFileAsync("gh", [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  return stdout.trim();
}

async function ghJson(args: string[]) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout) as GhNamedItem[];
}

function names(items: GhNamedItem[]) {
  return items.map((item) => item.name);
}

function printList(title: string, items: string[], emptyText: string) {
  console.log(title);
  if (items.length === 0) {
    console.log(`  ${emptyText}`);
    return;
  }
  items.forEach((item) => console.log(`  - ${item}`));
}

try {
  const repo = await currentRepo();
  const [variables, secrets] = await Promise.all([
    ghJson(["variable", "list", "--repo", repo, "--json", "name"]),
    ghJson(["secret", "list", "--repo", repo, "--json", "name"]),
  ]);
  const audit = auditGitHubProductionConfig({
    variables: names(variables),
    secrets: names(secrets),
  });

  console.log(`GitHub production config audit for ${repo}`);
  printList(
    "Missing required repo variables for first deploy:",
    audit.missingRequiredVariables,
    "none",
  );
  printList(
    "Missing required repo secrets for first deploy:",
    audit.missingRequiredSecrets,
    "none",
  );
  printList("Missing post-deploy repo variables:", audit.missingPostDeployVariables, "none");
  printList(
    "Missing optional repo variables with runtime defaults:",
    audit.missingOptionalVariables,
    "none",
  );

  if (!audit.ok) {
    console.log("GitHub production config audit failed.");
    process.exit(1);
  }

  console.log("GitHub production config audit passed for first deploy.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`GitHub production config audit could not run: ${message}`);
  console.error("Install and authenticate GitHub CLI, then retry with: bun run verify:github-prod");
  process.exit(2);
}
