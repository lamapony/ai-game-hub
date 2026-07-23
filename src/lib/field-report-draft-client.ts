import { hostSecretCandidates } from "./room";
import type { FieldReportObservations } from "./field-report";
import type { FieldReportDraft } from "./field-report-draft-store";

async function postAsHost<T>(roomId: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (!secrets.length) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/host-field-report-draft", {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return (await response.json()) as T;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("field report draft request failed");
}

export function loadFieldReportDraftClient(roomId: string, configuredAt: number) {
  return postAsHost<{ draft: FieldReportDraft | null }>(roomId, {
    action: "load",
    configuredAt,
  });
}

export function saveFieldReportDraftClient(
  roomId: string,
  configuredAt: number,
  observations: FieldReportObservations,
  baseObservations: FieldReportObservations,
) {
  return postAsHost<{ draft: FieldReportDraft }>(roomId, {
    action: "save",
    configuredAt,
    observations,
    baseObservations,
  });
}
