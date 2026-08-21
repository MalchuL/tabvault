"""URL validation and normalization helpers."""

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

TRACKING_PREFIXES = ("utm_",)
TRACKING_KEYS = {"gclid", "fbclid", "mc_cid", "mc_eid"}


def normalize_url(value: str) -> str:
    """Validate and normalize an absolute HTTP or HTTPS URL."""
    parsed = urlparse(value.strip())
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL must be an absolute http or https URL")
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError("URL contains an invalid port") from error
    query = sorted(
        (key, item)
        for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith(TRACKING_PREFIXES) and key.lower() not in TRACKING_KEYS
    )
    scheme = parsed.scheme.lower()
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    host = parsed.hostname.lower()
    netloc = host if port is None or default_port else f"{host}:{port}"
    return urlunparse((scheme, netloc, parsed.path.rstrip("/") or "/", "", urlencode(query), ""))
