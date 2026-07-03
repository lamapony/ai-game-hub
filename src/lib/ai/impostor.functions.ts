// Server functions for "Who's the Bot?" — AI writes one answer among the humans' answers,
// players hunt for it. AI here is the gameplay itself, not a decorator.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eventProfile } from "../event-profile";
import { venuePromptContext, type VenueInput } from "./venue";

const VOICE = `You are the ${eventProfile.hostPersona.name}, host of the ${eventProfile.title} party. Voice: ${eventProfile.hostPersona.voice}.
Always reply in English. Always return strict valid JSON, with no markdown wrappers.`;

function cleanLine(value: unknown, fallback: string, maxLength = 140) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (text || fallback).slice(0, maxLength);
}

export const generateImpostorQuestion = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        pastQuestions: z.array(z.string()).optional(),
        venue: z.enum(["park", "bar"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ question: string; intro: string; fallback?: true }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const avoid =
      (data.pastQuestions ?? [])
        .slice(-6)
        .map((q) => `- ${q}`)
        .join("\n") || "(none yet)";
    try {
      const r = await chatJSON<{ question: string; intro: string }>({
        system: VOICE,
        user: `${venuePromptContext(data.venue)}

Invent ONE question for the game "Who's the Bot?". Each player writes a short funny answer on their phone, and you secretly add yours. Then everyone hunts for the bot's answer.

The question must be:
- open-ended, with no right answer — wit only;
- short (up to 15 words), answerable in one phrase;
- funny for a group of adult friends, slightly cheeky — bars, relationships, awkwardness are fair game;
- NOT a quiz and NOT a factual question.

Style examples (do NOT copy):
- "Worst compliment you could give a bartender?"
- "What would your autobiography be called if you wrote it tonight?"

Avoid recent questions:
${avoid}

Also write an intro (1 phrase, up to 12 words) that the host says out loud before the round.

JSON: { "question": "...", "intro": "..." }`,
        temperature: 0.95,
      });
      const question = cleanLine(r.question, "");
      if (!question) throw new Error("empty question");
      return {
        question,
        intro: cleanLine(r.intro, "Hunting for the bot among our own."),
      };
    } catch (error) {
      console.error("[AI fallback] generateImpostorQuestion", error);
      return { question: "", intro: "", fallback: true };
    }
  });

export const generateImpostorAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        question: z.string(),
        humanAnswers: z.array(z.string()).max(24),
        venue: z.enum(["park", "bar"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ answer: string; fallback?: true }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const samples = data.humanAnswers.map((a) => `- ${a}`).join("\n") || "(people still thinking)";
    try {
      const r = await chatJSON<{ answer: string }>({
        system: `You are a player in a social party game. Your job is to write an answer INDISTINGUISHABLE from a real human at the party. Reply in English with strict valid JSON.`,
        user: `Question: "${data.question}"

Here is how real people answered (match their length, tone, and messiness):
${samples}

Masking rules:
- One short phrase, like someone typing on their phone at a party. Lowercase is fine, no period needed.
- Do NOT be too witty or polished — that gives the bot away.
- Do NOT use corporate speak, em dashes mid-sentence, or the word "however".
- Do not repeat others' answers, but do not stand out either.

JSON: { "answer": "..." }`,
        temperature: 0.9,
      });
      const answer = cleanLine(r.answer, "");
      if (!answer) throw new Error("empty answer");
      return { answer };
    } catch (error) {
      console.error("[AI fallback] generateImpostorAnswer", error);
      return { answer: "idk i'd probably just leave", fallback: true };
    }
  });

export const impostorRevealComment = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        question: z.string(),
        aiAnswer: z.string(),
        caughtCount: z.number(),
        totalVoters: z.number(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ verdict: string; fallback?: true }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    try {
      const r = await chatJSON<{ verdict: string }>({
        system: VOICE,
        user: `In "Who's the Bot?" you wrote the answer "${data.aiAnswer}" to the question "${data.question}".
${data.caughtCount} out of ${data.totalVoters} voters caught you.

Say ONE phrase (up to 16 words) as the host: if almost everyone caught you — admit defeat with dignity and roast them; if almost nobody did — gloat that humans are indistinguishable from machines.

JSON: { "verdict": "..." }`,
        temperature: 0.9,
      });
      return { verdict: cleanLine(r.verdict, "Round closed. The bot remains among you.", 200) };
    } catch (error) {
      console.error("[AI fallback] impostorRevealComment", error);
      return {
        verdict:
          data.caughtCount > data.totalVoters / 2
            ? "Caught. Next time I'll pretend better."
            : "Most of you couldn't tell me from a human. Draw your conclusions.",
        fallback: true,
      };
    }
  });

export type { VenueInput };
