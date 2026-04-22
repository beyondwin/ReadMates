#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this script from inside the ReadMates repository"
cd "$repo_root"
repo_abs="$(pwd -P)"

tmp_dir="$repo_abs/.tmp"
fixture_root="$tmp_dir/public-release-fixtures"

prepare_tmp_dir() {
  if [[ -L "$tmp_dir" ]]; then
    fail ".tmp is a symlink; refusing to remove or write public-release fixture data"
  fi

  if [[ -e "$tmp_dir" && ! -d "$tmp_dir" ]]; then
    fail ".tmp exists but is not a directory"
  fi

  mkdir -p "$tmp_dir"

  if [[ -L "$tmp_dir" ]]; then
    fail ".tmp became a symlink; refusing to continue"
  fi

  local resolved_tmp
  resolved_tmp="$(cd "$tmp_dir" && pwd -P)" || fail "could not resolve .tmp"
  if [[ "$resolved_tmp" != "$repo_abs/.tmp" ]]; then
    fail "resolved .tmp path is '$resolved_tmp', expected '$repo_abs/.tmp'"
  fi
}

safe_remove_fixture_root() {
  [[ -n "${fixture_root:-}" ]] || return 0

  case "$fixture_root" in
    "$tmp_dir"/public-release-fixtures)
      ;;
    *)
      return 0
      ;;
  esac

  if [[ -L "$tmp_dir" || -L "$fixture_root" ]]; then
    return 0
  fi

  [[ -d "$fixture_root" ]] || return 0

  local resolved_tmp
  resolved_tmp="$(cd "$tmp_dir" && pwd -P 2>/dev/null)" || return 0
  [[ "$resolved_tmp" == "$repo_abs/.tmp" ]] || return 0

  rm -rf -- "$fixture_root" || true
}

cleanup() {
  safe_remove_fixture_root
}
trap cleanup EXIT

prepare_tmp_dir

if [[ -L "$fixture_root" ]]; then
  fail ".tmp/public-release-fixtures is a symlink; refusing to use it"
fi

safe_remove_fixture_root
mkdir -p "$fixture_root/secret-dollar" "$fixture_root/secret-comment" "$fixture_root/placeholders"

printf 'SPRING_DATASOURCE_PASSWORD=%s\n' 'Abc$123Def456Gh!' > "$fixture_root/secret-dollar/.env.example"

if ./scripts/public-release-check.sh "$fixture_root/secret-dollar" > "$fixture_root/secret-dollar.out" 2> "$fixture_root/secret-dollar.err"; then
  fail "dollar-containing secret fixture unexpectedly passed"
fi

if ! grep -q "real-looking DB/BFF/OAuth secret assignment" "$fixture_root/secret-dollar.err"; then
  sed 's/^/  /' "$fixture_root/secret-dollar.err" >&2
  fail "dollar-containing secret fixture failed for the wrong reason"
fi

secret_key="SPRING_DATASOURCE_PASSWORD"
comment_secret_value="SuperSecretPassword123"
printf '%s=%s # <db-password>\n' "$secret_key" "$comment_secret_value" > "$fixture_root/secret-comment/.env.example"

if ./scripts/public-release-check.sh "$fixture_root/secret-comment" > "$fixture_root/secret-comment.out" 2> "$fixture_root/secret-comment.err"; then
  fail "comment-placeholder secret fixture unexpectedly passed"
fi

if ! grep -q "real-looking DB/BFF/OAuth secret assignment" "$fixture_root/secret-comment.err"; then
  sed 's/^/  /' "$fixture_root/secret-comment.err" >&2
  fail "comment-placeholder secret fixture failed for the wrong reason"
fi

cat > "$fixture_root/placeholders/.env.example" <<'PLACEHOLDERS'
SPRING_DATASOURCE_PASSWORD=<db-password>
SPRING_DATASOURCE_PASSWORD=${SPRING_DATASOURCE_PASSWORD}
READMATES_BFF_SECRET=<shared-bff-secret>
BFF_SECRET=test-bff-secret
APP_DB_PASS=${APP_DB_PASS}
MYSQL_ADMIN_PASS=${MYSQL_ADMIN_PASS}
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
READMATES_API_BASE_URL=https://api.example.com
PLACEHOLDERS

if ! ./scripts/public-release-check.sh "$fixture_root/placeholders" > "$fixture_root/placeholders.out" 2> "$fixture_root/placeholders.err"; then
  sed 's/^/  /' "$fixture_root/placeholders.out" >&2
  sed 's/^/  /' "$fixture_root/placeholders.err" >&2
  fail "documented placeholder fixture unexpectedly failed"
fi

printf 'Public-release fixture checks passed.\n'
