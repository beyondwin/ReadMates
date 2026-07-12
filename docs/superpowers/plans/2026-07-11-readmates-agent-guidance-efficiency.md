# ReadMates Agent Guidance Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. A user-selected external executor may run the same tasks if it preserves task order, RED/GREEN evidence, review gates, and commits.

**Goal:** Remove duplicated agent workflow surfaces and make ReadMates project guidance, verification commands, release review, Graphify input, CI, and pre-push checks consistent and mechanically verifiable.

**Architecture:** Generic discovery, planning, debugging, review, and branch-completion workflows remain outside the repository. ReadMates keeps only project-specific routing and evidence contracts in existing active documents, uses `scripts/server-ci-check.sh` as the single PR-level server gate, archives old release evidence in one dated report, and adds one deterministic Python checker that reuses the existing public-release scanner.

**Tech Stack:** Markdown, Python 3 standard library, Bash, Gradle, GitHub Actions YAML, Graphify CLI, existing `scripts/public-release-check.sh`.

## Global Constraints

- Add exactly two production files: `scripts/check-agent-guidance.py` and `docs/reports/2026-07-11-release-readiness-history.md`.
- Do not add `.agents/skills`, `.codex/agents`, `.codex/config.toml`, hooks, rules, plugins, MCP configuration, automations, `server/AGENTS.md`, a planning guide, or an agent-workflow guide.
- Do not require or invoke a private executor. The resulting plan and repository guidance must remain executor-independent.
- Do not copy generic TDD, debugging, code-review, plan-writing, or branch-finishing instructions into active ReadMates docs.
- Keep `CLAUDE.md` and `front/CLAUDE.md` as exact `@AGENTS.md` pointers. Reduce `.claude/commands/release-readiness.md` to a compatibility pointer instead of deleting it.
- Preserve `vMAJOR.MINOR.PATCH` Git tags as the version source of truth. Do not add a `VERSION` file or a generic four-part version workflow.
- Preserve explanatory and historical mentions of `./server/gradlew -p server clean test`; remove only runnable normative recommendations.
- `./scripts/server-ci-check.sh` must call `./server/gradlew -p server check` exactly once. `integrationTest` stays an explicit Docker/Testcontainers lane.
- Do not duplicate secret, token, private-domain, or local-path regexes in the Python checker. Stage selected guidance into a temporary directory and call the existing `scripts/public-release-check.sh`.
- Do not edit dated reports, postmortems, or `docs/superpowers/**` to rewrite historical evidence.
- Do not persist local absolute paths, private domains, real member data, credentials, deployment state, or token-shaped examples.
- Serialize Gradle verification in one worktree. Do not run `check`, `architectureTest`, or `integrationTest` concurrently against the same `server/build` directory.

## File And Interface Map

| File or group | Responsibility after implementation | Task |
| --- | --- | --- |
| `scripts/server-ci-check.sh` | Single PR-level backend quality command; delegates once to Gradle `check` | 1 |
| `AGENTS.md`, server/deploy/testing active docs | Route agents to the canonical wrapper and explicit integration lane | 1 |
| `.github/workflows/ci.yml`, `scripts/pre-push-check.sh` | Use the same server wrapper; later run the guidance checker | 1, 5 |
| `.claude/commands/release-readiness.md` | Thin base-range and checklist pointer with no duplicated commands | 2 |
| `docs/development/project-map.md`, `docs/development/vertical-slice-checklist.md` | Tool-neutral ReadMates discovery and handoff contract | 2 |
| `docs/development/local-setup.md`, `docs/development/performance-budget.md` | Corepack-first package-manager examples | 2 |
| `.graphifyignore`, `docs/development/graphify.md` | Exclude `.waygent/` and retain direct-file verification fallback | 2 |
| `docs/development/release-readiness-review.md` | Concise active ReadMates-specific release checklist | 3 |
| `docs/reports/2026-07-11-release-readiness-history.md` | Immutable snapshot of the old dated closeout notes | 3 |
| `scripts/check-agent-guidance.py` | Structural, link, command, size, ignore, and staged-safety contract | 4 |
| `scripts/README.md` | Documents canonical server and guidance checks | 1, 5 |

Task dependency order is `1 -> 2 -> 3 -> 4 -> 5`. Task 4 intentionally comes after the repository facts it enforces, so every committed task can remain green.

---

### Task 1: Make The Existing Server Wrapper Canonical

**Files:**

- Modify: `scripts/server-ci-check.sh`
- Modify: `scripts/README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/pre-push-check.sh`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/agents/server.md`
- Modify: `docs/development/new-developer-onboarding-guide.md`
- Modify: `docs/development/project-map.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/development/technical-decisions.md`
- Modify: `docs/development/release-management.md`
- Modify: `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- Modify: `docs/development/adr/0007-mysql-with-flyway-over-alternatives.md`
- Modify: `docs/deploy/README.md`
- Modify: `docs/deploy/compose-stack.md`
- Modify: `docs/deploy/release-publish-runbook.md`

**Interfaces:**

