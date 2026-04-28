# Public Superpowers Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 공개된 ReadMates 저장소에서 `docs/superpowers/**`를 공개 가능한 상태로 정리하고, 공개 릴리즈 검사에 포함되도록 안전하게 전환한다.

**Architecture:** 현재 public release candidate는 `docs/superpowers/**`를 제외해서 통과한다. 이 플랜은 먼저 노출 내용을 정리하고, 그 다음 builder/checker allowlist와 denylist를 바꿔 `docs/superpowers/**`를 candidate에 포함한다. 마지막으로 현재 public 저장소, fresh candidate, history/cached exposure를 각각 검증한다.

**Tech Stack:** Bash, Git, gitleaks, ripgrep, GitHub repository settings, ReadMates public release scripts.

---

## 전제

- 현재 저장소는 이미 GitHub에 공개되어 있다.
- 이전 보안 점검에서 clean candidate는 통과했지만 repository root는 `docs/superpowers/**` 때문에 실패했다.
- 이전 점검에서 active API key, cloud credential, private key, OAuth client secret, database password, BFF secret 원문은 확인하지 못했다.
- 그래도 이미 공개된 상태라서, “민감정보 없음”을 가정하지 말고 scanner 결과를 기준으로 정리한다.

## 파일 구조

- Modify: `scripts/public-release-check.sh`
  - `docs/superpowers/**` path denylist 제거.
  - content scanner는 유지.
  - OpenAI/API key style false positive를 줄이도록 token regex 경계를 강화.

- Modify: `scripts/build-public-release-candidate.sh`
  - `docs/superpowers/**`를 candidate manifest에 포함.
  - symlink/envrc preflight source roots에 `docs/superpowers` 추가.
  - candidate forbidden path에서 `docs/superpowers/**` 제거.

- Modify: `docs/deploy/security-public-repo.md`
  - `docs/superpowers/**` 정책을 “무조건 제외”에서 “sanitized historical docs는 포함 가능”으로 변경.
  - 공개 전 검사 절차를 `docs/superpowers` 포함 기준으로 업데이트.

- Modify: `docs/superpowers/**`
  - local path, private domain, Gmail address, real-looking secret assignment, token-shaped false positive를 제거 또는 placeholder로 치환.

- Optional Create: `.github/CODEOWNERS`
  - workflow 보호는 별도 Finding 3 대응이지만, public repo remediation과 같이 처리할 수 있다.

---

### Task 1: 공개 중인 노출 범위 재확인

**Files:**
- Read: `scripts/public-release-check.sh`
- Read: `scripts/build-public-release-candidate.sh`
- Read: `docs/superpowers/**`
- Output: terminal findings only

- [ ] **Step 1: 현재 branch와 dirty state 확인**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main
```

또는 기존 작업 변경이 보이면 이후 commit에서 unrelated change를 섞지 않는다.

- [ ] **Step 2: 현재 tree 공개 검사 실행**

Run:

```bash
./scripts/public-release-check.sh
```

Expected:

```text
Public-release check failed:
  forbidden tracked path: docs/superpowers/...
  targeted content finding: ...
