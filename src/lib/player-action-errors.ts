type PlayerActionVerb = "send" | "load" | "open";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

export function friendlyPlayerActionError(
  error: unknown,
  actionLabel = "action",
  verb: PlayerActionVerb = "send",
) {
  const raw = errorMessage(error).trim();
  const message = raw.toLowerCase();

  if (message.includes("room is full")) {
    return "This room already has 30 players. Ask the host to remove a duplicate or inactive phone.";
  }

  if (message.includes("network") || message.includes("fetch") || message.includes("load failed")) {
    return `Could not ${verb} ${actionLabel}: network dropped. Try again.`;
  }

  if (
    message.includes("closed") ||
    message.includes("cannot start now") ||
    message.includes("round mismatch")
  ) {
    return "This round moved on. Check the host screen and use the current prompt.";
  }

  if (
    message.includes("authorization") ||
    message.includes("unauthorized") ||
    message.includes("player auth") ||
    message.includes("player not found")
  ) {
    return "This phone lost its player session. Rejoin from the room link.";
  }

  if (
    message.includes("not available") ||
    message.includes("not found") ||
    message.includes("only ") ||
    message.includes("cannot ")
  ) {
    return `That ${actionLabel} is not available right now.`;
  }

  return `Could not ${verb} ${actionLabel}. Try again. If the round moved on, follow the host screen.`;
}
