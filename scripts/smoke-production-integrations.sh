#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${READMATES_SMOKE_BASE_URL:-https://readmates.pages.dev}"
AUTH_BASE_URL="${READMATES_SMOKE_AUTH_BASE_URL:-$BASE_URL}"
CLUB_HOST="${READMATES_SMOKE_CLUB_HOST:-}"
STRICT_GOOGLE="${READMATES_SMOKE_STRICT_GOOGLE:-false}"
MARKER_PATH="/.well-known/readmates-domain-check.json"

normalize_origin() {
  local raw="$1"
  raw="${raw%/}"
  if [[ "$raw" != http://* && "$raw" != https://* ]]; then
    raw="https://$raw"
  fi
  printf '%s\n' "$raw"
}

require_marker() {
  local origin
  origin="$(normalize_origin "$1")"
  local body
  body="$(curl -fsS --max-time 10 "$origin$MARKER_PATH")"
  python3 - "$body" <<'PY'
import json
import sys

try:
    marker = json.loads(sys.argv[1])
except json.JSONDecodeError:
    sys.exit("domain marker is not JSON")

if marker.get("service") != "readmates" or marker.get("surface") != "cloudflare-pages" or marker.get("version") != 1:
    sys.exit("domain marker does not identify ReadMates Cloudflare Pages")
PY
  printf 'marker ok: %s%s\n' "$origin" "$MARKER_PATH"
}

header_value() {
  awk 'BEGIN { IGNORECASE = 1 } /^location:/ { sub(/\r$/, ""); sub(/^[^:]+:[[:space:]]*/, ""); value = $0 } END { print value }' "$1"
}

oauth_redirect_uri() {
  python3 - "$1" <<'PY'
from urllib.parse import parse_qs, unquote, urlparse
import sys

location = sys.argv[1]
query = parse_qs(urlparse(location).query)
value = query.get("redirect_uri", [""])[0]
print(unquote(value))
PY
}

require_oauth_redirect() {
  local base auth headers status location actual expected
  base="$(normalize_origin "$BASE_URL")"
  auth="$(normalize_origin "$AUTH_BASE_URL")"
  headers="$(mktemp)"
  trap 'rm -f "$headers"' RETURN

  status="$(curl -sS --max-time 10 -o /dev/null -D "$headers" -w '%{http_code}' "$base/oauth2/authorization/google?returnTo=/app")"
  if [[ "$status" != 302 && "$status" != 303 ]]; then
    printf 'OAuth start returned HTTP %s, expected 302/303\n' "$status" >&2
    return 1
  fi

  location="$(header_value "$headers")"
  if [[ "$location" != https://accounts.google.com/* ]]; then
    printf 'OAuth start redirected to unexpected location: %s\n' "$location" >&2
    return 1
  fi

  actual="$(oauth_redirect_uri "$location")"
  expected="$auth/login/oauth2/code/google"
  if [[ "$actual" != "$expected" ]]; then
    printf 'OAuth redirect_uri mismatch\nexpected: %s\nactual:   %s\n' "$expected" "$actual" >&2
    return 1
  fi

  if [[ "$STRICT_GOOGLE" == "true" ]]; then
    local google_body
    google_body="$(curl -sSL --max-time 10 "$location" || true)"
    if grep -qi 'redirect_uri_mismatch' <<<"$google_body"; then
      printf 'Google reported redirect_uri_mismatch for %s\n' "$actual" >&2
      return 1
    fi
  fi

  printf 'oauth redirect_uri ok: %s\n' "$actual"
}

require_marker "$BASE_URL"
if [[ -n "$CLUB_HOST" ]]; then
  require_marker "$CLUB_HOST"
fi
require_oauth_redirect
