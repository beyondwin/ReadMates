# ReadMates Release Readiness Review

이 문서는 현재 branch의 ReadMates-specific release risk를 검토하는 active checklist입니다. 2026-07-11 이전의 dated evidence는 [`docs/reports/2026-07-11-release-readiness-history.md`](../reports/2026-07-11-release-readiness-history.md)에 보존되어 있으며 현재 절차의 source of truth가 아닙니다.

## 기본 범위

기본 범위는 현재 branch와 base branch의 차이입니다. 보통 `origin/main..HEAD`를 사용합니다.

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git diff --name-only origin/main..HEAD
```

feature branch에서 base가 `origin/main`이 아니면 실제 base branch 또는 merge-base를 먼저 확인합니다. 사용자가 명시적으로 특정 implementation plan 범위만 보라고 하지 않았다면, 최신 계획 문서나 마지막 커밋 묶음으로 범위를 좁히지 않습니다.

## 필수 확인 항목

- `CHANGELOG.md`의 `## Unreleased`가 사용자에게 보이는 변경, 운영자에게 보이는 변경, security posture 변경, CI/deploy 변경, behavior change를 반영하는지 확인합니다.
- 운영자가 놀랄 수 있는 변경이 historical planning docs에만 남지 않고 CHANGELOG, deploy/runbook, operator-facing docs 중 적절한 곳에 기록되어 있는지 확인합니다.
- CI/deploy script가 scan한 artifact와 publish/deploy한 artifact를 다르게 만들지 않는지, root cause를 오도하는 진단 메시지를 만들지 않는지, broad false positive로 운영 실패를 유발하지 않는지 확인합니다.
- Security code에 피할 수 있는 dead code, inconsistent constant-time behavior, unsafe fallback mode, secret/token exposure, audit/metric silent-loss mode가 없는지 확인합니다.
- Architecture test의 baseline이나 exception list가 새 부채를 영속화하지 않는지 확인합니다. 남겨야 한다면 후속 plan, issue, TODO가 아니라 실행 가능한 추적 문서에 명시되어야 합니다.
- Public release candidate 생성과 scanner가 새 generated artifact, private state, local path, token-shaped data를 허용하지 않는지 확인합니다.
- 운영 분석 또는 observability 표면이 바뀌면 데이터 부족, 측정 실패, 위험 신호가 UI/API/docs에서 서로 구분되는지 확인합니다. Analytics 변경은 가능한 경우 query budget evidence와 public-safe visual evidence를 함께 남깁니다.
- 테스트 통과는 중요한 증거지만, release note 누락, 운영 surprise, 보안 코드 위생, 배포 진단 리스크를 자동으로 닫지는 않습니다.

## DB/API 릴리즈 추가 체크리스트

DB migration 또는 public API contract 변경이 포함된 release는 일반 테스트 통과 외에 아래 증거를 release-readiness review에 남깁니다.

- **Migration scope:** 변경된 `server/src/main/resources/db/mysql/migration/V*.sql` 파일, Flyway 적용 방향, additive 여부, rollback 대신 forward-fix가 필요한 이유.
- **API contract scope:** 변경된 route, method, request schema, response schema, error code, auth requirement, frontend Zod fixture/export 영향.
- **Deployment order:** `main` merge, annotated release tag, `Deploy Server Image`, 필요한 `sync-config(restart_api=false)`, OCI compose promotion/Flyway/health, same-tag `Deploy Front` manual dispatch, post-deploy smoke 순서.
- **Review path:** non-author reviewer 존재 여부, solo-admin release PR 사용 여부, branch protection blocker가 있다면 `POLICY_MISMATCH`, `CHECK_FAILURE`, `MISSING_EVIDENCE` 중 하나로 분류.
- **Smoke evidence:** anonymous BFF/auth status, logged-in host/member route, OAuth redirect marker, DB-backed route, admin route 중 변경 표면에 맞는 smoke 결과.
- **Public safety:** public release candidate check 결과와 private value, token-shaped value, local path, member data 노출 여부.
- **Residual risk:** deploy 전 남은 일, deploy 후 남은 일, skipped validation, operator follow-up을 분리합니다.

