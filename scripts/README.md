# ReadMates 스크립트

이 디렉터리에는 공개 릴리즈 후보 생성·검사, 로컬/CI 점검, 로컬 OAuth 실행, 관측 설정 검증, 배포 후 smoke 스크립트가 있습니다. 명령은 모두 저장소 루트에서 실행하는 기준입니다.

이 스크립트들은 GitHub에 게시하지 않고, 저장소 공개 설정을 바꾸지 않고, secret을 교체하지 않고, commit을 만들지 않습니다. 공개 저장소 기준은 [공개 저장소 보안](../docs/deploy/security-public-repo.md)을 봅니다.

- scanner 실패는 경고가 아니라 실패입니다. finding은 공개 가능 / 수정 필요 / active secret 가능성으로 분류합니다.
- `gitleaks` 미설치 fallback처럼 검증이 약해진 경우는 결과에 그 한계를 적습니다.
- 스크립트 통과만으로 secret rotation, 공개 전환, branch protection, production 배포가 끝났다고 보지 않습니다.

## 한눈에 보기

| 목적 | 스크립트 |
| --- | --- |
| 서버 PR 수준 점검 | `server-ci-check.sh` |
| 푸시 전 CI 점검 | `pre-push-check.sh` |
| 배포 workflow 계약 검사 | `check-deploy-workflow-contract.py` |
| Flyway migration 불변성 검사 | `check-flyway-migration-immutability.py` |
| 공개 릴리즈 후보 생성·검사 | `build-public-release-candidate.sh`, `public-release-check.sh`, `verify-public-release-fixtures.sh` |
| 배포 후 공개 연동 smoke | `smoke-production-integrations.sh` |
| 로컬 Google OAuth | `run-local-google-oauth.sh`, `run-local-google-oauth-stack.sh`, `verify-local-google-oauth-*.sh`, `check-local-google-oauth-redirect.py` |
| 관측 설정 검증 | `validate-prometheus-*.sh`, `validate-tempo-config.sh`, `validate-alertmanager-config.sh`, `lint-grafana-dashboards.sh`, `observability-local-smoke.sh` |
| 운영 AI 설정 검증 | `validate-production-ai-config.sh`, `verify-production-ai-config-fixtures.sh` |
| AI 생성 PII/라이브 smoke | `aigen-pii-check.sh`, `aigen-smoke-{claude,openai,gemini}.sh` |
| 월간 SLO 보고서 초안 | `generate-slo-report.py` |
| 운영 env → GitHub Secrets/Variables 일괄 등록 | `sync-config/import-from-prod-env.sh` (기본 dry-run, `--apply`로 실제 반영) |
| 빌드/테스트 시간 측정 | [`bench/`](bench/README.md) |

## Source-checkout contributor guidance

전체 source checkout에는 저장소 전용 contributor 라우팅·사전 점검·안내 검사 도구가 있을 수 있습니다. 있으면 계획 보조용으로 쓰되, 아래 표준 점검을 대신하지 않습니다.

clean 공개 릴리즈 후보에는 contributor 전용 안내가 의도적으로 빠져 있습니다. 후보에 포함된 release helper는 특정 로컬 agent 도구 없이 동작합니다.

## `check-deploy-workflow-contract.py`

`Deploy Server Image` workflow가 아래 계약을 지키는지 fail closed로 검사합니다. CI, `pre-push-check.sh`, 공개 후보가 같은 checker를 씁니다.

- exact release semver의 annotated tag를 checkout합니다.
- tag commit과 `HEAD`가 같습니다.
- Trivy가 검사한 digest와 같은 digest만 release tag로 promote합니다.

```bash
python3 -B scripts/check-deploy-workflow-contract.py --self-test
python3 -B scripts/check-deploy-workflow-contract.py
```

다른 workflow 파일을 검사할 때만 `--workflow <path>`를 씁니다. workflow를 실행하거나 image를 publish하지는 않습니다.

