import type { PartyActId } from "@/lib/party-context";
import { pickThemedItem } from "../catalog-pick";

// Fallback questions for "Who's the Bot?" — used when the AI generator is unreachable.
export type ImpostorQuestion = {
  id: string;
  text: string;
  acts?: readonly PartyActId[];
  heat?: 1 | 2 | 3;
};

export const IMPOSTOR_QUESTION_CATALOG: ImpostorQuestion[] = [
  { id: "excuse-late", text: "Silliest excuse to leave the party early?" },
  { id: "cocktail-name", text: "What would tonight's cocktail be called?", acts: ["bar"] },
  { id: "bar-superpower", text: "Useless superpower that only helps in a bar?", acts: ["bar"] },
  { id: "toast-worst", text: "Worst toast you could give at a birthday?", acts: ["bar"] },
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
  {
    id: "grill-law",
    text: "New law that should apply only to people standing near the grill?",
    acts: ["grill"],
  },
  {
    id: "bar-warning",
    text: "Warning label every bar stool should legally carry?",
    acts: ["bar"],
  },
  { id: "tiny-scandal", text: "Tiny scandal that would destroy this friend group for 12 minutes?" },
  { id: "menu-crime", text: "Menu item that sounds illegal but probably tastes good?" },
  {
    id: "bad-toast",
    text: "Opening line of a toast that instantly ruins the room?",
    acts: ["bar"],
    heat: 2,
  },
  { id: "lost-item", text: "Object someone will lose tonight and blame on destiny?" },
  { id: "party-tax", text: "Ridiculous tax every party guest should have to pay?" },
  { id: "group-chat-ban", text: "Message that should get someone banned from the group chat?" },
  {
    id: "overconfident-order",
    text: "Drink order from someone trying way too hard?",
    acts: ["bar"],
  },
  { id: "fake-tradition", text: "Fake tradition you could invent and make everyone follow?" },
  {
    id: "grill-superstition",
    text: "Grill superstition that sounds ancient but was invented tonight?",
    acts: ["grill"],
    heat: 2,
  },
  { id: "worst-sponsor", text: "Worst possible sponsor for this party?" },
  { id: "founding-myth", text: "Founding myth of this table, told 200 years from now?" },
  {
    id: "bartender-code",
    text: "Secret code phrase bartenders use for this exact group?",
    acts: ["bar"],
  },
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
  {
    id: "foil-confession",
    text: "What is the foil whispering about the person holding the tongs?",
    acts: ["grill"],
    heat: 3,
  },
  {
    id: "smoke-alibi",
    text: "Official alibi for why the smoke chose that particular piece of meat?",
    acts: ["grill"],
    heat: 3,
  },
  {
    id: "charcoal-obituary",
    text: "One-line obituary for the thing that just became charcoal?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "glass-psych",
    text: "What does this glass think of its owner, unkindly but accurately?",
    acts: ["bar"],
    heat: 3,
  },
  {
    id: "toast-evidence",
    text: "A toast that would later be entered as evidence?",
    acts: ["bar"],
    heat: 3,
  },
  {
    id: "last-call-lie",
    text: "Best lie you could tell the bartender at last call?",
    acts: ["bar"],
    heat: 2,
  },
  {
    id: "final-fib",
    text: "The lie this table would agree on if the lights went out right now?",
    heat: 3,
  },
  {
    id: "museum-label",
    text: "Museum label for the worst decision made within three meters of here?",
    heat: 3,
  },
];

export function pickImpostorQuestion(
  usedQuestionIds: string[],
  random = Math.random(),
  options?: { actId?: PartyActId; preferHeat?: 1 | 2 | 3 },
): ImpostorQuestion {
  return pickThemedItem(IMPOSTOR_QUESTION_CATALOG, usedQuestionIds, random, options);
}
