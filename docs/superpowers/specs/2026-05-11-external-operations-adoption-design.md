# 외부 운영 자동화 패턴 반영 설계

상태: draft (작성자 검토 대기)
작성일: 2026-05-11
오너: docs / operations / deploy
분석 기준: 외부 운영 자동화 도구의 공개 저장소 snapshot `412410b6dd46dd42d7413f579cca7e0573645b79` (`master`, 2026-05-07)
ReadMates 재검토 기준: 커밋 `de77be6` (`docs: plan external operations workflow adoption`)의 `.github/workflows`, `deploy/oci`, `scripts`, `docs/deploy` 현재 상태

## 목적

ReadMates의 현재 배포, 운영, 테스트 체계를 유지하면서 외부 운영 자동화 도구에서 검증된 운영자 워크플로우 패턴을 선별해 반영한다. 핵심은 외부 도구의 Tauri 데스크톱 앱이나 SFTP 배포 방식을 가져오는 것이 아니라, **배포 attempt를 명시적으로 기록하고, 실패 시 멈추며, 읽기 전용 진단 채널로 빠르게 원인을 수집하고, 배포 후 smoke와 로그 관찰을 하나의 절차로 묶고, release tag가 만드는 artifact/image에 검증 증거를 남기는 운영 규율**을 ReadMates의 Cloudflare Pages + OCI Docker Compose 구조에 맞게 이식하는 것이다.

첫 라운드는 운영 안전장치와 문서화에 집중한다. 사용자 기능, 인증 모델, API contract, DB schema, Cloudflare BFF 구조는 바꾸지 않는다.

## 현재 맥락

### ReadMates 현재 강점

ReadMates는 해당 외부 도구보다 서비스 운영형 검증 체계가 이미 넓다.

- GitHub Actions CI가 frontend lint/test/build, server Gradle test, Playwright E2E shard를 실행한다.
- Cloudflare Pages frontend 배포와 GHCR server image publish workflow가 release tag 또는 manual dispatch 기준으로 분리되어 있다.
- `deploy/oci/05-deploy-compose-stack.sh`가 Docker Compose stack 배포, backup preflight, compose config 검증, container health smoke, Cloudflare BFF auth smoke를 수행한다.
- `scripts/build-public-release-candidate.sh`와 `scripts/public-release-check.sh`가 공개 후보 tree와 secret/path safety를 검사한다.
- `docs/operations/observability/`에 메트릭 카탈로그, 대시보드, alert 후보, SLO 문서가 있다.
- post-mortem 디렉토리와 incident 기록이 도입되어 있다.

### ReadMates 현재 gap

외부 운영 자동화 도구와 비교했을 때 ReadMates 운영 절차에서 아직 약한 부분은 아래다.

- 배포 attempt가 명시적인 상태 모델로 남지 않는다. script stdout은 있지만, `STARTED`, `FAILED_PREFLIGHT`, `FAILED_HEALTH`, `SUCCESS` 같은 구조화된 배포 기록이 없다.
- GHCR image tag가 실제 어떤 digest로 실행되었는지 배포 기록에 남지 않는다.
- 배포 직후 5-10분 동안 logs, health, BFF/OAuth smoke를 묶어 관찰하는 post-deploy watch 절차가 독립된 runbook으로 정리되어 있지 않다.
- 운영자가 Claude나 다른 도구에게 production 진단을 위임할 때 사용할 **읽기 전용 진단 채널**이 없다.
- `docs/operations/README.md`에는 runbook 디렉토리가 후속 항목으로만 남아 있다.
- shell script 품질 검증은 public release scanner와 manual execution 중심이며, `bash -n`/`shellcheck`류의 script-level CI gate가 없다.
- `scripts/build-public-release-candidate.sh`와 `scripts/public-release-check.sh`는 존재하지만 기본 `ci.yml`의 필수 job으로 실행되지 않는다.
- `deploy-server.yml`은 release image를 만들기 전에 `bootJar`만 실행하고 `clean test`를 다시 실행하지 않는다. `v*` tag가 잘못된 commit에 직접 붙으면 main/PR CI 통과 여부와 별개로 image publish가 시작될 수 있다.
- `deploy-front.yml`은 lint/test/build를 다시 실행하지만 Zod fixture drift check와 E2E shard는 release workflow 안에서 재확인하지 않는다.
- frontend deploy와 server image publish가 같은 `v*` tag에 독립적으로 반응하므로 한쪽만 성공하는 partial release 상태가 생길 수 있다.
- server image build에는 SBOM, provenance, image vulnerability scan, signing 같은 supply-chain 증거가 없다.
- CI 실패 시 Playwright report, Gradle test report, frontend test output이 GitHub Actions artifact로 자동 보존되지 않는다.
- production environment approval은 workflow 파일에 명시되어 있지 않고, GitHub environment protection 설정이 별도 운영 지식으로 남는다.

