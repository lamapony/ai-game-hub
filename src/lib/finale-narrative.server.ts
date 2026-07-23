import { getExperienceAct } from "@/experiences/catalog";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fallbackFinaleNarrative,
  finaleNarrativeSpec,
  isFinaleNarrativeGrounded,
} from "./ai/finale.prompts";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import {
  claimFinaleNarrativeState,
  completeFinaleNarrativeState,
  releaseFinaleNarrativeClaim,
} from "./finale-narrative";
import { normalizePartyContext } from "./party-context";
import { statusError } from "./player-auth.server";
import { migrateRoomState } from "./room-state-migration";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import type { RoomState } from "./types";

type FinaleRoomSnapshot = {
  id: string;
  state: RoomState;
  updatedAt: string;
};

async function loadFinaleRoom(roomId: string): Promise<FinaleRoomSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, state, updated_at")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw statusError("room not found", 404);
  return {
    id: data.id,
    state: migrateRoomState(data.state as unknown as RoomState),
    updatedAt: data.updated_at,
  };
}

async function writeFinaleRoom(snapshot: FinaleRoomSnapshot, state: RoomState) {
  if (snapshot.state === state) return true;
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .update({ state: state as never })
    .eq("id", snapshot.id)
    .eq("updated_at", snapshot.updatedAt)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function waitForFinaleNarrative(roomId: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let delayMs = 150;
  while (Date.now() < deadline) {
    const snapshot = await loadFinaleRoom(roomId);
    if (snapshot.state.finale?.narrative) return snapshot.state.finale;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(1_000, delayMs * 2);
  }
  return null;
}

async function releaseClaim(roomId: string, requestId: string) {
  await updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadFinaleRoom(roomId),
    applyUpdate: async (snapshot) => ({
      state: releaseFinaleNarrativeClaim(snapshot.state, requestId),
      value: undefined,
    }),
    writeSnapshot: writeFinaleRoom,
  });
}

export async function generateFinaleNarrative(params: {
  roomId: string;
  now?: number;
  requestId?: string;
}) {
  const now = params.now ?? Date.now();
  const requestId = params.requestId ?? crypto.randomUUID();
  const claim = await updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadFinaleRoom(params.roomId),
    applyUpdate: async (snapshot) => {
      if (snapshot.state.status !== "finished") {
        throw statusError("party must be finished before writing its epilogue", 409);
      }
      const result = claimFinaleNarrativeState(snapshot.state, { requestId, now });
      return {
        state: result.state,
        value: { claimed: result.claimed, narrative: result.narrative },
      };
    },
    writeSnapshot: writeFinaleRoom,
  });

  if (claim.value.narrative) {
    const finale = claim.state.finale!;
    return {
      narrative: claim.value.narrative,
      generatedAt: finale.generatedAt,
      usedFallback: finale.usedFallback ?? false,
      replayed: true,
    };
  }
  if (!claim.value.claimed) {
    const finale = await waitForFinaleNarrative(params.roomId);
    if (!finale?.narrative) {
      throw statusError("finale generation is already in progress; retry shortly", 409);
    }
    return {
      narrative: finale.narrative,
      generatedAt: finale.generatedAt,
      usedFallback: finale.usedFallback ?? false,
      replayed: true,
    };
  }

  const claimedFinale = claim.state.finale!;
  const input = {
    evidence: claimedFinale.evidence,
    playerCount: claim.state.players.length,
    teamNames: claim.state.teams.map((team) => team.name),
  };
  const party = normalizePartyContext(claim.state.party, claim.state.venue);
  const finaleAct = getExperienceAct(party.experienceId, "finale");
  const context = finaleAct
    ? { ...party, actId: "finale" as const, venue: finaleAct.venue }
    : party;

  try {
    const generated = await runPromptSpec({
      spec: finaleNarrativeSpec,
      input,
      context,
      temperature: 0.82,
      budget: {
        roomId: params.roomId,
        operationId: `finale:${claimedFinale.evidenceCapturedAt}:v1`,
      },
    });
    const grounded = isFinaleNarrativeGrounded(generated.output, input);
    const narrative = grounded ? generated.output : fallbackFinaleNarrative(input, context);
    const usedFallback = generated.usedFallback || !grounded;
    const completed = await updateRoomStateWithOptimisticRetry({
      loadSnapshot: () => loadFinaleRoom(params.roomId),
      applyUpdate: async (snapshot) => {
        if (snapshot.state.finale?.narrative) {
          return {
            state: snapshot.state,
            value: {
              narrative: snapshot.state.finale.narrative,
              generatedAt: snapshot.state.finale.generatedAt,
              usedFallback: snapshot.state.finale.usedFallback ?? false,
              replayed: true,
            },
          };
        }
        const result = completeFinaleNarrativeState(snapshot.state, {
          requestId,
          narrative,
          generatedAt: Date.now(),
          usedFallback,
        });
        if (!result) throw statusError("finale generation lease changed; retry shortly", 409);
        return {
          state: result.state,
          value: {
            narrative: result.narrative,
            generatedAt: result.state.finale?.generatedAt,
            usedFallback: result.state.finale?.usedFallback ?? false,
            replayed: result.replayed,
          },
        };
      },
      writeSnapshot: writeFinaleRoom,
    });
    return completed.value;
  } catch (error) {
    await releaseClaim(params.roomId, requestId).catch(() => undefined);
    throw error;
  }
}
