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
  {
    id: "classy-trashy",
    leftLabel: "classy",
    rightLabel: "trash fire",
    prompt: "A bar snack",
  },
  {
    id: "brave-reckless",
    leftLabel: "brave",
    rightLabel: "reckless",
    prompt: "A decision made at midnight",
  },
  {
    id: "chef-menace",
    leftLabel: "chef",
    rightLabel: "public menace",
    prompt: "A move at the grill",
  },
  {
    id: "minimal-extra",
    leftLabel: "minimal",
    rightLabel: "deeply extra",
    prompt: "A birthday toast",
  },
  {
    id: "honest-toxic",
    leftLabel: "honest",
    rightLabel: "toxic",
    prompt: "A group chat reply",
  },
  {
    id: "smooth-desperate",
    leftLabel: "smooth",
    rightLabel: "desperate",
    prompt: "A flirting technique",
  },
  {
    id: "genius-delusion",
    leftLabel: "genius",
    rightLabel: "pure delusion",
    prompt: "A shortcut home",
  },
  {
    id: "adult-childish",
    leftLabel: "adult behavior",
    rightLabel: "childish behavior",
    prompt: "A reaction to bad weather",
  },
  {
    id: "cheap-iconic",
    leftLabel: "cheap",
    rightLabel: "iconic",
    prompt: "A party decoration",
  },
  {
    id: "helpful-controlling",
    leftLabel: "helpful",
    rightLabel: "controlling",
    prompt: "Taking charge of the table",
  },
  {
    id: "normal-theater",
    leftLabel: "normal",
    rightLabel: "community theater",
    prompt: "A way to enter a room",
  },
  {
    id: "refreshing-concerning",
    leftLabel: "refreshing",
    rightLabel: "concerning",
    prompt: "A drink order",
  },
  {
    id: "strategic-petty",
    leftLabel: "strategic",
    rightLabel: "petty",
    prompt: "Choosing where to sit",
  },
  {
    id: "humble-flex",
    leftLabel: "humble",
    rightLabel: "obvious flex",
    prompt: "A story about work",
  },
  {
    id: "romcom-thriller",
    leftLabel: "rom-com",
    rightLabel: "thriller",
    prompt: "A first date plan",
  },
  {
    id: "civil-warcrime",
    leftLabel: "civilized",
    rightLabel: "social crime",
    prompt: "Changing the song",
  },
  {
    id: "casual-ceremony",
    leftLabel: "casual",
    rightLabel: "full ceremony",
    prompt: "Opening a bottle",
  },
  {
    id: "responsible-boring",
    leftLabel: "responsible",
    rightLabel: "boring",
    prompt: "Leaving early",
  },
  {
    id: "lucky-cursed",
    leftLabel: "lucky",
    rightLabel: "cursed",
    prompt: "A found object",
  },
  {
    id: "compliment-insult",
    leftLabel: "compliment",
    rightLabel: "insult",
    prompt: "A comment on someone's outfit",
  },
  {
    id: "romantic-lawsuit",
    leftLabel: "romantic",
    rightLabel: "grounds for a lawsuit",
    prompt: "A surprise gesture",
  },
  {
    id: "efficient-soulless",
    leftLabel: "efficient",
    rightLabel: "soulless",
    prompt: "A way to split the bill",
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
