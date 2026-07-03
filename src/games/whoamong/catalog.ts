export type CatalogPrompt = {
  id: string;
  text: string;
};

export const PROMPT_CATALOG: CatalogPrompt[] = [
  { id: "sleep-party", text: "Who among us is most likely to fall asleep before the party ends?" },
  { id: "oscar-speech", text: 'Who among us secretly rehearses an Oscar acceptance speech?' },
  { id: "fridge-lunch", text: "Who among us would eat someone else's lunch from the shared fridge?" },
  { id: "tech-support", text: "Who among us would call tech support just to chat?" },
  { id: "wedding-sleep", text: "Who among us would probably sleep through their own wedding?" },
  { id: "alarm-10", text: "Who among us sets an alarm for 6:00 AM but gets up at noon?" },
  { id: "karaoke-hero", text: "Who among us would jump on the karaoke stage first with zero preparation?" },
  { id: "phone-scroll", text: "Who among us scrolls their phone while everyone else is talking?" },
  { id: "lost-keys", text: "Who among us loses their keys more often than they find them?" },
  {
    id: "dance-floor",
    text: "Who among us dances like nobody's watching — even when everyone is?",
  },
  {
    id: "snack-hoard",
    text: 'Who among us hides snacks "for later" and eats them five minutes later?',
  },
  {
    id: "google-doctor",
    text: "Who among us googles symptoms and convinces themselves they have a rare disease?",
  },
  { id: "meme-lord", text: "Who among us sends memes to the group chat at 3 AM and waits for reactions?" },
  { id: "hero-cat", text: "Who among us would rescue a cat from a tree and then post a story about it?" },
  { id: "procrastinator", text: 'Who among us says "be right there" and shows up half an hour later?' },
  { id: "spicy-food", text: 'Who among us orders spicy food "for courage" and immediately regrets it?' },
  { id: "selfie-pro", text: 'Who among us takes 47 selfies to pick one "casual" shot?' },
  {
    id: "playlist-dj",
    text: "Who among us is convinced their playlist is the perfect soundtrack for any party?",
  },
  { id: "awkward-hug", text: "Who among us ends up in awkward hugs more than anyone else?" },
  { id: "group-chat", text: "Who among us reads every message in the chat but replies once a week?" },
  { id: "chaos-cook", text: "Who among us cooks so chaotically the kitchen looks like a battlefield?" },
  { id: "fortune-teller", text: "Who among us reads coffee grounds and believes the result 100%?" },
  { id: "rain-umbrella", text: "Who among us forgets an umbrella on a sunny day and gets caught in a downpour?" },
  {
    id: "voice-note",
    text: 'Who among us sends three-minute voice notes instead of a short "ok"?',
  },
  { id: "secret-singer", text: "Who among us sings in the shower so loudly the neighbors know the setlist?" },
  { id: "coupon-king", text: "Who among us hoards discount coupons like treasure?" },
  { id: "plant-parent", text: "Who among us buys plants with love and forgets to water them?" },
  { id: "late-legend", text: "Who among us is late even to an online meeting?" },
  { id: "drama-queen", text: "Who among us turns a small story into an epic TV series?" },
  { id: "lucky-charm", text: 'Who among us wears "lucky" socks to important events?' },
  { id: "bar-tab", text: 'Who among us says "drinks are on me" and secretly suffers all night?' },
  { id: "toast-master", text: "Who among us gives a five-minute toast and forgets what we're drinking to?" },
  { id: "bartender-friend", text: "Who among us befriends the bartender in one evening?" },
  { id: "cocktail-menu", text: "Who among us reads the cocktail menu like a philosophy textbook?" },
  { id: "last-dance", text: "Who among us leaves the bar last and turns off the lights?" },
  {
    id: "storyteller",
    text: "Who among us will tell tomorrow's story better than the night actually was?",
  },
];

export function getCatalogPrompt(promptId: string | undefined): CatalogPrompt | null {
  if (!promptId) return null;
  return PROMPT_CATALOG.find((p) => p.id === promptId) ?? null;
}

export function pickCatalogPrompt(usedPromptIds: string[], random = Math.random()): CatalogPrompt {
  const available = PROMPT_CATALOG.filter((p) => !usedPromptIds.includes(p.id));
  const pool = available.length > 0 ? available : PROMPT_CATALOG;
  const index = Math.min(pool.length - 1, Math.floor(random * pool.length));
  return pool[index]!;
}
