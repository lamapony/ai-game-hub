import { hostSecretCandidates } from "./room";

export type HostArtifactRequest =
  | {
      action: "challenge-result";
      roundId: string;
      score: number;
      feedback: string;
    }
  | {
      action: "photo-results";
      results: Array<{ id: string; rank: number; points: number; comment: string }>;
    };

export async function postHostArtifact(roomId: string, payload: HostArtifactRequest) {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");

  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/host-artifact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-host-secret": secret,
      },
      body: JSON.stringify({ roomId, ...payload }),
    });
    if (response.ok) return (await response.json()) as { ok: true };
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }

  throw lastError ?? new Error("host artifact failed");
}
