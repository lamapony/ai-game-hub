export const HOST_ACTION_ERROR_EVENT = "ai-game-hub:host-action-error";

type HostActionVerb = "save" | "complete" | "prepare" | "load";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

export function friendlyHostActionError(
  error: unknown,
  actionLabel = "host action",
  verb: HostActionVerb = "save",
) {
  const raw = errorMessage(error).trim();
  const message = raw.toLowerCase();

  if (message.includes("network") || message.includes("fetch") || message.includes("load failed")) {
    return `Could not ${verb} ${actionLabel}: network dropped. Try again.`;
  }

  if (
    message.includes("authorization") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("host secret")
  ) {
    return "This browser lost host access. Open the original host device or create a new room.";
  }

  if (message.includes("room not found")) {
    return "Room is no longer available. Check the code or create a new room.";
  }

  if (
    message.includes("closed") ||
    message.includes("cannot") ||
    message.includes("not active") ||
    message.includes("not ready") ||
    message.includes("mismatch") ||
    message.includes("already") ||
    message.includes("changed") ||
    message.includes("conflict")
  ) {
    return "This party step changed. Reopen the current game panel and use the action shown there.";
  }

  return `Could not ${verb} ${actionLabel}. Try again. If it keeps failing, pause the party and reopen this host screen.`;
}

export function emitHostActionError(error: unknown, actionLabel = "host action") {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent(HOST_ACTION_ERROR_EVENT, {
      detail: {
        message: friendlyHostActionError(error, actionLabel),
      },
    }),
  );
}
