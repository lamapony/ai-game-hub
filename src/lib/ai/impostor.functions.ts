// Server functions for "Кто здесь бот?" — AI writes one answer among the humans' answers,
// players hunt for it. AI here is the gameplay itself, not a decorator.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eventProfile } from "../event-profile";
import { venuePromptContext, type VenueInput } from "./venue";

const VOICE = `Ты — ${eventProfile.hostPersona.ru}, ведущий вечеринки ${eventProfile.title}. Голос: ${eventProfile.hostPersona.voiceRu}.
Всегда отвечай на русском. Всегда возвращай строгий валидный JSON, без markdown-обёрток.`;

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
        .join("\n") || "(пока ничего)";
    try {
      const r = await chatJSON<{ question: string; intro: string }>({
        system: VOICE,
        user: `${venuePromptContext(data.venue)}

Придумай ОДИН вопрос для игры «Кто здесь бот?». Каждый игрок напишет короткий смешной ответ с телефона, а ты втайне добавишь свой. Потом все ищут ответ бота.

Вопрос должен быть:
- открытым, без правильного ответа — только остроумие;
- коротким (до 15 слов), чтобы ответить одной фразой;
- смешным для компании взрослых друзей, слегка дерзким — можно про бары, отношения, неловкость;
- НЕ викториной и НЕ «фактическим» вопросом.

Примеры стиля (НЕ копируй):
- «Худший комплимент, который можно сделать бармену?»
- «Как называется твоя автобиография, если писать её сегодня вечером?»

Избегай недавних:
${avoid}

Также напиши intro (1 фраза, до 12 слов) — её ведущий скажет голосом перед раундом.

JSON: { "question": "...", "intro": "..." }`,
        temperature: 0.95,
      });
      const question = cleanLine(r.question, "");
      if (!question) throw new Error("empty question");
      return {
        question,
        intro: cleanLine(r.intro, "Ищем бота среди своих."),
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
    const samples = data.humanAnswers.map((a) => `- ${a}`).join("\n") || "(люди ещё думают)";
    try {
      const r = await chatJSON<{ answer: string }>({
        system: `Ты — игрок в социальной игре. Твоя задача — написать ответ, НЕОТЛИЧИМЫЙ от ответа живого человека на вечеринке. Отвечай на русском строгим валидным JSON.`,
        user: `Вопрос: «${data.question}»

Вот как ответили живые люди (подстройся под их длину, тон и небрежность):
${samples}

Правила маскировки:
- Одна короткая фраза, как пишут с телефона на вечеринке. Можно без заглавной буквы, без точки.
- НЕ будь слишком остроумным и отполированным — это выдаёт бота.
- НЕ используй канцелярит, тире посередине фразы и слово «однако».
- Не повторяй чужие ответы, но и не выделяйся.

JSON: { "answer": "..." }`,
        temperature: 0.9,
      });
      const answer = cleanLine(r.answer, "");
      if (!answer) throw new Error("empty answer");
      return { answer };
    } catch (error) {
      console.error("[AI fallback] generateImpostorAnswer", error);
      return { answer: "ну такое, я бы просто ушёл", fallback: true };
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
        user: `В игре «Кто здесь бот?» ты писал ответ «${data.aiAnswer}» на вопрос «${data.question}».
Тебя вычислили ${data.caughtCount} из ${data.totalVoters} голосовавших.

Скажи ОДНУ фразу (до 16 слов) как ведущий: если поймали почти все — признай поражение с достоинством и уколи их; если почти никто — позлорадствуй, что люди неотличимы от машин.

JSON: { "verdict": "..." }`,
        temperature: 0.9,
      });
      return { verdict: cleanLine(r.verdict, "Раунд закрыт. Бот остаётся среди вас.", 200) };
    } catch (error) {
      console.error("[AI fallback] impostorRevealComment", error);
      return {
        verdict:
          data.caughtCount > data.totalVoters / 2
            ? "Поймали. В следующий раз буду притворяться лучше."
            : "Большинство не отличило меня от людей. Делайте выводы.",
        fallback: true,
      };
    }
  });

export type { VenueInput };