`POLICY_MISMATCH`는 reviewer 부재 또는 code-owner self-review 요구처럼 정책 설정이 단독 운영 현실과 맞지 않는 경우에만 사용합니다. CI 실패, scanner 실패, smoke 실패, release note 누락은 `POLICY_MISMATCH`가 아니며 merge 전에 고칩니다.

## 권장 명령

변경 파일에 맞춰 필요한 명령만 실행하되, 아래 확인을 우선 고려합니다.

```bash
git diff --check origin/main..HEAD
rg -n "^## Unreleased|\\(없음\\)" CHANGELOG.md
rg -n "[T]ODO|baseline|exception|allowlist|fallback|audit|secret|token|scan|deploy|watch|POLICY_MISMATCH|CHECK_FAILURE|MISSING_EVIDENCE" \
  CHANGELOG.md \
  .github \
  deploy \
  scripts \
  server/src/main/kotlin \
  server/src/test/kotlin
```

Public release나 deploy 관련 변경이 있으면 repo guide의 public release checks도 실행합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Server behavior, auth, BFF, persistence, architecture boundary 변경이 있으면 관련 targeted test와 server guide의 server check를 선택합니다.

```bash
./scripts/server-ci-check.sh
```

Persistence, migration, API contract, query budget, or Testcontainers behavior changes also require the relevant focused test or `./server/gradlew -p server integrationTest`.

Frontend route, BFF proxy, user-flow 변경이 있으면 frontend guide의 checks와 E2E 필요성을 검토합니다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

## 출력 형식

findings를 우선순위별로 보고합니다.

- Blocker
- High
- Medium
- Low
- Not an issue

각 finding에는 파일/라인, 문제가 되는 이유, 추천 액션, 실행한 검증 또는 실행하지 못한 검증을 포함합니다. 문제가 없다고 판단한 항목도 중요한 오해 가능성이 있었다면 `Not an issue`에 짧게 남깁니다.

## 완료 기준

- 검토 범위가 `origin/main..HEAD` 또는 명시된 base 범위로 기록되어 있습니다.
- CHANGELOG/release note, 운영 문서, CI/deploy, security-code hygiene, architecture baseline, public-release safety가 모두 고려되었습니다.
- 실행한 검증과 skipped validation이 구분되어 있습니다.
- “테스트 통과”만을 근거로 운영/릴리즈 리스크가 없다고 결론내리지 않았습니다.

## v2.1.0 release evidence — 2026-07-31

### 범위와 결정

- 범위는 `v2.0.1..codex/release-v2.1.0`과 publication 직전 `origin/main..HEAD`이며 frontend, additive API, Java 25 runtime, public candidate, CI와 release docs를 포함합니다.
- Release class는 **minor**입니다. 새 `GET /api/archive/me/journey`는 현재 멤버의 기존 열람 범위를 합산하고, 새 `GET /api/host/clubs/{clubSlug}/ai-generation/capabilities`는 현재 클럽 호스트에게 AI 활성화 상태를 제공하는 additive endpoint입니다. 기존 endpoint나 request schema를 제거하지 않으며 Pages Functions BFF는 두 route를 기존 trusted proxy 경계로 전달합니다.
- Local decision은 **GO after release PR/main CI and GHCR scan**입니다. Release PR CI와 merge SHA의 CI를 모두 확인한 뒤 annotated `v2.1.0` tag를 만들고, tag image scan/promote가 성공하기 전에는 OCI/backend 및 frontend production promotion을 시작하지 않습니다.

### Migration, API와 운영 계약

- `v2.0.1` 이후 migration 변경은 없고 production schema baseline은 V42입니다.
- `GET /api/archive/me/journey`는 current membership의 개인 기록 summary와 cursor page를 고정 query 수로 반환합니다. `/app/me`는 최근 3건을 쓰고 전체 기록은 기존 archive route를 유지합니다.
- Additive `GET /api/host/clubs/{clubSlug}/ai-generation/capabilities`는 current-club host에게 `200 {"enabled": boolean}`을 반환합니다. Member와 cross-club host는 403으로 fail closed하고, frontend Zod `AiGenerationCapabilitiesResponseSchema`와 exported fixture가 wire shape를 고정합니다. Backend-first 배포 동안 구 frontend는 이 endpoint를 호출하지 않으며, 같은-tag frontend가 배포된 뒤 host defaults 화면이 활성화 상태를 읽습니다.
- Spring Boot `4.0.7`이 Spring Framework `7.0.8`을 관리해 CVE-2026-41842, CVE-2026-41845, CVE-2026-41850의 수정 버전을 릴리즈 이미지에 포함합니다. Boot 4.0.7은 CVE-2026-40992 수정으로 Spring Mail STARTTLS/SSL hostname verification을 기본 활성화하므로 production SMTP certificate mismatch는 이제 fail closed합니다. Production provider의 4분 timeout, SDK retry off, single-wire-request 계약은 바뀌지 않으며 테스트용 timeout fixture만 CI scheduling 여유를 갖게 했습니다.
- Secret/env/OAuth/cookie/permission/provider activation과 `sync-config` rendering은 바뀌지 않습니다. 실제 메일과 live provider 호출은 smoke에서 제외합니다.