```

이 단계는 실패가 정상이다. 실패 목록을 remediation 대상 목록으로 사용한다.

- [ ] **Step 3: `docs/superpowers`만 대상으로 content finding 재현**

Run:

```bash
LOCAL_ACCOUNT='<macos-account-name>'
PRIVATE_DOMAIN='<private-domain>'
rg -n -i '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|(READMATES_BFF_SECRET|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET)[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]"'"'"'<>`]{16,}|[A-Za-z0-9._%+-]+@gmail[.]com)' docs/superpowers
rg -n -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers
rg -n -F "$PRIVATE_DOMAIN" docs/superpowers
```

Expected:

```text
docs/superpowers/...:<line>:<matched text>
```

If there is no output, content findings have already been cleaned.

- [ ] **Step 4: active secret 여부 판단**

Check each hit:

- Placeholder-only examples such as `<db-password>` are safe.
- `replace-with-*` examples are not active secrets, but scanner-noisy and should be changed to angle-bracket placeholders.
- Any value that looks like a real provider token, private key, DB password, OAuth secret, OCI OCID, or deployment hook is incident material.

Expected decision:

```text
No active secret found
```

or:

```text
Active/possibly active secret found: <provider/category>
```

If active/possibly active secret is found, stop Task 2 and run Task 0 below first.

---

### Task 0: 조건부 incident response, active secret 발견 시에만 실행

**Files:**
- No source edits until rotation decision is made.

- [ ] **Step 1: 공개 repo를 임시 private로 전환 가능한지 확인**

Action:

- GitHub repository settings에서 visibility를 private로 임시 전환할 수 있으면 전환한다.
- 이미 fork/cache가 있을 수 있으므로 이것만으로 해결됐다고 보지 않는다.

Expected:

```text
Repository visibility temporarily private
```

or:

```text
Repository remains public; continue with rotation and scrub
```

- [ ] **Step 2: 노출된 credential별 revoke/rotate**

If `READMATES_BFF_SECRET` leaked:

```text
1. Generate new BFF secret.
2. Update Cloudflare Pages secret.
3. Update OCI VM /etc/readmates/readmates.env.
4. Restart Spring service.
5. Smoke test /api/bff/api/auth/me.
```

If DB password leaked:

```text
1. Create or rotate MySQL app user password.
2. Update OCI VM /etc/readmates/readmates.env.
3. Restart Spring service.
4. Confirm application can connect.
5. Revoke old password.
```

If Google OAuth client secret leaked:

```text
1. Rotate Google OAuth client secret in Google Cloud Console.
2. Update OCI VM runtime env.
3. Restart Spring service.
4. Test /oauth2/authorization/google redirect.
```

If Cloudflare API token or deploy hook leaked:

```text
1. Revoke leaked token/hook.
2. Create new scoped token/hook.
3. Update GitHub/Cloudflare secret storage.
4. Run deploy smoke test.
```

Expected:

```text
All possibly exposed active credentials are rotated before scrub is published
```

- [ ] **Step 3: exposure window 기록**

Create local incident note outside public candidate, for example:

```bash
mkdir -p .gstack/security-reports
cat > .gstack/security-reports/2026-04-28-public-exposure-incident-note.md <<'EOF'
# Public Exposure Incident Note

