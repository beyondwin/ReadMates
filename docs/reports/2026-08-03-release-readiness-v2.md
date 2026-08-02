# ReadMates v2 Release Readiness Evidence

이 문서는 v2.0.0 이후 릴리스의 시점별 검토·배포 증거를 보관하는 snapshot입니다. 현재 검토 절차와 완료 기준은 [release-readiness-review.md](../development/release-readiness-review.md)를 우선합니다.

## v2.2.0 release evidence — 2026-08-03

### 범위와 결정

- 검토 범위는 `v2.1.0..HEAD` 전체이며 guest browsing, target-club OAuth join, 통합 멤버 프로필/아바타, 멤버 공간 UI, React Router 8 보안 전환, CI/deploy provenance, Flyway V43–V46, active docs를 포함합니다.
- Release class는 **minor**입니다. 로그인 없는 guest app, 새 `PUT /api/me/profile`, canonical exposure field, target-club join과 네 개의 forward-only migration이 추가되므로 patch로 축소하지 않습니다.
- Publication decision은 **GO only after release PR/main CI, annotated tag, GHCR scan/promote, OCI Flyway/health, same-tag frontend와 final smoke**입니다. `v2.1.0` tag는 이동하거나 덮어쓰지 않고 `v2.2.0`을 새로 발행합니다.

### Migration, API와 호환 배포

- V43은 `memberships.avatar_key`를 도입하고, V44는 중간 avatar catalog로 확장합니다. V46이 최종 30-key catalog로 모든 membership을 다시 쓰고 named check constraint를 교체하므로 V43/V44를 수정하거나 squash하지 않습니다.
- V45는 app access의 `sessions.access_scope`와 public marketing placement의 `public_session_publications.site_visibility`를 분리하고 기존 값을 backfill합니다. 기존 `visibility`/`is_public` read/write는 rolling deploy와 rollback을 위한 한 릴리즈 compatibility window로 유지합니다.
- 새 guest read와 scoped OAuth join은 기존 public/member/host 권한을 넓히지 않고 target club, signed state, 1회용 join intent, current membership 경계를 fail closed로 검증합니다. `PUT /api/me/profile`은 현재 club membership의 표시 이름과 avatar를 한 transaction에서 변경하며 구 patch endpoint는 cached client 호환 창으로 남습니다.
- 배포 순서는 release PR/main CI → annotated `v2.2.0` tag → `Deploy Server Image` scan/promote → 최근 backup 확인 → OCI Compose backend/Flyway V43–V46/health → `Deploy Front(release_tag=v2.2.0)` → GitHub Release → production smoke입니다. Runtime config rendering 변경은 없어 `sync-config` mutation은 생략합니다.

### CI/CD, 보안과 공개 안전

- 원격 `main`의 최신 CI 실패는 OAuth stack shell의 ShellCheck 경고였고 현재 branch는 해당 원인과 fixture를 함께 수정합니다. Dependabot HIGH 세 건은 React Router `8.3.0`, `brace-expansion 5.0.8`, `postcss 8.5.25`로 해결하며 legacy `react-router-dom` 재유입을 architecture test로 거절합니다.
- `Deploy Server Image`는 exact annotated semver tag를 checkout하고 tag commit과 `HEAD` 일치를 검증한 뒤, Trivy가 검사한 digest와 동일한 digest만 release tag로 promote합니다. CI, pre-push와 public candidate가 이 workflow contract를 반복 검증합니다.
- 공개 후보는 private guidance, local path, nested scratch, secret/token 형태, 실제 member/deploy state를 제외합니다. 실제 AI provider 호출과 이메일 발송은 비용·개인정보·사용자 영향 때문에 release smoke에서 제외합니다.

### Local verification

| Evidence | Result |
| --- | --- |
| Frontend lint/coverage/build | PASS — 265 files / 2,049 tests; 83.68% statements, 78.88% branches, 83.72% functions, 84.54% lines |
| Server PR quality | PASS — unit 1,024 tests with 1 skipped; architecture 26 tests; no failures/errors |
| MySQL/Testcontainers integration | PASS — 839 tests; no failures/errors |
| Chromium E2E | PASS — 136/136 using isolated `18081` backend and `3101` frontend ports because an unrelated worktree owned the defaults |
| Docker component visual regression | PASS — 55/55 |
| Design workspaces | PASS — design system 14/14, design docs 2/2 and both builds |
| Dependency/security | PASS — pnpm HIGH audit 0, public candidate/gitleaks no findings, ShellCheck/actionlint clean |
| Deploy/operations contracts | PASS — deploy workflow checker self-tests/current contract, AI config, Prometheus, Tempo, Grafana and Alertmanager validators |

- 기본 E2E backend port `18080`은 다른 ReadMates worktree의 기존 server가 사용 중이었습니다. 해당 프로세스를 종료하지 않고 격리 포트로 같은 전체 suite를 실행했으며, 제품·테스트 코드는 바꾸지 않았습니다.

### Pre-publication gates

- `./scripts/pre-push-check.sh --full --release`로 frontend lint/coverage/build, server quality, Testcontainers integration, Playwright E2E, public candidate/gitleaks, AI/config/observability와 deploy workflow contract를 최종 release commit에서 확인합니다.
- Release PR과 merge SHA CI가 모두 성공하기 전에는 tag를 발행하지 않습니다. Tag image scan이나 OCI Flyway/health가 실패하면 frontend dispatch를 시작하지 않고, 이미 발행한 tag를 움직이지 않은 채 원인을 수정한 새 patch tag를 사용합니다.
- Production smoke는 anonymous app/auth, OAuth start marker, guest no-store/read boundary, backend health, host-write contract와 public-safe read를 포함합니다. 실제 member write, live provider 품질 호출과 알림 발송은 실행하지 않습니다.

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