### CI/CD와 review path

- 순서는 release PR merge → merge SHA CI → annotated tag → `Deploy Server Image` scan/promote → credential-free production SMTP STARTTLS hostname probe → same-tag OCI Compose backend promotion/health → `Deploy Front(release_tag=v2.1.0)` → GitHub Release → production smoke입니다.
- CI는 fixture가 만든 동일 public candidate를 최종 scan합니다. Deploy Server/Front와 sync-config 계약은 바뀌지 않았습니다.
- Active ruleset이 없고 branch protection도 확인되지 않아 `POLICY_MISMATCH`입니다. Release PR과 두 단계 CI를 수동 강제합니다.
- Builder fixture와 scanner가 nested `.tmp`, local path, token형 값, private member/transcript/deploy state를 거절합니다.

### Remote status — 2026-08-03 read-only refresh

- `v2.1.0` annotated tag와 같은 tag의 server image build/scan/promote는 확인됐습니다.
- Same-tag frontend와 GitHub Release는 확인되지 않았고, OCI/production 상태는 workflow 목록에서 추론하지 않습니다.

### Local verification

| Evidence | Result |
| --- | --- |
| `./scripts/pre-push-check.sh --full --release` | PASS — CHANGELOG guard, frontend lint/coverage/build, Zod fixtures, server quality, AI/privacy/config, public candidate/gitleaks, Testcontainers, Chromium E2E, observability |
| Frontend coverage | PASS — 223 files / 1,776 tests; 83.41% statements, 78.47% branches, 83.91% functions, 84.12% lines |
| Isolated Chromium E2E | PASS — 107/107 with owned Docker MySQL and non-conflicting local ports |
| Component/design gates | PASS — Chromium CT 17/17, design-system 14/14, design-docs 2/2 and builds |
| `./scripts/server-ci-check.sh` | PASS after Spring Boot `4.0.7` update and timeout-fixture stabilization |
| `./server/gradlew -p server integrationTest bootJar` | PASS |
| Local `linux/arm64` release image + Trivy `0.70.0` | PASS — Ubuntu packages 0, application JARs 0 HIGH/CRITICAL findings |
| Workflow/shell/config/public safety | PASS — Actionlint, Bash, ShellCheck, AI PII/config, observability validators, candidate fixtures/gitleaks |

### Production-only pending and residual risk

- Release PR/main CI와 tag-triggered GHCR build/scan/promote는 완료됐습니다. OCI backend promotion과 health, credential-free SMTP hostname probe, same-tag frontend dispatch, GitHub Release, production smoke는 아직 별도 실제 실행 결과로 닫아야 합니다.
- 기본 로컬 E2E 포트와 MySQL CLI는 개발 머신의 관련 없는 SSH tunnel/서비스와 충돌했습니다. 관련 없는 프로세스를 종료하지 않고 전용 Docker MySQL과 격리 포트로 동일 Chromium suite를 통과시켰으며 이 환경 차이를 release evidence에 보존합니다.
- Spring Boot 4.0.7은 SMTP hostname verification을 새로 기본 적용합니다. Tag image의 production promotion 전에 운영 SMTP host의 STARTTLS certificate hostname을 자격 증명·메일 발송 없이 검사하고, mismatch 또는 handshake 실패는 `CHECK_FAILURE`로 분류해 backend promotion을 중단합니다.
- Live provider account retention/paid-tier와 실제 member/host write는 CI가 증명하지 않습니다. 기존 fail-closed allowlist를 유지하고, 인증된 smoke는 read-only 또는 no-send 경로로 제한하며 private value를 Git이나 GitHub Release에 기록하지 않습니다.

