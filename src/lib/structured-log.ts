type LogPrimitive = string | number | boolean | null | undefined;
type LogFields = Record<string, LogPrimitive>;
type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY_RE = /(token|secret|password|authorization|api[_-]?key|service[_-]?role)/i;
const MAX_STRING_LENGTH = 500;

function sanitizeValue(key: string, value: LogPrimitive): LogPrimitive {
  if (value === undefined) return undefined;
  if (SENSITIVE_KEY_RE.test(key)) return "[redacted]";
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}...`;
  }
  return value;
}

export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: sanitizeValue("errorMessage", error.message),
    };
  }
  if (typeof error === "string") {
    return { errorMessage: sanitizeValue("errorMessage", error) };
  }
  return { errorMessage: "Unknown error" };
}

export function buildLogPayload(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload: LogFields = {
    ts: new Date().toISOString(),
    level,
    event,
  };

  for (const [key, value] of Object.entries(fields)) {
    const sanitized = sanitizeValue(key, value);
    if (sanitized !== undefined) payload[key] = sanitized;
  }

  return payload;
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload = buildLogPayload(level, event, fields);
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function logInfo(event: string, fields: LogFields = {}) {
  logEvent("info", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}) {
  logEvent("warn", event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}) {
  logEvent("error", event, { ...fields, ...errorFields(error) });
}
