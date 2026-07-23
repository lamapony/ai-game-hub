import type { FinaleNarrative } from "./finale-narrative";
import { hostSecretCandidates } from "./room";

export type FinaleNarrativeResponse = {
  narrative: FinaleNarrative;
  generatedAt?: number;
  usedFallback: boolean;
  replayed: boolean;
};

export async function generateFinaleNarrativeClient(roomId: string) {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/finale-narrative", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId }),
    });
    if (response.ok) return (await response.json()) as FinaleNarrativeResponse;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("finale generation failed");
}
