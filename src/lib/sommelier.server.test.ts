import { describe, expect, test } from "bun:test";
import {
  SOMMELIER_IMAGE_MAX_BYTES,
  sommelierAnalysisIdempotencyKey,
  sommelierCrowdFavoriteIdempotencyKey,
  sommelierGuessIdempotencyKey,
  sommelierResultIdempotencyKey,
  sommelierScoreIdempotencyKey,
  sommelierSubmissionIdempotencyKey,
} from "./sommelier.server";

describe("Sommelier server invariants", () => {
  test("derives stable opaque keys for every private artifact and score event", () => {
    const keys = [
      sommelierSubmissionIdempotencyKey("session_secret", "player_secret"),
      sommelierAnalysisIdempotencyKey("session_secret", "player_secret"),
      sommelierGuessIdempotencyKey("session_secret", "entry_secret", "voter_secret"),
      sommelierResultIdempotencyKey("session_secret", "entry_secret"),
      sommelierCrowdFavoriteIdempotencyKey("session_secret"),
      sommelierScoreIdempotencyKey("session_secret", "entry_secret", "voter_secret", "guess"),
      sommelierScoreIdempotencyKey("session_secret", "entry_secret", "player_secret", "hidden"),
      sommelierScoreIdempotencyKey("session_secret", "entry_secret", "player_secret", "crowd"),
    ];

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.length < 100)).toBe(true);
    expect(
      keys.every(
        (key) =>
          !key.includes("session_secret") &&
          !key.includes("entry_secret") &&
          !key.includes("player_secret"),
      ),
    ).toBe(true);
    expect(sommelierResultIdempotencyKey("s1", "e1")).toBe(
      sommelierResultIdempotencyKey("s1", "e1"),
    );
  });

  test("keeps the post-upload server image budget bounded", () => {
    expect(SOMMELIER_IMAGE_MAX_BYTES).toBe(8_000_000);
  });
});
