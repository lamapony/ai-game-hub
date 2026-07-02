export type SpectrumPrompt = {
  id: string;
  leftLabel: string;
  rightLabel: string;
  prompt: string;
};

export const SPECTRUM_PROMPTS: SpectrumPrompt[] = [
  {
    id: "romantic-cringe",
    leftLabel: "романтично",
    rightLabel: "кринжово",
    prompt: "Сцена из свидания",
  },
  {
    id: "luxury-chaos",
    leftLabel: "лакшери",
    rightLabel: "хаос",
    prompt: "Предмет в отпуске",
  },
  {
    id: "villain-hero",
    leftLabel: "герой",
    rightLabel: "злодей",
    prompt: "Поступок в компании друзей",
  },
  {
    id: "genius-stupid",
    leftLabel: "гениально",
    rightLabel: "глупо",
    prompt: "Идея для стартапа",
  },
  {
    id: "cozy-danger",
    leftLabel: "уютно",
    rightLabel: "опасно",
    prompt: "Место для вечеринки",
  },
  {
    id: "normal-suspicious",
    leftLabel: "нормально",
    rightLabel: "подозрительно",
    prompt: "Сообщение в общем чате",
  },
  {
    id: "quiet-main-character",
    leftLabel: "тихий фон",
    rightLabel: "главный герой",
    prompt: "Человек на мероприятии",
  },
  {
    id: "cheap-expensive",
    leftLabel: "дёшево",
    rightLabel: "дорого",
    prompt: "Подарок без чека",
  },
  {
    id: "safe-illegal",
    leftLabel: "безопасно",
    rightLabel: "почти незаконно",
    prompt: "План на выходные",
  },
  {
    id: "npc-boss",
    leftLabel: "NPC",
    rightLabel: "финальный босс",
    prompt: "Коллега на созвоне",
  },
];

export function pickSpectrumPrompt(usedIds: string[], random = Math.random()): SpectrumPrompt {
  const available = SPECTRUM_PROMPTS.filter((prompt) => !usedIds.includes(prompt.id));
  const pool = available.length > 0 ? available : SPECTRUM_PROMPTS;
  const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random * pool.length)));
  return pool[index];
}

export function randomSpectrumTarget(random = Math.random()) {
  return Math.max(5, Math.min(95, Math.round(random * 90 + 5)));
}
