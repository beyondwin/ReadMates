# ReadMates Test Suite Audit Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible, source-grounded baseline for all 510 automated test files, prove their runner and CI reachability, identify static effectiveness candidates, and create the high-risk gap matrix that scopes the later optimization plans.

**Architecture:** This phase is evidence-only: it does not delete, add, or rewrite product tests. Runner-native list/dry-run outputs establish reachability, a machine-readable inventory and candidate ledger preserve file-level evidence, official lanes establish runtime and coverage baselines, and a manually verified risk matrix turns those facts into bounded server, frontend/BFF, E2E/CT/CI, and final-verification follow-up plans.

**Tech Stack:** Node.js 24, pnpm 11.13.1 through Corepack 0.35.0, Vitest 4.1.10, Playwright 1.61.1, Kotlin 2.4, JDK 25, Gradle 9.6.1, JUnit 5, Bash/zsh, ripgrep, jq, Git.

## Global Constraints

- This plan creates audit evidence only. Do not modify, delete, merge, move, or add production tests in Phase 1.
- Treat the 510-file total as 504 `*.test.*`/`*.spec.*`/`*Test.kt` files plus 6 Playwright CT `*.ct.tsx` files.
- Keep every committed path repo-relative; never persist `/[U]sers/`, private domains, member data, credentials, tokens, deployment identifiers, raw provider output, or local environment values.
- Use Node.js 24.18.0. The current host default is Node.js 26.4.0, so resolve Homebrew `node@24` at runtime without committing its absolute path.
- The current host has no `corepack` executable. Run frontend commands through `npx --yes corepack@0.35.0 pnpm`.
- Do not lower frontend coverage thresholds (`lines 80`, `statements 79`, `functions 80`, `branches 75`) or server JaCoCo line coverage minimum (`0.23`).
- Do not increase retries, timeouts, sleeps, workers, or Gradle forks while measuring the baseline.
- A missing executable, database, Docker daemon, or browser dependency is `UNVERIFIED_ENV`, not PASS and not evidence that a test is unnecessary.
- A failing baseline is evidence to classify; do not delete or weaken a test to make Phase 1 green.
- Use `docs/development/architecture.md` as the current architecture source of truth and `docs/development/test-guide.md` as the official test-lane reference.
- Preserve unrelated user changes. Stop if audit files overlap new uncommitted edits.

---

## Scope And Dependency Check

This plan implements only sub-project 1 from the approved design:

```text
Task 1 runner inventory
  -> Task 2 static candidate ledger
  -> Task 3 official runtime baseline
  -> Task 4 high-risk gap matrix and handoff
```

The later server, frontend/BFF, E2E/CT/CI, and final-verification plans consume the reports produced here. They must not start from guessed duplication or coverage alone.

## File Structure Map

| Path | Responsibility |
| --- | --- |
| `docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv` | One row per automated test file with its actual runner lane and selection source |
| `docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv` | Static, non-conclusive effectiveness candidates with evidence counts |
| `docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md` | Toolchain, CI topology, runtime/coverage baseline, risk-gap matrix, and follow-up plan boundaries |
| `.tmp/test-suite-audit/` | Ignored raw runner lists, logs, timing files, and generated intermediate TSV files |

No source, test, workflow, build, package, migration, or active test-guide file is modified in this phase.

## Interfaces

### Inventory row

```text
path<TAB>lane<TAB>selection_source<TAB>status
```

- `path`: repo-relative tracked test file.
- `lane`: one of `front-vitest-node`, `front-vitest-jsdom`, `front-playwright-e2e`, `front-playwright-ct`, `design-system-vitest`, `design-docs-vitest`, `server-unit`, `server-integration`, `server-architecture`.
- `selection_source`: repo-relative config/task that selects the file.
- `status`: `included` in Phase 1. A discovered mismatch is recorded in the report instead of inventing another status.

### Candidate row

```text
path<TAB>flag<TAB>evidence_count<TAB>review_state
```

- `flag`: one of `skip-or-focus`, `todo-fixme`, `snapshot`, `mock-heavy`, `oversized`, `assertion-signal-missing`, `sleep-or-timeout`.
- `evidence_count`: positive integer from the exact static pattern.
- `review_state`: always `candidate-only`; no row is a deletion decision.

### Risk matrix row

```text
risk_id | boundary | production evidence | test evidence | observed gap | disposition | follow-up plan
```

- `risk_id`: `R01` through `R10`.
- `disposition`: one of `covered`, `strengthen`, `add`, `runtime-unverified`.
- `follow-up plan`: one of `server`, `frontend-bff`, `e2e-ct-ci`, `final-verification`.

## Requirement Traceability

| Approved design requirement | Implemented by |
| --- | --- |
| All automated test files mapped to a runner lane | Task 1 |
| Include visual CT and design-system tests | Task 1 |
| Detect skipped, assertion-poor, mock-heavy, snapshot, oversized, and timing-sensitive candidates | Task 2 |
| Record official lane pass/fail, wallclock, coverage, retry, and environment gaps | Task 3 |
| Separate test failure from missing local prerequisites | Task 3 |
| Map auth, tenant isolation, visibility, BFF, lifecycle, transaction, cache, AI, notifications, and observability gaps | Task 4 |
| Produce bounded inputs for later optimization plans | Task 4 |

---

