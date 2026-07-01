#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
base_ref="${READMATES_PRE_PUSH_BASE:-origin/main}"
mode="standard"
release_mode="auto"
dry_run="${READMATES_PRE_PUSH_DRY_RUN:-false}"
changelog_check="auto"
changelog_file="${READMATES_PRE_PUSH_CHANGELOG:-CHANGELOG.md}"
pnpm_cmd=(npx --yes pnpm@10.33.0)
# READMATES_PRE_PUSH_RELEASE=true forces release mode without requiring --release.
if [[ "${READMATES_PRE_PUSH_RELEASE:-false}" == "true" ]]; then
  release_mode="always"
fi

usage() {
  cat <<'USAGE'
Usage: ./scripts/pre-push-check.sh [--full] [--release|--no-release] [--dry-run] [--no-changelog-check]

Runs the CI gates that most often fail after pushing.

Options:
  --full                Also run backend integration tests and Playwright E2E.
  --release             Always build and scan the public release candidate.
  --no-release          Skip the public release candidate check.
  --dry-run             Print commands without executing them.
  --no-changelog-check  Skip the CHANGELOG Unreleased guard during release runs
                        (emergency override; record reason in the bypass ledger).

Release flag detection:
  Set --release on the CLI or export READMATES_PRE_PUSH_RELEASE=true to force
  release mode. The CHANGELOG Unreleased guard runs when release mode is active.
  Override the inspected file with READMATES_PRE_PUSH_CHANGELOG (default:
  CHANGELOG.md, resolved relative to the repo root).
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
    --no-changelog-check)
      changelog_check="never"
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

extract_unreleased_section() {
  local path="$1"
  awk '
    /^## [Uu]nreleased[[:space:]]*$/ { capture=1; next }
    capture && /^## / { exit }
    capture { print }
  ' "$path"
}

check_changelog_unreleased_guard() {
  # The guard fails the push when the Unreleased section contains accumulated
  # change entries that should have been promoted into a version section before
  # tagging a release. The project convention keeps a single `### Highlights`
  # subsection holding one meta-placeholder bullet (e.g. "다음 릴리즈 후보
  # 변경을 이 섹션에 기록합니다."). Concrete category headers
  # (### Added, ### Changed, ### Fixed, ### Engineering, ### Deployment Notes,
  # ### Verification) and any bullet that looks like real content (markdown
  # bold **, more than one bullet total, or any bullet under a forbidden
  # category) indicate the section was not cleaned up before the tag.
  local path="$changelog_file"
  if [[ ! "$path" = /* ]]; then
    path="$repo_root/$path"
  fi

  if [[ ! -f "$path" ]]; then
    printf 'CHANGELOG guard: file not found at %s\n' "$path" >&2
    return 1
  fi

  local section
  section="$(extract_unreleased_section "$path")"

  if [[ -z "$section" ]]; then
    printf 'CHANGELOG guard: no "## Unreleased" section found in %s\n' "$path" >&2
    return 1
  fi

  # Reject forbidden concrete-change category headers outright.
  if printf '%s\n' "$section" | grep -Eq '^###[[:space:]]+(Added|Changed|Fixed|Engineering|Engineering Proof Portfolio|Deployment Notes|Verification|Removed|Security)[[:space:]]*$'; then
    printf 'CHANGELOG Unreleased section is not empty. Move content into the version section before tagging.\n' >&2
    printf 'Detected forbidden category header(s) under ## Unreleased in %s\n' "$path" >&2
    return 1
  fi

  # Count real-looking bullets. Allow at most one placeholder bullet across the
  # whole Unreleased section. Reject any bullet that looks like a real entry
  # (markdown bold marker or backticks-with-content suggest a feature line).
  local bullets bullet_count bold_count
  bullets="$(printf '%s\n' "$section" | grep -E '^[[:space:]]*[-*][[:space:]]+' || true)"
  bullet_count=$(printf '%s' "$bullets" | grep -cE '^[[:space:]]*[-*][[:space:]]+' || true)
  bold_count=$(printf '%s' "$bullets" | grep -cE '\*\*' || true)

  if (( bullet_count > 1 )); then
    printf 'CHANGELOG Unreleased section is not empty. Move content into the version section before tagging.\n' >&2
    printf 'Detected %d bullets under ## Unreleased; placeholder convention permits at most one.\n' "$bullet_count" >&2
    return 1
  fi

  if (( bold_count > 0 )); then
    printf 'CHANGELOG Unreleased section is not empty. Move content into the version section before tagging.\n' >&2
    printf 'Detected feature-style bold marker (**) under ## Unreleased; that pattern is reserved for real release entries.\n' >&2
    return 1
  fi

  return 0
}

should_run_public_release_check() {
  case "$release_mode" in
    always) return 0 ;;
    never) return 1 ;;
  esac

  changed_paths | sort -u | grep -Eq '^(\.github/|deploy/|docs/|scripts/|AGENTS\.md|README\.md|\.env\.example|\.gitleaks\.toml)'
}

if [[ "$release_mode" == "always" && "$changelog_check" != "never" ]]; then
  printf '\n==> CHANGELOG Unreleased guard\n'
  printf '+ check_changelog_unreleased_guard\n'
  # Guard runs in dry-run too — it is a fast local-file check.
  check_changelog_unreleased_guard
elif [[ "$release_mode" == "always" && "$changelog_check" == "never" ]]; then
  printf '\n==> CHANGELOG Unreleased guard skipped (--no-changelog-check)\n'
  printf 'Emergency override active. Record reason in the branch protection bypass ledger.\n'
fi

run_step "Git whitespace check" check_whitespace
run_step "Frontend lint" "${pnpm_cmd[@]}" --dir front lint
run_step "Frontend unit tests with coverage" "${pnpm_cmd[@]}" --dir front test:coverage
run_step "Frontend build" "${pnpm_cmd[@]}" --dir front build
run_step "Export Zod fixtures" "${pnpm_cmd[@]}" --dir front zod:export-fixtures
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
  run_step "Playwright E2E" "${pnpm_cmd[@]}" --dir front test:e2e
  run_step "Validate Prometheus rules" ./scripts/validate-prometheus-rules.sh
  run_step "Validate Prometheus config" ./scripts/validate-prometheus-config.sh
  run_step "Validate Alertmanager config" ./scripts/validate-alertmanager-config.sh
fi

if [[ "$dry_run" == "true" ]]; then
  printf '\nPre-push dry-run complete.\n'
else
  printf '\nPre-push checks passed.\n'
fi
