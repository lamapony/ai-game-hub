import { describe, expect, test } from "bun:test";
import {
  TONGS_AUDIO_MAX_BYTES,
  tongsScoreKey,
  tongsTestimonyKey,
  tongsVerdictKey,
} from "./tongsoftruth.server";

describe("Tongs of Truth server invariants", () => {
  test("derives stable opaque keys without leaking testimony", () => {
    const transcript = "I lost the foil and the itinerary on Tuesday";
    const testimony = tongsTestimonyKey("tongs_1", `round_${transcript}`);
    const verdict = tongsVerdictKey("tongs_1", "round_1");
    const score = tongsScoreKey("tongs_1", "round_1");

    expect(testimony).toBe(tongsTestimonyKey("tongs_1", `round_${transcript}`));
    expect(testimony.includes("foil")).toBe(false);
    expect(new Set([testimony, verdict, score]).size).toBe(3);
  });

  test("keeps the server audio budget bounded", () => {
    expect(TONGS_AUDIO_MAX_BYTES > 1_000_000).toBe(true);
    expect(TONGS_AUDIO_MAX_BYTES <= 5_000_000).toBe(true);
  });
});