### Task 1: Build The Runner-Native 510-File Inventory

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv`
- Generate, do not commit: `.tmp/test-suite-audit/*.json`

**Interfaces:**
- Consumes: `front/vitest.config.ts`, `front/playwright.config.ts`, `front/playwright-ct.config.ts`, `design/system/package.json`, `design/docs/package.json`, `server/build.gradle.kts`, and server `@Tag` annotations.
- Produces: the inventory row contract and the exact lane counts used by Tasks 2–4.

- [ ] **Step 1: Verify the execution base and activate the pinned Node toolchain**

Run:

```bash
git status --short --branch
git rev-parse HEAD
test_audit_node_bin="$(brew --prefix node@24)/bin"
PATH="$test_audit_node_bin:$PATH" node --version
PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --version
java -version
./server/gradlew -p server --version
```

Expected:

- the worktree contains no uncommitted source/test/report changes;
- Node prints `v24.18.0`;
- pnpm prints `11.13.1`;
- Gradle uses JVM 25.

If these versions differ, stop before generating committed evidence and record the mismatch in commentary.

- [ ] **Step 2: Collect runner-native frontend and design file lists**

Run:

```bash
test_audit_tmp="$PWD/.tmp/test-suite-audit"
test_audit_node_bin="$(brew --prefix node@24)/bin"
mkdir -p "$test_audit_tmp"

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest list \
  --filesOnly --staticParse --project node \
  --json=../.tmp/test-suite-audit/front-node-files.json

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest list \
  --filesOnly --staticParse --project jsdom \
  --json=../.tmp/test-suite-audit/front-jsdom-files.json

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright test \
  --list --reporter=json > "$test_audit_tmp/front-e2e.json"

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright test \
  --config=playwright-ct.config.ts --list --reporter=json > "$test_audit_tmp/front-ct.json"

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm \
  --filter @readmates/design-system exec vitest list \
  --filesOnly --staticParse \
  --json=../../.tmp/test-suite-audit/design-system-files.json

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm \
  --filter @readmates/design-system-docs exec vitest list \
  --filesOnly --staticParse \
  --json=../../.tmp/test-suite-audit/design-docs-files.json
```

Expected runner-native file counts:

```text
front-vitest-node       69
front-vitest-jsdom     114
front-playwright-e2e    40
front-playwright-ct      6
design-system-vitest     7
design-docs-vitest       1
```

- [ ] **Step 3: Generate the normalized inventory**

Run this exact block from the repository root:

```bash
test_audit_tmp="$PWD/.tmp/test-suite-audit"

{
  printf 'path\tlane\tselection_source\tstatus\n'
  jq -r --arg root "$PWD/" \
    '.[] | [(.file | ltrimstr($root)), "front-vitest-node", "front/vitest.config.ts:node", "included"] | @tsv' \
    "$test_audit_tmp/front-node-files.json"
  jq -r --arg root "$PWD/" \
    '.[] | [(.file | ltrimstr($root)), "front-vitest-jsdom", "front/vitest.config.ts:jsdom", "included"] | @tsv' \
    "$test_audit_tmp/front-jsdom-files.json"
  jq -r --arg root "$PWD/" \
    '[.. | objects | .file? // empty] | unique[] | [(. | ltrimstr($root)), "front-playwright-e2e", "front/playwright.config.ts", "included"] | @tsv' \
    "$test_audit_tmp/front-e2e.json"
  jq -r --arg root "$PWD/" \
    '[.. | objects | .file? // empty] | unique[] | [(. | ltrimstr($root)), "front-playwright-ct", "front/playwright-ct.config.ts", "included"] | @tsv' \
    "$test_audit_tmp/front-ct.json"
  jq -r --arg root "$PWD/" \
    '.[] | [(.file | ltrimstr($root)), "design-system-vitest", "design/system/package.json", "included"] | @tsv' \
    "$test_audit_tmp/design-system-files.json"
  jq -r --arg root "$PWD/" \
    '.[] | [(.file | ltrimstr($root)), "design-docs-vitest", "design/docs/package.json", "included"] | @tsv' \
    "$test_audit_tmp/design-docs-files.json"

  while IFS= read -r test_audit_file; do
    if rg -q '@Tag\("architecture"\)' "$test_audit_file"; then
      test_audit_lane='server-architecture'
      test_audit_source='server/build.gradle.kts:architectureTest'
    elif rg -q '@Tag\("(integration|container)"\)' "$test_audit_file"; then
      test_audit_lane='server-integration'
      test_audit_source='server/build.gradle.kts:integrationTest'
    else
      test_audit_lane='server-unit'
      test_audit_source='server/build.gradle.kts:unitTest'
    fi
    printf '%s\t%s\t%s\tincluded\n' \
      "$test_audit_file" "$test_audit_lane" "$test_audit_source"
  done < <(rg --files server/src/test -g '*Test.kt' -g '*Tests.kt' | sort)
} > "$test_audit_tmp/inventory.unsorted.tsv"

{
  head -n 1 "$test_audit_tmp/inventory.unsorted.tsv"
  tail -n +2 "$test_audit_tmp/inventory.unsorted.tsv" | sort -t $'\t' -k2,2 -k1,1
} > "$test_audit_tmp/inventory.tsv"

install -m 0644 \
  "$test_audit_tmp/inventory.tsv" \
  docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv
```

- [ ] **Step 4: Prove the inventory is complete, unique, and repo-relative**

Run:

```bash
test_audit_inventory=docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv

printf 'rows='
tail -n +2 "$test_audit_inventory" | wc -l | tr -d ' '

printf '\nduplicate_paths='
tail -n +2 "$test_audit_inventory" | cut -f1 | sort | uniq -d | wc -l | tr -d ' '

printf '\nmissing_paths='
tail -n +2 "$test_audit_inventory" | cut -f1 | while IFS= read -r test_audit_file; do
  test -f "$test_audit_file" || printf '%s\n' "$test_audit_file"
done | wc -l | tr -d ' '

printf '\nlanes\n'
tail -n +2 "$test_audit_inventory" | cut -f2 | sort | uniq -c | sort -k2

if rg -n '/[U]sers/|/[Hh]ome/|file:/{2}|https?://[^[:space:]]+' "$test_audit_inventory"; then
  exit 1
fi
```

Expected:

```text
rows=510
duplicate_paths=0
missing_paths=0
```

Expected lane counts:

```text
1 design-docs-vitest
7 design-system-vitest
6 front-playwright-ct
40 front-playwright-e2e
114 front-vitest-jsdom
69 front-vitest-node
2 server-architecture
98 server-integration
173 server-unit
```

- [ ] **Step 5: Commit the runner inventory**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv
git diff --cached --check
git commit -m "docs: inventory ReadMates test runner lanes"
```

Expected: one commit containing only the 510-row inventory.

---

### Task 2: Generate The Static Effectiveness Candidate Ledger

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv`

**Interfaces:**
- Consumes: Task 1 inventory.
- Produces: candidate-only file flags for later human review; no deletion or strengthening decision.

- [ ] **Step 1: Generate evidence-backed candidate rows**

Run:

```bash
test_audit_inventory=docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv
test_audit_tmp="$PWD/.tmp/test-suite-audit"

printf 'path\tflag\tevidence_count\treview_state\n' \
  > "$test_audit_tmp/candidates.unsorted.tsv"

while IFS=$'\t' read -r test_audit_file test_audit_lane test_audit_source test_audit_status; do
  test "$test_audit_file" = "path" && continue

  test_audit_lines="$(wc -l < "$test_audit_file" | tr -d ' ')"
  if test "$test_audit_lines" -ge 500; then
    printf '%s\toversized\t%s\tcandidate-only\n' \
      "$test_audit_file" "$test_audit_lines" \
      >> "$test_audit_tmp/candidates.unsorted.tsv"
  fi

  test_audit_count="$(
    (rg -o '\b(describe|it|test)\.(skip|todo|only)\b|\b(xdescribe|xit|xtest)\b|@(Disabled|Ignore)\b' \
      "$test_audit_file" || true) | wc -l | tr -d ' '
  )"
  if test "$test_audit_count" -gt 0; then
    printf '%s\tskip-or-focus\t%s\tcandidate-only\n' \
      "$test_audit_file" "$test_audit_count" \
      >> "$test_audit_tmp/candidates.unsorted.tsv"
  fi

  test_audit_count="$(
    (rg -o '\b([T]ODO|[F]IXME)\b' "$test_audit_file" || true) |
      wc -l | tr -d ' '
  )"
  if test "$test_audit_count" -gt 0; then
    printf '%s\ttodo-fixme\t%s\tcandidate-only\n' \
      "$test_audit_file" "$test_audit_count" \
      >> "$test_audit_tmp/candidates.unsorted.tsv"
  fi

  test_audit_count="$(
    (rg -o 'toMatchSnapshot|toMatchInlineSnapshot|toHaveScreenshot' \
      "$test_audit_file" || true) | wc -l | tr -d ' '
  )"
  if test "$test_audit_count" -gt 0; then
    printf '%s\tsnapshot\t%s\tcandidate-only\n' \
      "$test_audit_file" "$test_audit_count" \
      >> "$test_audit_tmp/candidates.unsorted.tsv"
  fi

  test_audit_count="$(
    (rg -o 'vi\.(mock|fn|spyOn)|page\.route\(|mockk?\(|Mockito|@MockBean|whenever\(|every \{' \
      "$test_audit_file" || true) | wc -l | tr -d ' '
  )"
  if test "$test_audit_count" -ge 10; then
    printf '%s\tmock-heavy\t%s\tcandidate-only\n' \
      "$test_audit_file" "$test_audit_count" \
      >> "$test_audit_tmp/candidates.unsorted.tsv"
  fi

  test_audit_count="$(
    (rg -o 'Thread\.sleep\(|waitForTimeout\(|setTimeout\(|sleep\(' \
      "$test_audit_file" || true) | wc -l | tr -d ' '
  )"
  if test "$test_audit_count" -gt 0; then
    printf '%s\tsleep-or-timeout\t%s\tcandidate-only\n' \
      "$test_audit_file" "$test_audit_count" \
      >> "$test_audit_tmp/candidates.unsorted.tsv"
  fi

  case "$test_audit_file" in
    *.kt)
      test_audit_assertion_pattern='\bassert[A-Z]|\bassertThat|\bverify\(|\.andExpect\(|\bshould(Be|Not|Throw|Contain|Have)|\bfail\('
      ;;
    *)
      test_audit_assertion_pattern='\bexpect\(|\bassert\.|\bassert\(|toHave|toBe|toEqual|toMatch|toContain|toThrow|\bfail\('
      ;;
  esac

  if ! rg -q "$test_audit_assertion_pattern" "$test_audit_file"; then
    printf '%s\tassertion-signal-missing\t1\tcandidate-only\n' \
      "$test_audit_file" \
      >> "$test_audit_tmp/candidates.unsorted.tsv"
  fi
done < "$test_audit_inventory"

{
  head -n 1 "$test_audit_tmp/candidates.unsorted.tsv"
  tail -n +2 "$test_audit_tmp/candidates.unsorted.tsv" |
    sort -t $'\t' -k1,1 -k2,2
} > "$test_audit_tmp/candidates.tsv"

install -m 0644 \
  "$test_audit_tmp/candidates.tsv" \
  docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv
```

The patterns intentionally over-select. A helper-based test can be flagged as assertion-signal-missing even when its imported helper asserts internally. The row remains a candidate until a later surface plan reads the test and production target together.

- [ ] **Step 2: Verify candidate-ledger invariants**

Run:

```bash
test_audit_inventory=docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv
test_audit_candidates=docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv

tail -n +2 "$test_audit_candidates" | cut -f1 | sort -u > .tmp/test-suite-audit/candidate-paths.txt
tail -n +2 "$test_audit_inventory" | cut -f1 | sort -u > .tmp/test-suite-audit/inventory-paths.txt

comm -23 \
  .tmp/test-suite-audit/candidate-paths.txt \
  .tmp/test-suite-audit/inventory-paths.txt

tail -n +2 "$test_audit_candidates" | cut -f1,2 | sort | uniq -d

awk -F '\t' '
  NR == 1 {
    if ($1 != "path" || $2 != "flag" || $3 != "evidence_count" || $4 != "review_state") exit 1
    next
  }
  $3 !~ /^[1-9][0-9]*$/ { exit 1 }
  $4 != "candidate-only" { exit 1 }
' "$test_audit_candidates"

if rg -n '/[U]sers/|/[Hh]ome/|file:/{2}|https?://[^[:space:]]+' "$test_audit_candidates"; then
  exit 1
fi

cut -f2 "$test_audit_candidates" | tail -n +2 | sort | uniq -c | sort -nr
```

Expected:

- both `comm` and duplicate-pair commands print no paths;
- `awk` exits 0;
- the final command prints only the seven documented flag names with their counts.

- [ ] **Step 3: Commit the candidate ledger**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv
git diff --cached --check
git commit -m "docs: record test effectiveness candidates"
```

Expected: one commit containing only the candidate ledger.

---

### Task 3: Capture Official Runtime, Coverage, And Environment Baselines

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md`
- Generate, do not commit: `.tmp/test-suite-audit/*.log`, `.tmp/test-suite-audit/*.time`, `.tmp/test-suite-audit/baseline-status.tsv`

**Interfaces:**
- Consumes: official commands from `AGENTS.md`, `.github/workflows/ci.yml`, `docs/development/test-guide.md`, and Task 1 runner counts.
- Produces: actual exit status, wallclock, coverage, test-case counts, retries, and environment gaps for Task 4.

- [ ] **Step 1: Collect test-case census without executing test bodies**

Run:

```bash
test_audit_tmp="$PWD/.tmp/test-suite-audit"
test_audit_node_bin="$(brew --prefix node@24)/bin"

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest list \
  --staticParse --project node \
  --json=../.tmp/test-suite-audit/front-node-cases.json

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest list \
  --staticParse --project jsdom \
  --json=../.tmp/test-suite-audit/front-jsdom-cases.json

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm \
  --filter @readmates/design-system exec vitest list \
  --staticParse \
  --json=../../.tmp/test-suite-audit/design-system-cases.json

PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm \
  --filter @readmates/design-system-docs exec vitest list \
  --staticParse \
  --json=../../.tmp/test-suite-audit/design-docs-cases.json

./server/gradlew -p server \
  unitTest architectureTest integrationTest \
  --test-dry-run --rerun-tasks

: > "$test_audit_tmp/server-runtime-lanes.tsv"
: > "$test_audit_tmp/server-runtime-unmapped.tsv"

for test_audit_lane in unitTest integrationTest architectureTest; do
  case "$test_audit_lane" in
    unitTest) test_audit_label='server-unit' ;;
    integrationTest) test_audit_label='server-integration' ;;
    architectureTest) test_audit_label='server-architecture' ;;
  esac

  while IFS= read -r test_audit_xml; do
    test_audit_class="$(
      sed -n 's/.*<testsuite name="\([^"]*\)".*/\1/p' "$test_audit_xml" |
        head -n 1
    )"
    test_audit_top="${test_audit_class%%\$*}"
    test_audit_rel="server/src/test/kotlin/${test_audit_top//.//}.kt"

    if ! test -f "$test_audit_rel"; then
      test_audit_simple="${test_audit_top##*.}"
      test_audit_matches="$(
        rg -l "class[[:space:]]+$test_audit_simple\\b" \
          server/src/test/kotlin -g '*.kt' || true
      )"
      if test "$(
        printf '%s\n' "$test_audit_matches" |
          sed '/^$/d' |
          wc -l |
          tr -d ' '
      )" -eq 1; then
        test_audit_rel="$test_audit_matches"
      fi
    fi

    if test -f "$test_audit_rel"; then
      printf '%s\t%s\n' "$test_audit_rel" "$test_audit_label" \
        >> "$test_audit_tmp/server-runtime-lanes.tsv"
    else
      printf '%s\t%s\n' "$test_audit_class" "$test_audit_label" \
        >> "$test_audit_tmp/server-runtime-unmapped.tsv"
    fi
  done < <(
    find "server/build/test-results/$test_audit_lane" \
      -maxdepth 1 -name 'TEST-*.xml' |
      sort
  )
