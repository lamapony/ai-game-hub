import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

test("Smoke Screen reveals/results and oracle verdicts remain in the current session", async () => {
  // The cleanup tests replace the shared Supabase module. A fresh process exercises the real
  // SDK against the fixture's fake REST backend without depending on test-file import order.
  const fixturePath = fileURLToPath(
    new URL("./test-support/party-record-session.fixture.ts", import.meta.url),
  );
  const { stdout } = await promisify(execFile)(process.execPath, ["run", fixturePath], {
    timeout: 10_000,
  });
  expect(stdout).toContain("Revealed record session verified");
});