- Consumes: Gradle `check` contract from `server/build.gradle.kts`, where `check` depends on `detekt`, `unitTest`, and `architectureTest`.
- Produces: `./scripts/server-ci-check.sh` as the canonical PR-level backend command used by docs, CI, and pre-push.
- Produces: `./server/gradlew -p server integrationTest` as the only documented full Testcontainers lane outside focused tests.

- [ ] **Step 1: Capture the redundant and stale command evidence**

Run:

```bash
READMATES_SERVER_CI_CHECK_DRY_RUN=true ./scripts/server-ci-check.sh
rg -n -F './server/gradlew -p server clean test' \
  AGENTS.md \
  README.md \
  docs/agents/server.md \
  docs/deploy/README.md \
  docs/deploy/compose-stack.md \
  docs/deploy/release-publish-runbook.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/adr/0007-mysql-with-flyway-over-alternatives.md \
  docs/development/new-developer-onboarding-guide.md \
  docs/development/project-map.md \
  docs/development/release-management.md \
  docs/development/technical-decisions.md \
  docs/development/test-guide.md
```

Expected:

- Dry-run prints both `./server/gradlew -p server check` and a redundant standalone `architectureTest`.
- The search finds runnable `clean test` recommendations plus the two explanatory warnings in onboarding and the test guide.

- [ ] **Step 2: Remove the duplicate Gradle invocation from the wrapper**

Replace the final commands in `scripts/server-ci-check.sh` with:

```bash
run_step "Server CI quality gate" ./server/gradlew -p server check

printf '\nServer CI checks passed.\n'
```

Do not add `clean`, `architectureTest`, or `integrationTest` to this wrapper. Gradle `check` already owns unit, architecture, lint, static-analysis, and coverage dependencies; integration remains a separate lane.

- [ ] **Step 3: Point CI and pre-push at the wrapper**

Replace the backend step in `.github/workflows/ci.yml` with:

```yaml
      - name: Server quality gates (ktlint + detekt + tests + JaCoCo + architecture)
        run: ./scripts/server-ci-check.sh
```

Replace the backend pre-push line with:

```bash
run_step "Backend CI quality gate" ./scripts/server-ci-check.sh
```

Keep the existing full-mode integration line unchanged:

```bash
run_step "Backend integration tests" ./server/gradlew -p server integrationTest
```

- [ ] **Step 4: Replace normative server recommendations with the canonical contract**

Use this PR-level block in root guidance, README, server guide, project map, test guide, technical decisions, release-management, ADR-0002, and deploy runbooks:

```bash
./scripts/server-ci-check.sh
```

When the text promises Testcontainers, Flyway/MySQL, API-contract, query-budget, or full backend evidence, add the explicit lane instead of claiming the wrapper includes it:

```bash
./server/gradlew -p server integrationTest
```

For ADR-0007's “Testcontainers MySQL included” block, use:

```bash
./server/gradlew -p server clean unitTest architectureTest integrationTest
```

Keep explanatory warnings in onboarding and the test guide outside runnable recommendation blocks. They must say that the default Gradle `test` task is disabled to avoid duplicate selection and that running only `./server/gradlew -p server clean test` is not meaningful evidence.

In `AGENTS.md`, use two separate bullets:

```markdown
- Server PR-level quality: `./scripts/server-ci-check.sh`
- Server integration when persistence, migration, API contract, query budget, or Testcontainers behavior changes: `./server/gradlew -p server integrationTest`
```

- [ ] **Step 5: Align the script documentation**

Change `scripts/README.md` so the execution list is exactly:

```markdown
- `./server/gradlew -p server check`
```

State that `check` already runs `unitTest`, `architectureTest`, ktlint, detekt, and JaCoCo verification, while `integrationTest` is intentionally separate because it needs Docker/Testcontainers.

- [ ] **Step 6: Verify the wrapper and documentation contract**

Run:

```bash
set -e
READMATES_SERVER_CI_CHECK_DRY_RUN=true ./scripts/server-ci-check.sh
bash -n scripts/server-ci-check.sh scripts/pre-push-check.sh
shellcheck scripts/server-ci-check.sh scripts/pre-push-check.sh
./scripts/server-ci-check.sh
if rg -n -F './server/gradlew -p server clean test' \
  AGENTS.md \
  README.md \
  docs/agents/server.md \
  docs/deploy/README.md \
  docs/deploy/compose-stack.md \
  docs/deploy/release-publish-runbook.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/adr/0007-mysql-with-flyway-over-alternatives.md \
  docs/development/project-map.md \
  docs/development/release-management.md \
  docs/development/technical-decisions.md; then
  exit 1
fi
rg -n -F './server/gradlew -p server clean test' \
  docs/development/new-developer-onboarding-guide.md \
  docs/development/test-guide.md || true
```

Expected:

- Dry-run prints one Gradle command: `./server/gradlew -p server check`.
- Bash syntax and ShellCheck pass.
- The real wrapper exits zero and executes unit, architecture, static-analysis, and coverage gates once.
- The final search returns only explanatory warnings in onboarding/test-guide, or no results if those warnings were rephrased without the exact command.