done

sort -u \
  "$test_audit_tmp/server-runtime-lanes.tsv" \
  -o "$test_audit_tmp/server-runtime-lanes.tsv"

awk -F '\t' '
  NR > 1 && $2 ~ /^server-/ { print $1 "\t" $2 }
' docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv |
  sort -u \
  > "$test_audit_tmp/server-inventory-lanes.tsv"

printf 'server_runtime_paths='
wc -l < "$test_audit_tmp/server-runtime-lanes.tsv" | tr -d ' '
printf '\nserver_runtime_unmapped='
wc -l < "$test_audit_tmp/server-runtime-unmapped.tsv" | tr -d ' '
printf '\nserver_lane_diff='
comm -3 \
  "$test_audit_tmp/server-inventory-lanes.tsv" \
  "$test_audit_tmp/server-runtime-lanes.tsv" |
  wc -l |
  tr -d ' '
```

Expected collected-case counts at the approved design baseline:

```text
front-vitest-node cases       403
front-vitest-jsdom cases      948
front-playwright-e2e cases     82
front-playwright-ct cases       7
design-system-vitest cases     13
design-docs-vitest cases        2
server-unit dry-run cases      943
server-integration dry-run     692
server-architecture dry-run     25
```

For server dry-run XML, `173`, `101`, and `3` XML files are expected for unit, integration, and architecture respectively. XML file count is not source-file count because nested test classes produce separate XML files.

The runtime-to-source reconciliation must print:

```text
server_runtime_paths=273
server_runtime_unmapped=0
server_lane_diff=0
```

If case counts or reconciliation counts drift, record the actual count and the HEAD rather than editing the approved baseline number to force a match.

- [ ] **Step 2: Record environment readiness before running expensive lanes**

Run:

```bash
test_audit_tmp="$PWD/.tmp/test-suite-audit"
test_audit_node_bin="$(brew --prefix node@24)/bin"