### 외부 도구에서 가져올 패턴

외부 운영 자동화 도구는 web service가 아니라 1인용 Tauri 데스크톱 운영 도구다. 따라서 stack을 복제하지 않고 운영 패턴만 채택한다.

| 외부 도구 패턴 | ReadMates 반영 방식 |
| --- | --- |
| Attempt 모델: 한 번의 시도를 원자 단위로 보고 성공/실패/중단을 구분 | OCI 배포 script에 배포 attempt id와 구조화된 JSONL ledger를 추가 |
| 자동 재시도 금지: 실패 시 즉시 멈추고 사람이 판단 | deploy/watch script가 실패를 재시도하지 않고 stage와 증거만 남김 |
| ForceCommand로 잠긴 진단 전용 SSH 키 | ReadMates용 read-only collector script와 설치 runbook을 추가 |
| 진단 수집: `journalctl`, health, JVM, disk, memory, network snapshot | Docker Compose 기준 `readmates-api`, `caddy`, Redis, Redpanda, Actuator, disk/memory snapshot 수집 |
| SFTP upload 후 remote sha256 검증 | GHCR image digest와 running container image id/digest 검증 |
| audit log 저장 | remote VM의 `/var/log/readmates/deploy-attempts.jsonl`에 sanitized attempt event 저장 |
| 위험 도구 gate/deny | ReadMates repo 자체에는 Claude hook을 넣지 않고, 운영 runbook에서 "읽기 전용 진단 키만 사용" 원칙을 문서화 |

## 결정

### 1. 운영 runbook 디렉토리를 신설한다

`docs/operations/runbooks/`를 현재 운영 절차의 진입점으로 만든다.

```text
docs/operations/runbooks/
  README.md
  deploy-attempts.md
  read-only-diagnostics.md
  post-deploy-watch.md
```

`docs/operations/README.md`는 post-mortems, observability, runbooks 세 축을 모두 링크한다.

Runbook은 실제 운영값을 포함하지 않는다. VM IP, 운영 domain 목록, private DB host, email address, OAuth secret, BFF secret, OCI OCID, smoke 결과 전문은 모두 Git 밖에 둔다.

### 2. 배포 attempt ledger를 추가한다

`deploy/oci/05-deploy-compose-stack.sh`에 최소한의 JSONL ledger helper를 추가한다. 배포 script는 다음 이벤트를 remote VM의 `/var/log/readmates/deploy-attempts.jsonl`에 append한다.

| 이벤트 | 시점 | 필드 |
| --- | --- | --- |
| `STARTED` | local preflight 성공 직후 | `attemptId`, `startedAt`, `image`, `source`, `scriptVersion` |
| `PREFLIGHT_PASSED` | VM Docker/Compose, runtime files, backup 확인 후 | `backupWindowHours`, `composeConfigChecked` |
| `IMAGE_RESOLVED` | registry pull 또는 local tar load 후 | `image`, `repoDigest` 또는 `localImageId` |
| `STACK_STARTED` | compose up 성공 후 | `services` |
| `HEALTH_PASSED` | container `/internal/health` 성공 후 | `healthEndpoint` |
| `BFF_SMOKE_PASSED` | Cloudflare BFF auth smoke 성공 후 | `appBaseUrl` host만, path만 |
| `SUCCESS` | 모든 단계 성공 | `completedAt`, `durationSeconds` |
| `FAILED` | trap으로 잡은 실패 | `failedAt`, `stage`, `exitCode`, `durationSeconds` |

Ledger에는 secret, env file content, OAuth parameter 전체, cookie, request/response body, raw logs, 실제 smoke output 전문을 저장하지 않는다.

