export const HOST_ACCESS_HASH_KEY = "host-access";

export function normalizeHostAccessSecret(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const secret = value.trim();
  if (!/^hs_[a-z0-9_]{8,124}$/i.test(secret)) return null;
  return secret;
}

export function buildHostAccessUrl(origin: string, code: string, hostSecret: string) {
  const secret = normalizeHostAccessSecret(hostSecret);
  if (!secret) throw new Error("A valid host secret is required");
  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(normalizedCode)) throw new Error("A valid room code is required");
  const url = new URL(`/host/${encodeURIComponent(normalizedCode)}`, origin);
  url.hash = new URLSearchParams({ [HOST_ACCESS_HASH_KEY]: secret }).toString();
  return url.toString();
}

export function hostSecretFromAccessHash(hash: string) {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const candidates = params.getAll(HOST_ACCESS_HASH_KEY);
  return candidates.length === 1 ? normalizeHostAccessSecret(candidates[0]) : null;
}

export async function verifyHostAccessClient(params: { code: string; hostSecret: string }) {
  let response: Response;
  try {
    response = await fetch("/api/host-access", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-host-secret": params.hostSecret,
      },
      body: JSON.stringify({ code: params.code }),
    });
  } catch {
    throw new Error(
      "Backup host access could not be verified. Check the connection and reopen the link.",
    );
  }
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403 || response.status === 404
        ? "This backup host link is invalid or the room has expired."
        : "Backup host access could not be verified. Check the connection and reopen the link.",
    );
  }
  const body = (await response.json()) as { roomId?: unknown; code?: unknown };
  if (typeof body.roomId !== "string" || typeof body.code !== "string") {
    throw new Error("Backup host access returned an invalid response.");
  }
  return { roomId: body.roomId, code: body.code };
}