## v2.0.1 release evidence — 2026-07-25

### Patch scope and decision

- `v2.0.0` tag의 server workflow run `30148358730`은 GHCR scan candidate build 뒤 Trivy HIGH gate에서 멈췄습니다. Release image tag promotion 전에 중단되었고 config sync, OCI backend, Cloudflare frontend, GitHub Release는 실행하지 않았습니다.
- `v2.0.1`은 같은 v2 source에 release blocker만 닫는 patch입니다. `com.fasterxml.jackson.core:jackson-core 2.21.2`를 `2.21.4`로, Netty `4.2.15.Final`을 `4.2.16.Final`로 정렬합니다. API, migration, host-write handshake, notification/AI product behavior는 바꾸지 않습니다.
- Decision은 **GO after patch PR/main CI and GHCR scan**입니다. 기존 `v2.0.0` tag를 이동하거나 덮어쓰지 않고 새 annotated `v2.0.1` tag를 사용합니다.

### Verification and remaining production gates

| Evidence | Result |
| --- | --- |
| Gradle runtime dependency insight | PASS — Jackson core `2.21.4`/`3.1.4`, Netty compression/HTTP/HTTP3 `4.2.16.Final` |
| `./scripts/server-ci-check.sh` | PASS |
| Local `linux/arm64` release image build | PASS |
| Trivy `0.70.0` HIGH/CRITICAL scan | PASS — Ubuntu packages 0, application JARs 0 |
| `./scripts/pre-push-check.sh --full --release` | PASS — frontend 1,536 tests/build, server quality and Testcontainers integration, public candidate/gitleaks, Playwright 92/92, observability config |

- Patch PR과 merge SHA의 CI, GHCR `v2.0.1` scan/promote, production config sync, OCI promotion/Flyway/health, same-tag frontend dispatch, GitHub Release와 production smoke는 순서대로 닫아야 합니다.
- Live provider quality calls과 실제 알림 발송은 이 patch smoke에 포함하지 않습니다. 기존 production provider allowlist와 fail-closed 정책을 유지하고, member address/body/private transcript를 release evidence에 기록하지 않습니다.

## v2.0.0 release evidence — 2026-07-25

### 범위와 결정

- 비교 범위는 이전 제품 tag `v1.17.3..codex/release-v2.0.0`과 publication 직전 `origin/main..HEAD`입니다. 이 범위는 frontend, Pages Functions BFF, Spring API, V37–V42 migration, AI/notification/session-record 운영 계약, CI/deploy workflow와 active docs를 포함합니다.
- Release class는 **major**입니다. 기존 SEND/SKIP host-action 계약을 제거하고 staged session-record와 explicit notification composer API를 함께 도입해 이전 frontend/server 조합을 장기간 혼용할 수 없습니다.
- Local decision은 **GO after release PR CI**입니다. Release PR의 merge SHA에서 CI가 성공해야 tag를 만들며, tag 뒤 production-only 단계가 하나라도 실패하면 frontend dispatch와 release 완료 판정을 중단합니다.

### Migration과 API contract

- V37/V38은 grounded AI content-free receipt/audit·provider-attempt metadata를 additive하게 추가합니다.
- V39–V41은 `session_record_drafts`, immutable `session_record_revisions`, metadata-only host audit와 AI receipt/draft binding을 추가합니다. JSON import와 AI commit은 reviewed snapshot을 staged draft에 저장하고 live record는 별도 apply 전까지 바꾸지 않습니다.
- V42는 idempotent `session_record_apply_receipts`, opt-in `club_notification_policies`, manual dispatch content revision과 `SELECTED_MEMBERS` audience를 forward-only로 추가합니다. Destructive rollback 대신 schema를 남긴 image rollback/forward-fix를 사용합니다.
- 새 host record contract는 `/api/host/sessions/{sessionId}/record-editor`, `record-draft`, `record-apply[-preview]`, `history`, revision restore route family입니다.
- 새 notification contract는 `/api/host/notifications/manual/{options,dispatches,preview}`, manual confirm, `/api/host/notifications/policy`입니다. Close, Escape, navigation, content save는 dispatch를 만들지 않고 preview/confirm만 outbox를 만들 수 있습니다.
- Frontend Zod fixture export와 server serialization contract가 AI job/evidence, draft/apply, notification preview/confirm problem shapes를 고정합니다.

