# ReadMates Solo-Admin Branch Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align ReadMates release policy, CODEOWNERS guidance, and GitHub branch protection with the approved hybrid solo-admin operating model.

**Architecture:** This is an operations-policy slice, not application code. The source of truth lives in release docs and CODEOWNERS comments, while the live GitHub branch protection setting is changed with `gh` CLI and verified from the GitHub API before claiming completion.

**Tech Stack:** Markdown docs, GitHub CODEOWNERS, GitHub CLI (`gh`), repository public-release safety scripts.

---

## File Structure

- Modify `docs/development/release-management.md`
  - Owns release flow policy and the branch protection bypass policy operators follow during releases.
- Modify `docs/development/release-readiness-review.md`
  - Owns pre-ship and residual-risk checklist evidence, including DB/API release review evidence.
- Modify `.github/CODEOWNERS`
  - Keeps workflow ownership visible while making solo-admin enforcement expectations explicit.
- Read-only/CLI verify GitHub branch protection
  - `gh api repos/beyondwin/ReadMates/branches/main/protection`
  - Target: keep `Frontend` and `Backend` checks; remove impossible required pull request review/code-owner review until a real non-author reviewer exists.

## Task 1: Update Release Management Branch Policy

**Files:**
- Modify: `docs/development/release-management.md`

- [ ] **Step 1: Verify the current policy section exists**

Run:

```bash
rg -n "Branch protection bypass policy|허용 조건|비허용 조건|Emergency bypass" docs/development/release-management.md
```

Expected: output includes `Branch protection bypass policy`, `허용 조건`, `비허용 조건`, and `Emergency bypass`.

- [ ] **Step 2: Replace the current branch protection policy section**

Edit `docs/development/release-management.md` by replacing the section from `## Branch protection bypass policy` through the paragraph ending with ``./scripts/pre-push-check.sh --release --no-changelog-check`로 emergency override 시에도 위 ledger 기록은 생략하지 않습니다.` with this text:

