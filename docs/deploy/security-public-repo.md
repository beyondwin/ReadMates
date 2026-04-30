# 공개 저장소 보안

ReadMates 저장소는 공개 GitHub 저장소로 전환하거나 공개 릴리즈 후보를 별도 저장소에 옮겨도 안전해야 합니다. 운영 secret, 실제 멤버 신원, provider 상태 파일은 Git이 추적하는 파일에 들어가면 안 됩니다.

## 공개 방식

기본 전략은 기존 private 저장소를 그대로 public으로 전환하는 것이 아니라, 검토된 파일만 복사한 clean 공개 릴리즈 후보를 만드는 것입니다. 공개 릴리즈 후보에는 제품 소스, 공개 배포/개발 문서, placeholder 기반 예시만 포함하고 private 작업 이력, 로컬 산출물, provider 상태, 실제 secret은 포함하지 않습니다.

`scripts/build-public-release-candidate.sh`는 `.tmp/public-release-candidate`를 만들 뿐 GitHub에 게시하거나 저장소 공개 설정을 바꾸지 않습니다. `scripts/public-release-check.sh`는 후보 또는 현재 tree를 검사할 뿐 secret rotation, commit 생성, 원격 push를 수행하지 않습니다.

공개 릴리즈 후보에 포함하는 주요 경로:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-front.yml`
- `.github/CODEOWNERS`, 파일이 있을 때만 포함
- `.gitignore`
- `.env.example`
- `README.md`
- `compose.yml`
- `front/`
- `server/`
- `deploy/oci/`
- `docs/deploy/`
- `docs/development/`
- `docs/superpowers/`의 sanitized historical design and implementation records
- 공개 릴리즈 검증용 `scripts/`

공개 릴리즈 후보에서 제외하는 주요 경로:

- `.git/`
- `.env`, `.env.*`, 단 `.env.example`은 예외
- `.envrc`, `.envrc.*`
- `front/.env*`
- sanitization을 거치지 않은 private planning docs
- 실제 멤버 데이터, 로컬 절대 경로, private domain, provider state, 실제 secret, token-shaped example, 개인 Gmail 주소가 남아 있는 historical planning docs
- `design/`
- `output/`
- `front/output/`
- `front/dist/`
- `.gstack/`
- `.superpowers/`
- `.idea/`
- `.playwright-cli/`
- `.tmp/`
- `recode/`
- `deploy/oci/.deploy-state`
- `deploy/oci/*.env`
- `deploy/oci/*.state`
- private key, DB dump, screenshot, provider state, production export archive

프로덕션 secret 실제 값은 Git 밖에 둡니다. Cloudflare, OCI VM, Google Cloud, OCI 콘솔, 또는 운영자가 관리하는 ignored 파일에만 저장하고, 공개 문서에는 변수 이름과 placeholder만 둡니다.

## 커밋 금지

- `.env`
- `.env.*`, 단 `.env.example`은 예외
- `.envrc`, `.envrc.*`
- `.vercel/`
- `.wrangler/`
- `.cloudflare/`
- `deploy/oci/.deploy-state`
- `deploy/oci/*.env`
- `deploy/oci/*.state`
- `*.pem`
- `*.key`
- `*.sql.gz`
- `*.dump`
- SSH private key
- OCI API private key
- database dump
- production export archive
- 실제 `READMATES_BFF_SECRET`
- 실제 DB password
- 실제 Google OAuth client secret
- 실제 멤버 이메일 또는 개인 Gmail 주소

## 커밋 가능

- placeholder만 있는 `.env.example`
- `host@example.com`, `member1@example.com` 같은 예약된 sample email
- 공개해도 되는 sample 이름
- `local-dev-secret`, `e2e-secret`, `test-secret` 같은 테스트 전용 secret
- credential이 아닌 provider resource 이름
- 운영 절차를 설명하는 문서와 script

## 현재 ignore 기준

루트 `.gitignore`는 아래 범주를 막아야 합니다.

```text
design/
recode
.env
.env.*
!.env.example
.playwright-cli
output
.superpowers/
deploy/oci/.deploy-state
deploy/oci/*.env
deploy/oci/*.state
*.pem
*.key
*.sql.gz
*.dump
.wrangler
.cloudflare
.vercel
.gstack/
.tmp
```

`design/`은 로컬 설계 산출물 폴더로 취급하고 공개 저장소에는 올리지 않습니다.

## 공개 전 scan

반복 가능한 검증은 `scripts/public-release-check.sh`를 사용합니다. 공개 릴리즈 후보를 만든 뒤 후보 디렉터리를 먼저 검사합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

필요하면 현재 private 작업 tree도 검사할 수 있습니다.

```bash
./scripts/public-release-check.sh
```

현재 tree 검사는 `git ls-files` 기준으로 금지 경로와 tracked symlink를 확인하고, 공개 릴리즈 후보 검사는 `find` 기준으로 후보 디렉터리 전체의 금지 경로와 symlink를 확인합니다. 공개 릴리즈 후보 builder는 승인된 source root의 `.envrc*` loader 파일도 복사 전에 거부합니다. 두 scan 모드 모두 private key, OCI OCID, GitHub token, OpenAI/API key 형태의 token, 실제처럼 보이는 DB/BFF/OAuth secret 할당, Gmail 주소, private club domain, 로컬 workstation path를 찾습니다.

`gitleaks`가 설치되어 있으면 스크립트가 `.gitleaks.toml` 설정으로 `gitleaks dir <path>`를 실행합니다. 공개 릴리즈 후보에는 root `.gitleaks.toml`도 포함됩니다. 설치된 구버전 `gitleaks`가 `dir` subcommand를 지원하지 않으면 compatibility fallback으로 `gitleaks detect --source <path>`를 실행하고 downgrade 메시지를 출력합니다. `gitleaks`가 없으면 명확한 fallback 메시지를 출력하고 targeted path/content scan만 실행합니다. Fallback scan 통과는 전문적이거나 완전한 secret scan 통과와 같지 않으며, 로컬 반복 전에 명백한 실수를 막는 최소 안전장치로만 봅니다.

`docs/superpowers/`는 sanitized historical documentation만 공개 후보에 포함할 수 있습니다. 이 경로를 포함하려면 current-tree scan과 candidate scan 모두에서 local path, private domain, Gmail address, provider token, real-looking secret assignment 검사를 통과해야 합니다. no-arg current-tree scan이 `docs/superpowers/`에서 실패하면 공개 후보를 만들기 전에 해당 문서를 먼저 정리합니다.

Git history까지 검사하는 `gitleaks detect --source .`는 이미 공개된 과거 commit의 redacted 예시나 fixture를 계속 보고할 수 있습니다. 현재 tree와 clean 후보가 `gitleaks dir` 및 public-release check를 통과하고 active secret이 아니라는 검토가 끝났다면 history rewrite를 기본 선택으로 삼지 않습니다. History rewrite, force-push, mirror push는 기존 fork, clone, cache, search index에 남은 흔적을 보장해서 제거하지 못하므로 active 또는 active 가능 secret이 확인되고 별도 승인이 있을 때만 검토합니다.

`.github/CODEOWNERS`는 workflow ownership을 지정합니다. Code Owner review enforcement는 GitHub branch protection에서 Code Owner review가 켜져 있고, 해당 CODEOWNERS 파일이 protected base branch에 병합된 뒤에 완전히 적용됩니다. 공개 후보에 CODEOWNERS를 포함하고 branch protection을 설정한 뒤에도 merge 전까지는 이 until-merged 상태를 별도 리스크로 기록합니다.

## 공개 전 secret rotation

아래 값이 로컬 배포 상태 파일, 공유 메모, screenshot, terminal output에 노출된 적이 있으면 공개 전 또는 공개 직후 순서대로 교체합니다.

1. 새 `READMATES_BFF_SECRET`을 생성합니다.
2. Cloudflare Pages 운영 secret을 교체합니다.
3. OCI VM `/etc/readmates/readmates.env`를 교체합니다.
4. Spring을 재시작합니다.
5. `/api/bff/api/auth/me`를 smoke test합니다.
6. MySQL application user password를 교체합니다.
7. Google OAuth client secret을 교체합니다.
8. 새 OCI API key로 CLI 접근을 확인한 뒤 old key를 revoke합니다.
9. SSH deploy key가 공유 material에 들어갔다면 새 key로 교체합니다.

모든 secret을 한 번에 바꾸지 않습니다. 한 boundary를 바꾸고 smoke test한 뒤 다음 boundary로 넘어갑니다.

BFF, OAuth, domain boundary를 함께 바꾼 배포에서는 기본 auth smoke에 더해 Cloudflare Pages marker와 Google OAuth `redirect_uri`도 확인합니다. Smoke 결과에는 운영 domain 상태가 들어갈 수 있으므로 공개 문서와 Git에는 결과를 붙이지 않습니다.

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

## 로컬 파일 관리

Git ignore 대상 파일이라도 실제 secret을 담고 있으면 위험합니다. 가능하면 운영 secret은 repository 폴더 밖에 두고, 이슈나 지원 요청에 첨부하지 않습니다.

특히 아래 파일은 로컬에만 있어야 합니다.

- `.env.local`
- `front/.env.local`
- OCI CLI config와 private key
- SSH deploy key
- `deploy/oci/.deploy-state`
