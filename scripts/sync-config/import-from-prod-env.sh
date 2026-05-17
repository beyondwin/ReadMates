#!/usr/bin/env bash
# Bulk-import production secrets/variables from an env file into GitHub repo
# Secrets/Variables, using `gh` CLI. Never prints secret values to stdout/stderr.
#
# Usage:
#   ./scripts/sync-config/import-from-prod-env.sh <env-file-path> [--apply]
#
# Default mode is DRY-RUN — prints what would be set but never invokes `gh`.
# Pass --apply to actually write to GitHub.
#
# Safety:
#   - The env file MUST be outside the repository (so it can't be committed).
#   - Values are passed to `gh` via stdin (--body-file -), never on the command
#     line, so they don't leak to process listings or shell history.
#   - This script and its classification list are safe to commit; they hold
#     no secret values.

set -euo pipefail

# ----- args -----
APPLY=0
ENV_FILE=""
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help)
      sed -n '2,17p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    -*)
      echo "ERROR: unknown flag: $arg" >&2; exit 2 ;;
    *)
      if [ -z "$ENV_FILE" ]; then ENV_FILE="$arg"
      else echo "ERROR: extra positional arg: $arg" >&2; exit 2
      fi
      ;;
  esac
done

if [ -z "$ENV_FILE" ]; then
  echo "ERROR: env file path required. Usage: $0 <env-file-path> [--apply]" >&2
  exit 2
fi

