import { describe, expect, test } from "bun:test";
import {
  STILL_LIFE_IMAGE_MAX_BYTES,
  stillLifeHeadlineIdempotencyKey,
  stillLifeJudgmentIdempotencyKey,
  stillLifeResultIdempotencyKey,
  stillLifeScoreIdempotencyKey,
  stillLifeSubmissionIdempotencyKey,
  stillLifeVoteIdempotencyKey,
} from "./stilllife.server";

describe("Still Life server invariants", () => {
  test("derives stable opaque keys for every durable round artifact", () => {
    const keys = [
      stillLifeHeadlineIdempotencyKey("still_round_secret"),
      stillLifeSubmissionIdempotencyKey("still_round_secret", "forest"),
      stillLifeJudgmentIdempotencyKey("still_round_secret", "forest"),
      stillLifeVoteIdempotencyKey("still_round_secret", "player_secret"),
      stillLifeResultIdempotencyKey("still_round_secret"),
      stillLifeScoreIdempotencyKey("still_round_secret", "forest"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.length < 100)).toBe(true);
    expect(keys.every((key) => !key.includes("still_round_secret"))).toBe(true);
    expect(stillLifeSubmissionIdempotencyKey("r1", "forest")).toBe(
      stillLifeSubmissionIdempotencyKey("r1", "forest"),
    );
  });

  test("keeps the post-upload server image budget bounded", () => {
    expect(STILL_LIFE_IMAGE_MAX_BYTES).toBe(8_000_000);
  });
});
