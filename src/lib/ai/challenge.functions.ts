// Server functions for Park Spirit Challenge — AI invents a scene task and judges the recorded video.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eventProfile } from "../event-profile";
import { sanitizeChallengeJudgement, sanitizeTask } from "./sanitize";
import { venuePromptContext } from "./venue";

const HOST_VOICE_SYSTEM = `You are the ${eventProfile.hostPersona.name}, host of the ${eventProfile.title} party. Voice: ${eventProfile.hostPersona.voice}.
Always reply in English. Always reply with strict valid JSON, with no markdown wrappers.`;

const BAR_FALLBACK_TASKS = [
  {
    task: "Act out a tasting of the most expensive drink in history — in turns, with sommelier faces falling apart.",
    intro: "The bar becomes a theater. Sorry, bar.",
  },
  {
    task: "Perform a scene: you are a board of directors urgently deciding who gives the next toast.",
    intro: "Corporate drama at the table.",
  },
  {
    task: 'Show a silent film called "the last hour before closing" — drama, chase, and happy end required.',
    intro: "Lights, camera, bodega.",
  },
  {
    task: "Act out an orchestra where every instrument is something on the table.",
    intro: "The Philharmonic of this bodega opens tonight.",
  },
];

const FALLBACK_TASKS = [
  {
    task: "Act out a council of trees that just learned they were assigned to be Wi-Fi routers.",
    intro: "The park spirit switches on emergency theater.",
  },
  {
    task: "Perform a scene: you are a rescue team trying to revive a very dramatic leaf.",
    intro: "The leaf is not okay. You won't be either.",
  },
  {
    task: "Show what the park would look like if every bench suddenly became a manager.",
    intro: "The benches demand respect.",
  },
  {
    task: "Act out the championship final of invisible frisbee. Commentator, injury, and victory pose required.",
    intro: "Invisible sport, visible embarrassment.",
  },
];

function fallbackChallengeTask(pastTasks: string[] = [], venue?: "park" | "bar") {
  const pool = venue === "bar" ? BAR_FALLBACK_TASKS : FALLBACK_TASKS;
  return (
    pool.find((task) => !pastTasks.includes(task.task)) ?? pool[pastTasks.length % pool.length]
  );
}

export const generateChallengeTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        operatorName: z.string(),
        pastTasks: z.array(z.string()).optional(),
        venue: z.enum(["park", "bar"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ task: string; intro: string; fallback?: true }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const avoid =
      (data.pastTasks ?? [])
        .slice(-5)
        .map((t) => `- ${t}`)
        .join("\n") || "(none yet)";
    try {
      const r = await chatJSON<{ task: string; intro: string }>({
        system: HOST_VOICE_SYSTEM,
        user: `${venuePromptContext(data.venue)}

The operator right now is ${data.operatorName}. They are filming the other players for 20 seconds.
Invent ONE absurd scene task for everyone else. Something that makes them perform, yell, or make faces. No more than 2 sentences. No "how to do it" hints. The task must be doable in the current location.

Style examples (do NOT copy):
- "Act out a scene: you are three squirrels who just learned nuts got expensive. One of you must cry for real."
- "Perform as a rain-knight ensemble. Someone is thunder, someone is lightning, someone is an offended cloud."

Avoid these recent tasks:
${avoid}

Also write a short intro (1 short phrase, up to 12 words) that the park spirit will say out loud before the task. Full of character.

JSON: { "task": "...", "intro": "..." }`,
        temperature: 0.95,
      });
      return sanitizeTask(r, fallbackChallengeTask(data.pastTasks, data.venue));
    } catch (error) {
      console.error("[AI fallback] generateChallengeTask", error);
      return { ...fallbackChallengeTask(data.pastTasks, data.venue), fallback: true };
    }
  });

export const judgeChallenge = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        task: z.string(),
        transcript: z.string(),
        frames: z.array(z.string()).max(6), // base64 data URLs
        operatorName: z.string(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ score: number; feedback: string; verdict: string; fallback?: true }> => {
      const { chatJSON } = await import("../ai-gateway.server");
      const parts: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [
        {
          type: "text",
          text: `The task was: "${data.task}"
Operator (filming): ${data.operatorName}.
Audio transcript from the video: "${data.transcript || "(no speech or unintelligible)"}"

I am giving you ${data.frames.length} frames from the video. Look at them and judge by STRICT criteria:
1. How well the players actually performed the task (not just standing around).
2. Creativity of interpretation.
3. Energy and engagement (visible movement, emotion).
4. Bonus if the operator caught the climax on camera.

Scale 1-10:
- 1-3: nothing happens, boring or off-topic.
- 4-6: they tried, but no spark.
- 7-8: solid scene, effort shows.
- 9-10: brilliant, I'm applauding.

Do NOT dock points for filming technique. Reward the attempt.

Reply with JSON:
{
  "score": <number 1-10>,
  "feedback": "<your comment in 1-2 sentences, like a sarcastic judge, referencing a SPECIFIC detail you see>",
  "verdict": "<SHORT phrase up to 12 words that the park spirit says out loud over the speaker, with the score>"
}`,
        },
        ...data.frames.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ];

      try {
        const r = await chatJSON<{ score: number; feedback: string; verdict: string }>({
          system: HOST_VOICE_SYSTEM,
          user: parts,
          temperature: 0.7,
        });
        return sanitizeChallengeJudgement(r);
      } catch (error) {
        console.error("[AI fallback] judgeChallenge", error);
        const transcriptHint = data.transcript
          ? "The judge saw the transcript but could not reach the crystal ball."
          : "Video accepted, but the judge is blind and deaf today.";
        return {
          score: 6,
          feedback: `${transcriptHint} Crediting the attempt and team energy.`,
          verdict: "Six out of ten. The park spirit is working offline.",
          fallback: true,
        };
      }
    },
  );
