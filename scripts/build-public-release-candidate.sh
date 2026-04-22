#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

if [[ $# -ne 0 ]]; then
  fail "custom destinations are unsupported; run without arguments to build .tmp/public-release-candidate"
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this script from inside the ReadMates repository"
cd "$repo_root"
repo_abs="$(pwd -P)"

tmp_dir="$repo_abs/.tmp"
candidate_dir="$tmp_dir/public-release-candidate"
build_dir=""
staging_dir=""
private_plan_dir="docs/super""powers"

temp_files=()
new_temp_file_path=""
new_temp_file() {
  local file
  file="$(mktemp "${TMPDIR:-/tmp}/readmates-public-candidate.XXXXXX")" || fail "mktemp failed"
  temp_files+=("$file")
  new_temp_file_path="$file"
}

cleanup() {
  local status=$?
  if [[ -n "${staging_dir:-}" && -d "$staging_dir" ]]; then
    case "$staging_dir" in
      "$tmp_dir"/public-release-candidate.staging.*)
        rm -rf -- "$staging_dir" || true
        ;;
    esac
  fi

  if [[ ${#temp_files[@]} -gt 0 ]]; then
    rm -f -- "${temp_files[@]}" || true
  fi

  return "$status"
}
trap cleanup EXIT

capture_find() {
  local output_file="$1"
  shift

  if ! find "$@" -print0 > "$output_file"; then
    fail "find failed while scanning: find $* -print0"
  fi
}

require_file() {
  local path="$1"
  reject_symlink_components "$path"
  [[ -f "$path" ]] || fail "required file is missing: $path"
}

require_dir() {
  local path="$1"
  reject_symlink_components "$path"
  [[ -d "$path" ]] || fail "required directory is missing: $path"
}

reject_symlink_components() {
  local path="$1"
  local current="" part
  local -a path_parts=()
  IFS='/' read -r -a path_parts <<< "$path"

  for part in "${path_parts[@]}"; do
    [[ -z "$part" || "$part" == "." ]] && continue
    if [[ -z "$current" ]]; then
      current="$part"
    else
      current="$current/$part"
    fi

    if [[ -L "$current" ]]; then
      fail "source path uses a symlink component: $current"
    fi
  done
}

prepare_tmp_dir() {
  if [[ -L "$tmp_dir" ]]; then
    fail ".tmp is a symlink; refusing to remove or write release-candidate data"
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

  if [[ -L "$candidate_dir" ]]; then
    fail ".tmp/public-release-candidate is a symlink; refusing to replace it"
  fi

  if [[ -e "$candidate_dir" && ! -d "$candidate_dir" ]]; then
    fail ".tmp/public-release-candidate exists but is not a directory"
  fi
}

create_staging_dir() {
  staging_dir="$(mktemp -d "$tmp_dir/public-release-candidate.staging.XXXXXX")" || fail "mktemp staging directory failed"
  build_dir="$staging_dir"
}

safe_remove_tmp_dir() {
  local path="$1"

  case "$path" in
    "$tmp_dir"/public-release-candidate.previous.*)
      ;;
    *)
      fail "refusing to remove path outside checked .tmp: $path"
      ;;
  esac

  if [[ -L "$path" ]]; then
    fail "refusing to remove symlinked temp path: $path"
  fi

  rm -rf -- "$path"
}

promote_candidate() {
  local previous_dir=""

  if [[ -L "$candidate_dir" ]]; then
    fail ".tmp/public-release-candidate is a symlink; refusing to replace it"
  fi

  if [[ -e "$candidate_dir" && ! -d "$candidate_dir" ]]; then
    fail ".tmp/public-release-candidate exists but is not a directory"
  fi

  if [[ -e "$candidate_dir" ]]; then
    previous_dir="$(mktemp -d "$tmp_dir/public-release-candidate.previous.XXXXXX")" || fail "mktemp previous directory failed"
    rmdir "$previous_dir" || fail "could not reserve previous candidate path"
    mv "$candidate_dir" "$previous_dir" || fail "could not move previous release candidate aside"
  fi

  if ! mv "$staging_dir" "$candidate_dir"; then
    if [[ -n "$previous_dir" && -d "$previous_dir" && ! -e "$candidate_dir" ]]; then
      mv "$previous_dir" "$candidate_dir" || true
    fi
    fail "could not promote verified release candidate"
  fi

  staging_dir=""

  if [[ -n "$previous_dir" ]]; then
    safe_remove_tmp_dir "$previous_dir"
  fi
}

preflight_envrc_loaders() {
  local roots=(
    "."
    "front"
    "server"
    "deploy/oci"
    "docs/development"
    "docs/deploy"
    "scripts"
  )
  local matches=()
  local root results path

  for root in "${roots[@]}"; do
    [[ -d "$root" ]] || continue
    reject_symlink_components "$root"
    new_temp_file
    results="$new_temp_file_path"
    if [[ "$root" == "." ]]; then
      capture_find "$results" "$root" -maxdepth 1 -name '.envrc*'
    else
      capture_find "$results" "$root" -name '.envrc*'
    fi

    while IFS= read -r -d '' path; do
      matches+=("${path#./}")
    done < "$results"
  done

  if [[ ${#matches[@]} -gt 0 ]]; then
    printf 'Forbidden env loader files were found in approved source roots:\n' >&2
    printf '  %s\n' "${matches[@]}" >&2
    fail "remove .envrc* files before building a public release candidate"
  fi
}

preflight_source_symlinks() {
  local roots=(
    ".github/workflows"
    "front"
    "server"
    "deploy/oci"
    "docs/development"
    "docs/deploy"
    "scripts"
  )
  local matches=()
  local root results path
  local -a find_args

  for root in "${roots[@]}"; do
    require_dir "$root"
    new_temp_file
    results="$new_temp_file_path"
    find_args=("$root")

    case "$root" in
      front)
        find_args+=(
          "("
          -path "$root/output" -o
          -path "$root/node_modules" -o
          -path "$root/dist" -o
          -path "$root/.wrangler" -o
          -path "$root/.cloudflare" -o
          -path "$root/.vercel" -o
          -path "$root/.terraform" -o
          -path "$root/.pulumi" -o
          -path "$root/private" -o
          -path "$root/screenshot" -o
          -path "$root/screenshots"
          ")"
          -prune -o -type l
        )
        ;;
      server)
        find_args+=(
          "("
          -path "$root/build" -o
          -path "$root/.gradle" -o
          -path "$root/.kotlin" -o
          -path "$root/.wrangler" -o
          -path "$root/.cloudflare" -o
          -path "$root/.vercel" -o
          -path "$root/.terraform" -o
          -path "$root/.pulumi" -o
          -path "$root/private" -o
          -path "$root/screenshot" -o
          -path "$root/screenshots"
          ")"
          -prune -o -type l
        )
        ;;
      *)
        find_args+=(
          "("
          -path "$root/.wrangler" -o
          -path "$root/.cloudflare" -o
          -path "$root/.vercel" -o
          -path "$root/.terraform" -o
          -path "$root/.pulumi" -o
          -path "$root/private" -o
          -path "$root/screenshot" -o
          -path "$root/screenshots"
          ")"
          -prune -o -type l
        )
        ;;
    esac

    capture_find "$results" "${find_args[@]}"

    while IFS= read -r -d '' path; do
      matches+=("${path#./}")
    done < "$results"
  done

  if [[ ${#matches[@]} -gt 0 ]]; then
    printf 'Forbidden symlinks were found in approved source roots:\n' >&2
    printf '  %s\n' "${matches[@]}" >&2
    fail "remove source symlinks before building a public release candidate"
  fi
}

copy_required_file() {
  local source="$1"
  local target="$build_dir/$source"

  require_file "$source"
  mkdir -p "$(dirname "$target")"
  cp -p "$source" "$target"
}

copy_optional_file() {
  local source="$1"
  local target="$build_dir/$source"

  if [[ -L "$source" ]]; then
    fail "optional source file is a symlink: $source"
  fi

  [[ -e "$source" ]] || return 0
  require_file "$source"
  mkdir -p "$(dirname "$target")"
  cp -p "$source" "$target"
}

copy_dir() {
  local source="$1"
  local target="$build_dir/$source"
  shift

  require_dir "$source"
  mkdir -p "$target"
  rsync -rtp \
    --exclude='.env*' \
    --exclude='*.env' \
    --exclude='*.pem' \
    --exclude='*.key' \
    --exclude='*.p8' \
    --exclude='*.sql.gz' \
    --exclude='*.dump' \
    --exclude='.DS_Store' \
    "$@" \
    "$source/" "$target/"
}

copy_manifest() {
  copy_required_file ".github/workflows/ci.yml"
  copy_required_file ".gitignore"
  copy_optional_file ".gitleaks.toml"
  copy_required_file ".env.example"
  copy_required_file "README.md"
  copy_required_file "compose.yml"

  copy_dir "front" \
    --exclude='/output/' \
    --exclude='/node_modules/' \
    --exclude='/dist/'

  copy_dir "server" \
    --exclude='/build/' \
    --exclude='/.gradle/' \
    --exclude='/.kotlin/'

  copy_dir "deploy/oci" \
    --exclude='/.deploy-state' \
    --exclude='/*.state'

  copy_dir "docs/deploy"
  copy_dir "docs/development"

  copy_required_file "scripts/build-public-release-candidate.sh"
  copy_required_file "scripts/README.md"
  copy_optional_file "scripts/public-release-check.sh"
  copy_optional_file "scripts/verify-public-release-fixtures.sh"
}

is_approved_manifest_path() {
  local rel="$1"

  case "$rel" in
    .github|.github/workflows|.github/workflows/ci.yml) return 0 ;;
    .gitignore|.gitleaks.toml|.env.example|README.md|compose.yml) return 0 ;;
    front|front/*) return 0 ;;
    server|server/*) return 0 ;;
    deploy|deploy/oci|deploy/oci/*) return 0 ;;
    docs|docs/deploy|docs/deploy/*|docs/development|docs/development/*) return 0 ;;
    scripts|scripts/README.md|scripts/build-public-release-candidate.sh|scripts/public-release-check.sh|scripts/verify-public-release-fixtures.sh) return 0 ;;
    *) return 1 ;;
  esac
}

is_forbidden_candidate_path() {
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
    "$private_plan_dir"|"$private_plan_dir"/*) return 0 ;;
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

verify_candidate() {
  local candidate="$1"
  local candidate_abs all_paths findings symlinks path rel
  candidate_abs="$(cd "$candidate" && pwd -P)" || fail "could not resolve candidate directory"
  new_temp_file
  all_paths="$new_temp_file_path"
  new_temp_file
  findings="$new_temp_file_path"
  new_temp_file
  symlinks="$new_temp_file_path"
  capture_find "$all_paths" "$candidate_abs"
  capture_find "$symlinks" "$candidate_abs" -type l

  while IFS= read -r -d '' path; do
    rel="${path#"$candidate_abs"/}"
    printf 'symlink path: %s\n' "$rel" >> "$findings"
  done < "$symlinks"

  while IFS= read -r -d '' path; do
    [[ "$path" == "$candidate_abs" ]] && continue
    rel="${path#"$candidate_abs"/}"

    if ! is_approved_manifest_path "$rel"; then
      printf 'unexpected manifest path: %s\n' "$rel" >> "$findings"
      continue
    fi

    if is_forbidden_candidate_path "$rel"; then
      printf 'forbidden path: %s\n' "$rel" >> "$findings"
    fi
  done < "$all_paths"

  if [[ -s "$findings" ]]; then
    printf 'Public release candidate verification failed:\n' >&2
    sed 's/^/  /' "$findings" >&2
    fail "candidate contains paths outside the approved public manifest or denylist"
  fi
}

print_next_steps() {
  cat <<EOF
Public release candidate built:
  $candidate_dir

Next verification commands:
  find .tmp/public-release-candidate -type l -print
  find .tmp/public-release-candidate -name '.env*' -print
  find .tmp/public-release-candidate \\( -path '*/design/*' -o -path '*/.gstack/*' -o -path '*/.superpowers/*' -o -path '*/.idea/*' -o -path '*/.playwright-cli/*' -o -path '*/.tmp/*' -o -path '*/recode/*' -o -path '*/front/output/*' -o -path '*/front/node_modules/*' -o -path '*/front/dist/*' -o -path '*/server/build/*' -o -path '*/server/.gradle/*' -o -path '*/server/.kotlin/*' -o -path '*/.wrangler' -o -path '*/.wrangler/*' -o -path '*/.cloudflare' -o -path '*/.cloudflare/*' -o -path '*/.vercel' -o -path '*/.vercel/*' -o -iname '*.env' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.p8' -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.jks' -o -iname 'id_rsa*' -o -iname 'id_ed25519*' -o -iname 'id_ecdsa*' -o -iname 'id_dsa*' -o -iname '*.sql.gz' -o -iname '*.dump' -o -iname '*.tfstate' -o -iname '*.db' -o -iname '*.sqlite' \\) -print
  git diff --check
EOF
}

preflight_envrc_loaders
prepare_tmp_dir
preflight_source_symlinks
create_staging_dir
copy_manifest
verify_candidate "$staging_dir"
promote_candidate
print_next_steps
