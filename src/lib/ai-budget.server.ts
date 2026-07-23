import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  completeAiUsageState,
  estimatePromptCredits,
  estimateSpeechCredits,
  estimateTranscriptionCredits,
  markAiPreparedState,
  reserveAiUsageState,
  type AiPreparedMeta,
  type AiUsageKind,
} from "./ai-budget";
import {
  chatJSON,
  ttsMp3,
  transcribeAudio,
  type AiGatewayUsage,
  type AiPromptMetadata,
  type ContentPart,
  type JsonResponseSchema,
} from "./ai-gateway.server";
import { statusError } from "./player-auth.server";
import { migrateRoomState } from "./room-state-migration";
import { updateRoomStateWithOptimisticRetry } from "./room-state-retry.server";
import type { RoomState } from "./types";

type Snapshot = { id: string; state: RoomState; updatedAt: string };

async function loadSnapshot(roomId: string): Promise<Snapshot> {
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

async function writeSnapshot(snapshot: Snapshot, state: RoomState) {
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

export function aiUsageKey(roomId: string, operationId: string) {
  return `ai_${createHash("sha256").update(`${roomId}:${operationId}`).digest("hex")}`;
}

export async function reserveRoomAiBudget(params: {
  roomId: string;
  operationId?: string;
  operation: string;
  kind: AiUsageKind;
  credits: number;
  now?: number;
}) {
  const key = aiUsageKey(params.roomId, params.operationId ?? randomUUID());
  const result = await updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSnapshot(params.roomId),
    applyUpdate: async (snapshot) => {
      const reserved = reserveAiUsageState(snapshot.state, {
        key,
        kind: params.kind,
        operation: params.operation.slice(0, 120),
        credits: params.credits,
        createdAt: params.now ?? Date.now(),
      });
      return {
        state: reserved.state,
        value: { status: reserved.status, receipt: reserved.receipt },
      };
    },
    writeSnapshot,
  });
  return { key, ...result.value };
}

export async function completeRoomAiUsage(params: {
  roomId: string;
  key: string;
  status: "succeeded" | "failed";
  inputTokens?: number;
  outputTokens?: number;
  providerRequests?: number;
}) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSnapshot(params.roomId),
    applyUpdate: async (snapshot) => ({
      state: completeAiUsageState(snapshot.state, params),
      value: params,
    }),
    writeSnapshot,
  });
}

export async function markRoomAiPrepared(roomId: string, prepared: AiPreparedMeta) {
  return updateRoomStateWithOptimisticRetry({
    loadSnapshot: () => loadSnapshot(roomId),
    applyUpdate: async (snapshot) => ({
      state: markAiPreparedState(snapshot.state, prepared),
      value: prepared,
    }),
    writeSnapshot,
  });
}

export async function transcribeWithRoomBudget(params: {
  roomId: string;
  operationId: string;
  file: Blob;
  filename?: string;
}) {
  const reservation = await reserveRoomAiBudget({
    roomId: params.roomId,
    operationId: params.operationId,
    operation: "audio.transcription",
    kind: "stt",
    credits: estimateTranscriptionCredits(params.file.size),
  });
  if (reservation.status !== "reserved") {
    throw statusError(`AI transcription unavailable (${reservation.status})`, 429);
  }

  let usage: AiGatewayUsage | undefined;
  try {
    const text = await transcribeAudio(params.file, params.filename, (nextUsage) => {
      usage = nextUsage;
    });
    await completeRoomAiUsage({
      roomId: params.roomId,
      key: reservation.key,
      status: "succeeded",
      providerRequests: usage?.providerRequests ?? 0,
    });
    return text;
  } catch (error) {
    await completeRoomAiUsage({
      roomId: params.roomId,
      key: reservation.key,
      status: "failed",
      providerRequests: usage?.providerRequests ?? 0,
    }).catch(() => undefined);
    throw error;
  }
}

export async function chatJsonWithRoomBudget<T>(params: {
  roomId: string;
  operationId: string;
  operation: string;
  model?: string;
  system: string;
  user: string | ContentPart[];
  temperature?: number;
  responseSchema?: JsonResponseSchema;
  prompt?: AiPromptMetadata;
}) {
  const reservation = await reserveRoomAiBudget({
    roomId: params.roomId,
    operationId: params.operationId,
    operation: params.operation,
    kind:
      Array.isArray(params.user) && params.user.some((part) => part.type === "image_url")
        ? "vision"
        : "text",
    credits: estimatePromptCredits(params.user),
  });
  if (reservation.status !== "reserved") {
    throw statusError(`AI generation unavailable (${reservation.status})`, 429);
  }

  let usage: AiGatewayUsage | undefined;
  try {
    const output = await chatJSON<T>({
      model: params.model,
      system: params.system,
      user: params.user,
      temperature: params.temperature,
      responseSchema: params.responseSchema,
      prompt: params.prompt,
      onUsage: (nextUsage) => {
        usage = nextUsage;
      },
    });
    await completeRoomAiUsage({
      roomId: params.roomId,
      key: reservation.key,
      status: "succeeded",
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      providerRequests: usage?.providerRequests ?? 0,
    });
    return output;
  } catch (error) {
    await completeRoomAiUsage({
      roomId: params.roomId,
      key: reservation.key,
      status: "failed",
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      providerRequests: usage?.providerRequests ?? 0,
    }).catch(() => undefined);
    throw error;
  }
}

export async function speakWithRoomBudget(params: {
  roomId: string;
  text: string;
  voice?: string;
}) {
  const reservation = await reserveRoomAiBudget({
    roomId: params.roomId,
    operation: "audio.speech",
    kind: "tts",
    credits: estimateSpeechCredits(params.text.length),
  });
  if (reservation.status !== "reserved") {
    throw statusError(`AI speech unavailable (${reservation.status})`, 429);
  }

  let usage: AiGatewayUsage | undefined;
  try {
    const output = await ttsMp3(params.text, params.voice, (nextUsage) => {
      usage = nextUsage;
    });
    await completeRoomAiUsage({
      roomId: params.roomId,
      key: reservation.key,
      status: "succeeded",
      providerRequests: usage?.providerRequests,
    });
    return output;
  } catch (error) {
    await completeRoomAiUsage({
      roomId: params.roomId,
      key: reservation.key,
      status: "failed",
      providerRequests: usage?.providerRequests ?? 0,
    }).catch(() => undefined);
    throw error;
  }
}
