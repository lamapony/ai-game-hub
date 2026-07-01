type RateLimitOptions = {
  keyPrefix: string;
  limit: number;
  windowMs: number;
  now?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, Bucket>();
let lastPrunedAt = 0;

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}

export function clientRateLimitKey(request: Request) {
  return (
    firstHeaderValue(request.headers.get("cf-connecting-ip")) ??
    firstHeaderValue(request.headers.get("true-client-ip")) ??
    firstHeaderValue(request.headers.get("x-forwarded-for")) ??
    "unknown"
  );
}

function pruneExpiredBuckets(now: number) {
  if (now - lastPrunedAt < 60_000) return;
  lastPrunedAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, options: Omit<RateLimitOptions, "keyPrefix">) {
  const now = options.now ?? Date.now();
  pruneExpiredBuckets(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit: options.limit,
      remaining: Math.max(0, options.limit - 1),
      resetAt,
      retryAfterSeconds: 0,
    } satisfies RateLimitResult;
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      limit: options.limit,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    } satisfies RateLimitResult;
  }

  current.count += 1;
  return {
    allowed: true,
    limit: options.limit,
    remaining: Math.max(0, options.limit - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds: 0,
  } satisfies RateLimitResult;
}

export function checkRequestRateLimit(request: Request, options: RateLimitOptions) {
  return checkRateLimit(`${options.keyPrefix}:${clientRateLimitKey(request)}`, options);
}

export function rateLimitResponse(result: RateLimitResult) {
  return new Response("rate limit exceeded", {
    status: 429,
    headers: {
      "Retry-After": String(result.retryAfterSeconds),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    },
  });
}
