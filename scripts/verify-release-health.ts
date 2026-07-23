import { checkReleaseHealth } from "../src/lib/release-health.server";
import { releaseHealthSummaryLines } from "../src/lib/release-health";

try {
  const report = await checkReleaseHealth();
  for (const line of releaseHealthSummaryLines(report)) console.log(line);
  if (report.status !== "ready") {
    console.error("Deployment stopped: complete the failed backend checks, then run this again.");
    process.exitCode = 1;
  }
} catch {
  console.error(
    "Backend release preflight could not connect. Verify server-only Supabase configuration and retry.",
  );
  process.exitCode = 1;
}
