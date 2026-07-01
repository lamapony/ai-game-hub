// Server functions for "Фотоохота" — AI picks an absurd photo task and ranks all submitted photos.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const VOICE = `Ты — дух парка, ведущий вечеринки DIMAS fest. Голос: едкий, остроумный конферансье.
Всегда отвечай на русском. Всегда возвращай строгий валидный JSON, без markdown-обёрток.`;

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
    return r;
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

      const r = await chatJSON<{
        ranking: Array<{ playerId: string; rank: number; comment: string }>;
        verdict: string;
      }>({
        system: VOICE,
        user: parts,
        temperature: 0.7,
      });

      // Sanitize: ensure every player gets a rank, dedupe ranks.
      const seen = new Map<string, { rank: number; comment: string }>();
      (r.ranking ?? []).forEach((e) => {
        if (e?.playerId && !seen.has(e.playerId)) {
          seen.set(e.playerId, { rank: e.rank ?? 99, comment: e.comment ?? "" });
        }
      });
      // Append anyone the model forgot.
      data.photos.forEach((p) => {
        if (!seen.has(p.playerId))
          seen.set(p.playerId, { rank: 99, comment: "Дух парка проглядел тебя." });
      });

      // Renumber ranks 1..N based on sort.
      const sorted = [...seen.entries()].sort((a, b) => a[1].rank - b[1].rank);
      const ranking = sorted.map(([playerId, v], i) => ({
        playerId,
        rank: i + 1,
        comment: v.comment,
      }));

      return {
        ranking,
        verdict: r.verdict || "Ну, кто-то выиграл, кто-то нет. Идём дальше.",
      };
    },
  );
