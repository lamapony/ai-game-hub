// Server functions for Photo Hunt — AI picks an absurd photo task and ranks all submitted photos.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eventProfile } from "../event-profile";
import { sanitizePhotoRanking, sanitizeTask } from "./sanitize";
import { venuePromptContext } from "./venue";

const VOICE = `You are the ${eventProfile.hostPersona.name}, host of the ${eventProfile.title} party. Voice: ${eventProfile.hostPersona.voice}.
Always reply in English. Always return strict valid JSON, with no markdown wrappers.`;

const BAR_FALLBACK_TASKS = [
  {
    task: "Photograph a still life from what's on the table that looks like a jazz album cover.",
    intro: "The table is now a recording studio.",
  },
  {
    task: "Take a shot that proves this bar is hiding a dark past.",
    intro: "The bodega knows something.",
  },
  {
    task: "Find the object in the bar that looks most disappointed with this evening.",
    intro: "Hunting exhaustion among the glasses.",
  },
  {
    task: 'Photograph your neighbor so it could be a "Success" business magazine cover.',
    intro: "Forbes is calling.",
  },
  {
    task: "Photograph the object on the table most likely to have a secret second life.",
    intro: "The props are hiding lore.",
  },
  {
    task: "Take a photo that looks like evidence from a very petty crime scene.",
    intro: "Forensics, but make it stupid.",
  },
  {
    task: "Shoot the most dramatic shadow near the table.",
    intro: "The lighting has ambition.",
  },
  {
    task: "Find a composition that makes one glass look like the villain of the evening.",
    intro: "Every glass has a motive.",
  },
  {
    task: "Photograph the most expensive-looking cheap thing within reach.",
    intro: "Budget luxury, go.",
  },
  {
    task: "Take a photo that could be titled 'before the apology message'.",
    intro: "Tomorrow is already nervous.",
  },
  {
    task: "Find something that looks like it just overheard gossip.",
    intro: "Objects are listening.",
  },
  {
    task: "Photograph the exact point where cozy becomes suspicious.",
    intro: "Comfort has crossed a line.",
  },
];

const FALLBACK_TASKS = [
  {
    task: "Snap an object that looks more tired of this party than anyone else.",
    intro: "We're hunting exhaustion in the wild.",
  },
  {
    task: 'Find a shot that could be titled "the last day of normalcy."',
    intro: "Beauty is over. Photo hunt begins.",
  },
  {
    task: "Photograph the most suspicious object within a one-minute jog.",
    intro: "The park is hiding something.",
  },
  {
    task: "Take a photo where an ordinary thing looks like key historical evidence.",
    intro: "The park spirit is on the case.",
  },
  {
    task: "Photograph the grill setup like it is a crime scene with excellent seasoning.",
    intro: "The tongs left fingerprints.",
  },
  {
    task: "Find the object that looks most personally betrayed by the weather.",
    intro: "Nature files a complaint.",
  },
  {
    task: "Take a photo that makes the ground look like an album cover.",
    intro: "The floor gets a record deal.",
  },
  {
    task: "Photograph something that looks like it gives terrible advice.",
    intro: "Wisdom has standards today.",
  },
  {
    task: "Find the most heroic-looking piece of trash nearby.",
    intro: "A small legend rises.",
  },
  {
    task: "Take a photo where smoke, light, or shadow looks like it is judging you.",
    intro: "The atmosphere has notes.",
  },
  {
    task: "Photograph the worst possible throne for a tiny king.",
    intro: "Royalty got budget cuts.",
  },
  {
    task: "Find something that looks like it survived a dramatic breakup.",
    intro: "Emotional damage, outdoors.",
  },
];

function fallbackPhotoTask(pastTasks: string[] = [], venue?: "park" | "bar") {
  const pool = venue === "bar" ? BAR_FALLBACK_TASKS : FALLBACK_TASKS;
  return (
    pool.find((task) => !pastTasks.includes(task.task)) ?? pool[pastTasks.length % pool.length]
  );
}

