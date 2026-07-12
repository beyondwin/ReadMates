# 공개 저장소 보안

ReadMates 저장소는 공개 GitHub 저장소로 전환하거나 공개 릴리즈 후보를 별도 저장소에 옮겨도 안전해야 합니다. 운영 secret, 실제 멤버 신원, provider 상태 파일은 Git이 추적하는 파일에 들어가면 안 됩니다.

공개 안전 작업은 clean 후보 생성, 후보 scan, 필요한 current-tree scan, scanner finding triage, 공개 대상 파일 검토가 끝났을 때 완료입니다. Scanner 통과는 active secret 부재를 보조 확인하는 guardrail이며, 운영 secret rotation이나 GitHub 공개 전환을 대신하지 않습니다.

Active 또는 active 가능 secret이 발견되면 문서 수정으로 끝내지 않습니다. 먼저 공개 중단, 영향 범위 확인, boundary별 secret rotation, smoke check 순서로 처리하고, history rewrite나 force-push는 별도 승인 전에는 실행하지 않습니다.

## 공개 방식

기본 전략은 기존 private 저장소를 그대로 public으로 전환하는 것이 아니라, 검토된 파일만 복사한 clean 공개 릴리즈 후보를 만드는 것입니다. 공개 릴리즈 후보에는 제품 소스, 공개 배포/개발 문서, placeholder 기반 예시만 포함하고 private 작업 이력, 로컬 산출물, provider 상태, 실제 secret은 포함하지 않습니다.

`scripts/build-public-release-candidate.sh`는 `.tmp/public-release-candidate`를 만들 뿐 GitHub에 게시하거나 저장소 공개 설정을 바꾸지 않습니다. `scripts/public-release-check.sh`는 후보 또는 현재 tree를 검사할 뿐 secret rotation, commit 생성, 원격 push를 수행하지 않습니다.

공개 릴리즈 후보에 포함하는 주요 경로:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-front.yml`
- `.github/workflows/deploy-server.yml`
- `.github/CODEOWNERS`, 파일이 있을 때만 포함
- `.gitignore`
- `.gitleaks.toml`, 파일이 있을 때만 포함
- `.env.example`
- `README.md`, `PRODUCT.md`
- `compose.yml`
- `front/`
- `server/`
- `deploy/oci/`
- `docs/deploy/`
- `docs/development/`
- `docs/operations/README.md`와 `docs/operations/runbooks/`
- 공개 릴리즈 후보 생성, 검사, fixture 검증, 배포 후 공개 연동 smoke용 `scripts/`

공개 릴리즈 후보에서 제외하는 주요 경로:

- `.git/`
- `.env`, `.env.*`, 단 `.env.example`은 예외
- `.envrc`, `.envrc.*`
- `front/.env*`
- `docs/superpowers/`의 historical design/spec/implementation records
- sanitization을 거치지 않은 private planning docs
- 실제 멤버 데이터, 로컬 절대 경로, private domain, provider state, 실제 secret, token-shaped example, 개인 Gmail 주소가 남아 있는 historical planning docs
- `design/`
- `output/`
- `front/output/`
- `front/dist/`
- `front/test-results/`
- `front/playwright-report/`
- `front/coverage/`
- `front/.nyc_output/`
- `.gstack/`
- `.claude/`
- `.orchestrator/`
- `.server-config/`
- `.superpowers/`
- `.idea/`
- `.playwright-cli/`
- `.tmp/`
- `docs/private/`
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
- public release scanner 설정인 `.gitleaks.toml`
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
.claude/
.orchestrator/
.tmp
.server-config/
docs/private/
```

`design/`은 로컬 설계 산출물 폴더로 취급하고 공개 저장소에는 올리지 않습니다.
`.claude/`와 `.orchestrator/`는 local agent 설정과 실행 state이며 product source of truth가 아니므로 Git에 추적하지 않습니다. 이미 추적된 파일이 발견되면 `git rm --cached`로 index에서 제거하고 local copy는 ignore된 상태로 남깁니다.

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

ignored 로컬 운영 백업이나 agent state를 이번 검증 범위에서 제외해야 하는 작업은 no-argument current-tree mode를 pass/fail gate로 쓰지 않습니다. 대신 clean candidate scan과 tracked archive scan을 함께 사용합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate

