export const ROOM_STATE_SCHEMA_VERSION = 2 as const;

export const EXPERIENCE_IDS = ["classic-park", "smoke-neon-norrebro"] as const;
export const PARTY_ACT_IDS = ["classic", "grill", "transition", "bar", "finale"] as const;
export const VENUE_KINDS = ["park", "grill-site", "bar"] as const;
export const CONTINGENCY_PLANS = ["normal", "bar-only", "compact"] as const;
export const PARTY_LOCALES = ["en", "ru"] as const;

export type ExperienceId = (typeof EXPERIENCE_IDS)[number];
export type PartyActId = (typeof PARTY_ACT_IDS)[number];
export type VenueKind = (typeof VENUE_KINDS)[number];
export type ContingencyPlan = (typeof CONTINGENCY_PLANS)[number];
export type PartyLocale = (typeof PARTY_LOCALES)[number];
export type PartyContext = {
  experienceId: ExperienceId;
  actId: PartyActId;
  venue: VenueKind;
  contingency: ContingencyPlan;
  uiLocale: PartyLocale;
  contentLocale: PartyLocale;
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
    (candidate.actStartedAt === undefined ||
      (typeof candidate.actStartedAt === "number" &&
        Number.isFinite(candidate.actStartedAt) &&
        candidate.actStartedAt >= 0))
  );
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
