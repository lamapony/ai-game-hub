import { describe, expect, test } from "bun:test";
import { eventProfile, hostStorageKey, playerStorageKey, speakerSlotPrompt } from "./event-profile";

describe("event profile", () => {
  test("keeps stable storage keys for existing rooms and players", () => {
    expect(eventProfile.storagePrefix).toBe("dimas");
    expect(hostStorageKey("ABCD")).toBe("dimas:host:ABCD");
    expect(playerStorageKey("ABCD")).toBe("dimas:player:ABCD");
  });

  test("defines the five speaker slots used by room state and AI prompts", () => {
    expect(Object.keys(eventProfile.speakerSlots).length).toBe(5);
    expect(eventProfile.speakerSlots[1]).toBe("Main Stage");
    expect(eventProfile.speakerSlots[5]).toBe("Forest Echo");
    expect(speakerSlotPrompt()).toContain("slot 1 = Main Stage (host)");
    expect(speakerSlotPrompt()).toContain("slot 5 = Forest Echo");
  });
});
