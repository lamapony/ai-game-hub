// Server functions for "Who's the Bot?" — server-derived act context, never client-selected.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hostPromptAuthFields } from "./prompt-auth";

export const generateImpostorQuestion = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        pastQuestions: z.array(z.string().max(240)).max(50).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ question: string; intro: string; fallback?: true }> => {
    const [promptSpecs, { authorizePromptRuntime, runPromptSpec }] = await Promise.all([
      import("./impostor.prompts"),
      import("./prompt-runtime.server"),
    ]);
    const runtime = await authorizePromptRuntime(data, "impostor");
    const pastQuestions = (runtime.state.impostor?.roundResults ?? []).map(
      (result) => result.question,
    );
    if ((runtime.state.impostor?.roundNumber ?? 1) === 1) {
      const { preparedAiOutput } = await import("../ai-prewarm.server");
      const prepared = await preparedAiOutput({
        roomId: runtime.roomId,
        state: runtime.state,
        gameId: "impostor",
        targetActId: runtime.party.actId,
      });
      const firstQuestion = promptSpecs.preparedFirstImpostorQuestion(
        prepared?.output,
        runtime.party,
        pastQuestions,
      );
      if (firstQuestion) {
        return {
          ...firstQuestion,
          ...(prepared?.usedFallback ? { fallback: true as const } : {}),
        };
      }
    }
    const result = await runPromptSpec({
      spec: promptSpecs.impostorQuestionSpec(runtime.party),
      input: { pastQuestions },
      context: runtime.party,
      temperature: 0.95,
      budget: {
        roomId: runtime.roomId,
        operationId: `impostor:${runtime.state.impostor?.roundId ?? "round"}:question`,
      },
    });
    return { ...result.output, ...(result.usedFallback ? { fallback: true as const } : {}) };
  });

export const generateImpostorAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        question: z.string().max(240),
        humanAnswers: z.array(z.string().max(240)).max(24),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ answer: string; fallback?: true }> => {
    const [{ impostorAnswerSpec }, { authorizePromptRuntime, runPromptSpec }] = await Promise.all([
      import("./impostor.prompts"),
      import("./prompt-runtime.server"),
    ]);
    const runtime = await authorizePromptRuntime(data, "impostor");
    const serverAnswers = Object.values(runtime.state.impostor?.answers ?? {});
    const result = await runPromptSpec({
      spec: impostorAnswerSpec(runtime.party),
      input: {
        question: runtime.state.impostor?.question ?? data.question,
        humanAnswers: serverAnswers.length > 0 ? serverAnswers : data.humanAnswers,
      },
      context: runtime.party,
      temperature: 0.9,
      budget: {
        roomId: runtime.roomId,
        operationId: `impostor:${runtime.state.impostor?.roundId ?? "round"}:answer`,
      },
    });
    return { ...result.output, ...(result.usedFallback ? { fallback: true as const } : {}) };
  });

export const impostorRevealComment = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        question: z.string().max(240),
        aiAnswer: z.string().max(240),
        caughtCount: z.number().int().nonnegative().max(100),
        totalVoters: z.number().int().nonnegative().max(100),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ verdict: string; fallback?: true }> => {
    const [{ impostorRevealSpec }, { authorizePromptRuntime, runPromptSpec }] = await Promise.all([
      import("./impostor.prompts"),
      import("./prompt-runtime.server"),
    ]);
    const runtime = await authorizePromptRuntime(data, "impostor");
    const result = await runPromptSpec({
      spec: impostorRevealSpec(runtime.party),
      input: {
        question: runtime.state.impostor?.question ?? data.question,
        aiAnswer: data.aiAnswer,
        caughtCount: data.caughtCount,
        totalVoters: data.totalVoters,
      },
      context: runtime.party,
      temperature: 0.9,
      budget: {
        roomId: runtime.roomId,
        operationId: `impostor:${runtime.state.impostor?.roundId ?? "round"}:reveal`,
      },
    });
    return { ...result.output, ...(result.usedFallback ? { fallback: true as const } : {}) };
  });

export type { VenueInput } from "./venue";
