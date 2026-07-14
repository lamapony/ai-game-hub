import { describe, expect, test } from "bun:test";
import {
  CONTRABAND_WORD_CATALOG,
  pickToastFallback,
  TOAST_GENRE_CATALOG,
  TOAST_REQUIRED_GENRE_IDS,
  type ContrabandWord,
  type ToastGenre,
} from "./fallback-catalog";

function idsAreUnique(items: Array<{ id: string }>) {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function hasLocalizedFields(item: ToastGenre | ContrabandWord) {
  const hasId = typeof item.id === "string" && item.id.length > 0;
  const hasEn = typeof item.label.en === "string" && item.label.en.length > 0;
  const hasRu = typeof item.label.ru === "string" && item.label.ru.length > 0;
  return hasId && hasEn && hasRu;
}

describe("toast syndicate fallback catalog", () => {
  test("catalog meets minimum size and required genres", () => {
    expect(TOAST_GENRE_CATALOG.length >= 10).toBe(true);
    expect(CONTRABAND_WORD_CATALOG.length >= 36).toBe(true);
    expect(idsAreUnique(TOAST_GENRE_CATALOG)).toBe(true);
    expect(idsAreUnique(CONTRABAND_WORD_CATALOG)).toBe(true);

    for (const genre of TOAST_GENRE_CATALOG) {
      expect(hasLocalizedFields(genre)).toBe(true);
      expect(genre.instructions.en.length > 0).toBe(true);
      expect(genre.instructions.ru.length > 0).toBe(true);
    }

    for (const word of CONTRABAND_WORD_CATALOG) {
      expect(hasLocalizedFields(word)).toBe(true);
    }

    const genreIds = new Set(TOAST_GENRE_CATALOG.map((genre) => genre.id));
    for (const requiredId of TOAST_REQUIRED_GENRE_IDS) {
      expect(genreIds.has(requiredId)).toBe(true);
    }
  });

  test("same seed always yields the same assignment", () => {
    const a = pickToastFallback("en", 42);
    const b = pickToastFallback("en", 42);
    expect(a).toEqual(b);

    const c = pickToastFallback("ru", 9001, ["noir-detective"], ["fjord", "laminate"]);
    const d = pickToastFallback("ru", 9001, ["noir-detective"], ["fjord", "laminate"]);
    expect(c).toEqual(d);
  });

  test("returns exactly three distinct word ids", () => {
    for (const seed of [0, 1, 7, 99, 12345]) {
      const pick = pickToastFallback("en", seed);
      expect(pick.words).toHaveLength(3);
      const wordIds = pick.words.map((word) => word.id);
      expect(new Set(wordIds).size).toBe(3);
      expect(pick.genreId.length > 0).toBe(true);
      expect(pick.genre.length > 0).toBe(true);
      expect(pick.instructions.length > 0).toBe(true);
    }
  });

  test("excludes recent genre and word ids when alternatives exist", () => {
    const recentGenre = TOAST_GENRE_CATALOG[0]!.id;
    const recentWords = CONTRABAND_WORD_CATALOG.slice(0, 5).map((word) => word.id);

    for (const seed of [3, 11, 77, 404, 2026]) {
      const pick = pickToastFallback("en", seed, [recentGenre], recentWords);
      expect(pick.genreId === recentGenre).toBe(false);
      for (const word of pick.words) {
        expect(recentWords.includes(word.id)).toBe(false);
      }
    }
  });

  test("when every genre except one is recent, the remaining genre is selected", () => {
    const soleGenre = TOAST_GENRE_CATALOG[TOAST_GENRE_CATALOG.length - 1]!;
    const recentGenres = TOAST_GENRE_CATALOG.filter((genre) => genre.id !== soleGenre.id).map(
      (genre) => genre.id,
    );

    for (const seed of [0, 1, 13, 88, 999, 4242]) {
      const pick = pickToastFallback("en", seed, recentGenres);
      expect(pick.genreId).toBe(soleGenre.id);
    }
  });

  test("when every word except three is recent, exactly those three word ids are returned", () => {
    const allowed = CONTRABAND_WORD_CATALOG.slice(-3);
    const allowedIds = allowed.map((word) => word.id).sort();
    const recentWords = CONTRABAND_WORD_CATALOG.filter((word) => !allowedIds.includes(word.id)).map(
      (word) => word.id,
    );

    for (const seed of [2, 17, 64, 303, 2024, 7777]) {
      const pick = pickToastFallback("en", seed, undefined, recentWords);
      const pickedIds = pick.words.map((word) => word.id).sort();
      expect(pickedIds).toEqual(allowedIds);
      expect(new Set(pickedIds).size).toBe(3);
    }
  });

  test("still returns three distinct words when fewer than three non-recent words remain", () => {
    const keepOne = CONTRABAND_WORD_CATALOG[0]!.id;
    const recentAllButOne = CONTRABAND_WORD_CATALOG.filter((word) => word.id !== keepOne).map(
      (word) => word.id,
    );
    const recentAllButTwo = CONTRABAND_WORD_CATALOG.slice(2).map((word) => word.id);
    const recentAll = CONTRABAND_WORD_CATALOG.map((word) => word.id);

    for (const recentWords of [recentAllButOne, recentAllButTwo, recentAll]) {
      for (const seed of [5, 21, 100, 1337]) {
        const pick = pickToastFallback("en", seed, undefined, recentWords);
        expect(pick.words).toHaveLength(3);
        const wordIds = pick.words.map((word) => word.id);
        expect(new Set(wordIds).size).toBe(3);
      }
    }
  });

  test("EN and RU share ids but localize text", () => {
    const seed = 555;
    const en = pickToastFallback("en", seed);
    const ru = pickToastFallback("ru", seed);

    expect(en.genreId).toBe(ru.genreId);
    expect(en.words.map((word) => word.id)).toEqual(ru.words.map((word) => word.id));

    const genre = TOAST_GENRE_CATALOG.find((item) => item.id === en.genreId)!;
    expect(en.genre).toBe(genre.label.en);
    expect(ru.genre).toBe(genre.label.ru);
    expect(en.instructions).toBe(genre.instructions.en);
    expect(ru.instructions).toBe(genre.instructions.ru);

    for (let i = 0; i < 3; i += 1) {
      const word = CONTRABAND_WORD_CATALOG.find((item) => item.id === en.words[i]!.id)!;
      expect(en.words[i]!.text).toBe(word.label.en);
      expect(ru.words[i]!.text).toBe(word.label.ru);
    }
  });
});