- [ ] **Step 7: Commit the canonical server gate**

```bash
git add \
  scripts/server-ci-check.sh \
  scripts/pre-push-check.sh \
  scripts/README.md \
  .github/workflows/ci.yml \
  AGENTS.md \
  README.md \
  docs/agents/server.md \
  docs/deploy/README.md \
  docs/deploy/compose-stack.md \
  docs/deploy/release-publish-runbook.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/adr/0007-mysql-with-flyway-over-alternatives.md \
  docs/development/new-developer-onboarding-guide.md \
  docs/development/project-map.md \
  docs/development/release-management.md \
  docs/development/technical-decisions.md \
  docs/development/test-guide.md
git commit -m "fix: align canonical server verification"
```

---

### Task 2: Consolidate Tool-Neutral Planning, Corepack, Claude, And Graphify Guidance

**Files:**

- Modify: `AGENTS.md`
- Modify: `.claude/commands/release-readiness.md`
- Modify: `docs/development/project-map.md`
- Modify: `docs/development/vertical-slice-checklist.md`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/performance-budget.md`
- Modify: `.graphifyignore`
- Modify: `docs/development/graphify.md`

Depends on: Task 1

**Interfaces:**

- Consumes: Existing source-of-truth ordering in `project-map.md` and surface boundaries in `vertical-slice-checklist.md`.
- Produces: Tool-neutral handoff fields that any approved plan/executor can consume.
- Produces: Corepack-first runnable examples without a new package-manager wrapper.
- Produces: `.waygent/` exclusion from Graphify input.

- [ ] **Step 1: Capture current duplication and package-manager drift**

Run:

```bash
rg -n 'readiness|clean test|pnpm --dir front' .claude/commands/release-readiness.md
rg -n -F 'npx --yes pnpm@10.33.0' \
  docs/development/project-map.md \
  docs/development/performance-budget.md
rg -n '^\.waygent/$' .graphifyignore || true
```

Expected:

- The Claude command duplicates the checklist and surface commands.
- Project map and performance budget use direct `npx pnpm` instead of Corepack-first examples.
- `.waygent/` is absent from `.graphifyignore`.

- [ ] **Step 2: Reduce the Claude command to a true pointer**

Replace `.claude/commands/release-readiness.md` with:

```markdown
---
description: Review the current branch for ReadMates release readiness against its base
argument-hint: "[base-ref, default origin/main]"
---

Review `${ARGUMENTS:-origin/main}..HEAD` as a whole branch diff.

Follow the current root `AGENTS.md` and `docs/development/release-readiness-review.md`. Report findings by severity, checks actually run, skipped validation, and residual risk. Do not substitute the latest implementation plan or the last commit for the branch range.
```

Do not copy frontend, server, E2E, or public-release commands back into this file.

- [ ] **Step 3: Add the project-specific handoff contract to existing docs**

Add this section to `docs/development/project-map.md` after “변경 유형별 읽는 순서”:

```markdown
## 계획에서 실행으로 넘길 때

사용하는 planning 또는 execution tool과 무관하게 ReadMates handoff에는 다음을 남깁니다.

- requirement와 task의 대응 관계;
- task dependency와 예상 수정 파일;
- frontend, BFF, server, migration, deploy, public-safety 중 실제 영향 표면;
- focused acceptance command와 PR-level evidence;
- non-goal, skipped validation, release-operation 후속 작업;
- 병렬 작업의 file ownership과 shared DB/container/build-output 충돌 여부.

Executor 이름, 개인 skill 경로, model, auth, MCP 상태는 plan source of truth로 기록하지 않습니다.
```

Add this opening section to `docs/development/vertical-slice-checklist.md`:

```markdown
## 0. Handoff

- Requirement마다 구현 task와 acceptance evidence가 연결되어 있습니다.
- Task dependency와 예상 수정 파일이 명시되어 있습니다.
- Parallel task는 같은 파일, database, container, fixture directory, build output을 공유하지 않습니다.
- Executor-specific state, 개인 경로, model/auth/MCP 설정이 제품 계약에 포함되지 않습니다.
- Non-goal, skipped validation, deploy 이후 operator follow-up이 구분되어 있습니다.
```

Add one root-router sentence that spec/plan work reads `project-map.md` and `vertical-slice-checklist.md`, and one release sentence that `vMAJOR.MINOR.PATCH` tags—not a new `VERSION` file—remain authoritative.

- [ ] **Step 4: Correct Corepack-first runnable examples**

Use this install block in `docs/development/local-setup.md`:

```bash
corepack pnpm install --frozen-lockfile
```

Immediately document the existing fallback without adding another wrapper:

```bash
npx --yes corepack@0.35.0 pnpm install --frozen-lockfile
```

Use `corepack pnpm` for every performance-budget command:

```bash
corepack pnpm --dir front build
corepack pnpm --dir front build:budget
corepack pnpm --dir front performance:budget
corepack pnpm --dir front lighthouse:preview -- --group public --limit 2
```

Replace the project-map direct-pnpm sentence with:

```markdown
Lockfile, install, build, or CI-parity work uses the root `packageManager` through Corepack. Use `corepack pnpm ...`; if `corepack` is not on `PATH`, use `npx --yes corepack@0.35.0 pnpm ...` and report the exact fallback command.
```

- [ ] **Step 5: Exclude confirmed local orchestration state from Graphify**

Add exactly this ignore entry beside the other local tool-state directories:

```text
.waygent/
```

Update `docs/development/graphify.md` to name `.waygent/` as local orchestration/cache state and keep this fallback sequence:

```markdown
1. Run `graphify update .` before a scoped cross-surface query when the local graph may be stale.
2. If Graphify is unavailable or update/query fails, inspect current code, tests, migrations, scripts, and active docs directly.
3. Never treat Graphify output as current product truth without opening the referenced files.
```

- [ ] **Step 6: Verify the consolidated guidance**

Run:

```bash
set -e
if rg -n 'clean test|pnpm --dir front|build-public-release-candidate' .claude/commands/release-readiness.md; then
  exit 1
