export const HOST_ACTION_ERROR_EVENT = "ai-game-hub:host-action-error";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

export function friendlyHostActionError(error: unknown, actionLabel = "host action") {
  const raw = errorMessage(error).trim();
  const message = raw.toLowerCase();

  if (message.includes("network") || message.includes("fetch") || message.includes("load failed")) {
    return `Could not save ${actionLabel}: network dropped. Try again.`;
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

  return raw ? `Could not save ${actionLabel}: ${raw}` : `Could not save ${actionLabel}.`;
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
