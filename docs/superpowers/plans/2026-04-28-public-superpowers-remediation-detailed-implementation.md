# Public Superpowers Remediation Detailed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 공개된 ReadMates 저장소에서 `docs/superpowers/**`를 공개 가능한 historical documentation으로 정리하고, 공개 릴리즈 후보와 보안 scanner가 이 경로를 안전하게 포함하도록 구현한다.

**Architecture:** 먼저 문서 본문을 public-safe placeholder 기준으로 정리한 뒤, release candidate builder의 manifest와 checker의 denylist를 같은 정책으로 맞춘다. 마지막으로 현재 tree, clean candidate, Git history, GitHub repository 설정을 분리해서 검증한다.

**Tech Stack:** Bash, Git, ripgrep, gitleaks, GitHub repository settings, ReadMates public release scripts.

---

## 구현 원칙

- 실제 credential, 운영 endpoint, 개인 이메일, 로컬 절대 경로, provider 상태값은 문서에도 넣지 않는다.
- scanner 실패를 없애기 위해 scanner를 느슨하게 만들지 않는다. 예외는 명백한 false positive를 더 좁은 정규식으로 줄이는 경우뿐이다.
- `docs/superpowers/**`를 공개하려면 “경로 허용”보다 “본문 정리”가 먼저다.
- 이미 공개된 저장소이므로 active secret이 하나라도 발견되면 문서 정리보다 rotation/revoke가 우선이다.
- Git history rewrite는 마지막 선택지다. 현재 공개 상태에서 이미 clone, fork, cache가 생겼을 수 있기 때문이다.

## 변경 파일 책임

- `docs/superpowers/**/*.md`
  - historical plan/spec 문서의 민감 문자열을 public-safe placeholder로 바꾼다.
  - 실제 운영 값 대신 `<db-password>`, `<shared-bff-secret>`, `<google-oauth-client-secret>`, `host@example.com`, `https://api.example.com` 같은 예시만 남긴다.

- `scripts/build-public-release-candidate.sh`
  - clean candidate에 sanitized `docs/superpowers/**`를 복사한다.
  - source preflight가 `docs/superpowers/**`의 `.envrc*`와 symlink도 검사하도록 root 목록을 확장한다.
  - candidate manifest allowlist와 forbidden path denylist를 같은 정책으로 맞춘다.

- `scripts/public-release-check.sh`
  - current tree와 candidate scan에서 sanitized `docs/superpowers/**` 경로를 허용한다.
  - private key, provider token, real-looking secret assignment, personal email, private domain, local path 검사는 유지한다.
  - token-shaped false positive는 좁은 boundary 개선으로만 줄인다.

- `docs/deploy/security-public-repo.md`
  - 공개 후보에 포함 가능한 historical docs 기준을 문서화한다.
  - “무조건 제외”가 아니라 “sanitized 문서만 포함 가능” 정책으로 갱신한다.

- Optional `.github/CODEOWNERS`
  - workflow 변경을 repository owner review 대상으로 만든다.

## Phase 1: 현재 노출 상태 재확인

> Status: Complete. Task 1 confirmed no Class A active credential; cleanup proceeds with Class B/C remediation.

### Task 1.1: 작업 시작 상태 기록

- [x] **Step 1: 현재 branch와 작업 tree 확인**

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main
```

기존 변경이 있으면 이번 remediation commit에 섞지 않는다. 특히 `compose.yml`처럼 이 작업과 무관한 변경은 그대로 두고 stage하지 않는다.

- [x] **Step 2: 현재 공개 검사 실패 목록 확보**

```bash
./scripts/public-release-check.sh
```

Expected before remediation:

```text
Public-release check failed:
  forbidden tracked path: docs/superpowers/...
  targeted content finding: ...