{
  printf 'dependency\tstatus\tdetail\n'
  printf 'node24\tREADY\t%s\n' "$(PATH="$test_audit_node_bin:$PATH" node --version)"
  printf 'pnpm\tREADY\t%s\n' "$(PATH="$test_audit_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --version)"
  printf 'java\tREADY\t%s\n' "$(java -version 2>&1 | head -n 1)"

  for test_audit_dependency in docker mysql shellcheck jq rg; do
    if command -v "$test_audit_dependency" >/dev/null 2>&1; then
      printf '%s\tREADY\tavailable\n' "$test_audit_dependency"
    else
      printf '%s\tUNVERIFIED_ENV\tmissing executable\n' "$test_audit_dependency"
    fi
  done

  if docker info >/dev/null 2>&1; then
    printf 'docker-daemon\tREADY\treachable\n'
  else
    printf 'docker-daemon\tUNVERIFIED_ENV\tunreachable\n'
  fi
} > "$test_audit_tmp/environment.tsv"

column -t -s $'\t' "$test_audit_tmp/environment.tsv"
```

Current-host expectation from plan authoring:

- Node 24, pnpm, Java 25, Docker, jq, and ripgrep are available;
- `mysql` and `shellcheck` executables are absent unless the environment has changed.

Do not install system packages in Phase 1. Mark dependent lanes `UNVERIFIED_ENV` with the exact missing prerequisite.

- [ ] **Step 3: Define a non-hiding measurement helper**

Run in the same shell that will execute Step 4:

```bash
test_audit_tmp="$PWD/.tmp/test-suite-audit"
mkdir -p "$test_audit_tmp"
printf 'lane\texit_status\ttime_file\tlog_file\n' > "$test_audit_tmp/baseline-status.tsv"

