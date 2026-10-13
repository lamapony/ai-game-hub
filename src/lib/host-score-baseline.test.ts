import { expect, test } from "bun:test";
import { parseHostScoreBaseline } from "./host-score-baseline";

test("score baseline accepts corrections and rejects malformed numbers and containers", () => {
  expect(parseHostScoreBaseline({ forest: -2, lake: 5 })).toEqual({ forest: -2, lake: 5 });
  for (const invalid of [
    undefined,
    null,
    [],
    2,
    { forest: "2" },
    { forest: NaN },
    { forest: Infinity },
    { "": 2 },
  ]) {
    expect(parseHostScoreBaseline(invalid)).toBeUndefined();
  }
});
