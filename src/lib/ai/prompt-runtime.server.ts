import { estimatePromptCredits } from "../ai-budget";
import { completeRoomAiUsage, reserveRoomAiBudget } from "../ai-budget.server";
import { chatJSON, type AiGatewayUsage } from "../ai-gateway.server";
import { authorizeHostRoom } from "../host-auth.server";
import { normalizePartyContext, type PartyContext } from "../party-context";
import { statusError } from "../player-auth.server";
import { logError, logWarn } from "../structured-log";
import type { GameId, RoomState } from "../types";
import type { PromptSpec } from "./prompt-contract";

export type AuthorizedPromptRuntime = {
  roomId: string;
  state: RoomState;
  party: PartyContext;
};

export function shouldUseManualAiFallback(context: PartyContext) {
  return context.aiMode === "manual";
}

function promptFallback<TInput, TOutput>(
  spec: PromptSpec<TInput, TOutput>,
  input: TInput,
  context: PartyContext,
) {
  return {
    output: spec.outputSchema.parse(spec.fallback(input, context)),
    usedFallback: true as const,
  };
}

export async function authorizePromptRuntime(
  input: { roomId: string; hostSecret: string },
  gameId: GameId,
): Promise<AuthorizedPromptRuntime> {
  const room = await authorizeHostRoom(input);
  if (room.state.currentGame !== gameId) {
    throw statusError(`${gameId} is not the active game`, 409);
  }
  return {
    roomId: room.id,
    state: room.state,
    party: normalizePartyContext(room.state.party, room.state.venue),
  };
}

export async function runPromptSpec<TInput, TOutput>(params: {
  spec: PromptSpec<TInput, TOutput>;
  input: TInput;
  context: PartyContext;
  temperature?: number;
  model?: string;
  budget?: { roomId: string; operationId: string };
}): Promise<{ output: TOutput; usedFallback: boolean }> {
  const { spec, input, context } = params;
  if (shouldUseManualAiFallback(context)) {
    logWarn("ai.prompt.manual_fallback", {
      promptId: spec.id,
      promptVersion: spec.version,
      gameId: spec.gameId,
      actId: context.actId,
    });
    return promptFallback(spec, input, context);
  }
  const system = spec.buildSystem(context);
  const user = spec.buildUser(input, context);
  let budgetKey: string | undefined;
  if (params.budget) {
    try {
      const reservation = await reserveRoomAiBudget({
        roomId: params.budget.roomId,
        operationId: params.budget.operationId,
        operation: spec.id,
        kind:
          Array.isArray(user) && user.some((part) => part.type === "image_url") ? "vision" : "text",
        credits: estimatePromptCredits(user),
      });
      if (reservation.status !== "reserved") {
        logWarn("ai.prompt.budget_fallback", {
          promptId: spec.id,
          promptVersion: spec.version,
          gameId: spec.gameId,
          actId: context.actId,
          budgetStatus: reservation.status,
        });
        return promptFallback(spec, input, context);
      }
      budgetKey = reservation.key;
    } catch (error) {
      logWarn("ai.prompt.budget_unavailable", {
        promptId: spec.id,
        promptVersion: spec.version,
        gameId: spec.gameId,
        actId: context.actId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return promptFallback(spec, input, context);
    }
  }
  let usage: AiGatewayUsage | undefined;
  try {
    const raw = await chatJSON<unknown>({
      model: params.model,
      system,
      user,
      temperature: params.temperature,
      responseSchema: spec.jsonSchema,
      prompt: {
        id: spec.id,
        version: spec.version,
        gameId: spec.gameId,
        actId: context.actId,
      },
      onUsage: (nextUsage) => {
        usage = nextUsage;
      },
    });
    const output = spec.outputSchema.parse(raw);
    if (params.budget && budgetKey) {
      try {
        await completeRoomAiUsage({
          roomId: params.budget.roomId,
          key: budgetKey,
          status: "succeeded",
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          providerRequests: usage?.providerRequests ?? 0,
        });
      } catch (error) {
        logWarn("ai.prompt.budget_completion_failed", {
          promptId: spec.id,
          gameId: spec.gameId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    return { output, usedFallback: false };
  } catch (error) {
    if (params.budget && budgetKey) {
      try {
        await completeRoomAiUsage({
          roomId: params.budget.roomId,
          key: budgetKey,
          status: "failed",
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          providerRequests: usage?.providerRequests ?? 0,
        });
      } catch (budgetError) {
        logWarn("ai.prompt.budget_completion_failed", {
          promptId: spec.id,
          gameId: spec.gameId,
          error: budgetError instanceof Error ? budgetError.message : "unknown",
        });
      }
    }
    logWarn("ai.prompt.fallback", {
      promptId: spec.id,
      promptVersion: spec.version,
      gameId: spec.gameId,
      actId: context.actId,
    });
    try {
      return promptFallback(spec, input, context);
    } catch (fallbackError) {
      logError("ai.prompt.invalid_fallback", fallbackError, {
        promptId: spec.id,
        promptVersion: spec.version,
        gameId: spec.gameId,
        actId: context.actId,
      });
      throw error;
    }
  }
}
