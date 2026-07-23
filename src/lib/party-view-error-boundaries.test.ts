import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const hostViews = [
  "src/games/sommelier/HostView.tsx",
  "src/games/tongsoftruth/BackgroundHost.tsx",
  "src/games/contraband/BackgroundHost.tsx",
  "src/games/crossexamination/HostView.tsx",
  "src/games/toastsyndicate/HostView.tsx",
  "src/games/smokescreen/BackgroundHost.tsx",
  "src/games/stilllife/HostView.tsx",
  "src/games/grilloracle/LifecycleHost.tsx",
  "src/games/grilloracle/HostView.tsx",
  "src/components/party-finale-ledger.tsx",
] as const;

const playerViews = [
  "src/games/sommelier/PlayerView.tsx",
  "src/games/tongsoftruth/BackgroundPlayer.tsx",
  "src/games/contraband/BackgroundPlayer.tsx",
  "src/games/crossexamination/PlayerView.tsx",
  "src/games/toastsyndicate/PlayerView.tsx",
  "src/games/smokescreen/BackgroundPlayer.tsx",
  "src/games/stilllife/PlayerView.tsx",
] as const;

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("party-native view error boundaries", () => {
  test("host views never pass raw Error.message into rendered error state", () => {
    for (const path of hostViews) {
      const contents = source(path);
      expect(contents).toContain("friendlyHostActionError");
      expect(contents.includes("instanceof Error ?")).toBe(false);
    }
  });

  test("player views use player or media recovery helpers instead of raw Error.message", () => {
    for (const path of playerViews) {
      const contents = source(path);
      expect(
        contents.includes("friendlyPlayerActionError") || contents.includes("friendlyUploadError"),
      ).toBe(true);
      expect(contents.includes("instanceof Error ?")).toBe(false);
    }
  });
});