```

이 실패는 시작점에서는 정상이다. 여기서 나온 항목을 정리 대상 목록으로 사용한다.

### Task 1.2: `docs/superpowers/**` 전용 targeted scan

- [x] **Step 1: 로컬 경로 후보 검색**

```bash
LOCAL_ACCOUNT='<macos-account-name>'
rg -n -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers
```

Expected before cleanup:

```text
docs/superpowers/...:<line>:...
```

Expected after cleanup:

```text
<no output>
```

- [x] **Step 2: private domain 후보 검색**

```bash
PRIVATE_DOMAIN='<private-domain>'
rg -n -F "$PRIVATE_DOMAIN" docs/superpowers
```

Expected after cleanup:

```text
<no output>
```

- [x] **Step 3: 개인 Gmail 주소 검색**

```bash
rg -n '[A-Za-z0-9._%+-]+@gmail[.]com' docs/superpowers
```

Expected after cleanup:

```text
<no output>
```

- [x] **Step 4: secret assignment 형태 검색**

```bash
rg -n -i '(READMATES_BFF_SECRET|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET)[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]"'"'"'<>`]{16,}' docs/superpowers
```

Expected after cleanup:

```text
<no output>
```

### Task 1.3: active secret 여부 결정

- [x] **Step 1: scanner hit을 세 가지로 분류**

```text
Class A: active 또는 active 가능 credential
Class B: 실제 credential은 아니지만 scanner-noisy example
Class C: 명백한 false positive
```

판단 기준:

- `Class A`: provider token, OAuth secret, DB password, BFF shared secret, private key, deploy hook, OCI OCID와 함께 쓰이는 secret material.
- `Class B`: 실제 값은 아니지만 16자 이상 password처럼 보이는 예시, `replace-with-*` 스타일 값, private domain, 개인 이메일, 로컬 절대 경로.
- `Class C`: 일반 파일명이나 설명 문장 일부가 token prefix처럼 보이는 경우.

- [x] **Step 2: Class A가 있으면 remediation 순서 변경**

Expected if Class A exists:

```text
Stop content cleanup. Rotate or revoke exposed credential first.
```

Expected if Class A does not exist:

```text
Continue to Phase 2.
```

## Phase 2: active secret 발견 시 incident response

이 Phase는 Task 1.3에서 `Class A`가 있을 때만 실행한다.

> Status: Skipped. Task 1 found no confirmed Class A active credential.

### Task 2.1: 공개 상태 완화

- [ ] **Step 1: 저장소 visibility 임시 전환 가능 여부 확인**

GitHub repository settings에서 public 저장소를 private로 임시 전환할 수 있으면 전환한다.

Expected:

```text
Repository visibility temporarily private.
```

전환할 수 없으면 그대로 다음 단계로 간다. visibility 변경은 이미 발생한 fork, clone, cache, search index 노출을 되돌리지 못한다.

### Task 2.2: credential별 rotation

- [ ] **Step 1: BFF shared secret 노출 시**

```text
1. 새 shared secret을 생성한다.
2. Cloudflare Pages secret 저장소를 갱신한다.
3. 서버 runtime env의 BFF secret 값을 갱신한다.
4. Spring 서비스를 재시작한다.
5. BFF 경유 auth health endpoint를 smoke test한다.
6. 기존 secret이 더 이상 통하지 않는지 확인한다.
```

- [ ] **Step 2: DB password 노출 시**

```text
1. MySQL application user password를 새 값으로 rotate한다.
2. 서버 runtime env의 datasource password를 갱신한다.
3. Spring 서비스를 재시작한다.
4. DB 연결과 기본 API 응답을 확인한다.
5. old password 접근이 차단됐는지 확인한다.
```

- [ ] **Step 3: Google OAuth client secret 노출 시**

```text
1. Google Cloud Console에서 OAuth client secret을 rotate한다.
2. 서버 runtime env를 갱신한다.
3. Spring 서비스를 재시작한다.
4. OAuth redirect와 callback flow를 smoke test한다.
5. old secret을 revoke한다.
```

- [ ] **Step 4: Cloudflare token 또는 deploy hook 노출 시**

```text
1. 노출된 token 또는 hook을 revoke한다.
2. 필요한 최소 scope로 새 token 또는 hook을 만든다.
3. GitHub/Cloudflare secret storage를 갱신한다.
4. dry-run 또는 smoke deploy를 실행한다.
```

### Task 2.3: private incident note 작성

- [ ] **Step 1: 공개되지 않는 위치에 기록**

```bash
mkdir -p .gstack/security-reports
```

`.gstack/security-reports/<date>-public-exposure-incident-note.md`에 아래 항목만 기록한다.

```text
Date:
Repository:
Exposure category:
First known public time:
Rotated credentials:
Provider audit logs checked:
Remaining follow-up:
```

`.gstack/`는 ignored 경로이므로 공개 후보에 포함하지 않는다.

## Phase 3: `docs/superpowers/**` 본문 정리

> Status: Complete. Task 2 sanitized local paths, private domains, Gmail scan targets, scanner-noisy secret examples, and token-shaped false positives.

### Task 3.1: 로컬 절대 경로 제거

- [x] **Step 1: 파일 목록 추출**

```bash
LOCAL_ACCOUNT='<macos-account-name>'
rg -l -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers
```

- [x] **Step 2: 치환 기준 적용**

```text
<absolute-local-repository-path> -> <local-workspace>/ReadMates
<absolute-local-home-path>       -> <local-home>/
```

문서가 “경로 형식 자체”를 설명해야 할 때만 generic placeholder를 사용한다.

- [x] **Step 3: 검증**

```bash
LOCAL_ACCOUNT='<macos-account-name>'
rg -n -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers
```

Expected:

```text
<no output>
```

### Task 3.2: private domain 제거

- [x] **Step 1: 파일 목록 추출**

```bash
PRIVATE_DOMAIN='<private-domain>'
rg -l -F "$PRIVATE_DOMAIN" docs/superpowers
```

- [x] **Step 2: 치환 기준 적용**

```text
<private-domain> -> readmates.example.com
https://<private-domain> -> https://readmates.example.com
```

- [x] **Step 3: 검증**

```bash
PRIVATE_DOMAIN='<private-domain>'
rg -n -F "$PRIVATE_DOMAIN" docs/superpowers
```

Expected:

```text
<no output>
```

### Task 3.3: 개인 이메일 제거

- [x] **Step 1: Gmail 주소 검색**

```bash
rg -n '[A-Za-z0-9._%+-]+@gmail[.]com' docs/superpowers
```

- [x] **Step 2: 문맥별 치환**

```text
host email      -> host@example.com
member email    -> member@example.com
maintainer mail -> maintainer@example.com
```

- [x] **Step 3: 검증**

```bash
rg -n '[A-Za-z0-9._%+-]+@gmail[.]com' docs/superpowers
```

Expected:

```text
<no output>
```

### Task 3.4: secret-looking example 정리

- [x] **Step 1: scanner-noisy assignment 검색**

```bash
rg -n -i '(READMATES_BFF_SECRET|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET)[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]"'"'"'<>`]{16,}' docs/superpowers
```

- [x] **Step 2: 안전한 placeholder로 치환**

```text
SPRING_DATASOURCE_PASSWORD=<db-password>
READMATES_BFF_SECRET=<shared-bff-secret>
BFF_SECRET=<shared-bff-secret>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
```

값이 test-only라면 기존 checker allowlist에 있는 테스트 값만 남긴다. 운영 secret처럼 보이는 긴 예시는 남기지 않는다.

- [x] **Step 3: 검증**

```bash
rg -n -i '(READMATES_BFF_SECRET|BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|APP_DB_PASS|GOOGLE_CLIENT_SECRET|SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET)[[:space:]]*[:=][[:space:]]*["'"'"']?[^[:space:]"'"'"'<>`]{16,}' docs/superpowers
```

Expected:

```text
<no output>
```

### Task 3.5: token-shaped false positive 정리

- [x] **Step 1: provider token 형태 검색**

```bash
rg -n '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,})' docs/superpowers
```

- [x] **Step 2: false positive는 문장으로 풀어쓰기**

파일명이나 문장 일부가 provider token prefix처럼 보이면 하이픈이 이어진 token-shaped substring을 제거한다.

Example:

```text
server legacy risk cleanup implementation plan
```

실제 provider token처럼 보이는 값이면 false positive로 처리하지 말고 Phase 2로 돌아간다.

- [x] **Step 3: 검증**

```bash
rg -n '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,})' docs/superpowers
```

Expected:

```text
<no output>
```

### Task 3.6: docs-only 검증과 commit

- [x] **Step 1: whitespace 검증**

```bash
git diff --check -- docs/superpowers
```

Expected:

```text
<no output>
```

- [x] **Step 2: targeted safety 검증**

```bash
LOCAL_ACCOUNT='<macos-account-name>'
PRIVATE_DOMAIN='<private-domain>'
rg -n -F "/Users/${LOCAL_ACCOUNT}/" docs/superpowers
rg -n -F "$PRIVATE_DOMAIN" docs/superpowers
rg -n '[A-Za-z0-9._%+-]+@gmail[.]com' docs/superpowers
```

Expected for each command:

```text
<no output>
```

- [x] **Step 3: commit**

```bash
git add docs/superpowers
git commit -m "docs: sanitize historical superpowers notes for public release"
```

## Phase 4: release candidate builder 수정

### Task 4.1: preflight root 확장

- [x] **Step 1: `preflight_envrc_loaders()` roots에 추가**

Modify `scripts/build-public-release-candidate.sh`:

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

- [x] **Step 2: `preflight_source_symlinks()` roots에 추가**

Modify `scripts/build-public-release-candidate.sh`:

```bash
local roots=(
  ".github/workflows"
  "front"
  "server"
  "deploy/oci"
  "docs/development"
  "docs/deploy"
  "docs/superpowers"
  "scripts"
)
```

Expected behavior:

```text
docs/superpowers 아래의 symlink와 env loader도 candidate build 전에 거부된다.
```

### Task 4.2: manifest copy 확장

- [x] **Step 1: `copy_manifest()`에 sanitized docs 추가**

Modify `scripts/build-public-release-candidate.sh`:

```bash
copy_dir "docs/deploy"
copy_dir "docs/development"
copy_dir "docs/superpowers"
```

`copy_dir`의 기존 exclude 규칙은 유지한다. `.env*`, key, dump, provider state, screenshot 계열은 계속 제외되어야 한다.

### Task 4.3: manifest allowlist 확장

- [x] **Step 1: `is_approved_manifest_path()`의 docs case 수정**

Replace the docs case with:

```bash
docs|docs/deploy|docs/deploy/*|docs/development|docs/development/*|docs/superpowers|docs/superpowers/*) return 0 ;;
```

### Task 4.4: candidate forbidden path 조정

- [x] **Step 1: `is_forbidden_candidate_path()`에서 private plan dir case 제거**

Remove only this case:

```bash
"$private_plan_dir"|"$private_plan_dir"/*) return 0 ;;
```

Keep these denylist categories:

```text
.env files, private keys, DB dumps, state files, build outputs, provider folders,
private folders, screenshots, .gstack, .superpowers, IDE files, temp folders
```

### Task 4.5: builder 검증

- [x] **Step 1: syntax check**

```bash
bash -n scripts/build-public-release-candidate.sh
```

Expected:

```text
<no output>
```

- [x] **Step 2: candidate 생성은 Phase 7에서 실행**

이 시점에는 checker가 아직 경로를 막을 수 있으므로 full candidate verification은 Phase 7에서 한다.

## Phase 5: public release checker 수정

### Task 5.1: path denylist 조정

- [x] **Step 1: `is_forbidden_path()`에서 private plan dir case 제거**

Modify `scripts/public-release-check.sh`.

Remove only:

```bash
"$private_plan_dir"|"$private_plan_dir"/*) return 0 ;;
```

Do not remove any file-extension denylist or provider/build/temp denylist.

### Task 5.2: token scanner false positive 경계 강화

- [x] **Step 1: OpenAI/API key style token pattern 교체**

In `run_targeted_content_checks()`, replace only the OpenAI/API key style token check with:

```bash
run_content_check "OpenAI/API key style token" '(^|[^A-Za-z0-9_-])(sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|(OPENAI_API_KEY|API_KEY|GOOGLE_API_KEY)[[:space:]]*[:=][[:space:]]*['"'"'"]?[A-Za-z0-9_-]{24,})'
```

Reason:

```text
Real provider tokens are still caught when they appear at a boundary.
Ordinary words or file names ending with the same two letters before a hyphen are no longer treated as a token.
```

### Task 5.3: checker 검증

- [x] **Step 1: syntax check**

```bash
bash -n scripts/public-release-check.sh
```

Expected:

```text
<no output>
```

- [x] **Step 2: current tree scan**

```bash
./scripts/public-release-check.sh
```

Expected after Phase 3:

```text
Public-release check passed.
```

If it fails, fix the reported content. Do not broaden allowlists until the finding is proven false positive.

### Task 5.4: script commit

- [x] **Step 1: commit**

```bash
git add scripts/build-public-release-candidate.sh scripts/public-release-check.sh
git commit -m "chore: include sanitized superpowers docs in public release checks"
```

## Phase 6: public repository policy 문서 갱신

### Task 6.1: include/exclude 정책 변경

- [x] **Step 1: include list에 추가**

Modify `docs/deploy/security-public-repo.md`의 공개 릴리즈 후보 포함 경로 목록에 추가:

```markdown
- `docs/superpowers/`의 sanitized historical design and implementation records
```

- [x] **Step 2: exclude list 표현 수정**

기존 “private planning docs” 표현을 아래 기준으로 바꾼다.

```markdown
- sanitization을 거치지 않은 private planning docs
- 실제 멤버 데이터, 로컬 절대 경로, private domain, provider state, 실제 secret, token-shaped example, 개인 Gmail 주소가 남아 있는 historical planning docs
```

### Task 6.2: scanner 설명 갱신

- [x] **Step 1: scan 기준 추가**

Add:

```markdown
`docs/superpowers/`는 공개 후보에 포함할 수 있지만, current-tree scan과 candidate scan 모두에서 local path, private domain, Gmail address, provider token, real-looking secret assignment 검사를 통과해야 합니다.
```

- [x] **Step 2: script docs 설명 동기화**

`scripts/README.md`의 public candidate manifest summary와 no-arg current-tree scan guidance도 같은 기준으로 갱신했다.

### Task 6.3: docs 검증과 commit

- [x] **Step 1: whitespace 검증**

```bash
git diff --check -- docs/deploy/security-public-repo.md
```

Expected:

```text
<no output>
```

- [x] **Step 2: policy docs commit**

```bash
git add docs/deploy/security-public-repo.md
git commit -m "docs: document sanitized superpowers public release policy"
```

## Phase 7: clean candidate 재생성과 검증

### Task 7.1: candidate 생성

- [ ] **Step 1: build 실행**

```bash
./scripts/build-public-release-candidate.sh
```

Expected:

```text
Public release candidate built:
  <repo>/.tmp/public-release-candidate
```

- [ ] **Step 2: `docs/superpowers` 포함 확인**

```bash
test -d .tmp/public-release-candidate/docs/superpowers && echo "included"
```

Expected:

```text
included
```

### Task 7.2: public release checker 실행

- [ ] **Step 1: candidate scan**

```bash
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

```text
Public-release check passed.
```

- [ ] **Step 2: current tree scan**

```bash
./scripts/public-release-check.sh
```

Expected:

```text
Public-release check passed.
```

### Task 7.3: gitleaks 직접 실행

- [ ] **Step 1: current tree**

```bash
gitleaks detect --source . --redact --verbose
```

Expected:

```text
no leaks found
```

- [ ] **Step 2: candidate**

```bash
gitleaks dir .tmp/public-release-candidate --redact --verbose
```

Expected:

```text
no leaks found
```

If installed `gitleaks` does not support `dir`, use:

```bash
gitleaks detect --source .tmp/public-release-candidate --redact --verbose
```

## Phase 8: 이미 공개된 Git history 처리

### Task 8.1: history rewrite 필요성 판단

- [ ] **Step 1: history scan 결과 확인**

```bash
gitleaks detect --source . --redact --verbose
```

Decision:

```text
No active secret in history:
  content cleanup commit is enough.

Only personal email metadata:
  decide whether privacy benefit is worth force-push cost.

Active or possibly active secret in history:
  rotate first, then rewrite or purge history if needed.
```

### Task 8.2: metadata rewrite가 필요한 경우

- [ ] **Step 1: mirror clone에서만 실행**

```bash
cd /tmp
git clone --mirror <public-repository-url> readmates-cleanup.git
cd readmates-cleanup.git
```

- [ ] **Step 2: mailmap 작성**

```bash
cat > mailmap.txt <<'EOF'
Public ReadMates Maintainer <noreply@example.com> <personal-gmail>
EOF
```

- [ ] **Step 3: rewrite 실행**

```bash
git filter-repo --mailmap mailmap.txt
```

- [ ] **Step 4: force push는 명시 승인 후에만 실행**

```bash
git push --force --mirror
```

### Task 8.3: path purge가 필요한 경우

`docs/superpowers/**`를 공개 유지하려는 목표라면 path purge를 기본 선택으로 쓰지 않는다. active secret이 과거 commit에 남아 있고 content rewrite로 해결하기 어려운 경우에만 mirror clone에서 실행한다.

```bash
git filter-repo --path docs/superpowers --invert-paths
```

Expected after rewrite:

```text
New clones no longer contain the removed historical path.
```

Residual risk:

```text
Existing forks, clones, GitHub caches, third-party mirrors, search indexes may still retain old content.
```

## Phase 9: GitHub repository hardening

### Task 9.1: CODEOWNERS 추가

- [ ] **Step 1: `.github/CODEOWNERS` 생성**

```text
# CI/CD workflow changes require owner review.
.github/workflows/** @beyondwin
```

- [ ] **Step 2: commit**

```bash
git add .github/CODEOWNERS
git commit -m "chore: require owner review for workflow changes"
```

### Task 9.2: branch protection 설정

- [ ] **Step 1: GitHub settings에서 main 보호**

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
Workflow file changes require CODEOWNERS review before merge.
```

### Task 9.3: GitHub security feature 확인

- [ ] **Step 1: code security settings 확인**

```text
Settings -> Code security and analysis
Enable:
- Secret scanning
- Push protection, if available
- Dependabot alerts
```

Expected:

```text
Public repository security alerts are active.
```

## Final Verification

- [ ] `git diff --check -- docs/superpowers docs/deploy/security-public-repo.md scripts/build-public-release-candidate.sh scripts/public-release-check.sh` passes.
- [ ] `bash -n scripts/build-public-release-candidate.sh` passes.
- [ ] `bash -n scripts/public-release-check.sh` passes.
- [ ] `./scripts/build-public-release-candidate.sh` passes.
- [ ] `test -d .tmp/public-release-candidate/docs/superpowers && echo "included"` prints `included`.
- [ ] `./scripts/public-release-check.sh .tmp/public-release-candidate` passes.
- [ ] `./scripts/public-release-check.sh` passes.
- [ ] `gitleaks detect --source . --redact --verbose` has no active secret findings.
- [ ] `gitleaks dir .tmp/public-release-candidate --redact --verbose` has no findings, or legacy `detect --source` fallback passes.
- [ ] GitHub branch protection and secret scanning settings are enabled.

## Rollback

If `docs/superpowers/**` produces too much scanner noise after cleanup:

1. Revert the script commit that includes `docs/superpowers/**` in the candidate manifest.
2. Keep the sanitized docs commit if it removed real risk from the already-public tree.
3. Publish a clean candidate without `docs/superpowers/**`.
4. Create a smaller public-safe subset later.

Rollback commands:

```bash
git revert <script-change-commit-sha>
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

```text
Public-release check passed.
```

## Implementation Notes

- This document intentionally avoids recording the actual private domain, local workstation path, or personal email value.
- Use the previous security report and live scanner output to map placeholders to the private values during cleanup.
- Do not paste active secrets into commit messages, issue comments, PR descriptions, or incident notes that may become public.
