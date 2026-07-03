import { describe, expect, test } from "bun:test";
import { IMPOSTOR_QUESTION_CATALOG } from "./impostor/catalog";
import { SPECTRUM_PROMPTS } from "./spectrumcourt/catalog";
import { pickBalancedTrackFromPool, TRACK_CATALOG, type CatalogTrack } from "./trackguess/catalog";
import { PROMPT_CATALOG } from "./whoamong/catalog";

function idsAreUnique(items: Array<{ id: string }>) {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function track(id: string, isAi: boolean): CatalogTrack {
  return {
    id,
    title: id,
    genre: "test",
    url: `https://example.com/${id}.mp3`,
    isAi,
  };
}

describe("game content catalogs", () => {
  test("has enough non-repeating prompts for a party session", () => {
    expect(PROMPT_CATALOG.length >= 55).toBe(true);
    expect(IMPOSTOR_QUESTION_CATALOG.length >= 35).toBe(true);
    expect(SPECTRUM_PROMPTS.length >= 30).toBe(true);
    expect(TRACK_CATALOG.length >= 18).toBe(true);

    expect(idsAreUnique(PROMPT_CATALOG)).toBe(true);
    expect(idsAreUnique(IMPOSTOR_QUESTION_CATALOG)).toBe(true);
    expect(idsAreUnique(SPECTRUM_PROMPTS)).toBe(true);
    expect(idsAreUnique(TRACK_CATALOG)).toBe(true);
  });

  test("balanced track picker pulls from the underused real/AI side", () => {
    const pool = [track("real-1", false), track("real-2", false), track("ai-1", true)];

    expect(pickBalancedTrackFromPool(pool, ["real-1"], 0.1).isAi).toBe(true);
    expect(pickBalancedTrackFromPool(pool, ["ai-1"], 0.1).isAi).toBe(false);
    expect(pickBalancedTrackFromPool(pool, ["real-1", "ai-1"], 0.1).id).toBe("real-2");
  });
});
