#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
base_ref="${READMATES_PRE_PUSH_BASE:-origin/main}"
mode="standard"
release_mode="auto"
dry_run="${READMATES_PRE_PUSH_DRY_RUN:-false}"

usage() {
  cat <<'USAGE'
Usage: ./scripts/pre-push-check.sh [--full] [--release|--no-release] [--dry-run]

Runs the CI gates that most often fail after pushing.

Options:
  --full        Also run backend integration tests and Playwright E2E.
  --release     Always build and scan the public release candidate.
  --no-release  Skip the public release candidate check.
  --dry-run     Print commands without executing them.
USAGE
}

while (($# > 0)); do
  case "$1" in
    --full)
      mode="full"
      ;;
    --release)
      release_mode="always"
      ;;
    --no-release)
      release_mode="never"
      ;;
    --dry-run)
      dry_run="true"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

cd "$repo_root"

run_step() {
  local label="$1"
  shift

  printf '\n==> %s\n' "$label"
  printf '+'
  printf ' %q' "$@"
  printf '\n'

  if [[ "$dry_run" == "true" ]]; then
    return 0
  fi

  "$@"
}

changed_paths() {
  if git rev-parse --verify --quiet "$base_ref" >/dev/null; then
    git diff --name-only "$base_ref"...HEAD
  else
    printf 'warning: base ref %s not found; using working tree paths for release check\n' "$base_ref" >&2
  fi

  git diff --name-only
  git diff --name-only --cached
}

check_whitespace() {
  local pathspecs=(
    .
    ':(exclude)docs/superpowers/**'
  )

  if git rev-parse --verify --quiet "$base_ref" >/dev/null; then
    git diff --check "$base_ref"...HEAD -- "${pathspecs[@]}"
  else
    printf 'warning: base ref %s not found; checking working tree only\n' "$base_ref" >&2
  fi

  git diff --check -- "${pathspecs[@]}"
  git diff --cached --check -- "${pathspecs[@]}"
}

should_run_public_release_check() {
  case "$release_mode" in
    always) return 0 ;;
    never) return 1 ;;
  esac

  changed_paths | sort -u | grep -Eq '^(\.github/|deploy/|docs/|scripts/|AGENTS\.md|README\.md|\.env\.example|\.gitleaks\.toml)'
}

run_step "Git whitespace check" check_whitespace
run_step "Frontend lint" pnpm --dir front lint
run_step "Frontend unit tests with coverage" pnpm --dir front test:coverage
run_step "Frontend build" pnpm --dir front build
run_step "Export Zod fixtures" pnpm --dir front zod:export-fixtures
run_step "Check Zod fixtures are committed" git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
run_step "Backend CI quality gate" ./server/gradlew -p server check

if should_run_public_release_check; then
  run_step "Build public release candidate" ./scripts/build-public-release-candidate.sh
  run_step "Run public release check" ./scripts/public-release-check.sh .tmp/public-release-candidate
else
  printf '\n==> Public release check skipped\n'
  if [[ "$release_mode" == "never" ]]; then
    printf 'Skipped by --no-release. Use --release to force it.\n'
  else
    printf 'No release-sensitive paths changed. Use --release to force it.\n'
  fi
fi

if [[ "$mode" == "full" ]]; then
  run_step "Backend integration tests" ./server/gradlew -p server integrationTest
  run_step "Playwright E2E" pnpm --dir front test:e2e
fi

if [[ "$dry_run" == "true" ]]; then
  printf '\nPre-push dry-run complete.\n'
else
  printf '\nPre-push checks passed.\n'
fi