Date: 2026-04-28
Repository: ReadMates
Exposure: <what was exposed>
First public time: <known or unknown>
Rotated credentials: <list>
Provider audit logs checked: <list>
Remaining follow-up: <list>
EOF
```

Expected:

```text
Incident note stored under ignored .gstack/security-reports
```

---

### Task 2: `docs/superpowers/**` 본문 정리

**Files:**
- Modify: `docs/superpowers/**/*.md`

- [ ] **Step 1: local workstation path 치환**

Run:

```bash
LOCAL_ACCOUNT='<macos-account-name>'
rg -l -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers
```

For each file returned, replace:

```text
<absolute-local-repository-path>
```

with:

```text
<local-workspace>/ReadMates
```

and replace any remaining:

```text
<absolute-local-home-path>
```

with:

```text
<local-home>/
```

Verification:

```bash
LOCAL_ACCOUNT='<macos-account-name>'
rg -n -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers
```

Expected:

```text
<no output>
```

- [ ] **Step 2: private domain 치환**

Run:

```bash
PRIVATE_DOMAIN='<private-domain>'
rg -n -F "$PRIVATE_DOMAIN" docs/superpowers
```

Replace:

```text
<private-domain>
```

with:

```text
readmates.example.com
```

Verification:

```bash
PRIVATE_DOMAIN='<private-domain>'
rg -n -F "$PRIVATE_DOMAIN" docs/superpowers
```

Expected:

```text
<no output>
```

- [ ] **Step 3: Gmail 주소 치환**

Run:

```bash
rg -n '[A-Za-z0-9._%+-]+@gmail[.]com' docs/superpowers
```

Replace real personal Gmail addresses with:

```text
host@example.com
```

or:

```text
member@example.com
```

Verification:

```bash
rg -n '[A-Za-z0-9._%+-]+@gmail[.]com' docs/superpowers
```

Expected:

```text
<no output>
```

- [ ] **Step 4: secret-looking examples를 angle-bracket placeholder로 치환**

Run:

```bash
rg -n -i '(READMATES_BFF_SECRET|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET)[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]"'"'"'<>`]{16,}' docs/superpowers
```

Replace any non-placeholder datasource password example with:

```text
SPRING_DATASOURCE_PASSWORD=<db-password>
```

Replace any non-placeholder BFF secret example with:

```text
READMATES_BFF_SECRET=<shared-bff-secret>
BFF_SECRET=<shared-bff-secret>
```

Replace any non-placeholder Google OAuth secret example with:

```text
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
```

Verification:

```bash
rg -n -i '(READMATES_BFF_SECRET|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET)[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]"'"'"'<>`]{16,}' docs/superpowers
```

Expected:

```text
<no output>
```

- [ ] **Step 5: scanner false positive 경로 문자열 정리**

Run:

```bash
OPENAI_KEY_PREFIX='s''k-'
rg -n "cleanup-implementation-plan|${OPENAI_KEY_PREFIX}[A-Za-z0-9][A-Za-z0-9_-]{20,}" docs/superpowers
```

For false positives caused by ordinary words around a provider-token-like prefix, rewrite the surrounding text so it does not contain a token-shaped substring. Example:

```text
server legacy risk cleanup implementation plan
```

can be described as:

```text
server legacy risk cleanup implementation plan
```

Do not weaken scanner behavior for real `sk-...` API keys in this task.

Verification:

```bash
OPENAI_KEY_PREFIX='s''k-'
rg -n "cleanup-implementation-plan|${OPENAI_KEY_PREFIX}[A-Za-z0-9][A-Za-z0-9_-]{20,}" docs/superpowers
```

Expected:

```text
<no output>
```

- [ ] **Step 6: docs-only diff check**

Run:

```bash
git diff --check -- docs/superpowers
```

Expected:

```text
<no output>
```

- [ ] **Step 7: Commit sanitized docs**

Run:

```bash
git add docs/superpowers
git commit -m "docs: sanitize historical superpowers notes for public release"
```

Expected:

```text
[main <sha>] docs: sanitize historical superpowers notes for public release
```

---

### Task 3: `docs/superpowers/**`를 public release candidate에 포함

**Files:**
- Modify: `scripts/build-public-release-candidate.sh`
- Test: `scripts/public-release-check.sh`

- [ ] **Step 1: preflight roots에 `docs/superpowers` 추가**

In `scripts/build-public-release-candidate.sh`, add `docs/superpowers` to the root arrays in:

```bash
preflight_envrc_loaders()
preflight_source_symlinks()
```

Expected shape:

```bash
local roots=(
  "."
  "front"
  "server"
  "deploy/oci"
  "docs/development"
  "docs/deploy"
  "docs/superpowers"
  "scripts"
)
```

- [ ] **Step 2: manifest copy에 `docs/superpowers` 추가**

In `copy_manifest()`, after:

```bash
copy_dir "docs/deploy"
copy_dir "docs/development"
```

add:

```bash
copy_dir "docs/superpowers"
```

- [ ] **Step 3: approved manifest path에 `docs/superpowers` 추가**

In `is_approved_manifest_path()`, replace:

```bash
docs|docs/deploy|docs/deploy/*|docs/development|docs/development/*) return 0 ;;
```

with:

```bash
docs|docs/deploy|docs/deploy/*|docs/development|docs/development/*|docs/superpowers|docs/superpowers/*) return 0 ;;
```

- [ ] **Step 4: candidate forbidden path에서 private plan dir 제거**

In `is_forbidden_candidate_path()`, remove this case:

```bash
"$private_plan_dir"|"$private_plan_dir"/*) return 0 ;;
```

Keep `.gstack`, `.superpowers`, `.tmp`, key files, env files, dumps, screenshots, and provider state denied.

- [ ] **Step 5: builder syntax check**

Run:

```bash
bash -n scripts/build-public-release-candidate.sh
```

Expected:

```text
<no output>
```

---

### Task 4: public-release checker가 sanitized `docs/superpowers/**`를 허용하도록 수정

**Files:**
- Modify: `scripts/public-release-check.sh`

- [ ] **Step 1: forbidden path에서 `docs/superpowers` 제거**

In `is_forbidden_path()`, remove:

```bash
"$private_plan_dir"|"$private_plan_dir"/*) return 0 ;;
```

Do not remove other denylist rules.

- [ ] **Step 2: OpenAI/API key scanner regex 경계 강화**

Current scan can catch path fragments like `risk-cleanup` as `sk-cleanup...` because `sk-` appears inside a normal word. In `run_sensitive_content_checks()`, replace the OpenAI/API key style pattern with a boundary-aware version:

```bash
run_content_check "OpenAI/API key style token" '(^|[^A-Za-z0-9_-])(sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|(OPENAI_API_KEY|API_KEY|GOOGLE_API_KEY)[[:space:]]*[:=][[:space:]]*['"'"'"]?[A-Za-z0-9_-]{24,})'
```

This still catches real `sk-...` style tokens at string boundaries while avoiding ordinary words ending in `sk`.

- [ ] **Step 3: checker syntax check**

Run:

```bash
bash -n scripts/public-release-check.sh
```

Expected:

```text
<no output>
```

- [ ] **Step 4: current tree check should now fail only on real remaining content, not path denylist**

Run:

```bash
./scripts/public-release-check.sh
```

Expected after Task 2 cleanup:

```text
Public-release check passed.
```

If it still fails, fix the listed content. Do not loosen scanner rules except for proven false positives with a narrow regex improvement.

- [ ] **Step 5: Commit script changes**

Run:

```bash
git add scripts/build-public-release-candidate.sh scripts/public-release-check.sh
git commit -m "chore: include sanitized superpowers docs in public release checks"
```

Expected:

```text
[main <sha>] chore: include sanitized superpowers docs in public release checks
```

---

### Task 5: public repository policy 문서 업데이트

**Files:**
- Modify: `docs/deploy/security-public-repo.md`
- Test: docs diff and public release candidate check

- [ ] **Step 1: 포함 정책 수정**

In `docs/deploy/security-public-repo.md`, update the public candidate include list to include:

```markdown
- `docs/superpowers/` sanitized historical design and implementation records
```

- [ ] **Step 2: 제외 정책 수정**

Replace language that treats all private planning docs as excluded with:

```markdown
- unsanitized private planning docs
- historical planning docs that contain real member data, local absolute paths, private domains, provider state, real secrets, token-shaped examples, or personal Gmail addresses
```

- [ ] **Step 3: scanner explanation 수정**

Add:

```markdown
`docs/superpowers/`는 공개 후보에 포함할 수 있지만, current-tree scan과 candidate scan 모두에서 local path, private domain, Gmail address, provider token, real-looking secret assignment 검사를 통과해야 합니다.
```

- [ ] **Step 4: docs diff check**

Run:

```bash
git diff --check -- docs/deploy/security-public-repo.md
```

Expected:

```text
<no output>
```

- [ ] **Step 5: Commit policy docs**

Run:

```bash
git add docs/deploy/security-public-repo.md
git commit -m "docs: document sanitized superpowers public release policy"
```

Expected:

```text
[main <sha>] docs: document sanitized superpowers public release policy
```

---

### Task 6: clean candidate 재생성 및 검증

**Files:**
- Output: `.tmp/public-release-candidate`

- [ ] **Step 1: candidate 생성**

Run:

```bash
./scripts/build-public-release-candidate.sh
```

Expected:

```text
Public release candidate built:
  <repo>/.tmp/public-release-candidate
```

- [ ] **Step 2: candidate에 `docs/superpowers` 포함 확인**

Run:

```bash
test -d .tmp/public-release-candidate/docs/superpowers && echo "included"
```

Expected:

```text
included
```

- [ ] **Step 3: candidate 공개 검사**

Run:

```bash
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

```text
Public-release check passed.
```

- [ ] **Step 4: current tree 공개 검사**

Run:

```bash
./scripts/public-release-check.sh
```

Expected:

```text
Public-release check passed.
```

- [ ] **Step 5: gitleaks 직접 검사**

Run:

```bash
gitleaks detect --source . --redact --verbose
gitleaks dir .tmp/public-release-candidate --redact --verbose
```

Expected:

```text
no leaks found
```

If gitleaks reports historical commits that are already public, proceed to Task 7. Current file cleanup alone does not remove old commit history.

---

### Task 7: 이미 공개된 Git history 처리

**Files:**
- Git history operation
- Remote repository settings

- [ ] **Step 1: history rewrite가 필요한지 결정**

Run:

```bash
gitleaks detect --source . --redact --verbose
```

Decision:

- If no leaks found: no history rewrite for secrets is required.
- If only personal email metadata remains: decide whether privacy cleanup is worth force-push cost.
- If active/possibly active secret appears in old commits: rotate first, then rewrite history.

- [ ] **Step 2: GitHub public cache 현실 기록**

Record this in a private note:

```text
Git history cleanup reduces future exposure but cannot guarantee removal from forks, clones, GitHub caches, search indexes, or third-party mirrors.
```

- [ ] **Step 3: history rewrite option, only if required**

If required, use `git filter-repo` from a temporary clone, not the active working tree.

Run:

```bash
cd /tmp
git clone --mirror git@github.com:beyondwin/ReadMates.git readmates-cleanup.git
cd readmates-cleanup.git
```

For file/path removal:

```bash
git filter-repo --path docs/superpowers --invert-paths
```

For email metadata rewrite:

```bash
cat > mailmap.txt <<'EOF'
Public ReadMates Maintainer <noreply@example.com> <personal-gmail>
EOF
git filter-repo --mailmap mailmap.txt
```

Only force-push after explicit approval:

```bash
git push --force --mirror
```

Expected:

```text
Forced update to public repository completed
```

Important: if the goal is to keep `docs/superpowers`, do not use `--invert-paths` for that directory. Use content cleanup commits instead. Use history rewrite only for secrets or metadata that must disappear from old commits.

---

### Task 8: GitHub public repo follow-up

**Files:**
- Optional Create: `.github/CODEOWNERS`

- [ ] **Step 1: CODEOWNERS 추가**

Create `.github/CODEOWNERS`:

```text
# CI/CD workflow changes require owner review.
.github/workflows/** @beyondwin
```

Run:

```bash
git add .github/CODEOWNERS
git commit -m "chore: require owner review for workflow changes"
```

Expected:

```text
[main <sha>] chore: require owner review for workflow changes
```

- [ ] **Step 2: GitHub branch protection 설정**

In GitHub:

```text
Settings -> Branches -> Branch protection rules -> main
Enable:
- Require a pull request before merging
- Require approvals
- Require review from Code Owners
- Require status checks to pass before merging
```

Expected:

```text
Workflow file changes require CODEOWNERS review before merge
```

- [ ] **Step 3: GitHub secret scanning 확인**

In GitHub:

```text
Settings -> Code security and analysis
Enable:
- Secret scanning
- Push protection, if available
- Dependabot alerts
```

Expected:

```text
GitHub security alerts active for public repository
```

---

## 최종 검증 체크리스트

- [ ] `./scripts/public-release-check.sh` passes on repository root.
- [ ] `./scripts/build-public-release-candidate.sh` passes.
- [ ] `./scripts/public-release-check.sh .tmp/public-release-candidate` passes.
- [ ] `.tmp/public-release-candidate/docs/superpowers` exists.
- [ ] `gitleaks detect --source . --redact --verbose` has no active secret findings.
- [ ] `gitleaks dir .tmp/public-release-candidate --redact --verbose` has no findings.
- [ ] `rg -n '[A-Za-z0-9._%+-]+@gmail[.]com' docs/superpowers` has no output.
- [ ] `rg -n -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers` has no output.
- [ ] `rg -n -F "$PRIVATE_DOMAIN" docs/superpowers` has no output.
- [ ] `rg -n -i '(READMATES_BFF_SECRET|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET)[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]"'"'"'<>`]{16,}' docs/superpowers` has no output.
- [ ] If any active secret was found, provider rotation is complete and recorded privately.

## Rollback Plan

If including `docs/superpowers/**` creates too much scanner noise:

1. Revert script changes that include `docs/superpowers`.
2. Keep sanitized docs commit if it improves current public tree.
3. Publish clean candidate without `docs/superpowers`.
4. Create a separate sanitized `docs/superpowers-public/` subset later.

Commands:

```bash
git revert <script-change-commit-sha>
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

```text
Public-release check passed.
```

## Self-Review

- Spec coverage: The plan covers already-public incident response, `docs/superpowers` sanitization, release script changes, policy docs, candidate verification, history/cache reality, and GitHub follow-up.
- Placeholder scan: No task uses `TBD` or asks the implementer to invent missing steps. Values that must remain non-secret use explicit placeholders such as `<db-password>`.
- Type consistency: File paths and script function names match the current repository structure observed during planning.
