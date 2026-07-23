import type { RoomState } from "./types";

export const DEFAULT_AI_PARTY_BUDGET_CREDITS = 120;
export const MAX_AI_PARTY_BUDGET_CREDITS = 500;
export const RECENT_AI_USAGE_LIMIT = 96;

export type AiUsageKind = "text" | "vision" | "stt" | "tts";
export type AiUsageStatus = "reserved" | "succeeded" | "failed" | "blocked";

export type AiUsageReceipt = {
  key: string;
  kind: AiUsageKind;
  operation: string;
  credits: number;
  status: AiUsageStatus;
  createdAt: number;
  inputTokens?: number;
  outputTokens?: number;
  providerRequests?: number;
};

export type AiPreparedMeta = {
  cacheKey: string;
  gameId: string;
  targetActId: string;
  participantCount: number;
  preparedAt: number;
  usedFallback: boolean;
};

export type AiRuntimeState = {
  limitCredits: number;
  usedCredits: number;
  inputTokens: number;
  outputTokens: number;
  providerRequests: number;
  failedOperations: number;
  blockedOperations: number;
  manualFallbackActivations: number;
  manualFallbackTotalMs: number;
  manualFallbackStartedAt?: number;
  recentUsage: AiUsageReceipt[];
  prepared?: Record<string, AiPreparedMeta>;
};

export function boundedCredits(value: number, fallback = DEFAULT_AI_PARTY_BUDGET_CREDITS) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(MAX_AI_PARTY_BUDGET_CREDITS, Math.floor(value)));
}

export function normalizeAiRuntimeState(value: AiRuntimeState | undefined): AiRuntimeState {
  return {
    limitCredits: boundedCredits(value?.limitCredits ?? DEFAULT_AI_PARTY_BUDGET_CREDITS),
    usedCredits: Math.max(0, Math.floor(value?.usedCredits ?? 0)),
    inputTokens: Math.max(0, Math.floor(value?.inputTokens ?? 0)),
    outputTokens: Math.max(0, Math.floor(value?.outputTokens ?? 0)),
    providerRequests: Math.max(0, Math.floor(value?.providerRequests ?? 0)),
    failedOperations: Math.max(0, Math.floor(value?.failedOperations ?? 0)),
    blockedOperations: Math.max(0, Math.floor(value?.blockedOperations ?? 0)),
    manualFallbackActivations: Math.max(0, Math.floor(value?.manualFallbackActivations ?? 0)),
    manualFallbackTotalMs: Math.max(0, Math.floor(value?.manualFallbackTotalMs ?? 0)),
    ...(value?.manualFallbackStartedAt !== undefined
      ? { manualFallbackStartedAt: value.manualFallbackStartedAt }
      : {}),
    recentUsage: (value?.recentUsage ?? []).slice(-RECENT_AI_USAGE_LIMIT),
    ...(value?.prepared ? { prepared: value.prepared } : {}),
  };
}

export function estimatePromptCredits(user: unknown) {
  const imageCount = Array.isArray(user)
    ? user.filter(
        (part) =>
          part && typeof part === "object" && (part as { type?: unknown }).type === "image_url",
      ).length
    : 0;
  return Math.min(20, 1 + imageCount * 4);
}

export function estimateTranscriptionCredits(fileBytes: number) {
  const mebibytes = Math.max(0, Number.isFinite(fileBytes) ? fileBytes : 0) / (1024 * 1024);
  return Math.max(1, Math.min(12, Math.ceil(mebibytes * 2)));
}

export function estimateSpeechCredits(textLength: number) {
  const length = Math.max(0, Number.isFinite(textLength) ? textLength : 0);
  return Math.max(1, Math.min(4, Math.ceil(length / 180)));
}

