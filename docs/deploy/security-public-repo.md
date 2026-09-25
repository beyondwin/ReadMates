# 공개 저장소 보안

ReadMates 저장소는 공개 GitHub 저장소로 전환하거나 공개 릴리즈 후보를 별도 저장소로 옮겨도 안전해야 합니다. 운영 secret, 실제 멤버 신원, provider 상태 파일은 Git이 추적하는 파일에 들어가면 안 됩니다.

완료 기준: clean 후보 생성 → 후보 scan → (필요 시) current-tree scan → finding 분류 → 공개 대상 파일 검토가 끝났을 때입니다. Scanner 통과는 보조 guardrail일 뿐, secret rotation이나 공개 전환을 대신하지 않습니다.

Active(또는 active 가능) secret이 발견되면 문서 수정으로 끝내지 않습니다. 공개 중단 → 영향 범위 확인 → boundary별 secret rotation → smoke 순서로 처리합니다. History rewrite나 force-push는 별도 승인 없이 하지 않습니다.

## 공개 방식

기존 private 저장소를 그대로 public으로 바꾸지 않습니다. 검토된 파일만 복사한 clean 공개 릴리즈 후보를 만듭니다.

- `scripts/build-public-release-candidate.sh`: `.tmp/public-release-candidate`를 만들기만 합니다. GitHub 게시나 공개 설정 변경은 하지 않습니다.
- `scripts/public-release-check.sh`: 후보 또는 현재 tree를 검사만 합니다. secret rotation, commit, push는 하지 않습니다.

후보에 들어가는 파일의 정확한 목록은 `scripts/build-public-release-candidate.sh`의 `copy_manifest()`가 기준입니다. 요약:

| 포함 | 예 |
| --- | --- |
| 루트 설정 | `.github/workflows/{ci,deploy-front,deploy-server,sync-config}.yml`, `.github/CODEOWNERS`(있을 때), `.gitignore`, `.gitleaks.toml`(있을 때), `.env.example`, `.node-version`, `README.md`, `PRODUCT.md`, `CHANGELOG.md`, `compose.yml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` |
| 제품 소스 | `design/`, `front/`, `server/` (build 산출물 제외) |
| 배포 | `deploy/oci/` (deploy state 제외) |
| 문서 | `docs/deploy/`, `docs/development/`, `docs/case-studies/`, `docs/operations/README.md`, `docs/operations/observability/`의 공개 문서, `docs/operations/runbooks/` |
| 관측 설정 | `ops/grafana/dashboards`, `ops/observability/local`, `ops/prometheus/{alerts,tests}`, `ops/tempo` |
| 스크립트 | 공개 릴리즈 helper, 서버/푸시 전 점검, 관측 설정 검증, 배포 후 smoke, `scripts/sync-config/`, `scripts/fixtures/public-release-candidate-coverage.txt` |

후보에서 빠지는 것(builder 제외 규칙 + 검증 denylist):

- `.git/`, `.env*`(단 `.env.example`), `*.env`, key material(`*.pem`, `*.key`, `*.p8` 등), DB dump, `*.state`
- build/test 산출물: `node_modules`, `front/dist`, `front/test-results`, `front/coverage`, `server/build`, `design/*/dist`, `design/standalone`, 모든 깊이의 `.tmp`
- 도구·agent 상태: `.claude`, `.cursor`, `.windsurf`, `.orchestrator`, `.gstack`, `.superpowers`, `.idea`, `.playwright-cli`, `.wrangler`, `.cloudflare`, `.vercel`
- contributor 전용 안내 파일(`AGENTS.md`, `CLAUDE.md` 등), 하위 디렉터리의 `CHANGELOG.md`, `*.local.md`
- `docs/superpowers/`(historical 기록), `private` 하위 트리, `recode`, screenshot 디렉터리, `deploy/oci/.deploy-state`

## 커밋 금지

