// Server functions for "Фотоохота" — AI picks an absurd photo task and ranks all submitted photos.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sanitizePhotoRanking, sanitizeTask } from "./sanitize";

const VOICE = `Ты — дух парка, ведущий вечеринки DIMAS fest. Голос: едкий, остроумный конферансье.
Всегда отвечай на русском. Всегда возвращай строгий валидный JSON, без markdown-обёрток.`;

const FALLBACK_TASKS = [
  {
    task: "Сфоткай предмет, который выглядит так, будто он устал от этой вечеринки сильнее всех.",
    intro: "Ищем усталость в естественной среде.",
  },
  {
    task: "Найди кадр, который мог бы называться «последний день нормальности».",
    intro: "Красота закончилась, начинаем фотоохоту.",
  },
  {
    task: "Сфоткай самый подозрительный объект в радиусе минуты бега.",
    intro: "Парк что-то скрывает.",
  },
  {
    task: "Сними фото, где обычная вещь выглядит как важная историческая улика.",
    intro: "Следствие ведёт дух парка.",
  },
];

function fallbackPhotoTask(pastTasks: string[] = []) {
  return (
    FALLBACK_TASKS.find((task) => !pastTasks.includes(task.task)) ??
    FALLBACK_TASKS[pastTasks.length % FALLBACK_TASKS.length]
  );
}

export const generatePhotoTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        pastTasks: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ task: string; intro: string }> => {
    const { chatJSON } = await import("../ai-gateway.server");
    const avoid =
      (data.pastTasks ?? [])
        .slice(-6)
        .map((t) => `- ${t}`)
        .join("\n") || "(пока ничего)";
    try {
      const r = await chatJSON<{ task: string; intro: string }>({
        system: VOICE,
        user: `Придумай ОДНО задание для фотоохоты. Все игроки одновременно бегут по парку и должны за 60 секунд сделать ОДИН снимок на телефон, который лучше других попадёт в задание.
Задание должно быть:
- абсурдным, но физически выполнимым в обычном городском парке;
- ОДНОЗНАЧНЫМ для оценки (можно посмотреть фото и понять, насколько попал);
- провоцировать креатив, а не просто «сфоткай дерево».

Примеры стиля (НЕ копируй):
- «Найди объект, который выглядит самым одиноким в этом парке».
- «Сними кадр, который мог бы стать обложкой грустного русского рэп-альбома».
- «Сфоткай предмет, похожий на лицо твоей бывшей».
- «Найди самую неудачную попытку благоустройства».

Избегай недавних:
${avoid}

Также напиши короткий intro (1 фраза, до 12 слов) — её дух парка скажет голосом перед стартом.

JSON: { "task": "...", "intro": "..." }`,
        temperature: 0.95,
      });
      return sanitizeTask(r, fallbackPhotoTask(data.pastTasks));
    } catch (error) {
      console.error("[AI fallback] generatePhotoTask", error);
      return fallbackPhotoTask(data.pastTasks);
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
    }> => {
      const { chatJSON } = await import("../ai-gateway.server");

      const intro = `Задание было: «${data.task}»

Ниже ${data.photos.length} фотографий от разных игроков. Каждая подписана номером и именем. Посмотри их ВСЕ и сравни между собой.

Список игроков (в том же порядке, что и фото):
${data.photos.map((p, i) => `${i + 1}. ${p.playerName} (id: ${p.playerId})`).join("\n")}

Оцени по СТРОГИМ критериям:
1. Точность попадания в задание (а не «красивое фото»).
2. Креативность интерпретации.
3. Какую-то изюминку или шутку — за это бонус.

Ранжируй ВСЕХ от 1 (лучший) до ${data.photos.length} (худший). Никаких ничьих.

Ответь JSON:
{
  "ranking": [
    { "playerId": "<id игрока>", "rank": <число от 1 до N>, "comment": "<едкий комментарий 1 предложение, ссылайся на конкретную деталь фото>" },
    ...
  ],
  "verdict": "<КОРОТКАЯ фраза до 14 слов, которую дух парка скажет вслух в колонку, объявляя победителя по имени>"
}`;

      const parts: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [{ type: "text", text: intro }];
      data.photos.forEach((p, i) => {
        parts.push({ type: "text", text: `Фото №${i + 1} — ${p.playerName}:` });
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
            comment: "AI-судья не вышел на связь, поэтому решает порядок загрузки.",
          })),
          verdict: `${data.photos[0]?.playerName ?? "Первый загрузивший"} забирает аварийную победу.`,
        };
      }

      return sanitizePhotoRanking(r, data.photos);
    },
  );
