import { z } from "zod";
import { getExperienceAct, getExperienceRoute } from "@/experiences/catalog";
import { getGame, getGameAvailability } from "@/games/registry";
import { classicChallengeTaskSpec, partyChallengeTaskSpec } from "./ai/challenge.prompts";
import { contrabandGenerationSpec } from "./ai/contraband.prompts";
import { impostorQuestionSpec } from "./ai/impostor.prompts";
import { classicPhotoTaskSpec, partyPhotoTaskSpec } from "./ai/phototunt.prompts";
import { runPromptSpec } from "./ai/prompt-runtime.server";
import { smokeScreenGenerationSpec } from "./ai/smokescreen.prompts";
import { soundscapeTopicsSpecForContext } from "./ai/soundscape.prompts";
import { stillLifeHeadlineSpec } from "./ai/stilllife.prompts";
import { toastAssignmentSpec } from "./ai/toastsyndicate.prompts";
import { markRoomAiPrepared } from "./ai-budget.server";
import {
  AI_PREWARM_GAME_IDS,
  aiPrewarmCacheKey,
  aiPrewarmParticipantIds,
  type AiPrewarmGameId,
} from "./ai-prewarm";
import type { AuthorizedHostRoom } from "./host-auth.server";
import { normalizePartyContext, type PartyActId, type PartyContext } from "./party-context";
import { createPartyRecord, findPartyRecordByIdempotency } from "./party-records.server";
import { statusError } from "./player-auth.server";
import type { RoomState } from "./types";

export const AI_PREWARM_KIND = "ai-prewarm";

const aiPrewarmRecordSchema = z
  .object({
    version: z.literal(1),
    cacheKey: z.string().min(16).max(80),
    gameId: z.enum(AI_PREWARM_GAME_IDS),
    targetActId: z.enum(["classic", "grill", "transition", "bar", "finale"]),
    participantIds: z.array(z.string()).max(30),
    preparedAt: z.number().nonnegative(),
    usedFallback: z.boolean(),
    output: z.unknown(),
  })
  .strict();

export type AiPrewarmRecord = z.infer<typeof aiPrewarmRecordSchema>;

function prewarmIdempotencyKey(cacheKey: string) {
  return `ai_prewarm_${cacheKey}`;
}

function targetContext(state: RoomState, targetActId: PartyActId): PartyContext {
  const party = normalizePartyContext(state.party, state.venue);
  const act = getExperienceAct(party.experienceId, targetActId);
  if (!act) throw statusError("target act is not part of this experience", 409);
  const route = getExperienceRoute(party.experienceId, party.contingency);
  if (!route.actOrder.includes(targetActId)) {
    throw statusError("target act is not part of this route", 409);
  }
  return { ...party, actId: targetActId, venue: act.venue };
}

function seedFromCacheKey(cacheKey: string) {
  return Number.parseInt(cacheKey.slice(0, 8), 16);
}

async function generatePrewarmOutput(params: {
  room: AuthorizedHostRoom;
  gameId: AiPrewarmGameId;
  context: PartyContext;
  cacheKey: string;
}) {
  const count = Math.max(1, params.room.state.players.length);
  const budget = {
    roomId: params.room.id,
    operationId: `prewarm:${params.cacheKey}`,
  };
  const seed = seedFromCacheKey(params.cacheKey);
  if (params.gameId === "smokescreen") {
    return runPromptSpec({
      spec: smokeScreenGenerationSpec,
      input: { count, existingMissionTexts: [] },
      context: params.context,
      temperature: 0.9,
      budget,
    });
  }
  if (params.gameId === "soundscape") {
    return runPromptSpec({
      spec: soundscapeTopicsSpecForContext(params.context),
      input: {},
      context: params.context,
      temperature: 0.95,
      budget,
    });
  }
  if (params.gameId === "challenge") {
    return runPromptSpec({
      spec:
        params.context.experienceId === "classic-park"
          ? classicChallengeTaskSpec
          : partyChallengeTaskSpec,
      input: {
        operatorName:
          params.context.contentLocale === "ru" ? "оператор камеры" : "the camera operator",
        pastTasks: [],
      },
      context: params.context,
      temperature: 0.95,
      budget,
    });
  }
  if (params.gameId === "impostor") {
    return runPromptSpec({
      spec: impostorQuestionSpec(params.context),
      input: { pastQuestions: [] },
      context: params.context,
      temperature: 0.95,
      budget,
    });
  }
  if (params.gameId === "phototunt") {
    return runPromptSpec({
      spec:
        params.context.experienceId === "classic-park" ? classicPhotoTaskSpec : partyPhotoTaskSpec,
      input: { pastTasks: [] },
      context: params.context,
      temperature: 0.95,
      budget,
    });
  }
  if (params.gameId === "contraband") {
    return runPromptSpec({
      spec: contrabandGenerationSpec,
      input: { count, seed, recentPhrases: [] },
      context: params.context,
      temperature: 0.85,
      budget,
    });
  }
  if (params.gameId === "toastsyndicate") {
    return runPromptSpec({
      spec: toastAssignmentSpec,
      input: { seed, recentGenreIds: [], recentWordIds: [] },
      context: params.context,
      temperature: 0.8,
      budget,
    });
  }
  return runPromptSpec({
    spec: stillLifeHeadlineSpec,
    input: { seed, recentHeadlines: [] },
    context: params.context,
    temperature: 0.9,
    budget,
  });
}