- `.env`, `.env.*`(단 `.env.example`), `*.env`, `.dev.vars`
- `.vercel/`, `.wrangler/`, `.cloudflare/`
- `deploy/oci/.deploy-state`, `deploy/oci/*.env`, `deploy/oci/*.state`, `deploy/cloudflare/.deploy-hook.env`
- `*.pem`, `*.key`, SSH/OCI API private key
- `*.sql.gz`, `*.dump`, DB dump, production export archive
- 실제 BFF secret, DB password, Google OAuth client secret
- 실제 멤버 이메일이나 개인 Gmail 주소

## 커밋 가능

- placeholder만 있는 `.env.example`
- scanner 설정 `.gitleaks.toml`
- `host@example.com`, `member1@example.com` 같은 예약된 sample email과 공개 가능한 sample 이름
- `local-dev-secret`, `e2e-secret`, `test-secret` 같은 테스트 전용 값
- credential이 아닌 provider resource 이름
- 운영 절차를 설명하는 문서와 script

## 현재 ignore 기준

루트 `.gitignore`가 기준입니다. 공개 안전에 중요한 항목:

```text
.env
.env.*
*.env
!.env.example
.dev.vars
*.pem
*.key
*.sql.gz
*.dump
.tmp/
.gstack/
.wrangler
.cloudflare
.vercel
.superpowers/
.claude/*
!.claude/settings.json
!.claude/commands/
.orchestrator/
.server-config/
output/
recode
/design/standalone/
/design/docs/dist/
/design/system/dist/
deploy/oci/.deploy-state
deploy/oci/*.env
deploy/oci/*.state
deploy/cloudflare/.deploy-hook.env
```

- `design/system`, `design/docs`는 frontend와 CI가 쓰는 제품 source라 후보에 포함합니다. 로컬 산출물(`design/standalone`, 각 `dist`)만 제외합니다.
- `.claude/`는 `settings.json`과 `commands/`만 추적하고 나머지 local agent 상태는 ignore합니다. 후보에는 `.claude/` 전체가 들어가지 않습니다.

## 공개 전 scan

1. 후보를 만들고 검사합니다.

   ```bash
   ./scripts/build-public-release-candidate.sh
   ./scripts/public-release-check.sh .tmp/public-release-candidate
   ```

2. 필요하면 현재 private tree도 검사합니다.

   ```bash
   ./scripts/public-release-check.sh
   ```

검사 방식:

- 현재 tree 모드: `git ls-files` 기준으로 tracked 금지 경로와 symlink를 봅니다.
- 후보 모드: `find`로 후보 전체의 금지 경로와 symlink를 봅니다.
- 두 모드 모두 private key, OCI OCID, GitHub token, API key 형태 token, 실제처럼 보이는 DB/BFF/OAuth secret 할당, Gmail 주소, private club domain, 로컬 workstation 경로를 찾습니다.
- `gitleaks`가 있으면 `.gitleaks.toml`로 `gitleaks dir`을 실행합니다(구버전은 `gitleaks detect --source`로 대체). 없으면 fallback path/content 검사만 하며, 이것은 완전한 secret scan이 아닙니다.

ignored 로컬 파일(운영 백업, agent 상태)을 검사 범위에서 빼야 할 때는 current-tree 모드를 pass/fail 기준으로 쓰지 않습니다. 대신 clean 후보와 tracked archive를 검사합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate

