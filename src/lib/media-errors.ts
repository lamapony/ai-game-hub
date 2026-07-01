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
    kind === "microphone" ? "микрофону" : kind === "camera" ? "камере" : "камере и микрофону";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return `Браузер не дал доступ к ${device}. Разреши доступ в настройках сайта и открой экран заново.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `Устройство не нашло ${device}. Проверь, что камера или микрофон доступны другому приложению.`;
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return `Не получилось включить ${device}. Закрой другие приложения, которые могут использовать камеру или микрофон.`;
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "Телефон не поддержал выбранный режим записи. Попробуй ещё раз или открой ссылку в другом браузере.";
  }
  if (name === "SecurityError") {
    return "Браузер заблокировал запись. Проверь, что страница открыта по HTTPS.";
  }

  const message = errorMessage(error);
  return message
    ? `Не удалось включить запись: ${message}`
    : "Не удалось включить запись. Попробуй обновить страницу.";
}

export function friendlyUploadError(error: unknown, kind: UploadKind) {
  const label = kind === "audio" ? "звук" : kind === "video" ? "видео" : "кадр";
  const message = errorMessage(error).toLowerCase();

  if (message.includes("network") || message.includes("fetch") || message.includes("failed")) {
    return `Не удалось отправить ${label}: похоже, пропала сеть. Подойди ближе к Wi-Fi и попробуй ещё раз.`;
  }
  if (message.includes("storage") || message.includes("bucket")) {
    return `Не удалось сохранить ${label}. Bucket recordings недоступен, ведущему стоит проверить Supabase Storage.`;
  }
  if (message.includes("signed url") || message.includes("signed")) {
    return `Не удалось подготовить ссылку на ${label}. Попробуй отправить ещё раз.`;
  }
  if (message.includes("payload") || message.includes("too large") || message.includes("413")) {
    return `Не удалось отправить ${label}: файл слишком большой. Запиши короче и попробуй ещё раз.`;
  }

  const raw = errorMessage(error);
  return raw ? `Не удалось отправить ${label}: ${raw}` : `Не удалось отправить ${label}.`;
}
