import { hostSecretCandidates } from "./room";
import type { ScoreEventView, ScoreLedgerSummary } from "./score-events";

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (!secrets.length) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/host-score-events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return (await response.json()) as T;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("score ledger request failed");
}

export const getHostScoreLedgerSummaryClient = (roomId: string) =>
  postAsHost<{ summary: ScoreLedgerSummary }>(roomId, { action: "summary" });

export const listHostScoreEventsClient = (roomId: string, limit = 250) =>
  postAsHost<{ events: ScoreEventView[] }>(roomId, { action: "list", limit });