상태 모델은 외부 도구의 attempt 종료 상태를 ReadMates 배포에 맞게 단순화한다.

| 상태 | 의미 | 다음 행동 |
| --- | --- | --- |
| `SUCCESS` | 배포 script와 smoke가 모두 성공 | release notes 또는 운영 기록에 sanitized summary만 반영 |
| `FAILED_PREFLIGHT` | env, Docker, backup, registry 준비 부족 | 배포 중단, 준비 조건 복구 후 새 attempt |
| `FAILED_DEPLOY` | image pull/load, runtime file install, compose config/up 실패 | compose logs와 ledger 확인, rollback 판단 |
| `FAILED_HEALTH` | container health 또는 BFF smoke 실패 | 새 image rollback 또는 runtime env 조사 |
| `USER_ABORTED` | 운영자가 중단 | 중단 시점 stage를 기록하고 수동 정리 |

### 3. image digest 검증을 배포 절차에 포함한다

릴리즈 배포에서 `READMATES_SERVER_IMAGE`가 `ghcr.io/`로 시작하면 VM에서 `docker pull` 후 다음 값을 얻는다.

```bash
sudo docker image inspect "$image_tag" \
  --format '{{json .RepoDigests}} {{.Id}}'
```

Compose start 후 실행 중인 `readmates-api` container의 image id를 얻는다.

```bash
sudo docker inspect "$(sudo docker compose -f compose.yml ps -q readmates-api)" \
  --format '{{.Image}}'
```

배포 script는 pulled image id와 running container image id가 일치하는지 확인한다. GHCR digest가 있으면 ledger에 digest를 기록한다. local image path에서는 digest 대신 local image id를 기록한다.

이 검증은 외부 도구의 SFTP upload `sha256` 검증과 같은 역할을 한다. ReadMates는 jar 파일을 직접 전송하지 않으므로 artifact 무결성 기준을 container image digest/id로 둔다.

### 4. read-only diagnostics collector를 추가한다

`deploy/oci/readmates-collect.sh`를 추가한다. 이 script는 ReadMates OCI Compose stack에 맞는 읽기 전용 진단 snapshot을 stdout으로 출력한다.

수집 범위:

- host: `hostname`, `date -Is`, `uptime`, `df -h`, `free -m`, `vmstat 1 3`
- systemd: `systemctl status readmates-stack --no-pager -l`
- compose: `/opt/readmates/compose.yml` 기준 `docker compose ps`, `docker compose logs --since 10 minutes --tail 200 readmates-api caddy`
- health: `readmates-api` container 내부 `http://127.0.0.1:8080/internal/health`
- actuator: `http://127.0.0.1:8081/actuator/health/readiness`와 `/actuator/prometheus` 중 안전한 summary
- Redis/Redpanda: compose health와 container status
- JVM: 가능하면 `jcmd`/`jstat`를 container 내부에서 실행하되, 없으면 명확히 skip
- recent errors: `readmates-api` logs에서 `ERROR|Exception|Caused by` 최근 24시간 count와 tail

금지 범위:

- `/etc/readmates/readmates.env` 내용 출력
- DB dump, member row, email, OAuth code, cookies, token, BFF secret, SMTP credential 출력
- raw request header 출력
- file write, service restart, Docker mutation, package install
- public 문서에 운영 결과 전문 저장

이 collector는 일반 SSH 세션에서도 수동 실행 가능하지만, 권장 운영 경로는 진단 전용 SSH public key를 `authorized_keys`에서 ForceCommand로 잠그는 방식이다.

예상 ForceCommand 라인 형태:

```text
command="/usr/local/bin/readmates-collect",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,restrict ssh-ed25519 <diagnostic-public-key> readmates-diagnostic
```

실제 public key 값은 Git에 넣지 않는다.

### 5. post-deploy watch를 독립 절차로 만든다

배포 완료 후 5-10분 동안 다음 확인을 묶는다.

- VM 내부 `/internal/health`
- Cloudflare Pages same-origin `/api/bff/api/auth/me`
- `scripts/smoke-production-integrations.sh`
- readmates-api/caddy 최근 logs의 `ERROR|Exception|Caused by`
- notification backlog metric 또는 host dashboard API는 알림 기능 변경이 있을 때만

