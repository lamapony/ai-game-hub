import { hostSecretCandidates } from "./room";
import type { ReleaseHealthReport } from "./release-health";

export async function getHostReleaseHealth(roomId: string): Promise<ReleaseHealthReport> {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");

  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/host-release-health", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-host-secret": secret,
      },
      body: JSON.stringify({ roomId }),
    });
    if (response.ok) return (await response.json()) as ReleaseHealthReport;
    lastError = new Error(
      response.status === 403
        ? "Host authorization expired. Reopen the room from the creating device."
        : "Backend preflight could not be completed.",
    );
    if (response.status !== 403) break;
  }

  throw lastError ?? new Error("Backend preflight could not be completed.");
}
