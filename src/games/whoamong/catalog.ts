import type { PartyActId } from "@/lib/party-context";
import { pickThemedItem } from "../catalog-pick";

export type CatalogPrompt = {
  id: string;
  text: string;
  acts?: readonly PartyActId[];
  heat?: 1 | 2 | 3;
};

export const PROMPT_CATALOG: CatalogPrompt[] = [
  { id: "sleep-party", text: "Who among us is most likely to fall asleep before the party ends?" },
  { id: "oscar-speech", text: "Who among us secretly rehearses an Oscar acceptance speech?" },
  {
    id: "fridge-lunch",
    text: "Who among us would eat someone else's lunch from the shared fridge?",
  },
  { id: "tech-support", text: "Who among us would call tech support just to chat?" },
  { id: "wedding-sleep", text: "Who among us would probably sleep through their own wedding?" },
  { id: "alarm-10", text: "Who among us sets an alarm for 6:00 AM but gets up at noon?" },
  {
    id: "karaoke-hero",
    text: "Who among us would jump on the karaoke stage first with zero preparation?",
  },
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
  {
    id: "meme-lord",
    text: "Who among us sends memes to the group chat at 3 AM and waits for reactions?",
  },
  {
    id: "hero-cat",
    text: "Who among us would rescue a cat from a tree and then post a story about it?",
  },
  {
    id: "procrastinator",
    text: 'Who among us says "be right there" and shows up half an hour later?',
  },
  {
    id: "spicy-food",
    text: 'Who among us orders spicy food "for courage" and immediately regrets it?',
  },
  { id: "selfie-pro", text: 'Who among us takes 47 selfies to pick one "casual" shot?' },
  {
    id: "playlist-dj",
    text: "Who among us is convinced their playlist is the perfect soundtrack for any party?",
  },
  { id: "awkward-hug", text: "Who among us ends up in awkward hugs more than anyone else?" },
  {
    id: "group-chat",
    text: "Who among us reads every message in the chat but replies once a week?",
  },
  {
    id: "chaos-cook",
    text: "Who among us cooks so chaotically the kitchen looks like a battlefield?",
    acts: ["grill"],
  },
  {
    id: "fortune-teller",
    text: "Who among us reads coffee grounds and believes the result 100%?",
  },
  {
    id: "rain-umbrella",
    text: "Who among us forgets an umbrella on a sunny day and gets caught in a downpour?",
  },
  {
    id: "voice-note",
    text: 'Who among us sends three-minute voice notes instead of a short "ok"?',
  },
  {
    id: "secret-singer",
    text: "Who among us sings in the shower so loudly the neighbors know the setlist?",
  },
  { id: "coupon-king", text: "Who among us hoards discount coupons like treasure?" },
  { id: "plant-parent", text: "Who among us buys plants with love and forgets to water them?" },
  { id: "late-legend", text: "Who among us is late even to an online meeting?" },
  { id: "drama-queen", text: "Who among us turns a small story into an epic TV series?" },
  { id: "lucky-charm", text: 'Who among us wears "lucky" socks to important events?' },
  {
    id: "bar-tab",
    text: 'Who among us says "drinks are on me" and secretly suffers all night?',
    acts: ["bar"],
  },
  {
    id: "toast-master",
    text: "Who among us gives a five-minute toast and forgets what we're drinking to?",
    acts: ["bar"],
  },
  {
    id: "bartender-friend",
    text: "Who among us befriends the bartender in one evening?",
    acts: ["bar"],
  },
  {
    id: "cocktail-menu",
    text: "Who among us reads the cocktail menu like a philosophy textbook?",
    acts: ["bar"],
  },
  {
    id: "last-dance",
    text: "Who among us leaves the bar last and turns off the lights?",
    acts: ["bar"],
  },
  {
    id: "storyteller",
    text: "Who among us will tell tomorrow's story better than the night actually was?",
    acts: ["bar", "finale"],
    heat: 2,
  },
  {
    id: "grill-quarterback",
    text: "Who among us takes over the grill like a nervous sports coach?",
    acts: ["grill"],
  },
  {
    id: "tongs-authority",
    text: "Who among us should legally not be trusted with the tongs?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "sauce-diplomat",
    text: "Who among us solves conflict by offering people sauce?",
    acts: ["grill"],
  },
  {
    id: "smoke-oracle",
    text: "Who among us stares into smoke like it contains career advice?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "plate-juggler",
    text: "Who among us carries too many plates and calls it confidence?",
    acts: ["grill"],
  },
  {
    id: "napkin-crisis",
    text: "Who among us creates a small emergency out of one missing napkin?",
    acts: ["grill", "bar"],
  },
  {
    id: "snack-accountant",
    text: "Who among us knows exactly who took the last chip?",
    acts: ["grill"],
  },
  {
    id: "weather-lawyer",
    text: "Who among us argues with the weather forecast like it can hear them?",
    acts: ["grill"],
  },
  {
    id: "queue-general",
    text: "Who among us organizes a casual queue with unnecessary military precision?",
  },
  {
    id: "table-detective",
    text: "Who among us instantly knows which glass belongs to nobody?",
    acts: ["bar"],
  },
  {
    id: "ice-strategist",
    text: "Who among us treats ice cubes like limited strategic resources?",
    acts: ["bar"],
  },
  {
    id: "tiny-complaint",
    text: "Who among us can turn a tiny inconvenience into an excellent speech?",
    heat: 2,
  },
  {
    id: "wrong-door",
    text: "Who among us walks confidently toward the wrong door and sells it as exploration?",
  },
  {
    id: "photo-director",
    text: "Who among us gives photo instructions like they are shooting a perfume ad?",
  },
  {
    id: "nickname-factory",
    text: "Who among us gives people nicknames that unfortunately stick?",
  },
  {
    id: "receipt-philosopher",
    text: "Who among us reads a receipt and immediately questions capitalism?",
    acts: ["bar"],
  },
  {
    id: "chair-bargainer",
    text: "Who among us negotiates for the best chair before anyone notices?",
  },
  {
    id: "playlist-coup",
    text: "Who among us starts a silent coup against the current playlist?",
  },
  {
    id: "fancy-water",
    text: "Who among us orders water with the confidence of ordering champagne?",
    acts: ["bar"],
  },
  {
    id: "bar-napkin-poet",
    text: "Who among us could write a tragic poem on a bar napkin right now?",
    acts: ["bar"],
    heat: 2,
  },
  {
    id: "lost-coat",
    text: "Who among us loses their coat while still wearing it?",
    acts: ["bar"],
  },
  {
    id: "afterparty-minister",
    text: "Who among us becomes minister of afterparty logistics after one drink?",
    acts: ["bar"],
    heat: 2,
  },
  {
    id: "menu-gambler",
    text: "Who among us orders the weirdest menu item and calls it research?",
    acts: ["bar"],
  },
  {
    id: "farewell-loop",
    text: "Who among us says goodbye seven times and still does not leave?",
    acts: ["bar"],
  },
  {
    id: "doneness-liar",
    text: "Who among us would lie about the doneness to protect their reputation?",
    acts: ["grill"],
    heat: 3,
  },
  {
    id: "grill-excuse",
    text: "Who among us has already planned their excuse if this grill fails in public?",
    acts: ["grill"],
    heat: 3,
  },
  {
    id: "smoke-personality",
    text: "Who among us treats smoke in the eyes as a personality test they intend to pass?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "tongs-scepter",
    text: "Who among us uses the tongs as a scepter and expects tribute?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "just-taste",
    text: "Who among us will 'just taste' until it becomes a diplomatic incident?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "charcoal-ted",
    text: "Who among us gives a TED talk about charcoal to people holding empty plates?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "burn-for-argument",
    text: "Who among us would let someone else's food burn to win an argument?",
    acts: ["grill"],
    heat: 3,
  },
  {
    id: "meat-identity",
    text: "Who among us will declare the meat ready while it's still having an identity crisis?",
    acts: ["grill"],
    heat: 2,
  },
  {
    id: "honesty-toast",
    text: "Who among us will toast 'to honesty' while smuggling a secret through the sentence?",
    acts: ["bar"],
    heat: 3,
  },
  {
    id: "failed-sommelier",
    text: "Who among us rates other people's drinks like a sommelier who bought the diploma?",
    acts: ["bar"],
    heat: 2,
  },
  {
    id: "ice-fight",
    text: "Who among us will start a philosophical fight with the ice cubes?",
    acts: ["bar"],
    heat: 2,
  },
  {
    id: "unpronounceable",
    text: "Who among us orders something they can't pronounce and then dies on that hill?",
    acts: ["bar"],
    heat: 2,
  },
  {
    id: "deny-tomorrow",
    text: "Who among us will confess something they will deny with a straight face tomorrow?",
    acts: ["bar", "finale"],
    heat: 3,
  },
  {
    id: "closing-argument",
    text: "Who among us is one drink away from delivering a closing argument?",
    acts: ["bar", "finale"],
    heat: 3,
  },
  {
    id: "toast-deposition",
    text: "Who among us would start a toast that accidentally becomes a deposition?",
    acts: ["bar"],
    heat: 3,
  },
  {
    id: "tab-art-project",
    text: "Who among us treats the bar tab like a group art project nobody consented to?",
    acts: ["bar"],
    heat: 2,
  },
  {
    id: "rewrite-legend",
    text: "Who among us will rewrite tonight into a legend before we reach the door?",
    acts: ["finale", "bar"],
    heat: 2,
  },
  {
    id: "grill-alibi",
    text: "Who among us is already constructing an alibi for what happened at the grill?",
    acts: ["finale", "grill"],
    heat: 3,
  },
  {
    id: "sell-transcript",
    text: "Who among us would sell the group-chat transcript to a documentary?",
    heat: 3,
  },
  {
    id: "flattering-edit",
    text: "Who among us is already editing tonight into a more flattering story?",
    heat: 3,
  },
  {
    id: "chair-betrayal",
    text: "Who among us would betray the table for a better chair?",
    heat: 3,
  },
  {
    id: "lights-out-confess",
    text: "Who among us would confess first if the lights went out?",
    heat: 3,
  },
];

export function getCatalogPrompt(promptId: string | undefined): CatalogPrompt | null {
  if (!promptId) return null;
  return PROMPT_CATALOG.find((p) => p.id === promptId) ?? null;
}

export function pickCatalogPrompt(
  usedPromptIds: string[],
  random = Math.random(),
  options?: { actId?: PartyActId; preferHeat?: 1 | 2 | 3 },
): CatalogPrompt {
  return pickThemedItem(PROMPT_CATALOG, usedPromptIds, random, options);
}
