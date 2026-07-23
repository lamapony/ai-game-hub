import type { AiPrewarmGameId } from "./ai-prewarm";
import type { PartyActId } from "./party-context";
import { hostSecretCandidates } from "./room";

export async function prewarmAiGameClient(params: {
  roomId: string;
  gameId: AiPrewarmGameId;
  targetActId: PartyActId;
}) {
  const secrets = hostSecretCandidates(params.roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/ai-prewarm", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify(params),
    });
    if (response.ok) return response.json();
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("AI preparation failed");
}
