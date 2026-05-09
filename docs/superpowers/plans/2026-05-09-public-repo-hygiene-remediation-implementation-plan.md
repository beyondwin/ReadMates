# Public Repo Hygiene Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove tracked agent-local artifacts and workstation absolute paths from the public repository while explicitly excluding ignored local files from this remediation scope.

**Architecture:** This is a docs/repository hygiene change only. The patch removes local agent state from Git tracking, updates ignore policy so it stays local, and sanitizes one tracked documentation file to use repo-relative paths.

**Tech Stack:** Git, Bash, Markdown, ReadMates public release scanner, gitleaks.

---

## Scope

This plan implements `docs/superpowers/specs/2026-05-09-public-repo-hygiene-remediation-spec.md`.

In scope:

- `.gitignore`
- `.orchestrator/` tracked files
- `.claude/settings.json`
- `docs/improvements.md`

Out of scope:

- ignored local files such as `.server-config/`, `.wrangler/`, `.gstack/`, `.tmp/`, `docs/private/`
- Git history rewrite or force-push
- production secret rotation
- dependency scanner/SBOM hardening

## File Structure

- Modify: `.gitignore`
  - Add `.orchestrator/`.
  - Normalize `.claude` to `.claude/` if needed.
- Remove from Git index: `.orchestrator/**`
  - Keep local files if desired; they are agent state, not project source.
- Remove from Git index: `.claude/settings.json`
  - Keep local file if desired; `.claude/` should remain ignored.
- Modify: `docs/improvements.md`
  - Replace workstation absolute paths with repo-relative paths.

---

## Task 0: Baseline Check

**Files:**
- Read-only: `.gitignore`
- Read-only: `.orchestrator/state.json`
- Read-only: `.claude/settings.json`
- Read-only: `docs/improvements.md`

- [x] **Step 1: Confirm worktree state**

Run:

```bash
git status --short --untracked-files=all
```

Expected:

- Existing unrelated changes may be present.
- Do not revert user changes.
- If `.gitignore` already has `.claude`, keep that user change and normalize it in Task 1.

- [x] **Step 2: Confirm tracked agent-local files**

Run:

```bash
git ls-files .orchestrator .claude
```

Expected before remediation:

```text
.claude/settings.json
.orchestrator/docs_prompts/phase_0.txt
...
```

The exact `.orchestrator/` list may differ. Any output under `.orchestrator/` or `.claude/` is remediation target.

- [x] **Step 3: Confirm local path findings**

Run:

```bash
local_path_pattern='/U''sers/|/h''ome/[^/]+/|C:\\U''sers\\'
git grep -n -I -E "$local_path_pattern" -- . ':!front/pnpm-lock.yaml'
```

Expected before remediation:

- Hits in `.orchestrator/**`.
- Hits in `docs/improvements.md`.
- No product source hits.

If product source files contain workstation absolute paths, stop and extend the spec before editing.

---

## Task 1: Update Ignore Policy

**Files:**
- Modify: `.gitignore`

- [x] **Step 1: Edit the local tooling ignore block**

Change the bottom of `.gitignore` so the local tooling/output block includes both `.claude/` and `.orchestrator/`.

Target block:

```gitignore
.wrangler
.cloudflare
.vercel
.gstack/
.tmp
.idea
.playwright-mcp
docs/private/
.server-config/
.claude/
.orchestrator/
```

If the file currently has `.claude` without a trailing slash, replace it with `.claude/`.

- [x] **Step 2: Verify ignore syntax**

Run:

```bash
git diff --check -- .gitignore
git diff -- .gitignore
```

Expected:

- `git diff --check` exits 0.
- Diff only adds `.orchestrator/` and normalizes `.claude/`.
- Existing ignore entries remain unchanged.

- [x] **Step 3: Commit ignore policy**

Run:

```bash
git add .gitignore
git commit -m "chore: ignore local agent artifacts"
```

Expected:

- Commit succeeds.
- If this work is being batched into one PR without intermediate commits, stage the file and continue instead.

---

## Task 2: Remove Agent Artifacts From Git Tracking

**Files:**
- Remove from Git index: `.orchestrator/**`
- Remove from Git index: `.claude/settings.json`