fi
if rg -n -F 'npx --yes pnpm@10.33.0' \
  docs/development/project-map.md \
  docs/development/performance-budget.md; then
  exit 1
fi
rg -n '^\.waygent/$' .graphifyignore
graphify update .
graphify query "which files define agent routing, plan handoff, server verification, and release readiness?"
git diff --check -- \
  AGENTS.md \
  .claude/commands/release-readiness.md \
  docs/development/project-map.md \
  docs/development/vertical-slice-checklist.md \
  docs/development/local-setup.md \
  docs/development/performance-budget.md \
  docs/development/graphify.md \
  .graphifyignore
```

Expected:

- Claude-command search returns no duplicated runnable commands.
- Direct `npx pnpm` search returns no results.
- `.waygent/` is present exactly once.
- Graphify update and scoped query exit zero; findings are verified against actual files before reporting.
- Diff check passes.

- [ ] **Step 7: Commit the guidance consolidation**

```bash
git add \
  AGENTS.md \
  .claude/commands/release-readiness.md \
  docs/development/project-map.md \
  docs/development/vertical-slice-checklist.md \
  docs/development/local-setup.md \
  docs/development/performance-budget.md \
  docs/development/graphify.md \
  .graphifyignore
git commit -m "docs: consolidate project agent guidance"
```

---

### Task 3: Split The Active Release Checklist From Historical Evidence

**Files:**

- Create: `docs/reports/2026-07-11-release-readiness-history.md`
- Modify: `docs/development/release-readiness-review.md`
- Modify: `docs/reports/README.md`

Depends on: Task 2

**Interfaces:**

- Consumes: Existing dated closeout notes at current `docs/development/release-readiness-review.md:3-632`.
- Produces: A dated immutable history report and an active checklist under the unchanged checklist path.
- Produces: Active server recommendation `./scripts/server-ci-check.sh`, with explicit integration selection when applicable.

- [ ] **Step 1: Capture the oversized active-document evidence**

Run:

```bash
wc -l -c docs/development/release-readiness-review.md
rg -n '^## 기본 범위$' docs/development/release-readiness-review.md
```

Expected:

- The document is 726 lines and approximately 120 KiB.
- The active procedure begins at line 633.

- [ ] **Step 2: Create the dated history snapshot**

Create `docs/reports/2026-07-11-release-readiness-history.md` with this header:

```markdown
# Release Readiness History Through 2026-07-11

이 문서는 2026-07-11 이전에 `docs/development/release-readiness-review.md`에 누적된 시점별 closeout evidence를 보존한 snapshot입니다. 현재 release 절차나 canonical command의 source of truth가 아니며, 현재 판단에는 코드, scripts, CI, active checklist를 다시 확인합니다.

```

Append the original source lines 3 through 632 verbatim after the header. Do not rewrite old command evidence, dates, counts, residual-risk wording, or CPE references.

- [ ] **Step 3: Reduce the active checklist**

Rewrite `docs/development/release-readiness-review.md` as:

```markdown
# ReadMates Release Readiness Review

이 문서는 현재 branch의 ReadMates-specific release risk를 검토하는 active checklist입니다. 2026-07-11 이전의 dated evidence는 [`docs/reports/2026-07-11-release-readiness-history.md`](../reports/2026-07-11-release-readiness-history.md)에 보존되어 있으며 현재 절차의 source of truth가 아닙니다.

