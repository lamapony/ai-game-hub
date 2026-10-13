import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

test("concurrent hosts share the provider's prepared result instead of racing fallback", async () => {
  const fixturePath = fileURLToPath(
    new URL("./test-support/ai-prewarm-concurrency.fixture.ts", import.meta.url),
  );
  const { stdout } = await promisify(execFile)(process.execPath, ["run", fixturePath], {
    timeout: 10_000,
  });
  expect(stdout).toContain("Concurrent AI preparation verified");
});