watch는 자동 rollback을 하지 않는다. 실패하면 evidence를 보여주고 운영자가 rollback 또는 조사 결정을 내린다.

### 6. shell script CI gate를 추가한다

`.github/workflows/ci.yml`에 script validation job을 추가한다.

검증 범위:

- `bash -n scripts/*.sh deploy/oci/*.sh`
- `shellcheck scripts/*.sh deploy/oci/*.sh`

`shellcheck`가 false positive를 내는 경우에는 inline disable 주석을 남기되, 이유를 적는다. public release scanner는 secret/path safety용이고, shell script lint를 대체하지 않는다.

### 7. public release safety를 기본 CI에 편입한다

Public repo safety는 release 직전 수동 확인이 아니라 모든 PR과 `main` push에서 반복되는 guardrail이어야 한다. `.github/workflows/ci.yml`에 별도 job을 추가해 아래 명령을 실행한다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

이 job은 clean 공개 후보가 만들어지는지와 scanner가 통과하는지를 확인한다. Current-tree mode의 historical planning note finding은 별도 triage 대상이지만, candidate mode failure는 release blocker로 본다.

Candidate tree 자체는 실패 artifact로 업로드하지 않는다. Scanner failure에 active secret 가능성이 있으면 artifact upload가 오히려 노출 경로가 될 수 있기 때문이다.

### 8. release tag workflow를 검증 중심으로 강화한다

`v*` tag push와 manual dispatch는 production에 가까운 side effect를 만든다. 따라서 deploy workflow는 artifact publish 전에 자체 검증을 다시 수행한다.

`deploy-front.yml`:

- 기존 `pnpm lint`, `pnpm test`, `pnpm build`를 유지한다.
- `pnpm zod:export-fixtures`와 fixture diff check를 추가해 release tag에서도 frontend/backend contract drift를 막는다.
- GitHub `environment: production`을 job에 붙인다. Required reviewer, wait timer, environment secrets는 GitHub settings에서 별도 설정한다.

`deploy-server.yml`:

- `bootJar` 단독 실행을 `./server/gradlew -p server clean test bootJar`로 바꿔 release image publish 전에 server test를 재확인한다.
- `docker/build-push-action`에 SBOM/provenance 출력을 켠다.
- image vulnerability scan을 추가한다. 첫 도입에서 기존 base image CVE가 많으면 report-only baseline을 만든 뒤 HIGH/CRITICAL fail gate로 전환한다. 새 critical/high가 확인된 image는 운영 VM 배포 대상으로 쓰지 않는다.
- GitHub `environment: production`을 job에 붙인다. 이 설정은 approval boundary이며, backend production SSH credential을 Actions에 넣는 의미가 아니다.

두 workflow 모두 실패 시 test report와 build diagnostics를 artifact로 보존한다. Artifact에는 `.env`, runtime env file, provider state, smoke output 전문, private host 목록을 포함하지 않는다.

### 9. partial release를 명시적으로 관리한다

첫 라운드에서는 frontend deploy와 server image publish workflow를 하나의 release orchestrator로 합치지 않는다. 대신 같은 release tag의 각 workflow 결과를 release checklist에서 함께 확인하고, backend 운영 반영은 여전히 `05-deploy-compose-stack.sh`를 운영자가 수동 실행한다.

향후 release 빈도가 늘면 `release.yml` 하나에서 full verification, public release check, server image publish, frontend deploy, smoke를 순서대로 묶는 방안을 재검토한다. 이번 작업에서는 production deploy credential을 GitHub Actions에 추가하지 않는다.

## 상세 요구사항

### R1. Public repo safety

새 문서와 script는 public release 후보에 포함될 수 있다. 따라서 다음 값은 절대 쓰지 않는다.

- 실제 VM IP 또는 private IP
- 실제 운영 domain 목록. 이미 공개된 `readmates.pages.dev`만 예외로 허용한다.
- Gmail 주소, 실제 멤버 이름, 이메일, club 운영 데이터
- DB password, BFF secret, OAuth secret, SMTP password
- OCI OCID, provider token, SSH private key, public key 실제 값
- 로컬 workstation 절대 경로

### R2. 기존 architecture 유지

이번 작업은 운영/배포 문서와 shell script만 다룬다.