```

Append the original source lines 633 through 726, then replace its normative server block with:

```bash
./scripts/server-ci-check.sh
```

Add this sentence after the block:

```markdown
Persistence, migration, API contract, query budget, or Testcontainers behavior changes also require the relevant focused test or `./server/gradlew -p server integrationTest`.
```

Keep the checklist ReadMates-specific: branch/base range, CHANGELOG, deployed/scanned artifact identity, operator surprise, security fallback/audit loss, architecture baseline debt, clean public candidate, DB/API deployment order, findings format, and completion criteria.

- [ ] **Step 4: Register the history report**

Add this row to `docs/reports/README.md`:

```markdown
| 2026-07-11 | [`2026-07-11-release-readiness-history.md`](2026-07-11-release-readiness-history.md) | 2026-07-11 이전 release-readiness closeout evidence snapshot; 현재 절차는 development checklist를 사용 |
```

- [ ] **Step 5: Verify lossless history and active-document size**

Run:

```bash
set -e
expected_history=$(mktemp)
actual_history=$(mktemp)
trap 'rm -f "$expected_history" "$actual_history"' EXIT
git show e967b232596f4f04fe9ad304e704624f70fd29ba:docs/development/release-readiness-review.md | sed -n '3,632p' > "$expected_history"
sed -n '5,$p' docs/reports/2026-07-11-release-readiness-history.md > "$actual_history"
diff -u "$expected_history" "$actual_history"
test "$(wc -c < docs/development/release-readiness-review.md)" -lt 20480
rg -n '^## 기본 범위$|^## 필수 확인 항목$|^## DB/API 릴리즈 추가 체크리스트$|^## 권장 명령$|^## 출력 형식$|^## 완료 기준$' \
  docs/development/release-readiness-review.md
git diff --check -- \
  docs/development/release-readiness-review.md \
  docs/reports/2026-07-11-release-readiness-history.md \
  docs/reports/README.md
```

Expected:

- `diff` exits zero: all old dated evidence is preserved byte-for-byte.
- Active checklist is under 20 KiB.
- All six active sections remain.
- Diff check passes.

- [ ] **Step 6: Commit the release documentation split**

```bash
git add \
  docs/development/release-readiness-review.md \
  docs/reports/2026-07-11-release-readiness-history.md \
  docs/reports/README.md
