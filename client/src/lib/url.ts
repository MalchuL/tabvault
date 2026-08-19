/**
 * Canonical tab identity. Browser storage, extension fast-save, and the API
 * apply this same contract: HTTP(S), normalized host and port, no fragment,
 * no known tracking parameters, stable query ordering, and no trailing slash
 * except for the root path.
 */
const TRACKING_PREFIXES = ["utm_"];
const TRACKING_KEYS = new Set(["gclid", "fbclid", "mc_cid", "mc_eid"]);

export function canonicalizeTabUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Tab URLs must use http or https.");
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  const query = Array.from(url.searchParams.entries())
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      return (
        !TRACKING_PREFIXES.some(prefix => normalized.startsWith(prefix)) &&
        !TRACKING_KEYS.has(normalized)
      );
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder || leftValue.localeCompare(rightValue);
    });
  url.search = new URLSearchParams(query).toString();
  return url.toString();
}