tmp="$(mktemp -d)"
git archive HEAD | tar -x -C "$tmp"
gitleaks dir "$tmp" --config "$tmp/.gitleaks.toml" --no-banner --redact=100 --verbose
rm -rf "$tmp"
```

`docs/superpowers/`는 historical design/spec/implementation record로 보관하되 clean 공개 릴리즈 후보에는 포함하지 않습니다. 현재 동작이나 운영 절차로 승격된 내용은 `docs/development/`, `docs/deploy/`, `docs/operations/` 중 적절한 source-of-truth 문서로 옮긴 뒤 공개 후보 scanner 대상에 둡니다. 현재 private tree에서 `docs/superpowers/` finding이 필요 이상으로 많다면 공개 후보 build/check 결과를 우선하고, 해당 historical 문서를 source-of-truth로 승격하지 않습니다.

Git history까지 검사하는 `gitleaks detect --source .`는 이미 공개된 과거 commit의 redacted 예시나 fixture를 계속 보고할 수 있습니다. 현재 tree와 clean 후보가 `gitleaks dir` 및 public-release check를 통과하고 active secret이 아니라는 검토가 끝났다면 history rewrite를 기본 선택으로 삼지 않습니다. History rewrite, force-push, mirror push는 기존 fork, clone, cache, search index에 남은 흔적을 보장해서 제거하지 못하므로 active 또는 active 가능 secret이 확인되고 별도 승인이 있을 때만 검토합니다.

`.github/CODEOWNERS`는 workflow ownership을 지정합니다. Code Owner review enforcement는 GitHub branch protection에서 Code Owner review가 켜져 있고, 해당 CODEOWNERS 파일이 protected base branch에 병합된 뒤에 완전히 적용됩니다. 공개 후보에 CODEOWNERS를 포함하고 branch protection을 설정한 뒤에도 merge 전까지는 이 until-merged 상태를 별도 리스크로 기록합니다.

## 공개 전 secret rotation

아래 값이 로컬 배포 상태 파일, 공유 메모, screenshot, terminal output에 노출된 적이 있으면 공개 전 또는 공개 직후 순서대로 교체합니다.

1. 새 BFF secret을 생성합니다.
2. GitHub Secrets `READMATES_BFF_SECRETS`에 `<new-secret>,<old-secret>`을 설정하고 `sync-config` 워크플로를 실행해 OCI VM `/etc/readmates/readmates.env`를 갱신하고 `readmates-api`를 재시작합니다 (절차: [secrets management runbook](../operations/runbooks/secrets-management.md)).
3. Cloudflare Pages 운영 secret에도 같은 `READMATES_BFF_SECRETS` 목록을 설정하고 배포합니다.
4. `/api/bff/api/auth/me`를 smoke test합니다.
5. `/api/bff/__internal/secret-status`와 `bff_secret_rotation_audit`에서 old-secret alias 트래픽이 0으로 떨어졌는지 확인한 뒤 old secret을 제거합니다.
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

## Observability secrets

Prometheus/Alertmanager/Grafana 자체는 자격증명을 git에 두지 않는다. SMTP receiver와 Grafana admin credential은 env로만 주입된다.

| 변수 | 의미 | placeholder 예시 |
|------|------|------------------|
| `READMATES_ALERT_SMTP_HOST` | SMTP server host | `smtp.example.com` |
| `READMATES_ALERT_SMTP_PORT` | SMTP port | `587` |
| `READMATES_ALERT_SMTP_USER` | SMTP user | — |
| `READMATES_ALERT_SMTP_PASSWORD` | SMTP password | — |
| `READMATES_ALERT_SMTP_FROM` | sender address | `alerts@example.com` |
| `READMATES_ALERT_EMAIL_TO` | operator recipient(들) | `ops@example.com` |
| `READMATES_GRAFANA_ADMIN_USER` | Grafana admin user | `readmates` |
| `READMATES_GRAFANA_ADMIN_PASSWORD` | Grafana admin password | — |

`scripts/public-release-check.sh`가 `deploy/oci/{prometheus,alertmanager,grafana}/`, `ops/prometheus/alerts/`에 예시값이 아닌 이메일 도메인이나 IPv4 literal이 들어오면 fail시킨다. Prometheus target은 docker network DNS(`readmates-api:8081`, `alertmanager:9093`)만 사용한다. Grafana는 운영 VM의 `127.0.0.1:3001`에만 바인딩하고 SSH tunnel로 접근한다.
