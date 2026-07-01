import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve("node_modules/nf3/dist/_chunks/trace.mjs");
let source = readFileSync(target, "utf8");
const broken = 'import { nodeFileTrace } from "@vercel/nft";';
const fixed = 'import nft from "@vercel/nft";\nconst { nodeFileTrace } = nft;';

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  writeFileSync(target, source);
  console.log("Patched nf3 @vercel/nft import for ESM compatibility.");
} else if (source.includes('import nft from "@vercel/nft"')) {
  console.log("nf3 @vercel/nft import patch already applied.");
} else {
  console.warn("nf3 trace.mjs format changed; patch was not applied.");
  process.exitCode = 1;
}