- frontend route, state, API client 변경 없음
- Cloudflare Pages Functions BFF 변경 없음
- Kotlin/Spring API 변경 없음
- MySQL/Flyway migration 없음
- Compose topology 변경 없음

### R3. 실패는 재시도하지 않고 멈춘다

배포 script와 watch script는 실패 시 같은 명령을 자동 재시도하지 않는다. 헬스체크 polling처럼 readiness를 기다리는 bounded loop는 허용하되, 실패한 배포를 다시 시작하거나 image를 바꾸거나 rollback을 자동 실행하지 않는다.

### R4. 읽기 전용 진단은 서버 쪽에서 강제한다

진단 전용 SSH 키를 쓰는 경우 안전성의 핵심은 client trust가 아니라 OpenSSH server의 ForceCommand다. 운영 문서는 이 차이를 명확히 설명한다.

### R5. 배포 ledger는 민감하지 않은 최소 정보만 남긴다

Ledger는 사후 분석을 위한 stage, time, image id/digest, status만 담는다. 로그 본문이나 response body는 남기지 않는다.

### R6. 검증은 변경 surface에 맞게 좁게 시작한다

첫 구현 완료 기준:

```bash
bash -n deploy/oci/*.sh scripts/*.sh
shellcheck deploy/oci/*.sh scripts/*.sh
git diff --check -- <changed-docs-and-scripts>
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

배포 script를 실제 운영 VM에 적용하는 검증은 별도 운영 승인 후 실행한다.

### R7. release workflow는 publish 전에 자체 검증을 수행한다

Release tag workflow는 이전 PR/main CI가 통과했을 것이라고 가정하지 않는다. `deploy-server.yml`은 server tests를 다시 실행하고, `deploy-front.yml`은 frontend contract fixture drift를 다시 확인한다. 검증이 실패하면 Cloudflare Pages upload 또는 GHCR image push를 실행하지 않는다.

### R8. supply-chain 증거는 public-safe metadata로만 남긴다

Image digest, image id, SBOM/provenance metadata, scanner summary는 운영 판단에 필요한 낮은 민감도의 release evidence다. 단, scanner raw output이나 artifact에는 private repository name, internal URL, env file content, token-shaped string이 들어가지 않도록 확인한다.

### R9. GitHub production environment는 승인 경계이지 배포 자동화가 아니다

Workflow에 `environment: production`을 붙이더라도 backend 운영 VM SSH credential을 GitHub Actions에 넣지 않는다. Backend production 반영은 이 spec의 첫 라운드에서 계속 수동 운영 절차로 남긴다.

## 파일 단위 설계

### `docs/operations/runbooks/README.md`

운영 runbook 진입점. post-mortem, observability와의 관계를 설명하고 runbook 목록을 제공한다.

### `docs/operations/runbooks/deploy-attempts.md`

배포 attempt 상태 모델, ledger 필드, 실패 stage별 대응 기준, release notes에 남길 sanitized summary 형식을 설명한다.

### `docs/operations/runbooks/read-only-diagnostics.md`

진단 전용 SSH 키, ForceCommand 설정, collector 실행, 출력 sanitization, 위협 모델과 한계를 설명한다.

### `docs/operations/runbooks/post-deploy-watch.md`

배포 후 5-10분 관찰 절차, smoke command, 실패 판정, rollback 판단 기준을 설명한다.

### `deploy/oci/readmates-collect.sh`

ReadMates OCI Compose stack용 read-only collector. stdout만 사용하고, 실패한 섹션은 전체 script 실패가 아니라 섹션별 `SKIP` 또는 `ERROR`로 표시한다. secret-bearing file content를 읽지 않는다.

### `deploy/oci/install-readmates-collector.sh`

Collector를 `/usr/local/bin/readmates-collect`로 설치하고 권한을 설정하는 helper. 진단 public key 등록은 운영자가 직접 하거나 별도 승인된 절차로만 수행한다. 첫 라운드에서는 public key를 인자로 받아 `authorized_keys`를 수정하는 자동화까지 넣지 않는다.

### `deploy/oci/05-deploy-compose-stack.sh`

배포 attempt id, remote ledger append, stage tracking, image digest/id 검증, post-deploy watch 호출 hook을 추가한다. 기존 배포 순서와 preflight 조건은 유지한다.

### `deploy/oci/watch-compose-post-deploy.sh`

배포 후 smoke와 logs scan을 묶는 read-only script. 운영자가 별도로 실행할 수 있고, `05-deploy-compose-stack.sh` 마지막 단계에서도 호출 가능하게 한다.

### `.github/workflows/ci.yml`

script validation job과 public release safety job을 추가한다. 기존 frontend/backend/e2e job의 검증 의미는 유지하되, 실패 시 test report artifact를 보존한다.

### `.github/workflows/deploy-front.yml`

Release tag frontend deploy 전에 Zod fixture drift를 확인하고, production environment approval boundary를 붙인다. Cloudflare Pages project, Wrangler command, `v*` tag/manual trigger는 유지한다.

### `.github/workflows/deploy-server.yml`

Release image publish 전에 server test를 재실행하고, image SBOM/provenance와 vulnerability scan을 추가하며, production environment approval boundary를 붙인다. GHCR publish target과 ARM64 image target은 유지한다.

### `scripts/README.md`, `docs/deploy/compose-stack.md`, `docs/deploy/oci-backend.md`

새 script와 운영 절차를 링크한다. 기존 deploy command와 rollback command는 유지한다.

## 테스트 전략

### 문서 검증

- `git diff --check -- <changed-docs>`
- changed docs 대상 public-safety grep:
  - local workstation path
  - Gmail address
  - OCI OCID
  - token-shaped secret
  - private key header

### script 정적 검증

- `bash -n deploy/oci/readmates-collect.sh deploy/oci/install-readmates-collector.sh deploy/oci/watch-compose-post-deploy.sh deploy/oci/05-deploy-compose-stack.sh`
- `shellcheck deploy/oci/readmates-collect.sh deploy/oci/install-readmates-collector.sh deploy/oci/watch-compose-post-deploy.sh deploy/oci/05-deploy-compose-stack.sh`

### public release 검증

- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

### CI/CD workflow 검증

- `git diff --check -- .github/workflows/ci.yml .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml`
- `rg -n "public-release|zod:export-fixtures|clean test bootJar|environment:|sbom:|provenance:" .github/workflows`
- Release workflow 변경 후 첫 `workflow_dispatch`는 운영 승인 없이 실행하지 않는다. Dry-run이 필요한 경우에는 workflow syntax와 local command verification만 수행하고, Cloudflare/GHCR side effect는 만들지 않는다.

### dry-run 검증

가능하면 script에 `READMATES_DEPLOY_DRY_RUN=true`를 추가하지 않는다. 배포 script는 실제 side effect가 많아 dry-run이 실제 안전을 보장하지 못한다. 대신 helper 함수는 shellcheck와 review로 검증하고, 실제 VM smoke는 운영 승인 후 실행한다.

### 운영 검증

별도 승인 후:

- staging 또는 운영 VM에서 collector를 수동 실행하고 출력에 secret이 없는지 확인한다.
- release image tag로 compose 배포를 실행하고 ledger event가 생성되는지 확인한다.
- 배포 후 watch가 smoke 실패를 자동 rollback 없이 실패로 반환하는지 확인한다.

## 비목표

- 외부 도구의 Tauri desktop UI 도입
- SFTP/JAR 업로드 배포로 회귀
- Claude Code hooks, autoMode, `.claude/settings.local.json` 자동 수정
- production deploy credential을 GitHub Actions에 추가
- frontend/server deploy workflow를 하나의 release orchestrator로 즉시 통합
- 자동 GitHub release notes 생성
- 자동 rollback
- alertmanager, Grafana, Prometheus 실 배포
- DB schema 변경
- API 또는 frontend behavior 변경

## 위험과 완화

| 위험 | 완화 |
| --- | --- |
| Collector가 secret을 출력 | `/etc/readmates/readmates.env` content를 절대 읽지 않고, 로그 grep도 request header/body를 출력하지 않게 제한 |
| ForceCommand 문서가 client-side safety처럼 오해됨 | 안전성은 server-side OpenSSH ForceCommand라는 점을 runbook 첫 문단에 명시 |
| Ledger가 운영 state로 Git에 들어옴 | ledger 위치를 VM `/var/log/readmates/`로 제한하고 `.tmp`, `.state`, `.env` 공개 후보 금지 정책 유지 |
| Deploy script가 너무 커짐 | helper 함수를 stage/ledger/image 검증으로 제한하고, post-deploy watch는 별도 script로 분리 |
| Script lint가 기존 legacy script 경고로 CI를 막음 | 첫 PR에서 모든 `deploy/oci/*.sh`와 `scripts/*.sh`를 함께 shellcheck 호환으로 정리하거나, 명확한 이유가 있는 disable 주석만 허용 |
| 자동 rollback 유혹 | spec과 runbook에 자동 rollback 금지를 명시. rollback command는 운영자가 수동 실행 |
| Release tag가 검증되지 않은 commit에 붙음 | deploy workflow가 자체 lint/test/fixture/server test를 다시 실행하고 실패 시 publish하지 않음 |
| Image scan이 기존 base image CVE로 즉시 막힘 | 첫 도입은 report-only baseline 허용, 새 HIGH/CRITICAL 기준으로 fail gate를 점진 강화 |
| Artifact upload가 민감한 운영 출력까지 보존 | test report와 build diagnostics만 업로드하고 candidate tree, env file, smoke output 전문은 업로드하지 않음 |
| Frontend deploy와 server image publish 중 하나만 성공 | 첫 라운드는 release checklist와 production environment approval로 명시 관리하고, 추후 release orchestrator 통합을 재검토 |

## 대안과 기각 사유

| 대안 | 기각 이유 |
| --- | --- |
| 외부 도구 자체를 ReadMates 운영 도구로 사용 | ReadMates는 Cloudflare/GHCR/Compose 배포 구조라 SFTP/JAR 워크플로우와 맞지 않음 |
| 배포 attempt ledger를 GitHub Deployment API에만 기록 | VM 내부 실패, rollback, 수동 운영 흔적이 GitHub API만으로는 충분히 남지 않음 |
| collector를 Spring endpoint로 구현 | 운영 장애 시 Spring 자체가 죽어 있을 수 있어 host/compose level 진단이 필요 |
| collector가 DB query까지 수행 | private data 노출 위험과 credential 취급 부담이 큼. 첫 라운드는 DB 접속 없이 health/metrics/log만 |
| post-deploy watch가 자동 rollback 수행 | 작은 서비스에서 자동 rollback은 원인 보존을 해칠 수 있고, DB migration 포함 release에서는 위험 |
| backend production deploy를 GitHub Actions SSH로 자동화 | credential blast radius가 커지고 현재 수동 approval 운영과 충돌. 첫 라운드는 image publish와 VM 반영을 분리 유지 |
| release workflows를 즉시 단일 orchestrator로 통합 | 기존 운영자는 tag/manual workflow를 이미 쓰고 있으며, 우선 필요한 guardrail은 각 workflow 내부 검증과 environment approval로 충분 |

## 완료 기준

첫 구현이 완료되려면 아래가 모두 충족되어야 한다.

- `docs/operations/runbooks/`가 현재 운영 문서 허브에서 링크된다.
- Read-only diagnostics runbook이 ForceCommand 설정, 위협 모델, secret 금지 범위를 설명한다.
- `deploy/oci/readmates-collect.sh`가 read-only command만 사용한다.
- `05-deploy-compose-stack.sh`가 attempt id, stage, ledger event, image id/digest 검증을 갖는다.
- post-deploy watch가 health, BFF smoke, OAuth smoke, recent log scan을 묶는다.
- CI에 shell script syntax/lint gate가 있다.
- CI에 public release candidate safety job이 있다.
- release tag server image workflow가 `clean test`를 통과한 뒤 image를 publish한다.
- release tag frontend workflow가 Zod fixture drift를 확인한 뒤 Cloudflare Pages에 deploy한다.
- server image workflow가 SBOM/provenance와 image vulnerability scan 결과를 남긴다.
- deploy workflows에 production environment approval boundary가 붙어 있다.
- 실패한 CI/CD job의 필요한 test/build diagnostics가 artifact로 남고, secret-bearing output은 artifact에 포함되지 않는다.
- public release candidate 검사가 통과한다.
- 실제 운영 배포 실행은 별도 승인 없이는 수행하지 않는다.