```markdown
## Branch protection bypass policy

ReadMates `main` branch는 GitHub branch protection 대상입니다. 이 저장소는 단독 운영(solo admin)을 기본 운영 형태로 두므로, branch protection이 실제 reviewer가 없는 self-review를 요구하면 release PR이 구조적으로 막힐 수 있습니다. 정책의 목표는 review 요구를 형식적으로 유지하는 것이 아니라, CI와 release-readiness 증거를 통해 DB/API/auth/deploy 리스크를 추적 가능하게 닫는 것입니다.

### 기본 원칙

- `main`의 필수 CI status check는 유지합니다.
- solo-admin release PR은 명시적인 release-readiness 증거를 남기면 유효한 review artifact로 봅니다.
- branch protection은 실제 non-author reviewer가 없을 때 불가능한 code-owner self-review를 정상 경로로 요구하지 않습니다.
- `.github/workflows/**`, deploy scripts, auth/permission, secret/session/token handling, branch protection 정책 변경은 external-review preferred 표면으로 분류합니다.
- external reviewer가 없는 상태에서 high-control 변경을 ship해야 하면 admin bypass ledger와 release-readiness 증거를 남깁니다.

### Solo-admin evidence path

아래 조건을 모두 만족하면 solo admin이 `main`에 직접 push하거나 solo-admin release PR을 admin merge할 수 있습니다.

- 변경에 DB migration이 포함되지 않습니다 (`server/src/main/resources/db/mysql/migration/` 변경 없음).
- Public API contract(route, request/response schema, error code)가 바뀌지 않습니다.
- Auth, permission, BFF token, OAuth scope, role/visibility model, secret/session/token handling을 건드리지 않습니다.
- Deploy workflow, release automation, branch protection, CODEOWNERS 정책을 바꾸지 않습니다.
- Push 또는 merge 직전에 `./scripts/pre-push-check.sh` 또는 문서화된 release equivalent가 통과했습니다.
- `CHANGELOG.md`와 release-readiness review가 사용자-facing, operator-facing, security posture, deploy behavior 변경을 기록합니다.
- public release 또는 deploy 표면이면 public release candidate check와 post-deploy smoke 결과를 기록합니다.
- 실행하지 못한 검증은 skipped validation과 residual risk로 기록합니다.

### DB/API release PR path

DB migration 또는 public API contract 변경은 direct push 기본 경로가 아닙니다. Release PR을 만들고, CI와 release-readiness review를 통해 다음 증거를 남깁니다.

- 변경된 Flyway migration 파일과 expected direction.
- 변경된 public API route, request/response schema, error code.
- frontend/server/E2E/public-release 검증 명령과 결과.
- 서버 image, Cloudflare Pages, OCI compose promotion, post-deploy smoke 순서.
- rollback 또는 forward-fix 고려사항.
- normal review가 막혔다면 `POLICY_MISMATCH` 사유.

branch protection이 reviewer 부재만으로 막히고 위 증거가 모두 충족되면 admin merge를 허용합니다. `CHECK_FAILURE` 또는 `MISSING_EVIDENCE` 상태에서는 incident 대응을 제외하고 merge하지 않습니다.

### External-review preferred path

다음 표면은 가능한 경우 실제 non-author reviewer를 붙입니다.

- `.github/workflows/**`
- branch protection 또는 CODEOWNERS 정책
- deploy scripts와 release automation
- auth, permission, OAuth, BFF shared secret handling, token/session handling
- secret rotation과 production configuration sync

실제 reviewer가 없고 변경이 필요하면 admin bypass ledger에 사유, 우회한 검증, 후속 보강 계획, release state 검증 위치를 기록합니다.

### Emergency bypass

운영 incident 대응 등 위 조건과 무관하게 bypass가 필요한 경우, push 전 또는 직후에 [bypass ledger](../operations/runbooks/release-bypass-ledger.md) 또는 release note `Deployment Notes`에 다음을 기록합니다.

- bypass 사유와 incident 맥락.
- 실패했거나 우회한 검증 단계.
- 후속 보강 계획.
- 나중에 release state를 확인할 수 있는 위치.

`./scripts/pre-push-check.sh --release --no-changelog-check`로 emergency override 시에도 위 ledger 기록은 생략하지 않습니다.
```

- [ ] **Step 3: Verify the updated policy uses the approved classifications**

Run:

```bash
rg -n "Solo-admin evidence path|DB/API release PR path|External-review preferred path|POLICY_MISMATCH|CHECK_FAILURE|MISSING_EVIDENCE" docs/development/release-management.md
```

Expected: each classification appears exactly in the branch protection policy section.

- [ ] **Step 4: Commit Task 1**

Run:

```bash
git add docs/development/release-management.md
git commit -m "docs: align solo-admin release policy"
```

Expected: commit succeeds with only `docs/development/release-management.md` staged.

## Task 2: Add DB/API Readiness Checklist

**Files:**
- Modify: `docs/development/release-readiness-review.md`

- [ ] **Step 1: Insert the DB/API checklist before `## 권장 명령`**

Edit `docs/development/release-readiness-review.md` and insert this section between the existing `## 필수 확인 항목` list and `## 권장 명령`:

```markdown
## DB/API 릴리즈 추가 체크리스트

DB migration 또는 public API contract 변경이 포함된 release는 일반 테스트 통과 외에 아래 증거를 release-readiness review에 남깁니다.

- **Migration scope:** 변경된 `server/src/main/resources/db/mysql/migration/V*.sql` 파일, Flyway 적용 방향, additive 여부, rollback 대신 forward-fix가 필요한 이유.
- **API contract scope:** 변경된 route, method, request schema, response schema, error code, auth requirement, frontend Zod fixture/export 영향.
- **Deployment order:** `main` merge, annotated release tag, `Deploy Front`, `Deploy Server Image`, OCI compose promotion, post-deploy smoke 순서.
- **Review path:** non-author reviewer 존재 여부, solo-admin release PR 사용 여부, branch protection blocker가 있다면 `POLICY_MISMATCH`, `CHECK_FAILURE`, `MISSING_EVIDENCE` 중 하나로 분류.
- **Smoke evidence:** anonymous BFF/auth status, logged-in host/member route, OAuth redirect marker, DB-backed route, admin route 중 변경 표면에 맞는 smoke 결과.
- **Public safety:** public release candidate check 결과와 private value, token-shaped value, local path, member data 노출 여부.
- **Residual risk:** deploy 전 남은 일, deploy 후 남은 일, skipped validation, operator follow-up을 분리합니다.

`POLICY_MISMATCH`는 reviewer 부재 또는 code-owner self-review 요구처럼 정책 설정이 단독 운영 현실과 맞지 않는 경우에만 사용합니다. CI 실패, scanner 실패, smoke 실패, release note 누락은 `POLICY_MISMATCH`가 아니며 merge 전에 고칩니다.
```

- [ ] **Step 2: Add branch policy terms to the recommended search command**

In the existing risk-search command, replace the pattern string with this equivalent pattern plus the branch-policy classifications:

```bash
rg -n "[T]ODO|baseline|exception|allowlist|fallback|audit|secret|token|scan|deploy|watch|POLICY_MISMATCH|CHECK_FAILURE|MISSING_EVIDENCE" \
```

- [ ] **Step 3: Verify the checklist is discoverable**

Run:

```bash
rg -n "DB/API 릴리즈 추가 체크리스트|Migration scope|API contract scope|POLICY_MISMATCH|CHECK_FAILURE|MISSING_EVIDENCE" docs/development/release-readiness-review.md
```

Expected: output includes the new checklist heading and all three blocker classifications.

- [ ] **Step 4: Commit Task 2**

Run:

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: add db api release readiness checklist"
```

Expected: commit succeeds with only `docs/development/release-readiness-review.md` staged.

## Task 3: Clarify CODEOWNERS Enforcement Semantics

**Files:**
- Modify: `.github/CODEOWNERS`

- [ ] **Step 1: Replace the CODEOWNERS comment**

Edit `.github/CODEOWNERS` so the full file is:

```text
# CI/CD workflow changes are owned by @beyondwin.
# In solo-admin mode, branch protection must not require impossible self-review.
# Treat this as ownership/notification metadata unless a real non-author owner or team is added.
.github/workflows/** @beyondwin
```

- [ ] **Step 2: Verify the ownership rule is unchanged**

Run:

```bash
git diff -- .github/CODEOWNERS
```

Expected: only comment lines changed; `.github/workflows/** @beyondwin` remains present.

- [ ] **Step 3: Commit Task 3**

Run:

```bash
git add .github/CODEOWNERS
git commit -m "docs: clarify codeowners solo-admin semantics"
```

Expected: commit succeeds with only `.github/CODEOWNERS` staged.

## Task 4: Align GitHub Branch Protection With Solo-Admin Policy

**Files:**
- No repository file change expected.
- CLI state change: GitHub branch protection for `main`.

- [ ] **Step 1: Capture current branch protection**

Run:

```bash
gh api repos/beyondwin/ReadMates/branches/main/protection \
  --jq '{required_status_checks, enforce_admins, required_pull_request_reviews, allow_force_pushes, allow_deletions}'
```

Expected before change: `required_status_checks.contexts` includes `Frontend` and `Backend`; `required_pull_request_reviews.require_code_owner_reviews` may be `true`.

- [ ] **Step 2: Remove impossible required PR review enforcement**

Run:

```bash
gh api \
  -X DELETE \
  repos/beyondwin/ReadMates/branches/main/protection/required_pull_request_reviews
```

Expected: command exits 0. GitHub may print no body for the delete operation.

- [ ] **Step 3: Verify status checks remained required**

Run:

```bash
gh api repos/beyondwin/ReadMates/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, reviews: .required_pull_request_reviews, forcePushes: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
```

Expected output shape:

```json
{
  "checks": [
    "Frontend",
    "Backend"
  ],
  "strict": true,
  "reviews": null,
  "forcePushes": false,
  "deletions": false
}
```

- [ ] **Step 4: Record the CLI result in release readiness**

Append this note after the `## 2026-05-31 v1.12.1 server image scan repair note` section and before `## 2026-05-31 Ops Insight & Release Trust verification note`:

```markdown
## 2026-05-31 solo-admin branch protection policy note

- Scope reviewed: branch protection/code-owner operating policy for the current solo-admin repository.
- Policy decision: keep required `Frontend` and `Backend` status checks; remove impossible required PR/code-owner self-review until a real non-author reviewer or team exists.
- Executed: `gh api .../branches/main/protection` before and after the change, and `gh api -X DELETE .../protection/required_pull_request_reviews`.
- Closure evidence: branch protection still requires strict `Frontend` and `Backend` checks, force pushes and branch deletion remain disabled, and `required_pull_request_reviews` is absent.
- Residual risk: no impossible self-review blocker remains for solo-admin DB/API release PRs. High-control surfaces still require explicit release-readiness evidence and external review when a real reviewer is available.
```

- [ ] **Step 5: Commit Task 4 documentation**

Run:

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: record solo-admin branch protection update"
```

Expected: commit succeeds with only the branch protection note staged.

## Task 5: Final Verification And Push

**Files:**
- Verify all changed docs and repository state.

- [ ] **Step 1: Run whitespace check on changed files**

Run:

```bash
git diff --check HEAD~4..HEAD -- docs/development/release-management.md docs/development/release-readiness-review.md .github/CODEOWNERS
```

Expected: no output and exit 0.

- [ ] **Step 2: Run public release candidate checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: candidate builds and public-release check ends with `Public-release check passed.`

- [ ] **Step 3: Verify branch protection one final time**

Run:

```bash
gh api repos/beyondwin/ReadMates/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, reviews: .required_pull_request_reviews, forcePushes: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
```

Expected: `checks` contains `Frontend` and `Backend`, `strict` is `true`, `reviews` is `null`, `forcePushes` is `false`, and `deletions` is `false`.

- [ ] **Step 4: Inspect final status**

Run:

```bash
git status --short --branch
git log --oneline -6
```

Expected: working tree is clean and the latest commits are the Task 1-4 documentation commits on top of the approved design/plan commits.

- [ ] **Step 5: Push main**

Run:

```bash
git push origin main
```

Expected: push succeeds. If pre-push hooks run, they must pass before the push completes.
