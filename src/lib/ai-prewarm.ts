import { normalizePartyContext, type PartyActId } from "./party-context";
import type { GameId, RoomState } from "./types";

export const AI_PREWARM_GAME_IDS = [
  "smokescreen",
  "soundscape",
  "challenge",
  "impostor",
  "phototunt",
  "contraband",
  "toastsyndicate",
  "stilllife",
] as const;

export type AiPrewarmGameId = (typeof AI_PREWARM_GAME_IDS)[number];

export function isAiPrewarmGameId(gameId: GameId): gameId is AiPrewarmGameId {
  return (AI_PREWARM_GAME_IDS as readonly string[]).includes(gameId);
}

const ROSTER_BOUND_AI_PREWARM_GAME_IDS: readonly AiPrewarmGameId[] = ["smokescreen", "contraband"];

export function aiPrewarmParticipantIds(state: RoomState, gameId: AiPrewarmGameId) {
  if (!ROSTER_BOUND_AI_PREWARM_GAME_IDS.includes(gameId)) return [];
  return state.players.map((player) => player.id).sort();
}

function stableIdentityHash(value: string) {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export function aiPrewarmCacheKey(
  state: RoomState,
  gameId: AiPrewarmGameId,
  targetActId: PartyActId,
) {
  const party = normalizePartyContext(state.party, state.venue);
  return stableIdentityHash(
    JSON.stringify({
      experienceId: party.experienceId,
      contingency: party.contingency,
      venue: party.venue,
      contentLocale: party.contentLocale,
      aiMode: party.aiMode ?? "live",
      storySeed: party.storySeed ?? null,
      partyRunConfiguredAt: state.quickStart?.configuredAt ?? null,
      gameId,
      targetActId,
      participantIds: aiPrewarmParticipantIds(state, gameId),
      storyEvidence: party.storyEvidence ?? [],
    }),
  );
}

export function autoAiPrewarmAttemptKey(params: {
  triggerId?: string;
  gameId?: AiPrewarmGameId;
  cacheKey?: string;
  preparedCacheKey?: string;
}) {
  if (
    !params.triggerId ||
    !params.gameId ||
    !params.cacheKey ||
    params.preparedCacheKey === params.cacheKey
  ) {
    return null;
  }
  return `${params.triggerId}:${params.gameId}:${params.cacheKey}`;
}