tmp="$(mktemp -d)"
git archive HEAD | tar -x -C "$tmp"
gitleaks dir "$tmp" --config "$tmp/.gitleaks.toml" --no-banner --redact=100 --verbose
rm -rf "$tmp"
```

- `docs/superpowers/`는 historical 기록이라 후보에 넣지 않습니다. 현재 동작으로 굳은 내용은 `docs/development/`, `docs/deploy/`, `docs/operations/`로 옮깁니다. private tree에서 이 디렉터리의 finding이 많으면 후보 검사 결과를 우선합니다.
- `gitleaks detect --source .`는 Git history까지 봐서 과거 commit의 redacted 예시를 계속 보고할 수 있습니다. 현재 tree와 후보가 통과하고 active secret이 아니라면 history rewrite를 기본 선택으로 삼지 않습니다. rewrite·force-push·mirror push는 이미 퍼진 fork/clone/cache 흔적을 지우지 못하므로, active secret이 확인되고 별도 승인이 있을 때만 검토합니다.
- `.github/CODEOWNERS`의 review 강제는 branch protection에서 Code Owner review가 켜지고 CODEOWNERS가 protected base branch에 병합된 뒤에야 적용됩니다. 그 전까지는 별도 리스크로 기록합니다.

## 공개 전 secret rotation

아래 값이 로컬 상태 파일, 공유 메모, screenshot, terminal output에 노출된 적이 있으면 공개 전(또는 직후)에 순서대로 교체합니다. 한 번에 하나의 boundary만 바꾸고 smoke한 뒤 다음으로 넘어갑니다.

1. 새 BFF secret을 만듭니다.
2. GitHub Secrets `READMATES_BFF_SECRETS`를 `<new-secret>,<old-secret>`으로 바꾸고 `sync-config`를 `restart_api=true`로 실행합니다. VM의 `/etc/readmates/readmates.env`가 갱신되고 `readmates-api`가 재시작됩니다([secrets management runbook](../operations/runbooks/secrets-management.md)).
3. Cloudflare Pages 운영 secret에도 같은 목록을 설정하고 재배포합니다.
4. `/api/bff/api/auth/me`를 smoke합니다.
5. `/api/bff/__internal/secret-status`와 `bff_secret_rotation_audit`에서 old secret 트래픽이 0이 된 것을 확인하고 old secret을 뺍니다.
6. MySQL application user password를 교체합니다.
7. Google OAuth client secret을 교체합니다.
8. 새 OCI API key로 CLI 접근을 확인한 뒤 old key를 revoke합니다.
9. SSH deploy key가 공유된 적이 있으면 새 key로 바꿉니다.

BFF, OAuth, domain을 함께 바꿨다면 Pages marker와 Google OAuth `redirect_uri`도 확인합니다. 결과는 공개 문서나 Git에 붙이지 않습니다.

```bash
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://app.example.com \
./scripts/smoke-production-integrations.sh
```

## 로컬 파일 관리

ignore 대상이라도 실제 secret을 담은 파일은 위험합니다. 가능하면 운영 secret은 저장소 폴더 밖에 두고, 이슈나 지원 요청에 첨부하지 않습니다. 아래 파일은 로컬에만 둡니다.

- `.env.local`, `front/.env.local`
- OCI CLI config와 private key
- SSH deploy key
- `deploy/oci/.deploy-state`, `deploy/cloudflare/.deploy-hook.env`

## Observability secrets

Prometheus, Alertmanager, Grafana 자격증명은 Git에 두지 않고 환경 변수로만 주입합니다.

| 변수 | 의미 | placeholder 예시 |
| --- | --- | --- |
| `READMATES_ALERT_SMTP_HOST` | SMTP server host | `smtp.example.com` |
| `READMATES_ALERT_SMTP_PORT` | SMTP port | `587` |
| `READMATES_ALERT_SMTP_USER` | SMTP user | — |
| `READMATES_ALERT_SMTP_PASSWORD` | SMTP password | — |
| `READMATES_ALERT_SMTP_FROM` | 발신 주소 | `alerts@example.com` |
| `READMATES_ALERT_EMAIL_TO` | 운영자 수신 주소 | `ops@example.com` |
| `READMATES_GRAFANA_ADMIN_USER` | Grafana admin user | `readmates` |
| `READMATES_GRAFANA_ADMIN_PASSWORD` | Grafana admin password | — |

- `scripts/public-release-check.sh`는 `deploy/oci/{prometheus,alertmanager,grafana}/`, `ops/prometheus/alerts/`, `ops/tempo/`에 예시가 아닌 이메일 도메인이나 IPv4 literal이 있으면 실패합니다.
- Prometheus target은 docker network 이름(`readmates-api:8081`, `alertmanager:9093`)만 씁니다.
- Grafana는 운영 VM의 `127.0.0.1:3001`에만 바인딩하고 SSH tunnel로 접근합니다. Tempo/OTLP는 host port를 publish하지 않습니다.
- `scripts/validate-production-ai-config.sh`는 app의 내부 `tempo:4318` endpoint, legacy selector 부재, Google paid-tier 확인값의 fail-closed sync를 함께 확인합니다.
