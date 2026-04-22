#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.deploy-hook.env"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

if [[ -z "${CLOUDFLARE_PAGES_DEPLOY_HOOK_URL:-}" ]]; then
  cat >&2 <<'EOF'
Missing CLOUDFLARE_PAGES_DEPLOY_HOOK_URL.

Set it in the environment, or copy:
  deploy/cloudflare/.deploy-hook.env.example
to:
  deploy/cloudflare/.deploy-hook.env
and fill in the Cloudflare Pages Deploy Hook URL.
EOF
  exit 1
fi

curl --fail --silent --show-error --request POST "${CLOUDFLARE_PAGES_DEPLOY_HOOK_URL}"
echo
echo "Cloudflare Pages deploy triggered."