### CI/CD와 review path

- Tag push는 `Deploy Server Image`만 시작합니다. Trivy가 통과한 GHCR tag를 만든 뒤 `sync-config(restart_api=false, dry_run=false)` → OCI Compose promotion/Flyway/health/BFF → `Deploy Front(release_tag=v2.0.0)` → final smoke 순서를 사용합니다. Front workflow는 입력 tag 형식과 checkout commit을 검증하므로 새 frontend가 구 backend API를 먼저 호출하는 window를 만들지 않습니다.
- `sync-config`는 `READMATES_HOST_WRITE_CLIENT_CONTRACT_REQUIRED=true`를 고정합니다. 새 browser는 host mutation에 v2를 선언하고 새 Pages BFF만 그 값을 trusted upstream header로 재생성하며 Spring도 exact match를 요구합니다. 따라서 backend-first 창과 열린 구 탭은 host write 409로 동결되고 새 browser + 새 BFF만 재개합니다. E2E backend도 같은 gate를 켜 전체 browser→Vite→Spring 경로를 검증합니다.
- Live `main` protection 조회 결과 required status checks와 required PR reviews가 설정되지 않았고 admin enforcement도 꺼져 있습니다. 분류는 `POLICY_MISMATCH`이며 보호가 적용된 것처럼 간주하지 않습니다.
- 이 release는 DB migration, public API, deploy workflow를 바꾸므로 direct-push solo path를 사용하지 않습니다. Release PR을 만들고 CI의 merge SHA 성공을 수동 확인한 뒤 admin merge하며, `main` CI 성공을 다시 확인한 뒤 tag를 발행합니다.

### Local verification

| Evidence | Result |
| --- | --- |
| `./scripts/pre-push-check.sh --full --release` | PASS — agent guidance, frontend lint/coverage/build, Zod fixtures, server PR quality, AI/privacy/config validators, public candidate/gitleaks, Testcontainers integration, Playwright E2E와 observability config gates |
| `corepack pnpm --dir front test:e2e` | PASS — 92/92 |
| `corepack pnpm --dir front test:ct:docker` | PASS — 7/7 route-critical component tests |
| `actionlint .github/workflows/deploy-front.yml .github/workflows/deploy-server.yml .github/workflows/sync-config.yml` | PASS — no findings |
| Public release candidate | PASS — candidate built, required files/workflows present, gitleaks no findings |

### Production-only pending and residual risk

- Release PR #14와 `main` CI는 통과했고 annotated `v2.0.0` tag를 발행했습니다. Server workflow run `30148358730`은 scan candidate를 만든 뒤 Jackson core/Netty의 수정 가능한 HIGH 6건으로 Trivy gate에서 차단됐으며 release image tag로 promote되지 않았습니다.
- Fail-closed 순서에 따라 production config sync, OCI backend/Flyway, frontend dispatch와 GitHub Release는 실행하지 않았습니다. 기존 production은 변경되지 않았고, source tag를 이동하지 않은 채 `v2.0.1` patch release로 이어갑니다.
- Private transcript를 live provider에 보내는 품질 평가는 실행하지 않습니다. Provider account retention/paid-tier 상태는 CI가 증명하지 않으며 현재 production allowlist와 fail-closed 설정을 이 release에서 임의로 넓히지 않습니다.
- V37–V42는 forward-only입니다. OCI promotion 전에 최근 48시간 backup을 확인하고, 실패 시 새 frontend를 배포하지 않은 채 AI/consumer를 먼저 끄고 schema를 유지하는 이전 호환 image 또는 patch release로 roll forward합니다.
- Frontend만 이전 tag로 rollback하면 v2 backend가 host write를 409로 계속 동결합니다. 읽기/멤버 표면을 보존한 안전 상태이며, 쓰기 복구는 호환 frontend 재배포 또는 schema를 보존한 backend rollback/forward-fix로 수행합니다.
- 실제 알림 발송은 release smoke에 포함하지 않습니다. 인증된 host 확인은 preview close/no-send와 기존 sanitized ledger를 사용하며 실제 member address/body를 증거에 남기지 않습니다.
