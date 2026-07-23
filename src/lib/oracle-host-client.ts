import type { OracleDonenessLevel, OracleItemCategory } from "@/games/grilloracle/model";
import { hostSecretCandidates } from "./room";

export async function createOracleHostFallback(params: {
  roomId: string;
  playerId: string;
  roundId: string;
  itemCategory: OracleItemCategory;
  doneness: OracleDonenessLevel;
}) {
  const secrets = hostSecretCandidates(params.roomId);
  if (secrets.length === 0) throw new Error("host authorization required");

  let lastError: Error | null = null;
  for (const secret of secrets) {
    const response = await fetch("/api/oracle-reading", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-host-secret": secret,
      },
      body: JSON.stringify({ action: "host-fallback", ...params }),
    });
    if (response.ok) {
      return (await response.json()) as { replayed: boolean };
    }
    lastError = new Error(await response.text());
    if (response.status !== 403) break;
  }

  throw lastError ?? new Error("Oracle fallback failed");
}