git commit -m "docs: separate release checklist from history"
```

---

### Task 4: Add A Narrow Deterministic Guidance Checker

**Files:**

- Create: `scripts/check-agent-guidance.py`

Depends on: Task 3

**Interfaces:**

- Produces: CLI `python3 scripts/check-agent-guidance.py` returning `0` only when repository guidance invariants and staged guidance safety pass.
- Produces: CLI `python3 scripts/check-agent-guidance.py --self-test` using temporary positive/negative fixtures.
- Consumes: `scripts/public-release-check.sh <temporary-tree>` for all secret/private-path scanning.
- Does not consume: live Codex, LLM, user-local skills, auth, MCP, config, plugin, or connector state.

- [ ] **Step 1: Write the self-test-first scaffold**

Create `scripts/check-agent-guidance.py` with these imports, constants, fixture builder, and tests. The first run must fail because `run_checks` is not implemented yet.

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

INSTRUCTION_LIMIT = 32 * 1024
RELEASE_CHECKLIST_LIMIT = 20 * 1024
STALE_SERVER_COMMAND = "./server/gradlew -p server clean test"
CANONICAL_SERVER_COMMAND = "./scripts/server-ci-check.sh"
DIRECT_PNPM_RE = re.compile(r"\bnpx --yes pnpm@\d")
MARKDOWN_LINK_RE = re.compile(r"!?\[[^]]+\]\(([^)]+)\)")
SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")

REQUIRED_PATHS = (
    "AGENTS.md",
    "front/AGENTS.md",
    "CLAUDE.md",
    "front/CLAUDE.md",
    ".claude/settings.json",
    ".claude/commands/release-readiness.md",
    ".impeccable.md",
    "docs/agents/front.md",
    "docs/agents/server.md",
    "docs/agents/design.md",
    "docs/agents/docs.md",
    "docs/development/project-map.md",
    "docs/development/vertical-slice-checklist.md",
    "docs/development/release-readiness-review.md",
    "docs/reports/2026-07-11-release-readiness-history.md",
    ".graphifyignore",
    "scripts/README.md",
    "scripts/public-release-check.sh",
)

NORMATIVE_COMMAND_PATHS = (
    "AGENTS.md",
    "README.md",
    "docs/agents/server.md",
    "docs/deploy/README.md",
    "docs/deploy/compose-stack.md",
    "docs/deploy/release-publish-runbook.md",
    "docs/development/adr/0002-server-clean-architecture-with-archunit.md",
    "docs/development/adr/0007-mysql-with-flyway-over-alternatives.md",
    "docs/development/project-map.md",
    "docs/development/release-management.md",
    "docs/development/release-readiness-review.md",
    "docs/development/technical-decisions.md",
    "docs/development/test-guide.md",
    "scripts/README.md",
)
DIRECT_PNPM_FORBIDDEN_PATHS = (
    "docs/development/local-setup.md",
    "docs/development/performance-budget.md",
    "docs/development/project-map.md",
)
SERVER_GATE_REQUIRED_PATHS = (
    "AGENTS.md",
    "README.md",
    "docs/agents/server.md",
    "docs/deploy/README.md",
    "docs/deploy/compose-stack.md",
    "docs/deploy/release-publish-runbook.md",
    "docs/development/adr/0002-server-clean-architecture-with-archunit.md",
    "docs/development/project-map.md",
    "docs/development/release-management.md",
    "docs/development/release-readiness-review.md",
    "docs/development/technical-decisions.md",
    "docs/development/test-guide.md",
    "scripts/README.md",
)
GUIDANCE_PATHS = tuple(
    sorted(
        set(REQUIRED_PATHS + NORMATIVE_COMMAND_PATHS + DIRECT_PNPM_FORBIDDEN_PATHS)
        - {
            "scripts/public-release-check.sh",
            "docs/reports/2026-07-11-release-readiness-history.md",
        }
    )
)


def write(root: Path, relative: str, content: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def make_valid_fixture(root: Path) -> None:
    paths = set(REQUIRED_PATHS + NORMATIVE_COMMAND_PATHS + DIRECT_PNPM_FORBIDDEN_PATHS)
    for relative in paths:
        write(root, relative, "# Guidance\n")
    for relative in SERVER_GATE_REQUIRED_PATHS:
        write(root, relative, f"# Guidance\n\n```bash\n{CANONICAL_SERVER_COMMAND}\n```\n")
    write(root, "CLAUDE.md", "@AGENTS.md\n")
    write(root, "front/CLAUDE.md", "@AGENTS.md\n")
    write(root, ".graphifyignore", ".waygent/\n")
    write(
        root,
        "docs/development/release-readiness-review.md",
        f"# Active checklist\n\n{CANONICAL_SERVER_COMMAND}\n",
    )
    write(root, "docs/reports/2026-07-11-release-readiness-history.md", "# History\n")
    write(root, "scripts/public-release-check.sh", "#!/usr/bin/env bash\nexit 0\n")


class GuidanceCheckerTests(unittest.TestCase):
    def check_fixture(self, mutate=None) -> list[str]:
        with tempfile.TemporaryDirectory(prefix="readmates-guidance-test-") as raw:
            root = Path(raw)
            make_valid_fixture(root)
            if mutate is not None:
                mutate(root)
            return run_checks(root, run_public_scan=False)

    def test_valid_fixture(self) -> None:
        self.assertEqual([], self.check_fixture())

    def test_broken_link_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "docs/development/project-map.md", "[missing](missing.md)\n")
        )
        self.assertTrue(any("broken link" in error for error in errors), errors)

    def test_runnable_clean_test_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/project-map.md",
                f"```bash\n{STALE_SERVER_COMMAND}\n```\n{CANONICAL_SERVER_COMMAND}\n",
            )
        )
        self.assertTrue(any("stale server command" in error for error in errors), errors)

    def test_explanatory_clean_test_is_allowed(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/test-guide.md",
                f"Do not use `{STALE_SERVER_COMMAND}` as evidence.\n{CANONICAL_SERVER_COMMAND}\n",
            )
        )
        self.assertFalse(any("stale server command" in error for error in errors), errors)

    def test_direct_pnpm_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/performance-budget.md",
                "```bash\nnpx --yes pnpm@10.33.0 --dir front build\n```\n",
            )
        )
        self.assertTrue(any("direct pnpm" in error for error in errors), errors)

    def test_oversized_instruction_chain_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(root, "AGENTS.md", "x" * (INSTRUCTION_LIMIT + 1))
        )
        self.assertTrue(any("instruction chain" in error for error in errors), errors)

    def test_missing_waygent_exclusion_fails(self) -> None:
        errors = self.check_fixture(lambda root: write(root, ".graphifyignore", "graphify-out/\n"))
        self.assertTrue(any(".waygent/" in error for error in errors), errors)

    def test_oversized_release_checklist_fails(self) -> None:
        errors = self.check_fixture(
            lambda root: write(
                root,
                "docs/development/release-readiness-review.md",
                "x" * (RELEASE_CHECKLIST_LIMIT + 1),
            )
        )
        self.assertTrue(any("release checklist" in error for error in errors), errors)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GuidanceCheckerTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
```

- [ ] **Step 2: Run the scaffold to verify RED**

Run:

```bash
set -e
python3 scripts/check-agent-guidance.py --self-test
```

Expected: FAIL with `NameError: name 'run_checks' is not defined`.

- [ ] **Step 3: Implement the checker functions**

Insert these functions before `GuidanceCheckerTests`:

```python
def fenced_lines(text: str) -> list[str]:
    lines: list[str] = []
    inside = False
    for raw in text.splitlines():
        if raw.lstrip().startswith("```"):
            inside = not inside
            continue
        if inside:
            lines.append(raw.strip())
    return lines


def check_required_paths(root: Path) -> list[str]:
    return [
        f"missing required path: {relative}"
        for relative in REQUIRED_PATHS
        if not (root / relative).is_file()
    ]