export function reserveAiUsageState(
  state: RoomState,
  receipt: Omit<AiUsageReceipt, "status">,
): { state: RoomState; status: "reserved" | "replayed" | "blocked"; receipt: AiUsageReceipt } {
  const runtime = normalizeAiRuntimeState(state.aiRuntime);
  const existing = runtime.recentUsage.find((candidate) => candidate.key === receipt.key);
  if (existing) {
    return {
      state,
      status: existing.status === "blocked" ? "blocked" : "replayed",
      receipt: existing,
    };
  }

  const credits = boundedCredits(receipt.credits, 1);
  const blocked = runtime.usedCredits + credits > runtime.limitCredits;
  const nextReceipt: AiUsageReceipt = {
    ...receipt,
    credits: blocked ? 0 : credits,
    status: blocked ? "blocked" : "reserved",
  };
  const aiRuntime: AiRuntimeState = {
    ...runtime,
    usedCredits: runtime.usedCredits + nextReceipt.credits,
    blockedOperations: runtime.blockedOperations + (blocked ? 1 : 0),
    recentUsage: [...runtime.recentUsage, nextReceipt].slice(-RECENT_AI_USAGE_LIMIT),
  };
  return {
    state: { ...state, aiRuntime },
    status: blocked ? "blocked" : "reserved",
    receipt: nextReceipt,
  };
}

export function completeAiUsageState(
  state: RoomState,
  params: {
    key: string;
    status: "succeeded" | "failed";
    inputTokens?: number;
    outputTokens?: number;
    providerRequests?: number;
  },
): RoomState {
  const runtime = normalizeAiRuntimeState(state.aiRuntime);
  const index = runtime.recentUsage.findIndex((receipt) => receipt.key === params.key);
  if (index < 0) return state;
  const current = runtime.recentUsage[index]!;
  if (current.status !== "reserved") return state;
  const inputTokens = Math.max(0, Math.floor(params.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(params.outputTokens ?? 0));
  const providerRequests = Math.max(0, Math.floor(params.providerRequests ?? 1));
  const recentUsage = runtime.recentUsage.slice();
  recentUsage[index] = {
    ...current,
    status: params.status,
    inputTokens,
    outputTokens,
    providerRequests,
  };
  return {
    ...state,
    aiRuntime: {
      ...runtime,
      inputTokens: runtime.inputTokens + inputTokens,
      outputTokens: runtime.outputTokens + outputTokens,
      providerRequests: runtime.providerRequests + providerRequests,
      failedOperations: runtime.failedOperations + (params.status === "failed" ? 1 : 0),
      recentUsage,
    },
  };
}

export function setAiBudgetLimitState(state: RoomState, limitCredits: number): RoomState {
  const runtime = normalizeAiRuntimeState(state.aiRuntime);
  return {
    ...state,
    aiRuntime: {
      ...runtime,
      limitCredits: Math.max(runtime.usedCredits, boundedCredits(limitCredits)),
    },
  };
}

export function recordManualAiModeState(
  state: RoomState,
  mode: "auto" | "manual",
  now: number,
): AiRuntimeState {
  const runtime = normalizeAiRuntimeState(state.aiRuntime);
  const currentMode = state.party?.aiMode ?? "auto";
  if (mode === currentMode) return runtime;
  if (mode === "manual") {
    return {
      ...runtime,
      manualFallbackActivations: runtime.manualFallbackActivations + 1,
      manualFallbackStartedAt: now,
    };
  }
  const startedAt = runtime.manualFallbackStartedAt;
  return {
    ...runtime,
    manualFallbackTotalMs:
      runtime.manualFallbackTotalMs + (startedAt !== undefined ? Math.max(0, now - startedAt) : 0),
    manualFallbackStartedAt: undefined,
  };
}

export function resetAiRuntimeState(state: RoomState): RoomState {
  const runtime = normalizeAiRuntimeState(state.aiRuntime);
  return {
    ...state,
    aiRuntime: {
      ...normalizeAiRuntimeState(undefined),
      limitCredits: runtime.limitCredits,
    },
  };
}

export function markAiPreparedState(state: RoomState, prepared: AiPreparedMeta): RoomState {
  const runtime = normalizeAiRuntimeState(state.aiRuntime);
  return {
    ...state,
    aiRuntime: {
      ...runtime,
      prepared: { ...(runtime.prepared ?? {}), [prepared.gameId]: prepared },
    },
  };
}
