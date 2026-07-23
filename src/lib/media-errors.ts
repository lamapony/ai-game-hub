type MediaKind = "camera" | "microphone" | "camera-microphone";
type UploadKind = "audio" | "video" | "photo";

function errorName(error: unknown) {
  return error instanceof DOMException || error instanceof Error ? error.name : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

export function friendlyMediaError(error: unknown, kind: MediaKind) {
  const name = errorName(error);
  const device =
    kind === "microphone" ? "microphone" : kind === "camera" ? "camera" : "camera and microphone";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return `Browser denied access to the ${device}. Allow access in site settings, then tap Try again.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `Device did not find the ${device}. Make sure the camera or microphone is not in use by another app.`;
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return `Could not start the ${device}. Close other apps that might be using the camera or microphone.`;
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "Phone did not support the selected recording mode. Try again or open the link in another browser.";
  }
  if (name === "SecurityError") {
    return "Browser blocked recording. Make sure the page is opened over HTTPS.";
  }

  return `Could not start the ${device}. Close other apps using it, then tap Try again.`;
}

export function friendlyUploadError(error: unknown, kind: UploadKind) {
  const label = kind === "audio" ? "sound" : kind === "video" ? "video" : "photo";
  const message = errorMessage(error).toLowerCase();

  if (message.includes("network") || message.includes("fetch") || message.includes("load failed")) {
    return `Failed to send ${label}: looks like network dropped. Move closer to Wi-Fi and try again.`;
  }
  if (message.includes("storage") || message.includes("bucket")) {
    return `Party media is temporarily unavailable. Stay on this screen and try sending the ${label} again in a moment.`;
  }
  if (message.includes("signed url") || message.includes("signed")) {
    return `Failed to prepare link for ${label}. Try sending again.`;
  }
  if (message.includes("payload") || message.includes("too large") || message.includes("413")) {
    return `Failed to send ${label}: file too large. Record shorter and try again.`;
  }

  return `Failed to send ${label}. Stay on this screen and try again.`;
}