export const generatePhotoTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        pastTasks: z.array(z.string()).optional(),
        venue: z.enum(["park", "bar"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ task: string; intro: string; fallback?: true }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const avoid =
      (data.pastTasks ?? [])
        .slice(-6)
        .map((t) => `- ${t}`)
        .join("\n") || "(none yet)";
    try {
      const r = await chatJSON<{ task: string; intro: string }>({
        system: VOICE,
        user: `${venuePromptContext(data.venue)}

Invent ONE photo-hunt task. All players at once have 60 seconds to take ONE phone photo that best fits the task. The task must be doable in the current location.
The task must be:
- absurd but physically doable here and now;
- UNAMBIGUOUS to judge (you can look at the photo and tell how well it fits);
- creative, not just "photograph whatever you see."

Style examples (do NOT copy):
- "Find the object that looks loneliest in this park."
- "Take a shot that could be the cover of a sad indie album."
- "Photograph something that looks like your ex's face."
- "Find the worst landscaping attempt."

Avoid recent tasks:
${avoid}

Also write a short intro (1 phrase, up to 12 words) that the park spirit will say out loud before the start.

JSON: { "task": "...", "intro": "..." }`,
        temperature: 0.95,
      });
      return sanitizeTask(r, fallbackPhotoTask(data.pastTasks, data.venue));
    } catch (error) {
      console.error("[AI fallback] generatePhotoTask", error);
      return { ...fallbackPhotoTask(data.pastTasks, data.venue), fallback: true };
    }
  });

const PhotoInput = z.object({
  playerId: z.string(),
  playerName: z.string(),
  url: z.string(), // signed URL or data URL
});

export const judgePhotos = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        task: z.string(),
        photos: z.array(PhotoInput).min(1).max(12),
      })
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
      const { chatJSON } = await import("../ai-gateway.server");

      const intro = `The task was: "${data.task}"

Below are ${data.photos.length} photos from different players. Each is labeled with a number and name. Look at ALL of them and compare.

Player list (same order as the photos):
${data.photos.map((p, i) => `${i + 1}. ${p.playerName} (id: ${p.playerId})`).join("\n")}

Judge by STRICT criteria:
1. How well the photo fits the task (not just "a pretty photo").
2. Creativity of interpretation.
3. A spark of humor or surprise — bonus points for that.

Rank EVERYONE from 1 (best) to ${data.photos.length} (worst). No ties.

Reply with JSON:
{
  "ranking": [
    { "playerId": "<player id>", "rank": <number from 1 to N>, "comment": "<one sharp sentence, reference a specific detail in the photo>" },
    ...
  ],
  "verdict": "<SHORT phrase up to 14 words that the park spirit says out loud over the speaker, announcing the winner by name>"
}`;

      const parts: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [{ type: "text", text: intro }];
      data.photos.forEach((p, i) => {
        parts.push({ type: "text", text: `Photo #${i + 1} — ${p.playerName}:` });
        parts.push({ type: "image_url", image_url: { url: p.url } });
      });

      let r: {
        ranking: Array<{ playerId: string; rank: number; comment: string }>;
        verdict: string;
      };

      try {
        r = await chatJSON<{
          ranking: Array<{ playerId: string; rank: number; comment: string }>;
          verdict: string;
        }>({
          system: VOICE,
          user: parts,
          temperature: 0.7,
        });
      } catch (error) {
        console.error("[AI fallback] judgePhotos", error);
        r = {
          ranking: data.photos.map((photo, index) => ({
            playerId: photo.playerId,
            rank: index + 1,
            comment: "The AI judge went offline, so upload order decides.",
          })),
          verdict: `${data.photos[0]?.playerName ?? "First uploader"} takes the emergency win.`,
        };
        return { ...sanitizePhotoRanking(r, data.photos), fallback: true };
      }

      return sanitizePhotoRanking(r, data.photos);
    },
  );
