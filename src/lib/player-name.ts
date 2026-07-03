const PLAYER_NAME_MAX_LENGTH = 32;

export function normalizePlayerName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, PLAYER_NAME_MAX_LENGTH)
    : "";
}

export function isGenericPlayerName(value: unknown) {
  const name = normalizePlayerName(value).toLowerCase();
  return /^(player|игрок)(\s*\d+)?$/.test(name);
}

export function playerNameValidationMessage(value: unknown) {
  const name = normalizePlayerName(value);
  if (!name) return "Enter your name to join.";
  if (isGenericPlayerName(name)) return "Use a real nickname, not Player 1.";
  return null;
}

export function isValidPlayerName(value: unknown) {
  return playerNameValidationMessage(value) === null;
}
