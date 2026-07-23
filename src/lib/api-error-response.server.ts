type ErrorRecord = Record<string, unknown>;

function errorRecord(error: unknown): ErrorRecord | null {
  return error !== null && typeof error === "object" ? (error as ErrorRecord) : null;
}

export function publicApiErrorStatus(error: unknown, fallbackStatus = 500) {
  const status = errorRecord(error)?.status;
  const parsed = typeof status === "number" ? status : Number(status);
  return Number.isInteger(parsed) && parsed >= 400 && parsed <= 599 ? parsed : fallbackStatus;
}

export function publicApiErrorMessage(error: unknown, fallbackMessage: string) {
  const publicMessage = errorRecord(error)?.publicMessage;
  if (typeof publicMessage !== "string") return fallbackMessage;

  const normalized = publicMessage.replace(/[\r\n\t]+/g, " ").trim();
  return normalized ? normalized.slice(0, 240) : fallbackMessage;
}

export function publicApiErrorResponse(
  error: unknown,
  options: { fallbackMessage: string; status?: number },
) {
  const status = options.status ?? publicApiErrorStatus(error);
  return new Response(publicApiErrorMessage(error, options.fallbackMessage), { status });
}
