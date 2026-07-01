import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { serializeDotEnv, validateProductionEnv } from "../src/lib/production-env";

const writeArg = process.argv.find((arg) => arg.startsWith("--write-dotenv="));
const outputPath = writeArg?.slice("--write-dotenv=".length);
const validation = validateProductionEnv(process.env);

if (!validation.ok) {
  console.error("Missing required production configuration:");
  validation.missing.forEach((key) => console.error(`- ${key}`));
  process.exit(1);
}

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeDotEnv(validation.runtimeEnv), { mode: 0o600 });
  console.log(`Production runtime env file written: ${outputPath}`);
} else {
  console.log("Production configuration preflight passed.");
}
