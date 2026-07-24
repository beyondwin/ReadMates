#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

assert_file_contains() {
  local file="$1"
  local expected="$2"

  if ! grep -Fq "$expected" "$file"; then
    sed 's/^/  /' "$file" >&2
    fail "expected $file to contain: $expected"
  fi
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this script from inside the ReadMates repository"
cd "$repo_root"
repo_abs="$(pwd -P)"

tmp_dir="$repo_abs/.tmp"
fixture_root="$tmp_dir/public-release-fixtures"
candidate_dir="$tmp_dir/public-release-candidate"

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

if [[ ! -d "$candidate_dir" ]]; then
  fail "public-release candidate not found at $candidate_dir; run scripts/build-public-release-candidate.sh first"
fi

if [[ -L "$fixture_root" ]]; then
  fail ".tmp/public-release-fixtures is a symlink; refusing to use it"
fi

safe_remove_fixture_root
mkdir -p "$fixture_root/secret-dollar" "$fixture_root/secret-comment" "$fixture_root/placeholders"

secret_dollar_value="$(printf 'Abc\\044123Def456Gh!')"
printf 'SPRING_DATASOURCE_PASSWORD=%s\n' "$secret_dollar_value" > "$fixture_root/secret-dollar/.env.example"

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

# The positive placeholder case carries the minimum complete release contract:
# Tempo assets plus the fail-closed production AI configuration path.
placeholder_contract_files=(
  ".env.example"
  ".github/workflows/sync-config.yml"
  "deploy/oci/compose.yml"
  "deploy/oci/compose.infra.yml"
  "deploy/oci/grafana/provisioning/datasources/tempo.yml"
  "ops/tempo/tempo.yml"
  "ops/observability/local/compose.yml"
  "ops/observability/local/grafana/provisioning/datasources/tempo.yml"
  "scripts/validate-production-ai-config.sh"
  "scripts/sync-config/import-from-prod-env.sh"
)
for relative_path in "${placeholder_contract_files[@]}"; do
  mkdir -p "$fixture_root/placeholders/$(dirname "$relative_path")"
  cp "$candidate_dir/$relative_path" "$fixture_root/placeholders/$relative_path"
done
cat >> "$fixture_root/placeholders/.env.example" <<'PLACEHOLDERS'
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

artifact_fixture="$fixture_root/artifact-paths"
mkdir -p "$artifact_fixture/front/test-results"
printf '{}\n' > "$artifact_fixture/front/test-results/.last-run.json"

if ./scripts/public-release-check.sh "$artifact_fixture" > "$artifact_fixture.out" 2> "$artifact_fixture.err"; then
  fail "public release check should reject front/test-results"
fi
assert_file_contains "$artifact_fixture.err" "forbidden candidate path: front/test-results/.last-run.json"

tsbuildinfo_fixture="$fixture_root/tsbuildinfo-path"
mkdir -p "$tsbuildinfo_fixture/front"
printf '{"diagnostics":"generated compiler state"}\n' > "$tsbuildinfo_fixture/front/tsconfig.tsbuildinfo"

if ./scripts/public-release-check.sh "$tsbuildinfo_fixture" > "$tsbuildinfo_fixture.out" 2> "$tsbuildinfo_fixture.err"; then
  fail "public release check should reject generated TypeScript build metadata"
fi
assert_file_contains "$tsbuildinfo_fixture.err" "forbidden candidate path: front/tsconfig.tsbuildinfo"

design_standalone_fixture="$fixture_root/design-standalone-path"
mkdir -p "$design_standalone_fixture/design/standalone"
printf '<html>local design export</html>\n' > "$design_standalone_fixture/design/standalone/index.html"

if ./scripts/public-release-check.sh "$design_standalone_fixture" > "$design_standalone_fixture.out" 2> "$design_standalone_fixture.err"; then
  fail "public release check should reject design/standalone"
fi
assert_file_contains "$design_standalone_fixture.err" "forbidden candidate path: design/standalone"

instruction_reference_fixture="$fixture_root/omitted-instruction-reference"
mkdir -p "$instruction_reference_fixture"
cp -R "$candidate_dir/." "$instruction_reference_fixture"
printf 'Run AGENTS.md before editing.\n' > "$instruction_reference_fixture/docs/development/project-map.md"

if ./scripts/public-release-check.sh "$instruction_reference_fixture" > "$instruction_reference_fixture.out" 2> "$instruction_reference_fixture.err"; then
  fail "public release check should reject an instruction that requires an omitted contributor path"
fi
assert_file_contains "$instruction_reference_fixture.err" "artifact instruction references omitted contributor path: docs/development/project-map.md:1: Run AGENTS.md before editing."

guidance_checker_reference_fixture="$fixture_root/omitted-guidance-checker-reference"
mkdir -p "$guidance_checker_reference_fixture"
cp -R "$candidate_dir/." "$guidance_checker_reference_fixture"
printf 'Run python3 scripts/check-agent-guidance.py before editing.\n' \
  > "$guidance_checker_reference_fixture/scripts/README.md"

if ./scripts/public-release-check.sh "$guidance_checker_reference_fixture" > "$guidance_checker_reference_fixture.out" 2> "$guidance_checker_reference_fixture.err"; then
  fail "public release check should reject an instruction that requires the omitted guidance checker"
fi
assert_file_contains "$guidance_checker_reference_fixture.err" "artifact instruction references omitted contributor path: scripts/README.md:1: Run python3 scripts/check-agent-guidance.py before editing."

coverage_fixture="$repo_abs/scripts/fixtures/public-release-candidate-coverage.txt"

if [[ ! -f "$coverage_fixture" ]]; then
  fail "coverage fixture not found at $coverage_fixture"
fi

candidate_top="$(find "$candidate_dir" -mindepth 1 -maxdepth 1 -exec basename {} \; | sort)"
expected_top="$(sort "$coverage_fixture")"

if [ "$candidate_top" != "$expected_top" ]; then
  printf 'public release candidate top-level mismatch:\n' >&2
  diff <(printf '%s\n' "$expected_top") <(printf '%s\n' "$candidate_top") >&2 || true
  fail "public release candidate top-level does not match scripts/fixtures/public-release-candidate-coverage.txt"
fi

for required_workspace_file in \
  ".node-version" \
  "package.json" \
  "pnpm-lock.yaml" \
  "pnpm-workspace.yaml" \
  "front/package.json" \
  "design/system/package.json" \
  "design/docs/package.json" \
  "scripts/fixtures/public-release-candidate-coverage.txt"
do
  if [[ ! -f "$candidate_dir/$required_workspace_file" ]]; then
    fail "public release candidate is missing required workspace file: $required_workspace_file"
  fi
done

printf 'Public-release fixture checks passed.\n'