# ----- guard: env file must be outside the repo -----
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$REPO_ROOT" ]; then
  echo "ERROR: not inside a git repo. Run from the ReadMates checkout." >&2
  exit 2
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2; exit 2
fi
ENV_FILE_ABS="$(cd "$(dirname "$ENV_FILE")" && pwd -P)/$(basename "$ENV_FILE")"
case "$ENV_FILE_ABS" in
  "$REPO_ROOT"/*|"$REPO_ROOT")
    echo "ERROR: env file is inside the repo ($ENV_FILE_ABS)." >&2
    echo "Move it outside the repo (e.g., /tmp/) so it can't be accidentally committed." >&2
    exit 2
    ;;
esac

# ----- guard: gh CLI auth -----
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not installed. Install via 'brew install gh'." >&2; exit 2
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run 'gh auth login'." >&2; exit 2
fi

# ----- classification: which env keys go where -----
# Items listed here are read from the env file and written to GitHub.
# Any key in the env file NOT in either list is ignored (warned).

# GitHub *Secrets* (encrypted, used by sync-config.yml under secrets.*)
SECRET_KEYS=(
  SPRING_DATASOURCE_URL
  SPRING_DATASOURCE_USERNAME
  SPRING_DATASOURCE_PASSWORD
  READMATES_AUTH_RETURN_STATE_SECRET
  READMATES_BFF_SECRET
  READMATES_BFF_SECRETS
  READMATES_IP_HASH_BASE_SECRET
  SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID
  SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET
  READMATES_AIGEN_OPENAI_API_KEY
  READMATES_AIGEN_ANTHROPIC_API_KEY
  READMATES_AIGEN_GEMINI_API_KEY
  SPRING_MAIL_USERNAME
  SPRING_MAIL_PASSWORD
)

# GitHub *Variables* (plaintext, vars.*)
# Note: VM_USER / VM_SSH_PORT / DEPLOY_ROOT / BFF_SECRET_REQUIRED /
# AUTH_SESSION_COOKIE_SECURE / AIGEN_FALLBACK_DEFAULT_MODEL are inlined
# in the workflow YAML, so they are NOT imported.
VARIABLE_KEYS=(
  READMATES_VM_HOST
  READMATES_APP_BASE_URL
  READMATES_AUTH_BASE_URL
  READMATES_ALLOWED_ORIGINS
  READMATES_AIGEN_ENABLED
  READMATES_AIGEN_ENABLED_PROVIDERS
  CADDY_SITE
  READMATES_SERVER_IMAGE
)

is_in_array() {
  local needle="$1"; shift
  for it in "$@"; do [ "$it" = "$needle" ] && return 0; done
  return 1
}

# ----- parse env file: KEY=VALUE, skip comments and blanks -----
# Strips inline `export ` prefix and surrounding single/double quotes on value.
parse_env() {
  local file="$1"
  while IFS= read -r line; do
    # strip leading whitespace and `export `
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    line="${line#export }"
    case "$line" in
      *=*) : ;;
      *) continue ;;
    esac
    local key="${line%%=*}"
    local val="${line#*=}"
    # strip surrounding quotes (single or double)
    if [[ "$val" =~ ^\".*\"$ ]] || [[ "$val" =~ ^\'.*\'$ ]]; then
      val="${val:1:-1}"
    fi
    printf '%s\t%s\n' "$key" "$val"
  done < "$file"
}

# ----- main loop -----
LOG_TMP="$(mktemp -t sync-config-import-XXXXXX.log)"
echo "Importing from: $ENV_FILE_ABS"
echo "Mode: $([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo "Log (no values, only keys + status): $LOG_TMP"
echo "---"

declare -i n_secret=0 n_var=0 n_skip=0 n_empty=0
declare -a UNCLASSIFIED=()

while IFS=$'\t' read -r key val; do
  [ -z "$key" ] && continue

  # Skip placeholder-looking values (e.g. "<...>" or "{...}")
  if [[ "$val" =~ ^[\<\{].*[\>\}]$ ]]; then
    echo "SKIP  (placeholder)  $key"; n_skip=$((n_skip+1))
    echo "skip-placeholder $key" >>"$LOG_TMP"; continue
  fi

  # Skip empty values UNLESS key is BFF_SECRETS (intentionally empty most of the time)
  if [ -z "$val" ] && [ "$key" != "READMATES_BFF_SECRETS" ]; then
    echo "SKIP  (empty)        $key"; n_empty=$((n_empty+1))
    echo "skip-empty $key" >>"$LOG_TMP"; continue
  fi

  if is_in_array "$key" "${SECRET_KEYS[@]}"; then
    if [ $APPLY -eq 1 ]; then
      printf '%s' "$val" | gh secret set "$key" --body-file - >/dev/null
      echo "SET   secret         $key"
    else
      echo "DRY   secret         $key  (len=${#val})"
    fi
    echo "secret $key" >>"$LOG_TMP"
    n_secret=$((n_secret+1))
  elif is_in_array "$key" "${VARIABLE_KEYS[@]}"; then
    if [ $APPLY -eq 1 ]; then
      printf '%s' "$val" | gh variable set "$key" --body-file - >/dev/null
      echo "SET   variable       $key  = $val"
    else
      echo "DRY   variable       $key  = $val"
    fi
    echo "variable $key" >>"$LOG_TMP"
    n_var=$((n_var+1))
  else
    UNCLASSIFIED+=("$key")
    echo "skip-unclassified $key" >>"$LOG_TMP"
  fi
done < <(parse_env "$ENV_FILE_ABS")

echo "---"
echo "Summary: secrets=$n_secret variables=$n_var skipped-placeholder/empty=$((n_skip+n_empty))"

if [ ${#UNCLASSIFIED[@]} -gt 0 ]; then
  echo ""
  echo "Keys present in env file but NOT in this script's classification:"
  printf '  - %s\n' "${UNCLASSIFIED[@]}"
  echo "These were intentionally skipped (e.g., LOCAL-only, app-internal, or inlined in workflow)."
fi

# ----- post-import checklist -----
if [ $APPLY -eq 1 ]; then
  echo ""
  echo "Next steps (NOT in this env file — must be set separately):"
  echo "  1. READMATES_DEPLOY_SSH_KEY  (gh secret set READMATES_DEPLOY_SSH_KEY < /tmp/readmates-deploy)"
  echo "  2. READMATES_VM_KNOWN_HOSTS  (gh secret set READMATES_VM_KNOWN_HOSTS --body \"\$(cat /tmp/known_hosts_line)\")"
  echo "  3. Trigger sync-config with dry_run=true to verify assertion gate passes."
else
  echo ""
  echo "Dry run complete. Re-run with --apply to actually write to GitHub."
fi