## `check-flyway-migration-immutability.py`

기준 commit에 있던 production migration(`server/src/main/resources/db/mysql/migration/`)이 수정·삭제·rename·이동되지 않았는지 검사합니다.

```bash
python3 -B scripts/check-flyway-migration-immutability.py --self-test
python3 -B scripts/check-flyway-migration-immutability.py --base-ref <trusted-base-ref>
```

- staged, unstaged, untracked, index/worktree 차이를 모두 봅니다. Git 기본 줄바꿈 정규화는 적용하므로 플랫폼별 줄바꿈은 변경으로 보지 않습니다.
- migration에 활성 `filter` attribute가 있으면 외부 filter를 실행하기 전에 거부합니다.
- shallow history, 해석할 수 없는 base, 공통 조상 없음, 잘못된 파일명·위치, 중복 version, symlink, 읽을 수 없는 파일은 거부합니다. lazy fetch는 하지 않습니다.
- 출력은 merge base object ID, migration 수, 다음 허용 version입니다. SQL 본문, Git 오류 전문, 로컬 절대 경로는 출력하지 않습니다.

실패하면 과거 migration을 고치거나 `flyway repair`로 우회하지 않습니다. 안내된 최대 version보다 큰 `V{N}__lower_snake_case_description.sql`을 새로 추가합니다. 기존 version 빈칸을 채우는 낮은 번호도 허용되지 않습니다.

## `run-local-google-oauth.sh`

