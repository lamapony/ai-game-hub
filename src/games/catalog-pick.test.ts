import { describe, expect, test } from "bun:test";
import { pickThemedItem } from "./catalog-pick";

const ITEMS = [
  { id: "park", text: "park", acts: ["classic"] as const },
  { id: "grill-1", text: "grill", acts: ["grill"] as const, heat: 2 },
  { id: "grill-hot", text: "hot grill", acts: ["grill"] as const, heat: 3 },
  { id: "bar-1", text: "bar", acts: ["bar"] as const },
  { id: "any", text: "anywhere" },
];

describe("pickThemedItem", () => {
  test("without an act, unused items stay in the full pool", () => {
    expect(pickThemedItem(ITEMS, ["park", "grill-1", "grill-hot", "bar-1"], 0).id).toBe("any");
  });

  test("prefers unused items tagged for the current act", () => {
    expect(pickThemedItem(ITEMS, [], 0.9, { actId: "grill" }).id).toBe("grill-hot");
    expect(["park", "bar-1", "any"]).toContain(
      pickThemedItem(ITEMS, ["grill-1", "grill-hot"], 0, { actId: "grill" }).id,
    );
  });

  test("Last Lash heat prefers the hotter unused themed item", () => {
    expect(pickThemedItem(ITEMS, [], 0, { actId: "grill", preferHeat: 3 }).id).toBe("grill-hot");
  });
});
