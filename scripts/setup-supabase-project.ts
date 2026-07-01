import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Args = {
  projectRef: string;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  push: boolean;
};

function usage() {
  console.error(`Usage:
  bun scripts/setup-supabase-project.ts \\
    --project-ref=<ref> \\
    --url=https://<ref>.supabase.co \\
    --anon-key=<publishable-anon-key> \\
    --service-role-key=<service-role-key> \\
    [--no-push]

Runs supabase link + db push by default. Skips CLI when --no-push is set.
`);
}

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length).trim();
}

function parseArgs(): Args | null {
  const projectRef = readArg("project-ref");
  const url = readArg("url");
  const anonKey = readArg("anon-key");
  const serviceRoleKey = readArg("service-role-key");
  if (!projectRef || !url || !anonKey || !serviceRoleKey) {
    usage();
    return null;
  }
  return {
    projectRef,
    url: url.replace(/\/+$/, ""),
    anonKey,
    serviceRoleKey,
    push: !process.argv.includes("--no-push"),
  };
}

function setEnvValue(content: string, key: string, value: string) {
  const line = `${key}="${value.replace(/"/g, "")}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
}

function updateEnvFile(root: string, args: Args) {
  const envPath = resolve(root, ".env");
  const base = readFileSync(envPath, "utf8");
  let content = base;
  const pairs: Record<string, string> = {
    VITE_SUPABASE_URL: args.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: args.anonKey,
    VITE_SUPABASE_PROJECT_ID: args.projectRef,
    SUPABASE_URL: args.url,
    SUPABASE_PUBLISHABLE_KEY: args.anonKey,
    SUPABASE_PROJECT_ID: args.projectRef,
    SUPABASE_SERVICE_ROLE_KEY: args.serviceRoleKey,
  };
  for (const [key, value] of Object.entries(pairs)) {
    content = setEnvValue(content, key, value);
  }
  writeFileSync(envPath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 });
}

function updateSupabaseConfig(root: string, projectRef: string) {
  const configPath = resolve(root, "supabase/config.toml");
  const content = readFileSync(configPath, "utf8");
  const next = content.replace(/^project_id\s*=\s*".*"$/m, `project_id = "${projectRef}"`);
  writeFileSync(configPath, next);
}

function run(command: string, cwd: string) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}`);
  }
}

function readDbPassword(root: string) {
  const passwordPath = resolve(root, ".supabase-dimas-fest-db-password");
  try {
    return readFileSync(passwordPath, "utf8").trim();
  } catch {
    return "";
  }
}

async function verifySupabase(args: Args) {
  const headers = {
    apikey: args.anonKey,
    Authorization: `Bearer ${args.anonKey}`,
  };
  const adminHeaders = {
    apikey: args.serviceRoleKey,
    Authorization: `Bearer ${args.serviceRoleKey}`,
  };
  const tables = ["rooms", "submissions", "votes", "challenges", "photos"];
  for (const table of tables) {
    const response = await fetch(`${args.url}/rest/v1/${table}?select=id&limit=1`, { headers });
    if (!response.ok) {
      throw new Error(`Table ${table} check failed: HTTP ${response.status}`);
    }
    console.log(`✓ table ${table}`);
  }

  const bucketResponse = await fetch(`${args.url}/storage/v1/bucket`, { headers: adminHeaders });
  if (!bucketResponse.ok) {
    throw new Error(`Storage buckets check failed: HTTP ${bucketResponse.status}`);
  }
  const buckets = (await bucketResponse.json()) as Array<{ id: string }>;
  if (!buckets.some((bucket) => bucket.id === "recordings")) {
    throw new Error("Bucket recordings was not created");
  }
  console.log("✓ bucket recordings");
}

async function main() {
  const args = parseArgs();
  if (!args) process.exit(1);

  const root = resolve(import.meta.dirname, "..");
  updateSupabaseConfig(root, args.projectRef);
  updateEnvFile(root, args);
  console.log(`Updated supabase/config.toml and .env for ${args.projectRef}`);

  if (args.push) {
    const dbPassword = readDbPassword(root);
    const passwordFlag = dbPassword ? ` --password "${dbPassword.replace(/"/g, "")}"` : "";
    console.log("Linking Supabase project...");
    run(`supabase link --project-ref ${args.projectRef}${passwordFlag} --yes`, root);
    console.log("Applying migrations...");
    run("supabase db push --yes", root);
  } else {
    console.log("Skipped supabase link/db push (--no-push).");
  }

  await verifySupabase(args);
  console.log("Supabase setup complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
