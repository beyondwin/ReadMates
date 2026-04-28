#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

if [[ $# -gt 1 ]]; then
  fail "usage: $0 [path-to-current-tree-or-public-release-candidate]"
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
script_root="$(cd "$script_dir/.." && pwd -P)"

repo_root="$(git -C "$script_root" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  repo_root="$script_root"
else
  repo_root="$(cd "$repo_root" && pwd -P)"
fi

if [[ $# -eq 0 ]]; then
  source_abs="$repo_root"
else
  input_path="$1"
  [[ -e "$input_path" ]] || fail "scan path does not exist: $input_path"
  source_abs="$(cd "$input_path" && pwd -P)" || fail "could not resolve scan path: $input_path"
fi

mode="candidate"
if [[ "$source_abs" == "$repo_root" ]] && git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  mode="private-tree"
fi
private_plan_dir="docs/super""powers"

tmp_files=()
new_tmp_file_path=""
new_tmp_file() {
  local file
  file="$(mktemp "${TMPDIR:-/tmp}/readmates-public-release-check.XXXXXX")" || fail "mktemp failed"
  tmp_files+=("$file")
  new_tmp_file_path="$file"
}

cleanup() {
  if [[ ${#tmp_files[@]} -gt 0 ]]; then
    rm -f -- "${tmp_files[@]}" || true
  fi
}
trap cleanup EXIT

new_tmp_file
findings="$new_tmp_file_path"

record_finding() {
  printf '%s\n' "$*" >> "$findings"
}

record_scan_error() {
  local context="$1"
  local tool="$2"
  local status="$3"
  local stderr_file="$4"

  {
    printf 'scan error: %s (%s exit %s)\n' "$context" "$tool" "$status"
    if [[ -s "$stderr_file" ]]; then
      sed 's/^/  /' "$stderr_file"
    fi
  } >> "$findings"
}

content_match_is_allowed() {
  local description="$1"
  local match="$2"
  local assignment_regex value

  [[ "$description" == "real-looking DB/BFF/OAuth secret assignment" ]] || return 1

  assignment_regex="(READMATES_BFF_SECRET|readmates[.]bff-secret|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|spring[.]datasource[.]password|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET|client[_-]?secret|oauth[_-]?client[_-]?secret)[[:space:]]*[:=][[:space:]]*['\"]?([^[:space:]'\"<>\`]+)"

  if [[ "$match" =~ $assignment_regex ]]; then
    value="${BASH_REMATCH[2]}"
  else
    return 1
  fi

  case "$value" in
    "<db-password>"|"<secret>"|"<shared-secret>"|"<shared-bff-secret>"|"<same-secret-as-cloudflare>"|"<same-shared-secret>"|"<same-pages-function-secret>"|"<google-oauth-client-secret>"|"<pages-function-secret>")
      return 0
      ;;
    "local-dev-secret"|"e2e-secret"|"test-secret"|"test-bff-secret"|"wrong-secret")
      return 0
      ;;
  esac

  if [[ "$value" =~ ^\$\{(READMATES_BFF_SECRET|BFF_SECRET|APP_DB_PASS|MYSQL_ADMIN_PASS|GOOGLE_CLIENT_SECRET|SPRING_DATASOURCE_PASSWORD|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET)(:[^}]*)?\}$ ]]; then
    return 0
  fi

  return 1
}

record_content_matches() {
  local description="$1"
  local strip_source_prefix="$2"
  local matches_file="$3"
  local filtered line

  new_tmp_file
  filtered="$new_tmp_file_path"

  while IFS= read -r line; do
    if content_match_is_allowed "$description" "$line"; then
      continue
    fi
    printf '%s\n' "$line" >> "$filtered"
  done < "$matches_file"

  if [[ -s "$filtered" ]]; then
    {
      printf 'targeted content finding: %s\n' "$description"
      write_indented_matches "$strip_source_prefix" < "$filtered"
    } >> "$findings"
  fi
}

capture_find_scan() {
  local context="$1"
  local output_file="$2"
  local errors status
  shift 2

  new_tmp_file
  errors="$new_tmp_file_path"

  if find "$@" -print0 > "$output_file" 2> "$errors"; then
    status=0
  else
    status=$?
    record_scan_error "$context" "find" "$status" "$errors"
  fi

  return 0
}

is_forbidden_path() {
  local rel="$1"
  local lower lower_base
  lower="$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]')"
  lower_base="${lower##*/}"

  [[ "$lower" == ".env.example" ]] && return 1

  case "$lower_base" in
    .env*|*.env|*.pem|*.key|*.p8|*.p12|*.pfx|*.jks|id_rsa*|id_ed25519*|id_ecdsa*|id_dsa*) return 0 ;;
    *.sql.gz|*.dump|*.db|*.sqlite|*.sqlite3|*.bak) return 0 ;;
    *.tfstate|*.tfstate.*|*.state) return 0 ;;
  esac

  case "$lower" in
    .git|.git/*) return 0 ;;
    output|output/*) return 0 ;;
    front/output|front/output/*) return 0 ;;
    node_modules|node_modules/*) return 0 ;;
    front/node_modules|front/node_modules/*) return 0 ;;
    front/dist|front/dist/*) return 0 ;;
    server/build|server/build/*) return 0 ;;
    server/.gradle|server/.gradle/*) return 0 ;;
    server/.kotlin|server/.kotlin/*) return 0 ;;
    design|design/*) return 0 ;;
    .gstack|.gstack/*) return 0 ;;
    .superpowers|.superpowers/*) return 0 ;;
    .idea|.idea/*) return 0 ;;
    .playwright-cli|.playwright-cli/*) return 0 ;;
    .tmp|.tmp/*) return 0 ;;
    recode|recode/*) return 0 ;;
    deploy/oci/.deploy-state|deploy/oci/*.state) return 0 ;;
    .wrangler|.wrangler/*|*/.wrangler|*/.wrangler/*) return 0 ;;
    .cloudflare|.cloudflare/*|*/.cloudflare|*/.cloudflare/*) return 0 ;;
    .vercel|.vercel/*|*/.vercel|*/.vercel/*) return 0 ;;
    .terraform|.terraform/*|*/.terraform|*/.terraform/*) return 0 ;;
    .pulumi|.pulumi/*|*/.pulumi|*/.pulumi/*) return 0 ;;
    private|private/*|*/private|*/private/*) return 0 ;;
  esac

  case "$lower" in
    screenshot|screenshot/*|*/screenshot|*/screenshot/*) return 0 ;;
    screenshots|screenshots/*|*/screenshots|*/screenshots/*) return 0 ;;
    *screenshot*|*screen-shot*) return 0 ;;
  esac

  return 1
}

check_forbidden_paths_private_tree() {
  local path

  while IFS= read -r -d '' path; do
    if is_forbidden_path "$path"; then
      record_finding "forbidden tracked path: $path"
    fi
  done < <(git -C "$repo_root" ls-files -z)
}

check_tracked_symlinks_private_tree() {
  local entry metadata path mode_bits target

  while IFS= read -r -d '' entry; do
    metadata="${entry%%$'\t'*}"
    path="${entry#*$'\t'}"
    mode_bits="${metadata%% *}"

    if [[ "$mode_bits" == "120000" ]]; then
      target="$(git -C "$repo_root" cat-file -p ":$path" 2>/dev/null || true)"
      record_finding "forbidden tracked symlink: $path -> $target"
    fi
  done < <(git -C "$repo_root" ls-files -s -z)
}

check_forbidden_paths_candidate() {
  local path rel target all_paths

  new_tmp_file
  all_paths="$new_tmp_file_path"
  capture_find_scan "candidate path traversal" "$all_paths" "$source_abs"

  while IFS= read -r -d '' path; do
    [[ "$path" == "$source_abs" ]] && continue
    rel="${path#"$source_abs"/}"
    if [[ -L "$path" ]]; then
      target="$(readlink "$path" 2>/dev/null || true)"
      record_finding "forbidden candidate symlink: $rel -> $target"
    fi
    if is_forbidden_path "$rel"; then
      record_finding "forbidden candidate path: $rel"
    fi
  done < "$all_paths"
}

write_indented_matches() {
  local strip_source_prefix="$1"
  local line

  while IFS= read -r line; do
    if [[ "$strip_source_prefix" == "true" && "$line" == "$source_abs/"* ]]; then
      line="${line#"$source_abs"/}"
    fi
    printf '  %s\n' "$line"
  done
}

run_content_check_private_tree() {
  local description="$1"
  local pattern="$2"
  local matches_file

  new_tmp_file
  matches_file="$new_tmp_file_path"

  if git -C "$repo_root" grep -n -I -E -o -e "$pattern" -- . > "$matches_file" 2>/dev/null; then
    :
  else
    :
  fi

  record_content_matches "$description" false "$matches_file"
}

run_content_check_candidate_rg() {
  local description="$1"
  local pattern="$2"
  local matches errors status

  new_tmp_file
  matches="$new_tmp_file_path"
  new_tmp_file
  errors="$new_tmp_file_path"

  if rg -n -o --hidden --no-ignore -S -e "$pattern" "$source_abs" > "$matches" 2> "$errors"; then
    status=0
  else
    status=$?
  fi

  record_content_matches "$description" true "$matches"

  if (( status >= 2 )); then
    record_scan_error "candidate content scan for $description" "rg" "$status" "$errors"
  fi
}

run_content_check_candidate_grep() {
  local description="$1"
  local pattern="$2"
  local files matches errors path status rel

  new_tmp_file
  files="$new_tmp_file_path"
  new_tmp_file
  matches="$new_tmp_file_path"
  new_tmp_file
  errors="$new_tmp_file_path"

  capture_find_scan "candidate content file discovery for $description" "$files" "$source_abs" -type f

  while IFS= read -r -d '' path; do
    : > "$errors"
    if grep -HnoIE -- "$pattern" "$path" >> "$matches" 2> "$errors"; then
      status=0
    else
      status=$?
    fi

    if (( status > 1 )); then
      rel="${path#"$source_abs"/}"
      record_scan_error "candidate content scan for $description at $rel" "grep" "$status" "$errors"
    fi
  done < "$files"

  record_content_matches "$description" true "$matches"
}

run_content_check() {
  local description="$1"
  local pattern="$2"

  if [[ "$mode" == "private-tree" ]]; then
    run_content_check_private_tree "$description" "$pattern"
  elif command -v rg >/dev/null 2>&1; then
    run_content_check_candidate_rg "$description" "$pattern"
  else
    run_content_check_candidate_grep "$description" "$pattern"
  fi
}

run_targeted_content_checks() {
  run_content_check "private key block" '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----'
  run_content_check "OCI OCID" 'ocid1[.][a-z0-9][a-z0-9._-]{16,}'
  run_content_check "GitHub token" '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})'
  run_content_check "OpenAI/API key style token" '(^|[^A-Za-z0-9_-])(sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|(OPENAI_API_KEY|API_KEY|GOOGLE_API_KEY)[[:space:]]*[:=][[:space:]]*['"'"'"]?[A-Za-z0-9_-]{24,})'
  run_content_check "real-looking DB/BFF/OAuth secret assignment" '(^|[^A-Za-z0-9_$/{.-])(READMATES_BFF_SECRET|readmates[.]bff-secret|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|spring[.]datasource[.]password|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET|client[_-]?secret|oauth[_-]?client[_-]?secret)[[:space:]]*[:=][[:space:]]*['"'"'"]?[^[:space:]'"'"'"<>`]{16,}'
  run_content_check "Gmail address" '[A-Za-z0-9._%+-]+@gmail[.]com'
  run_content_check "private club domain" 'readmates[.]kr'
  run_content_check "local workstation path" '/Users/'"kws/"
}

run_gitleaks_or_fallback_notice() {
  local config_arg=()

  if command -v gitleaks >/dev/null 2>&1; then
    if [[ -f "$repo_root/.gitleaks.toml" ]]; then
      config_arg=(--config "$repo_root/.gitleaks.toml")
    elif [[ -f "$script_root/.gitleaks.toml" ]]; then
      config_arg=(--config "$script_root/.gitleaks.toml")
    fi

    if gitleaks dir --help >/dev/null 2>&1; then
      info "Running gitleaks dir $source_abs"
      if ! gitleaks dir "${config_arg[@]}" --redact --no-banner "$source_abs"; then
        record_finding "gitleaks dir reported findings or failed"
      fi
    else
      info "Installed gitleaks does not support 'dir'; falling back to legacy 'detect --source' compatibility command."
      info "Running gitleaks detect --source $source_abs"
      if ! gitleaks detect --source "$source_abs" "${config_arg[@]}" --redact --no-banner; then
        record_finding "gitleaks detect reported findings or failed"
      fi
    fi
  else
    info "gitleaks is not installed; running fallback path/content checks only."
    info "Fallback scanning is not a professional or complete secret scan. It blocks obvious mistakes before local iteration, but install gitleaks before publishing."
  fi
}

info "ReadMates public-release check"
info "  mode: $mode"
info "  source: $source_abs"

if [[ "$mode" == "private-tree" ]]; then
  check_forbidden_paths_private_tree
  check_tracked_symlinks_private_tree
else
  check_forbidden_paths_candidate
fi

run_targeted_content_checks
run_gitleaks_or_fallback_notice

if [[ -s "$findings" ]]; then
  printf '\nPublic-release check failed:\n' >&2
  sed 's/^/  /' "$findings" >&2
  exit 1
fi

info "Public-release check passed."
