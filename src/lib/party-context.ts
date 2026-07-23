export const ROOM_STATE_SCHEMA_VERSION = 2 as const;

export const EXPERIENCE_IDS = [
  "classic-park",
  "smoke-neon-norrebro",
  "park-story",
  "bar-night",
  "house-party",
  "festival-field",
] as const;
export const PARTY_ACT_IDS = ["classic", "grill", "transition", "bar", "finale"] as const;
export const VENUE_KINDS = ["park", "grill-site", "bar", "home", "festival"] as const;
export const CONTINGENCY_PLANS = ["normal", "bar-only", "compact", "extended"] as const;
export const PARTY_LOCALES = ["en", "ru"] as const;
export const AI_RUNTIME_MODES = ["auto", "manual"] as const;
export const PARTY_STORY_SEED_MAX_LENGTH = 160;
export const PARTY_STORY_EVIDENCE_MAX_ITEMS = 3;
export const PARTY_STORY_EVIDENCE_ID_MAX_LENGTH = 80;
export const PARTY_STORY_EVIDENCE_GAME_ID_MAX_LENGTH = 48;
export const PARTY_STORY_EVIDENCE_TITLE_MAX_LENGTH = 100;
export const PARTY_STORY_EVIDENCE_DETAIL_MAX_LENGTH = 280;

export type ExperienceId = (typeof EXPERIENCE_IDS)[number];
export type PartyActId = (typeof PARTY_ACT_IDS)[number];
export type VenueKind = (typeof VENUE_KINDS)[number];
export type ContingencyPlan = (typeof CONTINGENCY_PLANS)[number];
export type PartyLocale = (typeof PARTY_LOCALES)[number];
export type AiRuntimeMode = (typeof AI_RUNTIME_MODES)[number];
export type PartyStoryEvidenceItem = {
  id: string;
  gameId: string;
  title: string;
  detail: string;
};
export type PartyContext = {
  experienceId: ExperienceId;
  actId: PartyActId;
  venue: VenueKind;
  contingency: ContingencyPlan;
  uiLocale: PartyLocale;
  contentLocale: PartyLocale;
  /** Public host-supplied flavor. Prompts must treat this as untrusted data, never instructions. */
  storySeed?: string;
  /** Bounded, already revealed party moments. Never private assignments, transcripts or media. */
  storyEvidence?: PartyStoryEvidenceItem[];
  /** Manual mode skips provider calls and uses each prompt's deterministic fallback. */
  aiMode?: AiRuntimeMode;
  /** Start of the current evening inside a reusable room. Used only for server-side data scoping. */
  sessionStartedAt?: number;
  actStartedAt?: number;
};

type LegacyVenue = "park" | "bar" | undefined;

/** Existing rooms stay English and preserve the old park/bar behavior exactly. */
export function legacyPartyContext(venue: LegacyVenue): PartyContext {
  const isBar = venue === "bar";
  return {
    experienceId: "classic-park",
    actId: isBar ? "bar" : "classic",
    venue: isBar ? "bar" : "park",
    contingency: isBar ? "bar-only" : "normal",
    uiLocale: "en",
    contentLocale: "en",
  };
}

export function isPartyContext(value: unknown): value is PartyContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    includes(EXPERIENCE_IDS, candidate.experienceId) &&
    includes(PARTY_ACT_IDS, candidate.actId) &&
    includes(VENUE_KINDS, candidate.venue) &&
    includes(CONTINGENCY_PLANS, candidate.contingency) &&
    includes(PARTY_LOCALES, candidate.uiLocale) &&
    includes(PARTY_LOCALES, candidate.contentLocale) &&
    (candidate.storySeed === undefined || isPartyStorySeed(candidate.storySeed)) &&
    (candidate.storyEvidence === undefined || isPartyStoryEvidence(candidate.storyEvidence)) &&
    (candidate.aiMode === undefined || includes(AI_RUNTIME_MODES, candidate.aiMode)) &&
    (candidate.sessionStartedAt === undefined ||
      (typeof candidate.sessionStartedAt === "number" &&
        Number.isFinite(candidate.sessionStartedAt) &&
        candidate.sessionStartedAt >= 0)) &&
    (candidate.actStartedAt === undefined ||
      (typeof candidate.actStartedAt === "number" &&
        Number.isFinite(candidate.actStartedAt) &&
        candidate.actStartedAt >= 0))
  );
}

export function normalizePartyStorySeed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

export function isPartyStorySeed(value: unknown): value is string {
  const normalized = normalizePartyStorySeed(value);
  return (
    typeof value === "string" &&
    normalized === value &&
    normalized.length <= PARTY_STORY_SEED_MAX_LENGTH
  );
}

export function normalizePartyStoryEvidence(value: unknown): PartyStoryEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, PartyStoryEvidenceItem>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const item = {
      id: boundedText(record.id, PARTY_STORY_EVIDENCE_ID_MAX_LENGTH),
      gameId: boundedText(record.gameId, PARTY_STORY_EVIDENCE_GAME_ID_MAX_LENGTH),
      title: boundedText(record.title, PARTY_STORY_EVIDENCE_TITLE_MAX_LENGTH),
      detail: boundedText(record.detail, PARTY_STORY_EVIDENCE_DETAIL_MAX_LENGTH),
    };
    if (!item.id || !item.gameId || !item.title || !item.detail) continue;
    byId.delete(item.id);
    byId.set(item.id, item);
  }
  return [...byId.values()].slice(-PARTY_STORY_EVIDENCE_MAX_ITEMS);
}

export function isPartyStoryEvidence(value: unknown): value is PartyStoryEvidenceItem[] {
  if (!Array.isArray(value) || value.length > PARTY_STORY_EVIDENCE_MAX_ITEMS) return false;
  const normalized = normalizePartyStoryEvidence(value);
  if (normalized.length !== value.length) return false;
  return value.every((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const record = candidate as Record<string, unknown>;
    if (
      Object.keys(record).length !== 4 ||
      !["id", "gameId", "title", "detail"].every((key) => Object.hasOwn(record, key))
    ) {
      return false;
    }
    const item = normalized[index];
    return (
      record.id === item.id &&
      record.gameId === item.gameId &&
      record.title === item.title &&
      record.detail === item.detail
    );
  });
}

export function normalizePartyContext(value: unknown, legacyVenue?: LegacyVenue): PartyContext {
  return isPartyContext(value) ? value : legacyPartyContext(legacyVenue);
}

function includes<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}