- [x] **Step 1: Remove tracked files from the index while preserving local copies**

Run:

```bash
git rm --cached -r .orchestrator
git rm --cached .claude/settings.json
```

Expected:

- Git records deletions for `.orchestrator/**` and `.claude/settings.json`.
- Files may remain on disk as ignored local files.
- No product source files are removed.

If a path is already absent from the index, the command may report that it did not match any files. Continue only after `git ls-files .orchestrator .claude` prints nothing.

- [x] **Step 2: Verify tracking removal**

Run:

```bash
git ls-files .orchestrator .claude
git status --short -- .orchestrator .claude .gitignore
```

Expected:

```text
```

for `git ls-files .orchestrator .claude`.

Expected `git status` shape:

```text
D  .claude/settings.json
D  .orchestrator/...
```

The exact `.orchestrator` deletion list depends on tracked files.

- [x] **Step 3: Confirm ignored local copies do not reappear as untracked**

Run:

```bash
git status --short --untracked-files=all -- .orchestrator .claude
```

Expected:

- No `?? .orchestrator/...` output.
- No `?? .claude/...` output.

If ignored local files appear as untracked, fix `.gitignore` before continuing.

- [x] **Step 4: Commit tracking removal**

Run:

```bash
git add -u .orchestrator .claude
git commit -m "chore: stop tracking local agent state"
```

Expected:

- Commit succeeds.
- If batching commits, keep the staged deletions and continue.

---

## Task 3: Sanitize `docs/improvements.md`

**Files:**
- Modify: `docs/improvements.md`

- [x] **Step 1: Replace the DX absolute-path sentence**

Find the bullet that says the docs rely on a workstation path such as an absolute local source directory. Replace it with this text:

```markdown
- **(DX P2)** README/agents 문서는 풍부하지만 특정 workstation cwd에 의존하지 않고도 안전하게 동작하도록 한 곳에서 통합된 `Makefile` 또는 `Justfile`가 없고, 단일 명령어로 `lint+test+build+e2e` 통합 실행을 제공하지 않는다. Server는 Gradle alias도 없다.
```

- [x] **Step 2: Replace the referenced-location section**

Find the section headed `- **본 보고서가 참조한 위치**(절대 경로):` and replace that bullet group with this repo-relative version:

```markdown
- **본 보고서가 참조한 위치**(repo-relative path):
  - 보안 리포트: `.gstack/security-reports/2026-04-27-194155+0900-readmates-security-posture.md` (local ignored report)
  - 아키텍처 SoT: `docs/development/architecture.md`
  - 서버 entry: `server/build.gradle.kts`, `server/src/main/resources/application.yml`
  - 보안 wiring: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`, `BffSecretFilter.kt`, `RateLimitFilter.kt`
  - 거대 파일 후보:
    - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt` (612 LOC)
    - `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt` (576)
    - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryQueries.kt` (574)
    - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteOperations.kt` (540)
    - `front/features/archive/ui/archive-page.tsx` (1074)
    - `front/features/host/ui/host-session-editor.tsx` (857)
    - `front/features/host/ui/host-notifications-page.tsx` (856)
    - `front/features/current-session/ui/current-session-mobile.tsx` (798)
  - CI 워크플로우: `.github/workflows/{ci,deploy-front,deploy-server}.yml`
  - BFF: `front/functions/api/bff/[[path]].ts`, `front/functions/_shared/proxy.ts`
  - DB 마이그레이션: `server/src/main/resources/db/mysql/migration/` (V1, V9~V22)
  - `.gitleaks.toml`: `.gitleaks.toml`
```

- [x] **Step 3: Verify no workstation paths remain in the file**

Run:

```bash
local_path_pattern='/U''sers/|/h''ome/[^/]+/|C:\\U''sers\\'
git grep -n -I -E "$local_path_pattern" -- docs/improvements.md
```

Expected:

```text
```

- [x] **Step 4: Verify markdown whitespace**

Run:

```bash
git diff --check -- docs/improvements.md
git diff -- docs/improvements.md
```

Expected:

- `git diff --check` exits 0.
- Diff contains only path wording/path-format changes.

- [x] **Step 5: Commit docs sanitization**

Run:

