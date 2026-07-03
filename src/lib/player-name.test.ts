import { describe, expect, test } from "bun:test";
import { normalizePlayerName, playerNameValidationMessage } from "./player-name";

describe("player name validation", () => {
  test("normalizes whitespace and length", () => {
    expect(normalizePlayerName("  Mila   Prime  ")).toBe("Mila Prime");
    expect(normalizePlayerName("x".repeat(40))).toHaveLength(32);
  });

  test("rejects empty and generic player names", () => {
    expect(playerNameValidationMessage("")).toBe("Enter your name to join.");
    expect(playerNameValidationMessage("Player")).toBe("Use a real nickname, not Player 1.");
    expect(playerNameValidationMessage("Player 2")).toBe("Use a real nickname, not Player 1.");
    expect(playerNameValidationMessage("Игрок 3")).toBe("Use a real nickname, not Player 1.");
    expect(playerNameValidationMessage("Mila")).toBeNull();
  });
});