measure_test_audit_lane() {
  test_audit_lane_name="$1"
  shift
  set +e
  /usr/bin/time -p \
    -o "$test_audit_tmp/${test_audit_lane_name}.time" \
    "$@" \
    > "$test_audit_tmp/${test_audit_lane_name}.log" 2>&1
  test_audit_lane_rc="$?"
  set -e
  printf '%s\t%s\t%s\t%s\n' \
    "$test_audit_lane_name" \
    "$test_audit_lane_rc" \
    ".tmp/test-suite-audit/${test_audit_lane_name}.time" \
    ".tmp/test-suite-audit/${test_audit_lane_name}.log" \
    >> "$test_audit_tmp/baseline-status.tsv"
}

record_test_audit_unverified() {
  test_audit_lane_name="$1"
  test_audit_reason="$2"
  printf '%s\tUNVERIFIED_ENV\t-\t%s\n' \
    "$test_audit_lane_name" "$test_audit_reason" \
    >> "$test_audit_tmp/baseline-status.tsv"
}
```

This helper deliberately preserves non-zero exit status in the status TSV while allowing the baseline collection to continue. It does not retry a failed command.

- [ ] **Step 4: Execute each official lane once with its default semantics**

Run in the same shell as Step 3:

```bash
test_audit_node_bin="$(brew --prefix node@24)/bin"
test_audit_node_path="$test_audit_node_bin:$PATH"

