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

function objectField(error: Record<string, unknown>, key: string): LogPrimitive {
  const value = error[key];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  return undefined;
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
  if (error && typeof error === "object") {
    const source = error as Record<string, unknown>;
    const fields: LogFields = {};
    const name = objectField(source, "name");
    const message = objectField(source, "message");
    const status = objectField(source, "status") ?? objectField(source, "statusCode");
    const code = objectField(source, "code");

    if (name !== undefined) fields.errorName = sanitizeValue("errorName", name);
    if (message !== undefined) fields.errorMessage = sanitizeValue("errorMessage", message);
    if (status !== undefined) fields.errorStatus = status;
    if (code !== undefined) fields.errorCode = sanitizeValue("errorCode", code);

    if (Object.keys(fields).length > 0) return fields;
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
