// Server functions for the Soundscape Battle game.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { speakerSlotPrompt } from "../event-profile";
import { SOUND_TOPICS_MS } from "../host-controls";
import type { SoundscapeMix } from "../types";
import { sanitizeMixJudgement, sanitizeMixResponse } from "./sanitize";
import { hostPromptAuthFields } from "./prompt-auth";
import { statusError } from "../player-auth.server";

export const generateTopics = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({ ...hostPromptAuthFields })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ topics: string[]; fallback?: true }> => {
    const [promptSpecs, runtimeApi] = await Promise.all([
      import("./soundscape.prompts"),
      import("./prompt-runtime.server"),
    ]);
    const { authorizePromptRuntime, shouldUseManualAiFallback } = runtimeApi;
    const runtime = await authorizePromptRuntime(data, "soundscape");
    const spec = promptSpecs.soundscapeTopicsSpecForContext(runtime.party);
    const input = {};
    const roundId = runtime.state.soundscape?.roundId;
    if (!roundId) throw statusError("Soundscape round is not active", 409);
    const { persistSoundscapeTopics, readSoundscapeTopics, waitForSoundscapeTopics } =
      await import("../soundscape-topics.server");
    const completed = await readSoundscapeTopics(runtime.roomId, roundId);
    if (completed) return { topics: completed.topics, fallback: completed.fallback };

    const persist = async (topics: string[], fallback?: true) => {
      const stored = await persistSoundscapeTopics({
        roomId: runtime.roomId,
        roundId,
        topics,
        fallback,
        topicsEndsAt: Date.now() + SOUND_TOPICS_MS,
      });
      return { topics: stored.topics, fallback: stored.fallback };
    };
    const { preparedAiOutput } = await import("../ai-prewarm.server");
    const prepared = await preparedAiOutput({
      roomId: runtime.roomId,
      state: runtime.state,
      gameId: "soundscape",
      targetActId: runtime.party.actId,
    });
    const preparedTopics = promptSpecs.preparedSoundscapeTopics(prepared?.output, runtime.party);
    if (preparedTopics) {
      return persist(preparedTopics, prepared?.usedFallback ? true : undefined);
    }
    if (shouldUseManualAiFallback(runtime.party)) {
      return persist(spec.outputSchema.parse(spec.fallback(input, runtime.party)).topics, true);
    }
    const { chatJsonWithRoomBudget } = await import("../ai-budget.server");
    try {
      const raw = await chatJsonWithRoomBudget<unknown>({
        roomId: runtime.roomId,
        operationId: `soundscape:${runtime.state.soundscape?.roundId ?? "round"}:topics`,
        operation: spec.id,
        system: spec.buildSystem(runtime.party),
        user: spec.buildUser(input, runtime.party),
        temperature: 0.95,
        responseSchema: spec.jsonSchema,
        prompt: {
          id: spec.id,
          version: spec.version,
          gameId: spec.gameId,
          actId: runtime.party.actId,
        },
      });
      const output = spec.outputSchema.parse(raw);
      const fallbackTopics = spec.outputSchema.parse(spec.fallback(input, runtime.party)).topics;
      return persist(promptSpecs.preparedSoundscapeTopics(output, runtime.party) ?? fallbackTopics);
    } catch (error) {
      if (error instanceof Error && error.message.includes("(replayed)")) {
        const replayed = await waitForSoundscapeTopics(runtime.roomId, roundId);
        if (replayed) return { topics: replayed.topics, fallback: replayed.fallback };
      }
      console.error("[AI fallback] generateTopics", error);
      return persist(spec.outputSchema.parse(spec.fallback(input, runtime.party)).topics, true);
    }
  });

export const composeMix = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        teamId: z.string().trim().min(1).max(128),
        teamName: z.string().trim().min(1).max(80),
        topic: z.string().trim().min(1).max(80),
        clips: z
          .array(
            z
              .object({
                url: z.string().min(1).max(4_000),
                transcript: z.string().max(2_000),
                durationMs: z.number().finite().min(0).max(30_000),
                playerName: z.string().trim().min(1).max(80),
              })
              .strict(),
          )
          .max(30),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<SoundscapeMix> => {
    const [promptSpecs, runtimeApi] = await Promise.all([
      import("./soundscape.prompts"),
      import("./prompt-runtime.server"),
    ]);
    const { authorizePromptRuntime, runPromptSpec } = runtimeApi;
    const runtime = await authorizePromptRuntime(data, "soundscape");
    const spec =
      runtime.party.experienceId === "classic-park"
        ? promptSpecs.classicSoundscapeMixSpec
        : promptSpecs.partySoundscapeMixSpec;
    const input = {
      teamName: data.teamName,
      topic: data.topic,
      clips: data.clips,
      speakerSlots:
        runtime.party.experienceId === "classic-park"
          ? speakerSlotPrompt()
          : "slot 1 = host; slots 2–5 = remote speakers distributed around the current venue",
    };
    const result = await runPromptSpec({
      spec,
      input,
      context: runtime.party,
      temperature: 0.9,
      budget: {
        roomId: runtime.roomId,
        operationId: promptSpecs.soundscapeTeamOperationId(
          runtime.state.soundscape?.roundId,
          data.teamId,
          "mix",
        ),
      },
    });
    return {
      ...sanitizeMixResponse(result.output, data.clips, data.teamName),
      ...(result.usedFallback ? { aiFallback: true as const } : {}),
    };
  });

export const judgeMix = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        ...hostPromptAuthFields,
        teamId: z.string().trim().min(1).max(128),
        teamName: z.string().trim().min(1).max(80),
        topic: z.string().trim().min(1).max(80),
        clipsSummary: z.string().max(8_000),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ feedback: string; bonus: number; fallback?: true }> => {
    const [promptSpecs, runtimeApi] = await Promise.all([
      import("./soundscape.prompts"),
      import("./prompt-runtime.server"),
    ]);
    const { authorizePromptRuntime, runPromptSpec } = runtimeApi;
    const runtime = await authorizePromptRuntime(data, "soundscape");
    const spec =
      runtime.party.experienceId === "classic-park"
        ? promptSpecs.classicSoundscapeJudgmentSpec
        : promptSpecs.partySoundscapeJudgmentSpec;
    const result = await runPromptSpec({
      spec,
      input: {
        teamName: data.teamName,
        topic: data.topic,
        clipsSummary: data.clipsSummary,
      },
      context: runtime.party,
      temperature: 0.85,
      budget: {
        roomId: runtime.roomId,
        operationId: promptSpecs.soundscapeTeamOperationId(
          runtime.state.soundscape?.roundId,
          data.teamId,
          "judgment",
        ),
      },
    });
    return {
      ...sanitizeMixJudgement(result.output, data.teamName),
      ...(result.usedFallback ? { fallback: true as const } : {}),
    };
  });
