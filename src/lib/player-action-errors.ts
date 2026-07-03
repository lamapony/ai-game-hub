function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

export function friendlyPlayerActionError(error: unknown, actionLabel = "action") {
  const raw = errorMessage(error).trim();
  const message = raw.toLowerCase();

  if (message.includes("network") || message.includes("fetch") || message.includes("load failed")) {
    return `Could not send ${actionLabel}: network dropped. Try again.`;
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

  return raw ? `Could not send ${actionLabel}: ${raw}` : `Could not send ${actionLabel}.`;
}
