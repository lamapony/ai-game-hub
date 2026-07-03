// Fallback questions for "Who's the Bot?" — used when the AI generator is unreachable.
export type ImpostorQuestion = {
  id: string;
  text: string;
};

export const IMPOSTOR_QUESTION_CATALOG: ImpostorQuestion[] = [
  { id: "excuse-late", text: "Silliest excuse to leave the party early?" },
  { id: "cocktail-name", text: "What would tonight's cocktail be called?" },
  { id: "bar-superpower", text: "Useless superpower that only helps in a bar?" },
  { id: "toast-worst", text: "Worst toast you could give at a birthday?" },
  {
    id: "dating-bio",
    text: "First line of a dating profile that gets an instant left swipe?",
  },
  { id: "secret-menu", text: "What should be on this bodega's secret menu?" },
  { id: "hangover-cure", text: "Folk hangover cure that sounds like a witchcraft spell?" },
  { id: "karaoke-ban", text: "Song that should be banned from karaoke forever?" },
  { id: "wifi-name", text: "Wi-Fi name that instantly tells you what kind of people live here?" },
  { id: "last-message", text: "3 AM text after which you should probably change your number?" },
  { id: "job-title", text: "Made-up job title that sounds important but means nothing?" },
  { id: "museum-item", text: "Which item from this party ends up in a museum in 100 years?" },
];

export function pickImpostorQuestion(
  usedQuestionIds: string[],
  random = Math.random(),
): ImpostorQuestion {
  const available = IMPOSTOR_QUESTION_CATALOG.filter((q) => !usedQuestionIds.includes(q.id));
  const pool = available.length > 0 ? available : IMPOSTOR_QUESTION_CATALOG;
  const index = Math.min(pool.length - 1, Math.floor(random * pool.length));
  return pool[index]!;
}