function assertPrewarmRow(
  payload: unknown,
  params: {
    cacheKey: string;
    gameId: AiPrewarmGameId;
    targetActId: PartyActId;
  },
) {
  const record = aiPrewarmRecordSchema.parse(payload);
  if (
    record.cacheKey !== params.cacheKey ||
    record.gameId !== params.gameId ||
    record.targetActId !== params.targetActId
  ) {
    throw statusError("prepared AI payload does not match this party", 409);
  }
  return record;
}

async function publishPreparedMeta(roomId: string, record: AiPrewarmRecord) {
  await markRoomAiPrepared(roomId, {
    cacheKey: record.cacheKey,
    gameId: record.gameId,
    targetActId: record.targetActId,
    participantCount: record.participantIds.length,
    preparedAt: record.preparedAt,
    usedFallback: record.usedFallback,
  });
}

export async function prewarmAiGame(params: {
  room: AuthorizedHostRoom;
  gameId: AiPrewarmGameId;
  targetActId: PartyActId;
  now?: number;
}) {
  const context = targetContext(params.room.state, params.targetActId);
  const availability = getGameAvailability(getGame(params.gameId), context, params.room.state);
  if (availability.status === "blocked") {
    throw statusError(availability.reason ?? "game is not ready to prepare", 409);
  }
  const cacheKey = aiPrewarmCacheKey(params.room.state, params.gameId, params.targetActId);
  const idempotencyKey = prewarmIdempotencyKey(cacheKey);
  const existing = await findPartyRecordByIdempotency(params.room.id, idempotencyKey);
  if (existing) {
    const record = assertPrewarmRow(existing.payload, {
      cacheKey,
      gameId: params.gameId,
      targetActId: params.targetActId,
    });
    await publishPreparedMeta(params.room.id, record);
    return { record, replayed: true };
  }

  const generated = await generatePrewarmOutput({
    room: params.room,
    gameId: params.gameId,
    context,
    cacheKey,
  });
  const record = aiPrewarmRecordSchema.parse({
    version: 1,
    cacheKey,
    gameId: params.gameId,
    targetActId: params.targetActId,
    participantIds: aiPrewarmParticipantIds(params.room.state, params.gameId),
    preparedAt: params.now ?? Date.now(),
    usedFallback: generated.usedFallback,
    output: generated.output,
  });
  const created = await createPartyRecord({
    roomId: params.room.id,
    state: params.room.state,
    input: {
      idempotencyKey,
      runId: `prewarm_${cacheKey.slice(0, 48)}`,
      gameId: params.gameId,
      kind: AI_PREWARM_KIND,
      visibility: "host",
      payload: record,
    },
  });
  const persisted = assertPrewarmRow(created.row.payload, {
    cacheKey,
    gameId: params.gameId,
    targetActId: params.targetActId,
  });
  await publishPreparedMeta(params.room.id, persisted);
  return { record: persisted, replayed: created.replayed };
}

export async function preparedAiOutput(params: {
  roomId: string;
  state: RoomState;
  gameId: AiPrewarmGameId;
  targetActId: PartyActId;
}) {
  const cacheKey = aiPrewarmCacheKey(params.state, params.gameId, params.targetActId);
  const existing = await findPartyRecordByIdempotency(
    params.roomId,
    prewarmIdempotencyKey(cacheKey),
  );
  if (!existing) return null;
  const parsed = aiPrewarmRecordSchema.safeParse(existing.payload);
  if (!parsed.success) return null;
  if (
    parsed.data.cacheKey !== cacheKey ||
    parsed.data.gameId !== params.gameId ||
    parsed.data.targetActId !== params.targetActId
  ) {
    return null;
  }
  return parsed.data;
}