```bash
git add docs/improvements.md
git commit -m "docs: use repo-relative paths in improvement notes"
```

Expected:

- Commit succeeds.
- If batching commits, stage the file and continue.

---

## Task 4: Public-Safety Verification

**Files:**
- Verify: `.gitignore`
- Verify: `docs/improvements.md`
- Verify: Git tracked tree
- Verify: `.tmp/public-release-candidate`

- [x] **Step 1: Verify no tracked agent-local paths remain**

Run:

```bash
git ls-files | rg '(^|/)\.orchestrator/|^\.claude/'
```

Expected:

```text
```

- [x] **Step 2: Verify tracked files have no workstation absolute paths**

Run:

```bash
local_path_pattern='/U''sers/|/h''ome/[^/]+/|C:\\U''sers\\'
git grep -n -I -E "$local_path_pattern" -- . ':!front/pnpm-lock.yaml'
```

Expected:

```text
```

- [x] **Step 3: Verify changed docs and ignore file have no whitespace errors**

Run:

```bash
git diff --check -- .gitignore docs/improvements.md \
  docs/superpowers/specs/2026-05-09-public-repo-hygiene-remediation-spec.md \
  docs/superpowers/plans/2026-05-09-public-repo-hygiene-remediation-implementation-plan.md
```

Expected:

- Exit 0.

- [x] **Step 4: Build and scan clean public release candidate**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

- Candidate build succeeds.
- Candidate check prints `Public-release check passed.`
- `gitleaks dir` inside the candidate check prints `no leaks found`.

- [x] **Step 5: Scan tracked HEAD archive with gitleaks**

Run after committing the remediation:

```bash
tmp="$(mktemp -d)"
git archive HEAD | tar -x -C "$tmp"
gitleaks dir "$tmp" --config "$tmp/.gitleaks.toml" --no-banner --redact=100 --verbose
rm -rf "$tmp"
```

Expected:

- `gitleaks` exits 0.
- Output includes `no leaks found`.

Do not use no-argument `./scripts/public-release-check.sh` as the required pass/fail gate for this task while ignored local secret backups remain in the workspace. That mode may scan ignored files through `gitleaks dir .`, which is outside this remediation scope.

- [x] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected:

- Only intended staged/committed changes are present.
- Ignored local files are not listed.

---

## Task 5: PR / Final Response Content

**Files:**
- No file changes required unless preparing a PR description.

- [x] **Step 1: Summarize changed surface**

Use this summary:

```markdown
Changed surface: repository hygiene and docs.

- Removed `.orchestrator/**` and `.claude/settings.json` from Git tracking.
- Added `.orchestrator/` and `.claude/` to `.gitignore`.
- Replaced workstation absolute paths in `docs/improvements.md` with repo-relative paths.
```

- [x] **Step 2: List validation**

Use this validation list:

```markdown
Validation run:

- `git ls-files | rg '(^|/)\.orchestrator/|^\.claude/'`
- `local_path_pattern='/U''sers/|/h''ome/[^/]+/|C:\\U''sers\\'; git grep -n -I -E "$local_path_pattern" -- . ':!front/pnpm-lock.yaml'`
- `git diff --check -- .gitignore docs/improvements.md ...`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- `gitleaks dir <tracked-head-archive> --config <archive>/.gitleaks.toml --redact=100`
```

- [x] **Step 3: Call out skipped validation**

Use this caveat if ignored local secret backups still exist:

```markdown
Skipped as a pass/fail gate: no-argument `./scripts/public-release-check.sh`, because this task explicitly excludes ignored local files and that mode may scan ignored workspace files through `gitleaks dir .`. Clean candidate and tracked HEAD archive scans passed instead.
```

---

## Self-Review Checklist

- [ ] Every requirement in the spec maps to a task:
  - REQ-PH-001 → Task 2
  - REQ-PH-002 → Task 2
  - REQ-PH-003 → Task 3
  - REQ-PH-004 → Task 1
  - REQ-PH-005 → Task 4
- [ ] No task asks the worker to edit ignored local secret files.
- [ ] No task requires history rewrite or force-push.
- [ ] No command prints or stores real secret values.
- [ ] Verification distinguishes clean candidate/tracked archive scans from ignored-file current-tree scans.
