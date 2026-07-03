// Server functions for the Soundscape Battle game.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eventProfile, speakerSlotPrompt } from "../event-profile";
import type { SoundscapeMix } from "../types";
import { sanitizeMixJudgement, sanitizeMixResponse, sanitizeTopics } from "./sanitize";

const HOST_VOICE_SYSTEM = `You are the AI host of an outdoor party in a ${eventProfile.venue} called "${eventProfile.title}".
Voice: ${eventProfile.hostPersona.voice}.
Always reply in English. Always reply with strict valid JSON when asked.`;

const FALLBACK_TOPICS = [
  "Squirrels arguing at dawn",
  "Mushroom disco",
  "The forest at the end of time",
  "Tongs declaring independence",
  "Smoke with a secret agenda",
  "A bar stool remembers everything",
  "The last ice cube's revenge",
  "Grill opera in three acts",
  "Napkins forming a union",
  "A receipt becomes sentient",
  "Tiny thunder under the table",
  "The playlist goes to court",
  "Chairs gossip after midnight",
];

export const generateTopics = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async (): Promise<{ topics: string[]; fallback?: true }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    try {
      const result = await chatJSON<{ topics: string[] }>({
        system: HOST_VOICE_SYSTEM,
        user: `Invent 3 wild, evocative themes for a 3-minute "field recording" game in a public ${eventProfile.venue}.
Themes must spark physical action and silly recordings (people running around capturing sounds).
Mix absurd, atmospheric, and cinematic. Keep each under 6 words.

Return JSON: { "topics": ["...", "...", "..."] }`,
        temperature: 0.95,
      });
      return { topics: sanitizeTopics(result, FALLBACK_TOPICS) };
    } catch (error) {
      console.error("[AI fallback] generateTopics", error);
      return { topics: FALLBACK_TOPICS, fallback: true };
    }
  });

export const composeMix = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        teamName: z.string(),
        topic: z.string(),
        clips: z.array(
          z.object({
            url: z.string(),
            transcript: z.string(),
            durationMs: z.number(),
            playerName: z.string(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SoundscapeMix> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const numClips = data.clips.length;
    const clipsForPrompt = data.clips
      .map(
        (c, i) =>
          `Clip ${i}: by ${c.playerName}, ${Math.round(c.durationMs)}ms. Heard: "${c.transcript || "(non-verbal sound)"}"`,
      )
      .join("\n");

    type Resp = {
      intro: string;
      score: Array<{ at_ms: number; clip_index?: number; slot: number; speak?: string }>;
      total_ms: number;
    };

    let resp: Resp;
    try {
      resp = await chatJSON<Resp>({
        system: HOST_VOICE_SYSTEM,
        user: `You are directing a 60-second SPATIAL audio piece for team "${data.teamName}".
Theme: "${data.topic}".
There are 5 speakers placed across a ${eventProfile.venue}: ${speakerSlotPrompt()}.

You have ${numClips} recorded clips from the team:
${clipsForPrompt}

Compose a 60-second score (60000ms max) that:
- Starts with a 2-3 second spoken intro on slot 1 only (the "intro" field).
- Schedules each clip to play at a moment that makes it feel cinematic (avoid overlapping clips on the same slot).
- Routes clips across slots 2-5 to create movement through space.
- Inserts at most 2 short spoken commentary lines (1-2 sentences) by the park spirits, on slots 2-5, using "speak".
- Be specific and funny in your commentary; reference the actual recorded sounds.

Return JSON:
{
  "intro": "A spoken sentence the Main Stage host says before the piece begins.",
  "score": [
    { "at_ms": 0, "clip_index": 0, "slot": 2 },
    { "at_ms": 4000, "speak": "Squirrel: oh look, they brought a leaf.", "slot": 4 }
  ],
  "total_ms": 60000
}

clip_index must be an integer 0..${numClips - 1}. slot must be 2..5 for clips and 2..5 for commentary. Use 0 <= at_ms <= 58000.`,
        temperature: 0.9,
      });
    } catch (error) {
      console.error("[AI fallback] composeMix", error);
      resp = {
        intro: `Team ${data.teamName}, the park is offline but still listening.`,
        score: data.clips.map((_, index) => ({
          at_ms: index * 6000,
          clip_index: index,
          slot: 2 + (index % 4),
        })),
        total_ms: 60000,
      };
      return { ...sanitizeMixResponse(resp, data.clips, data.teamName), aiFallback: true };
    }

    return sanitizeMixResponse(resp, data.clips, data.teamName);
  });

export const judgeMix = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        teamName: z.string(),
        topic: z.string(),
        clipsSummary: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ feedback: string; bonus: number; fallback?: true }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    try {
      const r = await chatJSON<{ feedback: string; bonus: number }>({
        system: HOST_VOICE_SYSTEM,
        user: `Team "${data.teamName}" just performed a soundscape on the theme "${data.topic}".
What they recorded: ${data.clipsSummary}

Write 1-2 sentence reaction in the voice of a witty MC: specific, funny, mention something concrete from their recordings. Then award a creativity bonus from 0 to 30.

Return JSON: { "feedback": "...", "bonus": 12 }`,
        temperature: 0.85,
      });
      return sanitizeMixJudgement(r, data.teamName);
    } catch (error) {
      console.error("[AI fallback] judgeMix", error);
      return {
        feedback: `Team ${data.teamName} survived "${data.topic}" without the AI jury. The park awards a practical offline bonus.`,
        bonus: 10,
        fallback: true,
      };
    }
  });