def check_markdown_links(root: Path) -> list[str]:
    errors: list[str] = []
    for relative in GUIDANCE_PATHS:
        source = root / relative
        if not source.is_file() or source.suffix != ".md":
            continue
        for raw in MARKDOWN_LINK_RE.findall(source.read_text(encoding="utf-8")):
            target = raw.strip().strip("<>")
            if not target or target.startswith("#") or SCHEME_RE.match(target):
                continue
            target_path = target.split("#", 1)[0]
            if target_path and not (source.parent / target_path).resolve().exists():
                errors.append(f"broken link: {relative} -> {target_path}")
    return errors


def check_instruction_chains(root: Path) -> list[str]:
    errors: list[str] = []
    chains = {
        "root": ("AGENTS.md",),
        "front": ("AGENTS.md", "front/AGENTS.md"),
    }
    for name, paths in chains.items():
        total = sum(
            (root / relative).stat().st_size
            for relative in paths
            if (root / relative).is_file()
        )
        if total >= INSTRUCTION_LIMIT:
            errors.append(
                f"instruction chain {name} is {total} bytes; must be below {INSTRUCTION_LIMIT}"
            )
    return errors


def check_normative_commands(root: Path) -> list[str]:
    errors: list[str] = []
    for relative in NORMATIVE_COMMAND_PATHS:
        path = root / relative
        if path.is_file() and STALE_SERVER_COMMAND in fenced_lines(path.read_text(encoding="utf-8")):
            errors.append(f"stale server command in runnable block: {relative}")
    for relative in DIRECT_PNPM_FORBIDDEN_PATHS:
        path = root / relative
        if path.is_file() and DIRECT_PNPM_RE.search(path.read_text(encoding="utf-8")):
            errors.append(f"direct pnpm bypasses Corepack-first policy: {relative}")
    for relative in SERVER_GATE_REQUIRED_PATHS:
        path = root / relative
        if path.is_file() and CANONICAL_SERVER_COMMAND not in path.read_text(encoding="utf-8"):
            errors.append(f"canonical server gate missing: {relative}")
    return errors


def check_pointer_contract(root: Path) -> list[str]:
    errors: list[str] = []
    for relative in ("CLAUDE.md", "front/CLAUDE.md"):
        path = root / relative
        if path.is_file() and path.read_text(encoding="utf-8") != "@AGENTS.md\n":
            errors.append(f"pointer contract violation: {relative}")
    return errors


def check_graphify_ignore(root: Path) -> list[str]:
    path = root / ".graphifyignore"
    if not path.is_file():
        return []
    lines = {line.strip() for line in path.read_text(encoding="utf-8").splitlines()}
    return [] if ".waygent/" in lines else [".graphifyignore must contain .waygent/"]


def check_release_docs(root: Path) -> list[str]:
    active = root / "docs/development/release-readiness-review.md"
    history = root / "docs/reports/2026-07-11-release-readiness-history.md"
    errors: list[str] = []
    if active.is_file() and active.stat().st_size >= RELEASE_CHECKLIST_LIMIT:
        errors.append(
            f"release checklist is {active.stat().st_size} bytes; must be below {RELEASE_CHECKLIST_LIMIT}"
        )
    if not history.is_file():
        errors.append("release readiness history report is missing")
    return errors


