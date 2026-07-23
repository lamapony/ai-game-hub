import { describe, expect, test } from "bun:test";
import {
  isPartyContext,
  legacyPartyContext,
  normalizePartyContext,
  normalizePartyStoryEvidence,
  PARTY_STORY_EVIDENCE_MAX_ITEMS,
} from "./party-context";

describe("party story evidence", () => {
  test("normalizes, deduplicates and keeps only the newest bounded public moments", () => {
    const normalized = normalizePartyStoryEvidence([
      { id: "old", gameId: "soundscape", title: "Old", detail: "First" },
      { id: "same", gameId: "challenge", title: " Earlier ", detail: "  Old   version " },
      { id: "middle", gameId: "phototunt", title: "Middle", detail: "Second" },
      { id: "same", gameId: "challenge", title: "Latest", detail: "New version" },
      { id: "new", gameId: "whoamong", title: "Newest", detail: "Third" },
    ]);

    expect(normalized).toEqual([
      { id: "middle", gameId: "phototunt", title: "Middle", detail: "Second" },
      { id: "same", gameId: "challenge", title: "Latest", detail: "New version" },
      { id: "new", gameId: "whoamong", title: "Newest", detail: "Third" },
    ]);
    expect(normalized).toHaveLength(PARTY_STORY_EVIDENCE_MAX_ITEMS);
  });

  test("accepts only exact bounded evidence inside a party context", () => {
    const base = legacyPartyContext("park");
    const valid = {
      ...base,
      storyEvidence: [
        {
          id: "challenge:r1",
          gameId: "challenge",
          title: "Bucket",
          detail: "It became a co-star.",
        },
      ],
    };

    expect(isPartyContext(valid)).toBe(true);
    expect(
      isPartyContext({
        ...base,
        storyEvidence: [
          {
            id: "challenge:r1",
            gameId: "challenge",
            title: "Bucket",
            detail: "It became a co-star.",
            transcript: "DO_NOT_ACCEPT",
          },
        ],
      }),
    ).toBe(false);
    expect(
      isPartyContext({
        ...base,
        storyEvidence: Array.from({ length: PARTY_STORY_EVIDENCE_MAX_ITEMS + 1 }, (_, index) => ({
          id: `e${index}`,
          gameId: "challenge",
          title: "Moment",
          detail: "Public detail",
        })),
      }),
    ).toBe(false);
  });

  test("accepts JSONB key reordering without downgrading the party", () => {
    const context = {
      ...legacyPartyContext("park"),
      experienceId: "park-story" as const,
      storyEvidence: [
        {
          detail: "The park became a brass section.",
          title: "Soundscape: Cutlery overture",
          gameId: "soundscape",
          id: "soundscape:round_jsonb",
        },
      ],
    };

    expect(isPartyContext(context)).toBe(true);
    expect(normalizePartyContext(context).experienceId).toBe("park-story");
  });

  test("validates an optional reusable-room session clock", () => {
    const base = legacyPartyContext("park");
    expect(isPartyContext({ ...base, sessionStartedAt: 1_234 })).toBe(true);
    expect(isPartyContext({ ...base, sessionStartedAt: -1 })).toBe(false);
    expect(isPartyContext({ ...base, sessionStartedAt: "1234" })).toBe(false);
  });
});