macOS Keychain에서 로컬 Google OAuth credential을 읽어 Spring backend 프로세스에만 주입합니다. Git이나 `.env`에는 저장하지 않습니다. 운영과 분리된 localhost 전용 Web client를 쓰고, 등록 절차는 [로컬 개발 환경](../docs/development/local-setup.md#macos-keychain으로-로컬-google-oauth-실행)을 따릅니다.

```bash
./scripts/run-local-google-oauth.sh
```

client ID 형식, secret 누락, 대표 placeholder를 거부하고 값은 출력하지 않습니다. backend를 띄우지 않고 Keychain 조회와 형식만 볼 때:

```bash
READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN=true ./scripts/run-local-google-oauth.sh
```

mock Keychain으로 경계를 검증하는 fixture(실제 Keychain·Google 호출 없음):

```bash
./scripts/verify-local-google-oauth-keychain-fixtures.sh
```

## `run-local-google-oauth-stack.sh`

frontend와 backend를 한 번에 띄우고 포트 충돌, health 준비, 종료 정리를 관리합니다.

```bash
./scripts/run-local-google-oauth-stack.sh
```

포트와 동작을 바꿀 때:

```bash
READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=5174 \
READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=28080 \
READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=28081 \
READMATES_LOCAL_GOOGLE_OAUTH_STARTUP_TIMEOUT_SECONDS=180 \
READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER=false \
./scripts/run-local-google-oauth-stack.sh
```

준비되면 `Ctrl+C`로 끝냅니다. 자기가 시작한 프로세스 그룹만 정리하고, 임시 로그는 OS temp에 둡니다.

## `verify-local-google-oauth-stack.sh`

실행 중인 stack의 OAuth redirect contract를 secret 노출 없이 검사합니다. provider redirect URL은 출력하지 않고, 실제 Google 로그인 완료는 확인 대상이 아닙니다.

```bash
./scripts/verify-local-google-oauth-stack.sh
```

포트는 위와 같은 `READMATES_LOCAL_GOOGLE_OAUTH_*_PORT` 변수로 바꿉니다. runner 없이 경계(포트 충돌, timeout, 정리, redaction)를 검증하는 fixture:

```bash
./scripts/verify-local-google-oauth-stack-fixtures.sh
```

## `server-ci-check.sh`

서버 코드를 고친 뒤 GitHub Actions backend job과 같은 품질 게이트를 로컬에서 돌립니다.

```bash
./scripts/server-ci-check.sh
```

실행 명령: `./server/gradlew -p server --no-build-cache --rerun-tasks check`. `check`에는 `unitTest`, `architectureTest`, ktlint, detekt, JaCoCo 검증이 들어갑니다. Docker가 필요한 `integrationTest`는 별도로 실행합니다.

실행 명령만 확인할 때:

```bash
READMATES_SERVER_CI_CHECK_DRY_RUN=true ./scripts/server-ci-check.sh
```

## `pre-push-check.sh`

푸시 전에 CI에서 자주 실패하던 게이트를 로컬에서 먼저 돌립니다.

```bash
./scripts/pre-push-check.sh
```

옵션: `--full`, `--release` / `--no-release`, `--dry-run`, `--no-changelog-check`, `-h`.

기본 실행 순서:

1. (release 모드일 때) CHANGELOG Unreleased 가드
2. contributor 안내 검사 (full source checkout에 도구가 있을 때만)
3. 배포 workflow 계약 검사 (`check-deploy-workflow-contract.py`)
4. 루트 `packageManager`의 pnpm을 Corepack으로 활성화
5. `git diff --check` (기준: `READMATES_PRE_PUSH_BASE`, 기본 `origin/main`. `docs/superpowers/`는 제외)
6. frontend `lint` → `test:coverage` → `build` → `zod:export-fixtures` → Zod fixture 변경 없음 확인
7. `./scripts/server-ci-check.sh`
8. `validate-production-ai-config.sh`, `verify-production-ai-config-fixtures.sh`
9. 공개 릴리즈 검사: `verify-public-release-fixtures.sh` + `public-release-check.sh .tmp/public-release-candidate`

frontend 명령은 `corepack pnpm ...`으로 실행하고, `corepack`이 PATH에 없으면 `npx --yes corepack@0.35.0 pnpm ...`을 씁니다. 전역 설치된 다른 버전 pnpm으로 우회하지 않습니다.

공개 릴리즈 검사(9)는 `.github/`, `deploy/`, `docs/`, `scripts/`, 루트 안내 파일, `README.md`, `.env.example`, `.gitleaks.toml`이 바뀌었을 때 자동으로 돕니다. `--release`는 항상, `--no-release`는 건너뜁니다.

`--full`은 추가로 `./server/gradlew -p server integrationTest`, `pnpm --dir front test:e2e`(Corepack 경유), 관측 설정 검증(Prometheus rules/config, Tempo, Grafana dashboard, Alertmanager)을 실행합니다. Docker, MySQL client, Playwright browser가 필요하므로 보통 릴리즈 직전에 수동으로 씁니다.

```bash
./scripts/pre-push-check.sh --full --release
```

### Release-mode CHANGELOG guard

`--release` 또는 `READMATES_PRE_PUSH_RELEASE=true`면 `CHANGELOG.md`의 `## Unreleased`가 비어 있는지(placeholder 상태인지) 먼저 검사합니다.

- 실패: `### Added|Changed|Fixed|Engineering|Engineering Proof Portfolio|Deployment Notes|Verification|Removed|Security` 헤더가 있음, bullet이 2개 이상, bullet에 `**`가 있음, `## Unreleased` 섹션이 없거나 비어 있음.
- 통과: `_No unreleased changes._` 같은 placeholder 문장, 또는 `### Highlights` 아래 meta-placeholder bullet 하나(예: `다음 릴리즈 후보 변경을 이 섹션에 기록합니다.`).
- 우회: `--no-changelog-check`. emergency에만 쓰고 [release-management.md](../docs/development/release-management.md#branch-protection-bypass-policy)에 따라 bypass 사유를 ledger에 남깁니다.

```bash
# Release tag push 직전 표준 실행
./scripts/pre-push-check.sh --release

# 환경 변수로 release 모드 강제
READMATES_PRE_PUSH_RELEASE=true ./scripts/pre-push-check.sh

# 다른 CHANGELOG 파일로 가드만 시험
READMATES_PRE_PUSH_CHANGELOG=<fixture-changelog-path> ./scripts/pre-push-check.sh --release

# Emergency 우회 (사유 ledger 기록 필수)
./scripts/pre-push-check.sh --release --no-changelog-check
```

로컬 Git hook(`.git/hooks/pre-push`)에서 이 스크립트를 부르게 할 수 있습니다. hook은 로컬 설정이라 `--no-verify`로 우회되고 다른 clone에는 전파되지 않습니다.

## `lint-grafana-dashboards.sh`

`ops/grafana/dashboards/*.json`의 JSON 유효성, 필수 필드(`title`, `schemaVersion`, `panels`), AI panel, Tempo datasource/exemplar 계약을 검사합니다. CI `scripts` job에서 실행됩니다.

```bash
./scripts/lint-grafana-dashboards.sh
```

## Prometheus / Tempo / Grafana / Alertmanager validators

관측 설정의 구조를 Docker 기반 `promtool`/`amtool`(`prom/prometheus`, `prom/alertmanager` image)로 검사합니다. 로컬 설치가 필요 없습니다. CI `scripts` job은 Alertmanager를 뺀 나머지를, `pre-push-check.sh --full`은 AI 설정 검증을 뺀 관측 검증을 실행합니다(AI 설정 검증은 기본 pre-push에 포함).

```bash
./scripts/validate-prometheus-rules.sh    # ops/prometheus/alerts/*.yml
./scripts/validate-prometheus-config.sh   # deploy/oci/prometheus/prometheus.yml
bash ./scripts/validate-tempo-config.sh   # Tempo 7일 retention, 내부 port
./scripts/validate-alertmanager-config.sh # deploy/oci/alertmanager/alertmanager.yml
./scripts/validate-production-ai-config.sh # 내부 OTLP, legacy 제거, Google retention sync
./scripts/verify-production-ai-config-fixtures.sh # legacy selector 회귀 fixture
```

`validate-alertmanager-config.sh`는 `${READMATES_ALERT_*}`를 dummy 값으로 바꾼 임시 파일(`.tmp` 아래, 종료 시 삭제)을 검사하므로 실제 SMTP credential이 필요 없습니다.

배포 전후 결과를 어떤 증거로 볼지는 [Deploy observability check runbook](../docs/operations/runbooks/deploy-observability-check.md)을 따릅니다.

## `observability-local-smoke.sh`

격리된 MySQL, Spring server, Prometheus/Grafana/Tempo를 띄워 합성 OTLP trace 조회, scrape target, Grafana datasource와 AI dashboard, span metric을 확인합니다. 이어서 Tempo를 멈춰도 server health가 유지되고 실패 metric이 늘어나는지 봅니다. 실제 운영 domain이나 credential은 쓰지 않습니다.

```bash
bash ./scripts/observability-local-smoke.sh
```

management port 8081을 직접 쓰므로 이미 떠 있는 server가 있으면 충돌을 먼저 해결합니다. Docker, curl, jq, Python이 필요합니다.

## `generate-slo-report.py`

`server/src/main/resources/slo/slos.yaml`의 Prometheus query를 실행해 월간 SLO markdown 초안을 출력합니다. 승인된 tunnel이나 port-forward로 Prometheus를 로컬에 연 뒤 실행하고, `CHECK` 행은 incident/deploy 맥락과 함께 검토합니다.

```bash
python3 scripts/generate-slo-report.py \
  --prometheus-url http://localhost:9090 \
  --month 2026-06 > docs/operations/slo-reports/2026-06.md
```

보고서에는 운영 도메인, 수신자 이메일, token, private endpoint를 쓰지 않습니다.

## `aigen-pii-check.sh`

앱 안 AI 세션 생성 경로가 transcript, parsed turns, 결과, evidence, 멤버 이름을 DB, Kafka message, metric tag, migration column, metadata hash, log/exception으로 흘리지 않는지 검사합니다. 콘텐츠는 job-store adapter가 관리하는 Redis short-lived key(`:transcript`, `:turns`, `:result`, `:evidence`)에서만 허용됩니다.

```bash
bash scripts/aigen-pii-check.sh
```

CI `scripts` job이 PR마다 실행합니다. 실패하면 출력의 `checkN` 메시지와 [AI session generation runbook](../docs/operations/runbooks/ai-session-generation.md#pii-regression)으로 어떤 invariant가 깨졌는지 봅니다.

## `aigen-smoke-{claude,openai,gemini}.sh`

provider 라이브 API key가 있는 검토된 환경에서 AI 생성 multipart start/polling을 수동 확인합니다. 공개해도 되는 합성 회원과 대본만 쓰고 private transcript는 받지 않습니다. 라이브 호출은 retention 조건과 별도 승인이 필요하므로 CI는 `bash -n` 문법 검사만 합니다.

```bash
./scripts/aigen-smoke-claude.sh
./scripts/aigen-smoke-openai.sh
./scripts/aigen-smoke-gemini.sh
```

key, transcript, 응답 전문, 운영 domain은 Git에 남기지 않습니다. 모델 허용 목록, cap, key 회전, kill switch는 [AI session generation runbook](../docs/operations/runbooks/ai-session-generation.md)을 따릅니다.

## `build-public-release-candidate.sh`

```bash
./scripts/build-public-release-candidate.sh
```

1. 출력 위치는 `.tmp/public-release-candidate`로 고정입니다. `.tmp`가 저장소 안의 실제 디렉터리인지 먼저 확인합니다.
2. 복사 전에 승인된 source root의 `.envrc*` 파일과 symlink를 거부합니다.
3. `.tmp/public-release-candidate.staging.*`에 후보를 만들고 검증합니다.
4. 검증을 통과해야 기존 후보를 교체합니다. 실패하면 이전 후보가 그대로 남습니다.
5. 성공하면 후보 경로와 다음 확인 명령을 출력합니다.

포함 범위의 정확한 목록은 스크립트의 `copy_manifest()`가 기준입니다. 요약은 [공개 저장소 보안](../docs/deploy/security-public-repo.md#공개-방식)에 있습니다.

- 디렉터리 복사 시 `.env*`, `*.env`, key material, dump, `.DS_Store`, 모든 깊이의 `.tmp`, 도구 상태, contributor 안내 파일, 하위 `CHANGELOG.md`를 빼고, manifest별로 build/test 산출물과 deploy state를 뺍니다.
- staging 검증은 denylist 기준입니다. 금지 경로(provider state, screenshot, `.gstack`, `.superpowers`, `.idea`, `.playwright-cli`, `.tmp`, `recode`, `docs/superpowers` 등)나 symlink가 남아 있으면 빌드가 실패합니다. 조용히 빠진다고 가정하지 않습니다.
- 루트 `.env.example`만 의도적으로 포함되는 env 파일입니다. `.gitleaks.toml`이 있으면 함께 포함되어 같은 scanner 규칙을 씁니다.
- `.github/CODEOWNERS`가 들어가도 review 강제는 GitHub branch protection 설정이 따로 필요합니다.

## `public-release-check.sh`

```bash
# 후보 검사
./scripts/public-release-check.sh .tmp/public-release-candidate

# 현재 private tree 검사
./scripts/public-release-check.sh
```

- 현재 tree 모드: `git ls-files` 기준 tracked 금지 경로와 symlink.
- 후보 모드: `find`로 후보 전체의 금지 경로와 symlink. 후보의 shipped 안내가 빠진 contributor 전용 경로를 요구하는지도 봅니다.
- 차단 항목: private key, OCI OCID, GitHub token, API key 형태 token, 실제처럼 보이는 DB/BFF/OAuth secret 할당, Gmail 주소, private club domain, 로컬 workstation 경로, 금지 경로.
- `gitleaks`가 있으면 `.gitleaks.toml`로 `gitleaks dir <path>`를 실행합니다(구버전은 `gitleaks detect --source <path>`로 대체하고 그 사실을 출력). 없으면 targeted 검사만 하며, 이것은 완전한 secret scan이 아닙니다.

current-tree 모드는 ignored 파일까지 `gitleaks dir .`로 읽을 수 있습니다. `.server-config/`, `.wrangler/`, `.gstack/`, `.tmp/`, `.claude/`, `.orchestrator/` 같은 ignored 로컬 파일을 범위에서 빼야 하면 current-tree 모드를 pass/fail 기준으로 쓰지 말고 후보와 tracked archive를 검사합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate

tmp="$(mktemp -d)"
git archive HEAD | tar -x -C "$tmp"
gitleaks dir "$tmp" --config "$tmp/.gitleaks.toml" --no-banner --redact=100 --verbose
rm -rf "$tmp"
```

`gitleaks detect --source .`는 Git history까지 검사합니다. 과거 commit의 redacted 예시나 fixture finding은 active secret 여부와 따로 분류하고, active secret이 아니면 history rewrite나 force-push를 기본 처리로 삼지 않습니다.

## `verify-public-release-fixtures.sh`

scanner pattern을 바꾼 뒤 실행합니다. 후보를 한 번 만들고 `.tmp/public-release-fixtures` 아래 fixture로 `public-release-check.sh`를 호출합니다.

```bash
./scripts/verify-public-release-fixtures.sh
```

확인 항목:

- `$`가 들어간 DB password 할당을 차단합니다.
- comment에 placeholder가 있어도 실제처럼 보이는 secret은 통과시키지 않습니다.
- 문서화된 placeholder와 환경 변수 간접 참조는 통과합니다.
- builder가 nested source `.tmp`를 빼고, checker가 root/nested `.tmp`를 거부합니다(임시 `front/.tmp` fixture는 종료 시 제거).
- `.tmp` parent가 symlink면 실행을 거부합니다.
- 후보에 top-level manifest, 루트 pnpm 계약, `front`·`design/system`·`design/docs` package manifest가 있습니다.
- 후보의 shipped 안내가 빠진 contributor 전용 경로를 요구하지 않습니다.

## `smoke-production-integrations.sh`

배포 후 Pages marker와 Google OAuth start redirect를 확인합니다. secret이 필요 없고, 결과는 공개 문서나 Git에 붙이지 않습니다.

```bash
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://app.example.com \
./scripts/smoke-production-integrations.sh
```

등록된 club host까지 볼 때:

```bash
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://<primary-domain> \
READMATES_SMOKE_CLUB_HOST=https://<registered-club-host> \
./scripts/smoke-production-integrations.sh
```

| 변수 | 설명 |
| --- | --- |
| `READMATES_SMOKE_BASE_URL` | 검사할 Pages origin. 생략하면 스크립트 기본값을 쓰므로 명시를 권장합니다. |
| `READMATES_SMOKE_AUTH_BASE_URL` | `redirect_uri` 기준 origin. 기본은 `READMATES_SMOKE_BASE_URL` |
| `READMATES_SMOKE_CLUB_HOST` | 선택. 등록된 club host |
| `READMATES_SMOKE_STRICT_GOOGLE` | `true`면 Google 응답에서 `redirect_uri_mismatch`도 찾아봅니다. Google 화면은 지역·계정·bot 방어에 따라 바뀌므로 기본은 `false`입니다. |

검사 항목:

- `/.well-known/readmates-domain-check.json`이 ReadMates marker를 반환합니다.
- `/oauth2/authorization/google?returnTo=/app`이 Google OAuth로 redirect됩니다.
- Google에 보내는 `redirect_uri`가 `READMATES_SMOKE_AUTH_BASE_URL/login/oauth2/code/google`과 같습니다.
