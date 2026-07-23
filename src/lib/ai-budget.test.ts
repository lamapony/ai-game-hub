import { describe, expect, test } from "bun:test";
import {
  RECENT_AI_USAGE_LIMIT,
  completeAiUsageState,
  estimatePromptCredits,
  estimateSpeechCredits,
  estimateTranscriptionCredits,
  markAiPreparedState,
  normalizeAiRuntimeState,
  recordManualAiModeState,
  reserveAiUsageState,
  resetAiRuntimeState,
  setAiBudgetLimitState,
} from "./ai-budget";
import { emptyRoomState } from "./types";

describe("per-party AI budget", () => {
  test("reserves once per operation and blocks before crossing the limit", () => {
    const initial = setAiBudgetLimitState(emptyRoomState("Host"), 5);
    const first = reserveAiUsageState(initial, {
      key: "op-1",
      kind: "vision",
      operation: "oracle.reading",
      credits: 5,
      createdAt: 1,
    });
    const replay = reserveAiUsageState(first.state, {
      key: "op-1",
      kind: "vision",
      operation: "oracle.reading",
      credits: 5,
      createdAt: 2,
    });
    const blocked = reserveAiUsageState(first.state, {
      key: "op-2",
      kind: "text",
      operation: "toast.assignment",
      credits: 1,
      createdAt: 3,
    });

    expect(first.status).toBe("reserved");
    expect(replay.status).toBe("replayed");
    expect(replay.state).toBe(first.state);
    expect(blocked.status).toBe("blocked");
    expect(blocked.receipt.credits).toBe(0);
    expect(blocked.state.aiRuntime?.usedCredits).toBe(5);
    expect(blocked.state.aiRuntime?.blockedOperations).toBe(1);
  });

  test("completes usage exactly once with provider telemetry", () => {
    const reserved = reserveAiUsageState(emptyRoomState("Host"), {
      key: "op-1",
      kind: "text",
      operation: "challenge.task",
      credits: 1,
      createdAt: 1,
    }).state;
    const completed = completeAiUsageState(reserved, {
      key: "op-1",
      status: "succeeded",
      inputTokens: 120,
      outputTokens: 30,
      providerRequests: 2,
    });
    const replay = completeAiUsageState(completed, {
      key: "op-1",
      status: "failed",
      inputTokens: 999,
      outputTokens: 999,
      providerRequests: 9,
    });

    expect(completed.aiRuntime?.usedCredits).toBe(1);
    expect(completed.aiRuntime?.inputTokens).toBe(120);
    expect(completed.aiRuntime?.outputTokens).toBe(30);
    expect(completed.aiRuntime?.providerRequests).toBe(2);
    expect(completed.aiRuntime?.failedOperations).toBe(0);
    expect(replay).toBe(completed);
  });

  test("keeps bounded receipts and private-output-free prepared metadata", () => {
    let state = setAiBudgetLimitState(emptyRoomState("Host"), 500);
    for (let index = 0; index < RECENT_AI_USAGE_LIMIT + 5; index++) {
      state = reserveAiUsageState(state, {
        key: `op-${index}`,
        kind: "tts",
        operation: "audio.speech",
        credits: 1,
        createdAt: index,
      }).state;
    }
    state = markAiPreparedState(state, {
      cacheKey: "opaque-cache-key",
      gameId: "smokescreen",
      targetActId: "grill",
      participantCount: 12,
      preparedAt: 99,
      usedFallback: false,
    });

    expect(state.aiRuntime?.recentUsage).toHaveLength(RECENT_AI_USAGE_LIMIT);
    expect(state.aiRuntime?.recentUsage[0]?.key).toBe("op-5");
    expect(state.aiRuntime?.prepared?.smokescreen).toEqual({
      cacheKey: "opaque-cache-key",
      gameId: "smokescreen",
      targetActId: "grill",
      participantCount: 12,
      preparedAt: 99,
      usedFallback: false,
    });
    expect(JSON.stringify(state.aiRuntime?.prepared).includes("mission")).toBe(false);
  });

  test("preserves the selected cap but clears usage for a new party", () => {
    const limited = setAiBudgetLimitState(emptyRoomState("Host"), 240);
    const used = reserveAiUsageState(limited, {
      key: "op-1",
      kind: "stt",
      operation: "audio.transcription",
      credits: 4,
      createdAt: 1,
    }).state;
    const reset = resetAiRuntimeState(used);

    const runtime = normalizeAiRuntimeState(reset.aiRuntime);
    expect(runtime.limitCredits).toBe(240);
    expect(runtime.usedCredits).toBe(0);
    expect(runtime.providerRequests).toBe(0);
    expect(runtime.recentUsage).toEqual([]);
  });

  test("ignores a late provider completion from the old party and lets the new party reuse its operation id", () => {
    const limited = setAiBudgetLimitState(emptyRoomState("Host"), 20);
    const reserved = reserveAiUsageState(limited, {
      key: "shared-operation",
      kind: "text",
      operation: "challenge.task",
      credits: 3,
      createdAt: 1,
    }).state;
    const prepared = markAiPreparedState(reserved, {
      cacheKey: "old-prepared-deck",
      gameId: "challenge",
      targetActId: "grill",
      participantCount: 8,
      preparedAt: 2,
      usedFallback: false,
    });
    const reset = resetAiRuntimeState(prepared);
    const lateCompletion = completeAiUsageState(reset, {
      key: "shared-operation",
      status: "succeeded",
      inputTokens: 500,
      outputTokens: 100,
      providerRequests: 1,
    });
    const nextParty = reserveAiUsageState(lateCompletion, {
      key: "shared-operation",
      kind: "text",
      operation: "challenge.task",
      credits: 3,
      createdAt: 3,
    });

    expect(lateCompletion).toBe(reset);
    expect(normalizeAiRuntimeState(lateCompletion.aiRuntime).providerRequests).toBe(0);
    expect(normalizeAiRuntimeState(lateCompletion.aiRuntime).prepared).toBeUndefined();
    expect(nextParty.status).toBe("reserved");
    expect(nextParty.state.aiRuntime?.usedCredits).toBe(3);
  });

  test("records manual fallback activations and elapsed time without double counting", () => {
    const state = emptyRoomState("Host");
    const manual = recordManualAiModeState(state, "manual", 1_000);
    const manualState = {
      ...state,
      party: { ...state.party!, aiMode: "manual" as const },
      aiRuntime: manual,
    };
    const replay = recordManualAiModeState(manualState, "manual", 2_000);
    const automatic = recordManualAiModeState(manualState, "auto", 4_500);

    expect(manual.manualFallbackActivations).toBe(1);
    expect(manual.manualFallbackStartedAt).toBe(1_000);
    expect(replay).toEqual(manual);
    expect(automatic.manualFallbackActivations).toBe(1);
    expect(automatic.manualFallbackTotalMs).toBe(3_500);
    expect(automatic.manualFallbackStartedAt).toBeUndefined();
  });

  test("uses conservative bounded estimates for each provider surface", () => {
    expect(estimatePromptCredits("text")).toBe(1);
    expect(
      estimatePromptCredits([
        { type: "text", text: "look" },
        { type: "image_url", image_url: { url: "https://example.test/a" } },
        { type: "image_url", image_url: { url: "https://example.test/b" } },
      ]),
    ).toBe(9);
    expect(estimateTranscriptionCredits(2.2 * 1024 * 1024)).toBe(5);
    expect(estimateSpeechCredits(181)).toBe(2);
    expect(estimateSpeechCredits(9_999)).toBe(4);
  });
});
