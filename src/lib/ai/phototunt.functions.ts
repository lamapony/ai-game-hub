// Server functions for Photo Hunt — versioned prompts plus deterministic party ranking.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hostPromptAuthFields } from "./prompt-auth";

export const generatePhotoTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        pastTasks: z.array(z.string().max(500)).max(50).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ task: string; intro: string; fallback?: true }> => {
    const [promptSpecs, runtimeApi] = await Promise.all([
      import("./phototunt.prompts"),
      import("./prompt-runtime.server"),
    ]);
    const { authorizePromptRuntime, runPromptSpec } = runtimeApi;
    const runtime = await authorizePromptRuntime(data, "phototunt");
    const input = { pastTasks: runtime.state.phototunt?.pastTasks ?? data.pastTasks ?? [] };
    const { preparedAiOutput } = await import("../ai-prewarm.server");
    const prepared = await preparedAiOutput({
      roomId: runtime.roomId,
      state: runtime.state,
      gameId: "phototunt",
      targetActId: runtime.party.actId,
    });
    const firstTask = promptSpecs.preparedFirstPhotoTask(
      prepared?.output,
      runtime.party,
      input.pastTasks,
    );
    if (firstTask) {
      return {
        ...firstTask,
        ...(prepared?.usedFallback ? { fallback: true as const } : {}),
      };
    }
    const result = await runPromptSpec({
      spec:
        runtime.party.experienceId === "classic-park"
          ? promptSpecs.classicPhotoTaskSpec
          : promptSpecs.partyPhotoTaskSpec,
      input,
      context: runtime.party,
      temperature: 0.95,
      budget: {
        roomId: runtime.roomId,
        operationId: `phototunt:${runtime.state.phototunt?.roundId ?? "round"}:task`,
      },
    });
    return { ...result.output, ...(result.usedFallback ? { fallback: true as const } : {}) };
  });

const PhotoInput = z
  .object({
    playerId: z.string().min(1).max(128),
    playerName: z.string().trim().min(1).max(80),
    url: z.string().min(1).max(4_000_000),
  })
  .strict();

export const judgePhotos = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        task: z.string().max(500),
        photos: z.array(PhotoInput).min(1).max(12),
      })
      .strict()
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ranking: Array<{ playerId: string; rank: number; comment: string }>;
      verdict: string;
      fallback?: true;
    }> => {
      const [
        { classicPhotoJudgementSpec, finalizePartyPhotoJudgement, partyPhotoJudgementSpec },
        { authorizePromptRuntime, runPromptSpec },
        { sanitizePhotoRanking },
      ] = await Promise.all([
        import("./phototunt.prompts"),
        import("./prompt-runtime.server"),
        import("./sanitize"),
      ]);
      const runtime = await authorizePromptRuntime(data, "phototunt");
      const input = {
        task: runtime.state.phototunt?.task ?? data.task,
        photos: data.photos,
      };

      if (runtime.party.experienceId === "classic-park") {
        const result = await runPromptSpec({
          spec: classicPhotoJudgementSpec,
          input,
          context: runtime.party,
          temperature: 0.7,
          budget: {
            roomId: runtime.roomId,
            operationId: `phototunt:${runtime.state.phototunt?.roundId ?? "round"}:judgment`,
          },
        });
        return {
          ...sanitizePhotoRanking(result.output, data.photos),
          ...(result.usedFallback ? { fallback: true as const } : {}),
        };
      }

      const result = await runPromptSpec({
        spec: partyPhotoJudgementSpec,
        input,
        context: runtime.party,
        temperature: 0.7,
        budget: {
          roomId: runtime.roomId,
          operationId: `phototunt:${runtime.state.phototunt?.roundId ?? "round"}:judgment`,
        },
      });
      return {
        ...finalizePartyPhotoJudgement(result.output, data.photos, runtime.party),
        ...(result.usedFallback ? { fallback: true as const } : {}),
      };
    },
  );
