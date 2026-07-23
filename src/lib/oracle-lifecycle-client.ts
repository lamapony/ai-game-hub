import type {
  OraclePredictionResults,
  OracleRecordPayload,
  OracleVerdictRecordPayload,
} from "@/games/grilloracle/model";
import type { PartyRecordView } from "./party-records";
import { hostSecretCandidates } from "./room";
import type { GrillOracleMemory } from "./types";

async function postAsHost<T>(roomId: string, path: string, body: Record<string, unknown>) {
  const secrets = hostSecretCandidates(roomId);
  if (secrets.length === 0) throw new Error("host authorization required");
  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-host-secret": secret },
      body: JSON.stringify({ roomId, ...body }),
    });
    if (response.ok) return (await response.json()) as T;
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }
  throw lastError ?? new Error("Oracle host action failed");
}

export function sealOracleRunClient(params: {
  roomId: string;
  runId: string;
  allowIncomplete: boolean;
}) {
  return postAsHost<{ updated: number; missingCount: number; memory: GrillOracleMemory }>(
    params.roomId,
    "/api/oracle-lifecycle",
    { action: "seal", runId: params.runId, allowIncomplete: params.allowIncomplete },
  );
}

export function revealOracleRunClient(params: { roomId: string; runId: string }) {
  return postAsHost<{ updated: number; memory: GrillOracleMemory }>(
    params.roomId,
    "/api/oracle-lifecycle",
    { action: "reveal", runId: params.runId },
  );
}

export function verifyOraclePredictionsClient(params: {
  roomId: string;
  runId: string;
  playerId: string;
  results: OraclePredictionResults;
}) {
  return postAsHost<{
    player: { id: string; name: string; teamId: string };
    prophecy: OracleRecordPayload;
    verdict: OracleVerdictRecordPayload;
    replayed: boolean;
    memory: GrillOracleMemory;
  }>(params.roomId, "/api/oracle-lifecycle", {
    action: "verify",
    runId: params.runId,
    playerId: params.playerId,
    results: params.results,
  });
}

export function listOracleRecordsForHost(params: { roomId: string; runId: string }) {
  return postAsHost<{ records: PartyRecordView[] }>(params.roomId, "/api/host-party-records", {
    action: "list",
    runId: params.runId,
  });
}
