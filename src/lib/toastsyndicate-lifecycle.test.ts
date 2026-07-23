import { describe, expect, test } from "bun:test";
import type { ToastAssignment, ToastJudgment } from "@/games/toastsyndicate/model";
import {
  caughtToastWords,
  sameToastGuesses,
  scoreToastRound,
  toastGuessMatchesWord,
  toastSyndicateRequestSchema,
  transcriptIncludesToastWord,
} from "./toastsyndicate-lifecycle";

const assignment: ToastAssignment = {
  genreId: "noir",
  genre: "Нуар",
  instructions: "Дело мокрое.",
  words: [
    { id: "carburetor", text: "карбюратор" },
    { id: "fjord", text: "фьорд" },
    { id: "laminate", text: "ламинат" },
  ],
};

const judgment: ToastJudgment = {
  genre_score: 9,
  smuggled: [
    { word: "карбюратор", used: true, caught: false, smoothness: 5 },
    { word: "фьорд", used: true, caught: true, smoothness: 2 },
    { word: "ламинат", used: false, caught: false, smoothness: 0 },
  ],
  comment: "Провоз почти удался.",
  speaker_points: 999,
  audience_points: 999,
};

describe("Toast Syndicate lifecycle contract", () => {
  test("normalizes punctuation and conservative word forms", () => {
    expect(toastGuessMatchesWord("КАРБЮРАТОРОМ!", "карбюратор")).toBe(true);
    expect(toastGuessMatchesWord("карб", "карбюратор")).toBe(false);
    expect(toastGuessMatchesWord("манхол", "крышка люка")).toBe(false);
    expect(transcriptIncludesToastWord("Наша дружба — карбюратором вечера.", "карбюратор")).toBe(
      true,
    );
  });

  test("keeps listener ballots order-insensitive and immutable-friendly", () => {
    expect(sameToastGuesses(["Фьорд", "карбюратор"], ["карбюратор", "фьорд"])).toBe(true);
    expect(sameToastGuesses(["фьорд"], ["ламинат"])).toBe(false);
  });

  test("attributes catches to each listener without exposing the assignment", () => {
    expect(
      caughtToastWords({
        assignment,
        catches: [
          { playerId: "p2", record: { version: 1, guesses: ["фьорд"], submittedAt: 1 } },
          {
            playerId: "p3",
            record: { version: 1, guesses: ["карбюратором"], submittedAt: 1 },
          },
        ],
      }),
    ).toEqual({ carburetor: ["p3"], fjord: ["p2"], laminate: [] });
  });

  test("ignores model point totals and scores the written rubric deterministically", () => {
    const result = scoreToastRound({
      roundId: "toast_1",
      speakerPlayerId: "p1",
      assignment,
      transcript: "Наша дружба — карбюратор. А там фьорд.",
      judgment,
      caughtByWordId: { carburetor: [], fjord: ["p2", "p3"], laminate: ["p2"] },
    });

    expect(result.speakerPoints).toBe(14);
    expect(result.listenerPoints).toEqual({ p2: 3, p3: 3 });
    expect(result.words[2]?.caughtByPlayerIds).toEqual([]);
  });

  test("accepts an explicit empty listener ballot and rejects more than three guesses", () => {
    expect(
      toastSyndicateRequestSchema.safeParse({
        roomId: "room",
        roundId: "round",
        action: "catch",
        playerId: "p2",
        guesses: [],
      }).success,
    ).toBe(true);
    expect(
      toastSyndicateRequestSchema.safeParse({
        roomId: "room",
        roundId: "round",
        action: "catch",
        playerId: "p2",
        guesses: ["a", "b", "c", "d"],
      }).success,
    ).toBe(false);
  });
});