measure_test_audit_lane front-lint \
  env PATH="$test_audit_node_path" \
  npx --yes corepack@0.35.0 pnpm --dir front lint

measure_test_audit_lane front-coverage \
  env PATH="$test_audit_node_path" \
  npx --yes corepack@0.35.0 pnpm --dir front test:coverage

measure_test_audit_lane front-build \
  env PATH="$test_audit_node_path" \
  npx --yes corepack@0.35.0 pnpm --dir front build

measure_test_audit_lane front-zod-fixtures \
  env PATH="$test_audit_node_path" \
  bash -c '
    npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures &&
    git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
  '

measure_test_audit_lane design-check \
  env PATH="$test_audit_node_path" \
  npx --yes corepack@0.35.0 pnpm design:check

measure_test_audit_lane server-ci \
  ./scripts/server-ci-check.sh

if docker info >/dev/null 2>&1; then
  measure_test_audit_lane server-integration \
    ./server/gradlew -p server integrationTest
else
  record_test_audit_unverified server-integration 'docker daemon unavailable'
fi

if command -v mysql >/dev/null 2>&1; then
  measure_test_audit_lane front-e2e \
    env PATH="$test_audit_node_path" \
    npx --yes corepack@0.35.0 pnpm --dir front test:e2e
else
  record_test_audit_unverified front-e2e 'mysql executable unavailable'
fi

if docker info >/dev/null 2>&1; then
  measure_test_audit_lane front-ct-docker \
    env PATH="$test_audit_node_path" \
    npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
else
  record_test_audit_unverified front-ct-docker 'docker daemon unavailable'
fi

measure_test_audit_lane agent-guidance \
  python3 scripts/check-agent-guidance.py

measure_test_audit_lane script-bash-syntax \
  bash -c 'for test_audit_script in scripts/*.sh deploy/oci/*.sh; do bash -n "$test_audit_script"; done'

