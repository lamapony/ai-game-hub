export type SpectrumPrompt = {
  id: string;
  leftLabel: string;
  rightLabel: string;
  prompt: string;
};

export const SPECTRUM_PROMPTS: SpectrumPrompt[] = [
  {
    id: "romantic-cringe",
    leftLabel: "romantic",
    rightLabel: "cringe",
    prompt: "A date scene",
  },
  {
    id: "luxury-chaos",
    leftLabel: "luxury",
    rightLabel: "chaos",
    prompt: "An object on vacation",
  },
  {
    id: "villain-hero",
    leftLabel: "hero",
    rightLabel: "villain",
    prompt: "A move among friends",
  },
  {
    id: "genius-stupid",
    leftLabel: "brilliant",
    rightLabel: "dumb",
    prompt: "A startup idea",
  },
  {
    id: "cozy-danger",
    leftLabel: "cozy",
    rightLabel: "dangerous",
    prompt: "A party venue",
  },
  {
    id: "normal-suspicious",
    leftLabel: "normal",
    rightLabel: "suspicious",
    prompt: "A message in the group chat",
  },
  {
    id: "quiet-main-character",
    leftLabel: "background extra",
    rightLabel: "main character",
    prompt: "A person at an event",
  },
  {
    id: "cheap-expensive",
    leftLabel: "cheap",
    rightLabel: "expensive",
    prompt: "A gift with no receipt",
  },
  {
    id: "safe-illegal",
    leftLabel: "safe",
    rightLabel: "barely legal",
    prompt: "A weekend plan",
  },
  {
    id: "npc-boss",
    leftLabel: "NPC",
    rightLabel: "final boss",
    prompt: "A coworker on a call",
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
