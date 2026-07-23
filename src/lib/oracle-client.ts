import type { OracleRecordPayload } from "@/games/grilloracle/model";
import { playerSecretFor } from "./player-action-client";
import type { PartyRecordView } from "./party-records";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export async function analyzeOraclePhoto(params: {
  roomId: string;
  playerId: string;
  roundId: string;
  storagePath: string;
}) {
  const playerSecret = playerSecretFor(params.playerId);
  const response = await fetch("/api/oracle-reading", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(playerSecret ? { "x-player-secret": playerSecret } : {}),
    },
    body: JSON.stringify({ action: "analyze", ...params }),
  });
  return responseJson<{ payload: OracleRecordPayload; replayed: boolean }>(response);
}

export async function listOracleRecordsForPlayer(params: {
  roomId: string;
  playerId: string;
  roundId: string;
}) {
  const playerSecret = playerSecretFor(params.playerId);
  const response = await fetch("/api/player-party-records", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(playerSecret ? { "x-player-secret": playerSecret } : {}),
    },
    body: JSON.stringify({
      action: "list",
      roomId: params.roomId,
      playerId: params.playerId,
      runId: params.roundId,
      kind: "oracle-prophecy",
    }),
  });
  return responseJson<{ records: PartyRecordView[] }>(response);
}
