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
  { id: "grill-law", text: "New law that should apply only to people standing near the grill?" },
  { id: "bar-warning", text: "Warning label every bar stool should legally carry?" },
  { id: "tiny-scandal", text: "Tiny scandal that would destroy this friend group for 12 minutes?" },
  { id: "menu-crime", text: "Menu item that sounds illegal but probably tastes good?" },
  { id: "bad-toast", text: "Opening line of a toast that instantly ruins the room?" },
  { id: "lost-item", text: "Object someone will lose tonight and blame on destiny?" },
  { id: "party-tax", text: "Ridiculous tax every party guest should have to pay?" },
  { id: "group-chat-ban", text: "Message that should get someone banned from the group chat?" },
  { id: "overconfident-order", text: "Drink order from someone trying way too hard?" },
  { id: "fake-tradition", text: "Fake tradition you could invent and make everyone follow?" },
  {
    id: "grill-superstition",
    text: "Grill superstition that sounds ancient but was invented tonight?",
  },
  { id: "worst-sponsor", text: "Worst possible sponsor for this party?" },
  { id: "founding-myth", text: "Founding myth of this table, told 200 years from now?" },
  { id: "bartender-code", text: "Secret code phrase bartenders use for this exact group?" },
  {
    id: "afterparty-threat",
    text: "Most threatening sentence that starts with 'afterparty at my place'?",
  },
  { id: "receipt-shock", text: "Line item on the receipt that would make everyone go silent?" },
  { id: "floor-manager", text: "One rule if the floor suddenly appointed a manager?" },
  { id: "playlist-defense", text: "Worst legal defense for hijacking the playlist?" },
  { id: "chair-feud", text: "Reason two adults might start a feud over one chair?" },
  { id: "ice-breaker", text: "Icebreaker question that somehow makes things worse?" },
  {
    id: "main-character-entry",
    text: "Entrance line for someone who thinks tonight is their movie?",
  },
  { id: "bad-advice", text: "Piece of advice that sounds wise until you actually follow it?" },
  { id: "secret-society", text: "Name of a secret society formed at this table?" },
  { id: "tomorrow-apology", text: "First sentence of tomorrow's apology message?" },
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
