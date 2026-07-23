// Server functions for Park Spirit Challenge — versioned prompts plus server-derived party act.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PartyChallengeBreakdown } from "./challenge.prompts";
import { hostPromptAuthFields } from "./prompt-auth";

export const generateChallengeTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        operatorName: z.string().trim().min(1).max(80),
        pastTasks: z.array(z.string().max(500)).max(50).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ task: string; intro: string; fallback?: true }> => {
    const [
      { classicChallengeTaskSpec, partyChallengeTaskSpec, preparedFirstChallengeTask },
      runtimeApi,
      prewarmApi,
    ] = await Promise.all([
      import("./challenge.prompts"),
      import("./prompt-runtime.server"),
      import("../ai-prewarm.server"),
    ]);
    const { authorizePromptRuntime, runPromptSpec } = runtimeApi;
    const { preparedAiOutput } = prewarmApi;
    const runtime = await authorizePromptRuntime(data, "challenge");
    const input = {
      operatorName: runtime.state.challenge?.operatorName ?? data.operatorName,
      pastTasks: data.pastTasks ?? [],
    };
    const spec =
      runtime.party.experienceId === "classic-park"
        ? classicChallengeTaskSpec
        : partyChallengeTaskSpec;
    const preparedRecord = await preparedAiOutput({
      roomId: runtime.roomId,
      state: runtime.state,
      gameId: "challenge",
      targetActId: runtime.party.actId,
    });
    const prepared = preparedFirstChallengeTask(
      preparedRecord?.output,
      runtime.party,
      input.pastTasks,
    );
    if (prepared) {
      return {
        ...prepared,
        ...(preparedRecord?.usedFallback ? { fallback: true as const } : {}),
      };
    }
    const result = await runPromptSpec({
      spec,
      input,
      context: runtime.party,
      temperature: 0.95,
      budget: {
        roomId: runtime.roomId,
        operationId: `challenge:${runtime.state.challenge?.roundId ?? "round"}:task`,
      },
    });
    return { ...result.output, ...(result.usedFallback ? { fallback: true as const } : {}) };
  });

export type ChallengeJudgementResult = {
  score: number;
  feedback: string;
  verdict: string;
  breakdown?: PartyChallengeBreakdown;
  fallback?: true;
};

export const judgeChallenge = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        task: z.string().max(500),
        transcript: z.string().max(8_000),
        frames: z.array(z.string().max(4_000_000)).max(6),
        operatorName: z.string().trim().min(1).max(80),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<ChallengeJudgementResult> => {
    const [
      {
        classicChallengeJudgementSpec,
        finalizePartyChallengeJudgement,
        partyChallengeJudgementSpec,
      },
      runtimeApi,
    ] = await Promise.all([import("./challenge.prompts"), import("./prompt-runtime.server")]);
    const { authorizePromptRuntime, runPromptSpec } = runtimeApi;
    const runtime = await authorizePromptRuntime(data, "challenge");
    const input = {
      task: runtime.state.challenge?.task ?? data.task,
      transcript: data.transcript,
      frames: data.frames,
      operatorName: runtime.state.challenge?.operatorName ?? data.operatorName,
    };

    if (runtime.party.experienceId === "classic-park") {
      const result = await runPromptSpec({
        spec: classicChallengeJudgementSpec,
        input,
        context: runtime.party,
        temperature: 0.7,
        budget: {
          roomId: runtime.roomId,
          operationId: `challenge:${runtime.state.challenge?.roundId ?? "round"}:judgment`,
        },
      });
      return { ...result.output, ...(result.usedFallback ? { fallback: true as const } : {}) };
    }

    const result = await runPromptSpec({
      spec: partyChallengeJudgementSpec,
      input,
      context: runtime.party,
      temperature: 0.7,
      budget: {
        roomId: runtime.roomId,
        operationId: `challenge:${runtime.state.challenge?.roundId ?? "round"}:judgment`,
      },
    });
    return {
      ...finalizePartyChallengeJudgement(result.output),
      ...(result.usedFallback ? { fallback: true as const } : {}),
    };
  });