if command -v shellcheck >/dev/null 2>&1; then
  measure_test_audit_lane script-shellcheck \
    shellcheck scripts/*.sh deploy/oci/*.sh
else
  record_test_audit_unverified script-shellcheck 'shellcheck executable unavailable'
fi

measure_test_audit_lane script-aigen-pii \
  bash scripts/aigen-pii-check.sh

measure_test_audit_lane script-observability-config \
  bash -c '
    ./scripts/validate-prometheus-rules.sh &&
    ./scripts/validate-prometheus-config.sh &&
    bash scripts/validate-tempo-config.sh &&
    ./scripts/lint-grafana-dashboards.sh
  '

measure_test_audit_lane script-production-ai-config \
  bash -c '
    bash scripts/validate-production-ai-config.sh &&
    bash scripts/verify-production-ai-config-fixtures.sh
  '

measure_test_audit_lane public-release \
  bash -c '
    ./scripts/build-public-release-candidate.sh &&
    ./scripts/public-release-check.sh .tmp/public-release-candidate
  '

column -t -s $'\t' "$test_audit_tmp/baseline-status.tsv"
```

Expected:

- every lane has exactly one status row;
- successful lanes have exit status `0`;
- unavailable prerequisites use `UNVERIFIED_ENV`;
- failed lanes retain their non-zero status and raw log;
- no command uses retry, increased timeout, increased workers, or changed fork count.

- [ ] **Step 5: Extract coverage, result, and retry evidence**

Run:

```bash
test_audit_tmp="$PWD/.tmp/test-suite-audit"

if test -f front/coverage/coverage-summary.json; then
  jq '.total | {
    lines: .lines.pct,
    statements: .statements.pct,
    functions: .functions.pct,
    branches: .branches.pct
  }' front/coverage/coverage-summary.json \
    > "$test_audit_tmp/front-coverage-summary.json"
fi

if test -f server/build/reports/jacoco/test/jacocoTestReport.xml; then
  rg -o '<counter type="LINE" missed="[0-9]+" covered="[0-9]+"/>' \
    server/build/reports/jacoco/test/jacocoTestReport.xml |
    tail -n 1 \
    > "$test_audit_tmp/server-line-counter.txt"
fi

for test_audit_result_dir in unitTest integrationTest architectureTest; do
  printf '%s\t' "$test_audit_result_dir"
  find "server/build/test-results/$test_audit_result_dir" \
    -maxdepth 1 -name 'TEST-*.xml' |
    wc -l |
    tr -d ' '
done > "$test_audit_tmp/server-result-file-counts.tsv"

rg -n -i 'retry|retried|flaky|attempt [2-9]|failed' \
  "$test_audit_tmp"/*.log \
  > "$test_audit_tmp/retry-failure-signals.txt" || true
```

Do not classify every textual `failed` match as a test failure. Read the corresponding log and distinguish build summaries, negative fixture assertions, actual retry, and actual test failure.

- [ ] **Step 6: Write and validate the baseline report**

Create `docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md` with these exact sections:

```markdown
# ReadMates 테스트 스위트 Phase 1 기준선 보고서

## 1. 범위와 기준 HEAD
## 2. 도구 및 환경 준비 상태
## 3. 파일·케이스·runner 연결성
## 4. CI job과 공식 명령 대응
## 5. 실행 결과와 wallclock
## 6. Coverage 기준선
## 7. Retry·flake·실패 신호
## 8. 미검증 항목과 환경 원인
```

Populate Sections 1–8 immediately from the commands in Steps 1–5. Each runtime row must contain the exact command, exit status or `UNVERIFIED_ENV`, `/usr/bin/time -p` real seconds when executed, case/file count, retry observation, and log-relative path. Do not copy local absolute paths or private environment values from raw logs.

Section 4 must map these exact CI jobs to the local baseline lane and command that represents them:

```text
scripts
public-release
frontend
frontend-visual-regression
design-system
backend
backend-integration
e2e (1/3)
e2e (2/3)
e2e (3/3)
```

Validate:

```bash
test_audit_report=docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md

for test_audit_heading in \
  '## 1. 범위와 기준 HEAD' \
  '## 2. 도구 및 환경 준비 상태' \
  '## 3. 파일·케이스·runner 연결성' \
  '## 4. CI job과 공식 명령 대응' \
  '## 5. 실행 결과와 wallclock' \
  '## 6. Coverage 기준선' \
  '## 7. Retry·flake·실패 신호' \
  '## 8. 미검증 항목과 환경 원인'
do
  rg -F "$test_audit_heading" "$test_audit_report"
done

for test_audit_job in \
  scripts \
  public-release \
  frontend \
  frontend-visual-regression \
  design-system \
  backend \
  backend-integration \
  'e2e (1/3)' \
  'e2e (2/3)' \
  'e2e (3/3)'
do
  rg -F "$test_audit_job" "$test_audit_report"
done

if rg -n '[T]BD|[T]ODO|[F]IXME|/[U]sers/|/[Hh]ome/|file:/{2}|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_' \
  "$test_audit_report"; then
  exit 1
fi

git diff --check -- "$test_audit_report"
```

- [ ] **Step 7: Commit the baseline report**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md
git diff --cached --check
git commit -m "docs: record test suite runtime baseline"
```

Expected: one report commit; raw `.tmp/test-suite-audit/` evidence remains ignored and uncommitted.

---

### Task 4: Build The High-Risk Gap Matrix And Follow-Up Handoff

**Files:**
- Modify: `docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md`

**Interfaces:**
- Consumes: Task 1 inventory, Task 2 candidate ledger, Task 3 runtime baseline, current production code, and architecture docs.
- Produces: ten source-grounded risk rows and four bounded follow-up-plan inputs.

- [ ] **Step 1: Trace the ten required risk boundaries from production code to tests**

Review each boundary in this fixed order. Record exact repo-relative production and test paths with the observable behavior each assertion protects.

| Risk ID | Boundary | Required starting evidence |
| --- | --- | --- |
| R01 | BFF secret, internal header stripping, cookie/redirect trust | `front/functions/_shared/proxy.ts`, `front/functions/api/bff/[[path]].ts`, `front/tests/unit/cloudflare-bff.test.ts`, `front/tests/unit/proxy-bff-secret.test.ts`, `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`, `server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterTest.kt` |
| R02 | OAuth return state and open-redirect prevention | `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`, `server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt`, `front/tests/unit/cloudflare-oauth-proxy.test.ts`, `front/tests/e2e/google-auth-invite-flow.spec.ts` |
| R03 | Membership, role, and club-context tenant isolation | `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`, `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`, `server/src/test/kotlin/com/readmates/club/api/ClubContextResolverTest.kt`, `server/src/test/kotlin/com/readmates/auth/api/AuthenticatedMemberSecurityTest.kt`, `front/tests/e2e/multi-club-flow.spec.ts` |
| R04 | Public/member/attendee visibility | `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`, `server/src/main/kotlin/com/readmates/club/domain/ClubPublicVisibility.kt`, `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`, `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`, `front/tests/e2e/public-auth-member-host.spec.ts` |
| R05 | Session/member/invitation/publication lifecycle denial paths | `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`, `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`, `server/src/test/kotlin/com/readmates/session/domain/SessionInvariantConstraintTest.kt`, `server/src/test/kotlin/com/readmates/auth/application/MemberLifecycleServiceTest.kt`, `front/tests/e2e/member-lifecycle.spec.ts` |
| R06 | Transaction rollback and Flyway upgrade path | `server/src/main/resources/db/mysql/migration`, `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`, `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`, `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt` |
| R07 | Redis failure, stale reads, and post-commit invalidation | `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`, `server/src/main/kotlin/com/readmates/publication/adapter/out/redis/RedisPublicReadCacheAdapter.kt`, `server/src/main/kotlin/com/readmates/note/adapter/out/redis/RedisNotesReadCacheAdapter.kt`, `server/src/test/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapterTest.kt`, `server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt`, `server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt` |
| R08 | AI authorization, cost cap, reservation, cancel/expiry/recovery races | `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryService.kt`, `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt`, `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt`, `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersTest.kt`, `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt`, `front/tests/e2e/aigen-cost-cap.spec.ts`, `front/tests/e2e/aigen-commit-recovery.spec.ts` |
| R09 | Notification outbox idempotency and partial delivery | `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`, `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`, `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`, `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt`, `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt` |
| R10 | PII-safe frontend/server observability and test-profile parity | `front/shared/observability/frontend-observability-client.ts`, `front/tests/e2e/frontend-observability-local-proxy.spec.ts`, `server/src/main/kotlin/com/readmates/observability/application/service/FrontendObservabilityService.kt`, `server/src/test/kotlin/com/readmates/observability/application/service/FrontendObservabilityServiceTest.kt`, `server/src/test/kotlin/com/readmates/observability/adapter/in/web/FrontendObservabilityBffSecurityTest.kt` |

Use targeted searches, then read the full assertion blocks and production branches before assigning a disposition:

```bash
rg -n 'BffSecret|x-readmates|Set-Cookie|returnUrl|OAuthReturnState|ClubContext|club_id|visibility|PUBLIC|ATTENDEE' \
  front/functions front/tests server/src/main/kotlin server/src/test/kotlin

rg -n 'rollback|@Transactional|Flyway|migration|invalidate|stale|CircuitBreaker|fail.open|fail.closed' \
  server/src/main/kotlin server/src/test/kotlin server/src/main/resources/db/mysql/migration

rg -n 'cost|reservation|idempoten|duplicate|cancel|expire|recovery|outbox|retry|partial' \
  server/src/main/kotlin/com/readmates/aigen \
  server/src/test/kotlin/com/readmates/aigen \
  server/src/main/kotlin/com/readmates/notification \
  server/src/test/kotlin/com/readmates/notification

rg -n 'PII|token|cookie|query|string|stack|message.hash|route.pattern|metric|label' \
  front/shared/observability \
  front/tests/e2e/frontend-observability-local-proxy.spec.ts \
  server/src/main/kotlin/com/readmates/observability \
  server/src/test/kotlin/com/readmates/observability
```

- [ ] **Step 2: Complete Sections 9 and 10 of the report**

Append the following headings only when their complete evidence is ready in this task:

```markdown
## 9. 고위험 gap matrix
## 10. 후속 계획 경계
```

For every `R01`–`R10` row, include:

- at least one production path and the exact guarded branch or invariant;
- every directly relevant test path discovered in the inventory;
- the observable assertion, not merely the test name;
- runtime lane and whether Task 3 actually verified it;
- one disposition from the four-value contract;
- the smallest follow-up plan that owns the change.

Section 10 must create exactly these bounded follow-up entries:

1. `server`: server unit/integration/architecture effectiveness and missing server failure modes;
2. `frontend-bff`: frontend unit/route/BFF effectiveness and missing browser-facing contract tests;
3. `e2e-ct-ci`: E2E, visual CT, design system, scripts, CI reachability, flake, and runtime optimization;
4. `final-verification`: selected defect injection, full official gates, before/after metrics, and final residual risk.

Each entry must list:

- candidate files from the ledger;
- risk rows owned;
- baseline commands and measured time;
- environment prerequisites;
- explicit non-goals;
- acceptance commands.

- [ ] **Step 3: Verify matrix completeness and report consistency**

Run:

```bash
test_audit_report=docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md
test_audit_inventory=docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv
test_audit_candidates=docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv

for test_audit_risk in R01 R02 R03 R04 R05 R06 R07 R08 R09 R10; do
  test "$(rg -c "\\| $test_audit_risk \\|" "$test_audit_report")" -eq 1
done

for test_audit_disposition in covered strengthen add runtime-unverified; do
  rg -n "\\b$test_audit_disposition\\b" "$test_audit_report" || true
done

for test_audit_plan in server frontend-bff e2e-ct-ci final-verification; do
  rg -n "\\b$test_audit_plan\\b" "$test_audit_report"
done

tail -n +2 "$test_audit_inventory" | cut -f1 | while IFS= read -r test_audit_file; do
  test -f "$test_audit_file" || exit 1
done

awk -F '\t' 'NR > 1 && $4 != "candidate-only" { exit 1 }' "$test_audit_candidates"

if rg -n '[T]BD|[T]ODO|[F]IXME|/[U]sers/|/[Hh]ome/|file:/{2}|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_' \
  "$test_audit_report" "$test_audit_inventory" "$test_audit_candidates"; then
  exit 1
fi

git diff --check -- \
  "$test_audit_report" \
  "$test_audit_inventory" \
  "$test_audit_candidates"
```

Expected:

- each risk ID appears exactly once as a matrix row;
- all four follow-up plan IDs appear;
- every inventory path still exists;
- candidate rows remain explicitly non-conclusive;
- public-safety and diff checks print no findings.

- [ ] **Step 4: Commit the completed Phase 1 report**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md
git diff --cached --check
git commit -m "docs: map ReadMates test risk gaps"
```

Expected: one commit completing Sections 9 and 10 without source, test, config, workflow, or active-guide changes.

- [ ] **Step 5: Perform final Phase 1 acceptance**

Run:

```bash
git status --short --branch
git log -4 --oneline

test "$(tail -n +2 docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv | wc -l | tr -d ' ')" -eq 510

test -s docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md

git diff --check HEAD~4..HEAD

rg -n 'UNVERIFIED_ENV|non-zero|실패|미검증' \
  docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md || true
```

Expected:

- worktree clean;
- the four Phase 1 commits are visible;
- inventory has exactly 510 rows;
- all three report artifacts are non-empty;
- diff check passes;
- any failed or unavailable lane remains explicitly reported rather than omitted.

## Phase 1 Completion Boundary

Phase 1 is complete when the three report artifacts are committed, every automated test file has exactly one runner lane, the candidate ledger is explicitly non-conclusive, official lane results are recorded without hidden retries, and all ten risk rows have a source-grounded disposition and follow-up owner.

Do not claim that unnecessary tests have already been removed or missing tests have already been added. Those outcomes belong to the bounded follow-up plans created from this evidence.
