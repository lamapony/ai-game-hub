import type { SoundscapeCue, SoundscapeMix } from "../types";

type TaskLike = {
  task?: unknown;
  intro?: unknown;
};

type ChallengeJudgementLike = {
  score?: unknown;
  feedback?: unknown;
  verdict?: unknown;
};

type SoundscapeScoreStep = {
  at_ms?: unknown;
  clip_index?: unknown;
  slot?: unknown;
  speak?: unknown;
};

type SoundscapeMixLike = {
  intro?: unknown;
  score?: unknown;
  total_ms?: unknown;
};

export type RankedPhotoInput = {
  playerId: string;
  playerName: string;
};

type PhotoRankingLike = {
  ranking?: unknown;
  verdict?: unknown;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function validClipIndex(value: unknown, clipCount: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric)) return -1;
  return numeric >= 0 && numeric < clipCount ? numeric : -1;
}

export function sanitizeTopics(value: unknown, fallbackTopics: string[], limit = 3) {
  const rawTopics =
    value && typeof value === "object" && Array.isArray((value as { topics?: unknown }).topics)
      ? (value as { topics: unknown[] }).topics
      : [];
  const seen = new Set<string>();
  const topics: string[] = [];

  for (const topic of [...rawTopics, ...fallbackTopics]) {
    const cleaned = cleanString(topic);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    topics.push(cleaned);
    if (topics.length >= limit) break;
  }

  return topics;
}

export function sanitizeTask(value: TaskLike, fallback: { task: string; intro: string }) {
  return {
    task: cleanString(value.task, fallback.task),
    intro: cleanString(value.intro, fallback.intro),
  };
}

export function sanitizeChallengeJudgement(value: ChallengeJudgementLike) {
  const score = clampNumber(value.score, 5, 1, 10);
  return {
    score,
    feedback: cleanString(value.feedback, "Молча принято."),
    verdict: cleanString(value.verdict, `${score} из 10. Идём дальше.`),
  };
}

export function sanitizeMixResponse(
  value: SoundscapeMixLike,
  clips: Array<{ url: string; durationMs: number }>,
  teamName: string,
): SoundscapeMix {
  const cues: SoundscapeCue[] = [];
  const steps = Array.isArray(value.score) ? (value.score as SoundscapeScoreStep[]) : [];

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;

    const atMs = clampNumber(step.at_ms, 0, 0, 58000);
    const slot = clampNumber(step.slot, 2, 2, 5);
    const clipIndex = validClipIndex(step.clip_index, clips.length);
    const speak = cleanString(step.speak);

    if (clipIndex >= 0 && clips[clipIndex]) {
      const clip = clips[clipIndex];
      cues.push({ atMs, slot, type: "audio", url: clip.url, durationMs: clip.durationMs });
    } else if (speak) {
      cues.push({ atMs, slot, type: "tts", text: speak });
    }
  }

  cues.sort((a, b) => a.atMs - b.atMs);

  return {
    teamId: "",
    intro: cleanString(value.intro, `Team ${teamName}, the park is listening.`),
    cues,
    totalMs: clampNumber(value.total_ms, 60000, 1000, 60000),
  };
}

export function sanitizeMixJudgement(
  value: { feedback?: unknown; bonus?: unknown },
  teamName: string,
) {
  return {
    feedback: cleanString(value.feedback, `Team ${teamName} made the park react.`),
    bonus: clampNumber(value.bonus, 0, 0, 30),
  };
}

export function sanitizePhotoRanking(value: PhotoRankingLike, photos: RankedPhotoInput[]) {
  const validPlayerIds = new Set(photos.map((photo) => photo.playerId));
  const seen = new Map<string, { rank: number; comment: string; order: number }>();
  const rawRanking = Array.isArray(value.ranking)
    ? (value.ranking as Array<{ playerId?: unknown; rank?: unknown; comment?: unknown }>)
    : [];

  rawRanking.forEach((entry, order) => {
    const playerId = cleanString(entry?.playerId);
    if (!validPlayerIds.has(playerId) || seen.has(playerId)) return;
    seen.set(playerId, {
      rank: clampNumber(entry?.rank, 99, 1, Math.max(photos.length, 1)),
      comment: cleanString(entry?.comment, "Дух парка промолчал."),
      order,
    });
  });

  photos.forEach((photo, index) => {
    if (!seen.has(photo.playerId)) {
      seen.set(photo.playerId, {
        rank: 99,
        comment: "Дух парка проглядел тебя.",
        order: rawRanking.length + index,
      });
    }
  });

  const ranking = [...seen.entries()]
    .sort((a, b) => a[1].rank - b[1].rank || a[1].order - b[1].order)
    .map(([playerId, item], index) => ({
      playerId,
      rank: index + 1,
      comment: item.comment,
    }));

  return {
    ranking,
    verdict: cleanString(value.verdict, "Ну, кто-то выиграл, кто-то нет. Идём дальше."),
  };
}
