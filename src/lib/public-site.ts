const configuredOrigin = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, "");

/** Canonical public origin for player/speaker links and QR codes. */
export function getPublicSiteOrigin() {
  if (configuredOrigin) return configuredOrigin;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function publicJoinUrl(code: string) {
  return `${getPublicSiteOrigin()}/play/${code}`;
}

export function publicSpeakerUrl(code: string, slot: number) {
  return `${getPublicSiteOrigin()}/speaker/${code}?slot=${slot}`;
}