def run_guidance_public_scan(root: Path) -> list[str]:
    scanner = root / "scripts/public-release-check.sh"
    if not scanner.is_file():
        return ["public release scanner is missing"]
    with tempfile.TemporaryDirectory(prefix="readmates-guidance-scan-") as raw:
        staged = Path(raw)
        for relative in GUIDANCE_PATHS:
            source = root / relative
            if not source.is_file():
                continue
            destination = staged / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        result = subprocess.run(
            [str(scanner), str(staged)],
            cwd=root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        if result.returncode != 0:
            return ["guidance public-safety scan failed:\n" + result.stdout.rstrip()]
    return []


def run_checks(root: Path, *, run_public_scan: bool) -> list[str]:
    errors: list[str] = []
    errors.extend(check_required_paths(root))
    errors.extend(check_markdown_links(root))
    errors.extend(check_instruction_chains(root))
    errors.extend(check_normative_commands(root))
    errors.extend(check_pointer_contract(root))
    errors.extend(check_graphify_ignore(root))
    errors.extend(check_release_docs(root))
    if run_public_scan and not errors:
        errors.extend(run_guidance_public_scan(root))
    return errors
```

- [ ] **Step 4: Replace the temporary self-test runner with the CLI entrypoint**

Replace the temporary `if __name__ == "__main__"` block with this code after `GuidanceCheckerTests`:

```python
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check ReadMates agent guidance invariants")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run temporary positive/negative fixtures",
    )
    args = parser.parse_args(argv)

    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(GuidanceCheckerTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1

    root = Path(__file__).resolve().parent.parent
    errors = run_checks(root, run_public_scan=True)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("ReadMates agent guidance check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Verify GREEN and repository compliance**

Run:

```bash
set -e
python3 scripts/check-agent-guidance.py --self-test
python3 scripts/check-agent-guidance.py
python3 -m py_compile scripts/check-agent-guidance.py
```

Expected:

- Eight self-tests pass, including the explanatory negative example.
- Repository mode prints `ReadMates agent guidance check passed.`
- Python compilation exits zero.
- The staged safety scan is executed by the existing public-release scanner; no duplicate regex exists in the Python file.

- [ ] **Step 6: Commit the checker**

```bash
git add scripts/check-agent-guidance.py
git commit -m "test: enforce agent guidance consistency"
```

---

### Task 5: Wire The Checker Into CI And Pre-Push, Then Verify The Whole Change

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/pre-push-check.sh`
- Modify: `scripts/README.md`

Depends on: Task 4

**Interfaces:**

- Consumes: `python3 scripts/check-agent-guidance.py` from Task 4.
- Produces: One fast deterministic check in the existing CI `scripts` job.
- Produces: One unconditional pre-push structural/safety check before package-manager activation.

- [ ] **Step 1: Add the checker to the existing CI scripts job**

Insert this step immediately after checkout and before ShellCheck installation:

```yaml
      - name: Agent guidance contract
        run: python3 scripts/check-agent-guidance.py
```

Do not create a new CI job and do not call Codex, an LLM, a connector, or a user-local skill.

- [ ] **Step 2: Run the checker before package-manager activation in pre-push**

Insert this line after the CHANGELOG guard and before `Activate repo package manager`:

```bash
run_step "Agent guidance contract" python3 scripts/check-agent-guidance.py
```

Run it unconditionally. Do not expand `should_run_public_release_check` for guidance-only files; those files are intentionally excluded from the clean candidate, and their source safety is already checked through the staged guidance scan.

- [ ] **Step 3: Document the checker without creating another workflow guide**

Add a `check-agent-guidance.py` section to `scripts/README.md` before `server-ci-check.sh` with this content:

```markdown
Agent router, active guide links, instruction-chain size, canonical server/Corepack commands, release-checklist size, Graphify local-state exclusion, and tracked-guidance public safety are checked with `python3 scripts/check-agent-guidance.py`. Run `python3 scripts/check-agent-guidance.py --self-test` for the temporary positive/negative fixtures.

The checker stages only tracked guidance into a temporary directory and delegates content safety to `public-release-check.sh`; it does not maintain a second secret-pattern engine or inspect user-local Codex configuration.
```

- [ ] **Step 4: Run focused static verification**

Run:

```bash
set -e
python3 scripts/check-agent-guidance.py --self-test
python3 scripts/check-agent-guidance.py
python3 -m py_compile scripts/check-agent-guidance.py
bash -n scripts/*.sh
shellcheck scripts/*.sh
READMATES_SERVER_CI_CHECK_DRY_RUN=true ./scripts/server-ci-check.sh
./scripts/pre-push-check.sh --dry-run --no-release
git diff --check
```

Expected:

- Checker self-tests and repository check pass.
- Python, Bash, and ShellCheck pass.
- Server dry-run prints one Gradle `check` command.
- Pre-push dry-run lists the guidance contract before package-manager activation and exits zero.
- Git diff check passes.

- [ ] **Step 5: Run public-release and Graphify verification**

Run serially:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
graphify update .
graphify query "which files define agent routing, plan handoff, server verification, and release readiness?"
```

Expected:

- Clean candidate build exits zero.
- Existing public-release scanner exits zero for the candidate.
- Graphify update and scoped query exit zero.
- Query results point to current router, guides, scripts, and active release checklist; each cited finding is verified by opening the actual file.

- [ ] **Step 6: Perform the whole-diff release review**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat f8bbf760..HEAD
git diff --check f8bbf760..HEAD
if rg -n -F './server/gradlew -p server clean test' \
  AGENTS.md \
  README.md \
  docs/agents/server.md \
  docs/deploy/README.md \
  docs/deploy/compose-stack.md \
  docs/deploy/release-publish-runbook.md \
  docs/development/project-map.md \
  docs/development/release-management.md \
  docs/development/release-readiness-review.md \
  docs/development/technical-decisions.md; then
  exit 1
fi
```

Expected:

- Diff is limited to approved guidance, docs, scripts, and CI surfaces.
- No runnable normative stale server command remains in the listed files.
- Historical evidence remains only in the dated history and other historical directories.
- No application code, migration, model/auth/MCP config, repo skill, custom agent, hook, rule, plugin, or automation was added.

- [ ] **Step 7: Commit CI and pre-push integration**

```bash
git add .github/workflows/ci.yml scripts/pre-push-check.sh scripts/README.md
git commit -m "ci: check agent guidance consistency"
```

- [ ] **Step 8: Final verification after the last commit**

Verification:

```bash
set -e
python3 scripts/check-agent-guidance.py --self-test
python3 scripts/check-agent-guidance.py
./scripts/server-ci-check.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check f8bbf760..HEAD
git status --short --branch
```

Expected:

- All commands exit zero.
- Worktree is clean.
- Final report names exact commands, results, skipped production/deploy validation, and residual risk.
- Production deployment, OAuth/provider-console checks, release tagging, and external publication remain explicitly outside this local implementation.
