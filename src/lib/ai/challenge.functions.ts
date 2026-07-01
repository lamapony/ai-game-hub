// Server functions for "Челлендж духа парка" — AI invents a scene task and judges the recorded video.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HOST_VOICE_SYSTEM = `Ты — дух парка, ведущий вечеринки DIMAS fest. Голос: едкий, остроумный, как саркастичный конферансье.
Всегда отвечай на русском. Всегда отвечай строгим валидным JSON, без markdown-обёрток.`;

export const generateChallengeTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        operatorName: z.string(),
        pastTasks: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ task: string; intro: string }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const avoid =
      (data.pastTasks ?? [])
        .slice(-5)
        .map((t) => `- ${t}`)
        .join("\n") || "(пока ничего)";
    const r = await chatJSON<{ task: string; intro: string }>({
      system: HOST_VOICE_SYSTEM,
      user: `Сейчас оператор — ${data.operatorName}. Он снимает видео остальных игроков 20 секунд.
Придумай ОДНО абсурдное физическое задание для остальных. Что-то такое, что заставит их встать, орать или строить рожи. Не больше 2 предложений. Без подсказок «как сделать».

Примеры стиля (НЕ копируй):
- «Сыграйте сцену: вы три белки, узнавшие что орехи подорожали. Один из вас должен расплакаться по-настоящему».
- «Изобразите ансамбль рыцарей дождя. Кто-то — гром, кто-то — молния, кто-то — оскорблённая туча».

Избегай вот этих недавних заданий:
${avoid}

Также напиши короткий intro (1 короткая фраза, до 12 слов), которую дух парка скажет голосом перед заданием. С характером.

JSON: { "task": "...", "intro": "..." }`,
      temperature: 0.95,
    });
    return r;
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
  .handler(async ({ data }): Promise<{ score: number; feedback: string; verdict: string }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const parts: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text",
        text: `Задание было: «${data.task}»
Оператор (снимал): ${data.operatorName}.
Расшифровка звука с видео: "${data.transcript || "(без речи или неразборчиво)"}"

Я даю тебе ${data.frames.length} кадров из видео. Посмотри их и оцени по СТРОГИМ критериям:
1. Насколько игроки реально выполнили задание (не просто стояли).
2. Креативность интерпретации.
3. Энергия и вовлечённость (видно ли движение, эмоции).
4. Бонус если оператор поймал кульминацию в кадр.

Шкала 1-10:
- 1-3: ничего не происходит, скучно или не по теме.
- 4-6: попытались, но без огонька.
- 7-8: годная сценка, видно усилия.
- 9-10: гениально, аплодирую.

НЕ занижай за технику съёмки. Цени попытку.

Ответь JSON:
{
  "score": <число 1-10>,
  "feedback": "<твой комментарий 1-2 предложения, как саркастичный судья, со ссылкой на КОНКРЕТНУЮ деталь которую видишь>",
  "verdict": "<КОРОТКАЯ фраза до 12 слов которую дух парка скажет голосом в колонку, с оценкой>"
}`,
      },
      ...data.frames.map((url) => ({ type: "image_url" as const, image_url: { url } })),
    ];

    const r = await chatJSON<{ score: number; feedback: string; verdict: string }>({
      system: HOST_VOICE_SYSTEM,
      user: parts,
      temperature: 0.7,
    });
    return {
      score: Math.max(1, Math.min(10, Math.round(r.score || 5))),
      feedback: r.feedback || "Молча принято.",
      verdict: r.verdict || `${Math.round(r.score || 5)} из 10. Идём дальше.`,
    };
  });
