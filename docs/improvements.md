# ReadMates 개선사항 분석 보고서

작성일: 2026-05-08
범위: `front/`, `server/`, `compose.yml`, `deploy/`, `scripts/`, 기존 문서, 보안 리포트
대상 버전 기준: `v1.5.2` (CHANGELOG.md 기준 최신 릴리즈)

---

## 프로젝트 개요

ReadMates는 멀티 클럽 정기 독서모임의 운영 워크플로우(공개 사이트, 멤버 앱, 호스트 운영, 공개 기록, 참석자 전용 피드백 문서)를 하나의 멤버십 풀스택 웹 서비스로 묶은 오픈소스 친화 SaaS 형태의 사이드 프로젝트입니다. React 19 + Vite SPA가 Cloudflare Pages에 배포되고, Pages Functions가 BFF/OAuth 프록시 역할을 하며, Kotlin/Spring Boot 4 API가 OCI Compute에서 MySQL 8을 source of truth로 운영합니다. 옵션 계층으로 Redis(rate limit/cache), Redpanda/Kafka(notification outbox→relay→consumer), Micrometer/Prometheus, OCI Email Delivery, OCI Object Storage backup, Caddy reverse proxy를 포함합니다.

코드는 클린 아키텍처 경계(`adapter.in.web → application.port.in → application.service → application.port.out → adapter.out.persistence`)를 ArchUnit 기반 `ServerArchitectureBoundaryTest`와 frontend `frontend-boundaries.test.ts`로 강제하며, 공개 저장소 안전성을 `gitleaks`/release candidate scanner로 가드합니다. 인증은 Google OAuth + 서버측 `readmates_session` 쿠키, BFF는 `X-Readmates-Bff-Secret` + Origin/Referer 검증으로 신뢰 경계를 명시합니다.

전체 규모(대략): 서버 251개 Kotlin 파일 / 약 21.8k LOC, 프론트 259개 TS/TSX / 약 28.4k LOC, 서버 테스트 107개 / 약 28.6k LOC, 프론트 unit 51개 + e2e 9개 spec / 약 21.3k LOC, MySQL Flyway migration 16개.

---

## 요약 (Executive Summary)

- **(보안 P0)** 현재 working tree는 자체 보안 리포트(`.gstack/security-reports/2026-04-27`)에서 HIGH로 표시된 그대로다. `docs/superpowers/**` 추적 중인 historical planning 노트가 release scanner를 fail시키고, Git author/committer metadata에 실명 Gmail이 노출되어 있다. clean release candidate를 별도 public repo에 게시하는 것 외에, 현재 repo를 공개로 전환하면 안 된다.
- **(아키텍처 P1)** Spring 측 `application` 패키지 경계는 ArchUnit으로 강제하지만, persistence adapter 안에 SQL 문자열, row mapping, 트랜잭션 의도가 모두 섞여 있고 일부 SQL은 `select *` + window function로 가독성이 낮다(`JdbcFeedbackDocumentStoreAdapter`, `HostSessionWriteOperations` 등). 또한 `JdbcMemberAccountAdapter`(612 LOC), `JdbcNotesFeedAdapter`(576 LOC), `NotificationDeliveryQueries`(574 LOC) 등 600 LOC 내외의 단일 클래스가 다수 존재한다.
- **(프런트 P1)** `archive-page.tsx`(1074), `host-session-editor.tsx`(857), `host-notifications-page.tsx`(856), `current-session-mobile.tsx`(798), `member-session-detail-page.tsx`(776) 등 700 LOC를 넘는 거대 컴포넌트가 다수다. 모바일/데스크톱이 같은 파일 안에서 분기되는 구조이고 mobile.css(1485) + globals.css(1620)도 한 곳에 모여 있어 변경 비용이 빠르게 증가한다.
- **(테스트 P2)** 서버 테스트 LOC가 main과 거의 1:1.3이며 `ServerQueryBudgetTest`/`MySqlQueryPlanTest`/`ServerArchitectureBoundaryTest` 등 가드레일이 잘 갖춰져 있는 반면, OWASP Dependency-Check/OSV Scanner 같은 JVM 의존성 CVE 게이트가 CI에 없다. e2e도 Chrome 단일 프로젝트이고 sharding이 없다.
- **(인프라/배포 P1)** `deploy-server.yml`이 `bootJar`를 native runner에서 만든 뒤 ARM64 Docker image를 따로 조립하는 구조는 잘 정리되어 있지만, `Dockerfile`(legacy multi-stage)과 `Dockerfile.release`가 공존하고 SBOM/이미지 서명/취약점 스캔이 없다. `compose.yml`의 Redis/Kafka에 healthcheck는 있지만 인증/네트워크 분리가 없어 로컬 실행 가정에 묶여 있다.
- **(DX P2)** README/agents 문서는 풍부하지만 특정 workstation cwd에 의존하지 않고도 안전하게 동작하도록 한 곳에서 통합된 `Makefile` 또는 `Justfile`가 없고, 단일 명령어로 `lint+test+build+e2e` 통합 실행을 제공하지 않는다. Server는 Gradle alias도 없다.

---

## 1. 아키텍처 / 구조

### 현황

- 서버는 단일 Spring Boot 모듈 안에서 feature 패키지 hexagonal 경계를 유지한다. `auth`, `club`, `note`, `publication`, `archive`, `feedback`, `session`, `notification`, `shared`로 나뉘고 `adapter.in.web | application.port.in | application.service | application.port.out | adapter.out.persistence | adapter.out.{redis,kafka,mail,http}` 구조로 정렬돼 있다.
- ArchUnit 테스트 `ServerArchitectureBoundaryTest`로 application package가 Spring Web/JDBC/Redis 세부사항을 import 하지 못하도록 강제한다.
- 프런트엔드는 `front/src/app -> front/src/pages -> front/features -> front/shared` 경계를 유지하며, `front/tests/unit/frontend-boundaries.test.ts`로 cross-feature import, `shared/ui`의 app 의존, 제거된 `shared/api/readmates` import 재발을 막는다.
- 공통: `feature/<name>/{api,model,route,ui}` 4-layer split이 표준화되어 있다.

### 개선사항

- **(아키텍처 분리도)** 단일 Spring Boot 모드 안에서 feature 패키지가 늘어나는 중. 다음 단계로 Gradle multi-module(`server-app`, `server-feature-notification`, `server-feature-session`, `server-shared`)로 split 하지 않더라도, 최소한 `server/build.gradle.kts`에 Kotlin source-set 또는 `api`/`implementation` boundary로 hexagonal layer 간 의존을 컴파일 타임에 막는 것을 검토. 현재는 ArchUnit 테스트가 실패해야 알 수 있다.
- **(persistence adapter 비대화)** `JdbcMemberAccountAdapter`(612 LOC), `JdbcHostInvitationStoreAdapter`(468), `JdbcMemberLifecycleStoreAdapter`(422), `JdbcNotesFeedAdapter`(576) 같은 600 LOC 가까이 되는 adapter는 query 전용 helper(예: `MemberAccountQueries`, `MemberAccountWriteOperations`, `MemberAccountRowMappers`)로 split. 이미 `session` 영역에는 `HostSessionQueries` / `HostSessionWriteOperations` / `HostSessionRowMappers` / `JdbcHostSessionWriteAdapter`로 split된 모범 사례가 있으니 동일 패턴을 다른 영역으로 확산.
- **(application service 비대화)** `HostSessionCommandService`가 `ManageHostSessionUseCase`, `ConfirmAttendanceUseCase`, `UpsertPublicationUseCase`, `ListUpcomingSessionsUseCase`, `GetHostDashboardUseCase` 5개 use-case를 동시에 구현. 책임이 다른 read/write를 묶었기 때문에 변경 충돌이 잦다. `HostSessionLifecycleService`(open/close/publish/delete), `HostSessionDraftService`(create/update/visibility), `HostSessionReadService`(detail/list/dashboard/upcoming) 정도로 split하면 트랜잭션 경계도 명확해진다.
- **(repository 추상화)** `@Repository` 클래스가 33개. 일부는 `JdbcTemplate`을 직접 받고 일부는 helper 클래스를 받는 등 일관되지 않다. shared `JdbcRepositorySupport` (예: `dbString`, `uuid`, `toUtcLocalDateTime` 확장)는 이미 `shared.db`에 있으므로, 신규/대형 adapter도 동일 helper만 쓰도록 정리.
- **(notification slice 응집도)** notification adapter는 outbox + relay + consumer + delivery engine + audit + preferences를 포함하지만 `application.model`(template), `application.service`, `application.port`가 모두 `notification` 한 패키지에 평면적으로 들어간다. `notification.send`(이메일 발송), `notification.inbox`(member_notifications), `notification.audit`(test mail audit) 정도로 sub-slice를 만들면 ledger UI/host 운영 변경이 다른 slice에 미치는 영향이 작아진다.

### 우선순위: 중간 (P1)

---

## 2. 백엔드

### 현황

- Spring Boot `4.0.0`(release candidate 시점), Kotlin `2.2.0`, Java toolchain 21, Flyway 11.7.2.
- Spring Security + 자체 `BffSecretFilter`, `SessionCookieAuthenticationFilter`, `MemberAuthoritiesFilter`, `PlatformAdminAuthoritiesFilter`, `RateLimitFilter`, `OAuthInviteTokenCaptureFilter`, `ReadmatesOAuthSuccessHandler`, `PrimaryOriginOAuthAuthorizationRequestResolver`로 인증/권한 wiring.
- Persistence는 순수 JDBC + `JdbcTemplate`을 사용하고 ORM 없음(Trade-off는 [technical-decisions.md] 참고).
- Notification 운영: `notification_event_outbox` → `KafkaNotificationEventPublisherAdapter` → `NotificationEventKafkaListener` → `NotificationDeliveryEngine` (in-app + email) → `member_notifications` / `notification_deliveries`.
- 16개 Flyway migration이 `db/mysql/migration`에 있고 dev seed는 `db/mysql/dev/R__readmates_dev_seed.sql`에 별도.

### 개선사항

- **(SecurityConfig CSRF 매처 비대)** `SecurityConfig.kt:38-87`의 `csrf { ignoringRequestMatchers(...) }` 블록이 50줄 가까이 길고 `methodAndPath("PATCH", Regex(...))` 패턴이 30회 이상 반복된다. BFF가 `Origin`/`Referer`를 강제하는 상황에서 모든 mutating API를 `csrf.ignoringRequestMatchers`로 등록하는 패턴은 사실상 csrf 비활성과 같다. `csrf { it.disable() }` + `BffSecretFilter`로 단순화하거나, route별 매처를 `RequestMatcher` 상수로 외부화하는 리팩터를 검토.
- **(`select *` SQL)** `JdbcFeedbackDocumentStoreAdapter.kt:36, 73`의 outer select는 inner subquery에서 explicit column projection을 갖고 있으므로 outer도 explicit list로 바꿔 schema drift에 강하게 만든다. Spring/MySQL `select *`는 row mapper가 깨진 컬럼 추가를 늦게 잡는다.
- **(N+1 위험 SQL)** `JdbcNotesFeedAdapter.loadNoteSessions`는 페이지당 4개의 correlated subquery로 question/one-liner/long_review/highlight count를 계산한다(`JdbcNotesFeedAdapter.kt:34-94`). 이미 `V22__note_count_query_indexes.sql` 인덱스 + `ServerQueryBudgetTest` 가드레일이 있긴 하지만, 단일 SQL을 `LEFT JOIN ... GROUP BY` + `JSON_OBJECTAGG` 또는 application-level batch로 바꾸면 shape이 단순해진다. 우선순위는 query budget 측정 후 결정.
- **(Spring Boot 4.0.0)** 의존성 명세에서 Spring Boot `4.0.0` + `io.spring.dependency-management` `1.1.7` + `flyway` `11.7.2`을 쓰는데, 4.x 메이저 이행 이후 deprecated API(예: WebMvc CORS, `RequestMatchers().regexMatchers()`)가 있을 수 있으니 release note 기반 cleanup task 1회 수행. Kotlin `2.2.0` + `kotlin("plugin.spring") 2.2.0`도 동일.
- **(testcontainers 버전 차이)** `org.testcontainers:testcontainers-mysql:2.0.2`, `testcontainers-kafka:2.0.2`. Testcontainers 1.x → 2.x 메이저 이행 사항이 dependency tree에 정상 반영됐는지 1회 sweep. `org.springframework.boot:spring-boot-testcontainers`도 함께 쓰므로 BOM/transitive 충돌은 `./server/gradlew -p server dependencies` 결과로 확인.
- **(예외 → HTTP 매핑 일관성)** `FeedbackDocumentUploadValidator.validate`에서 `ResponseStatusException`을 직접 던진다(`FeedbackDocumentUploadValidator.kt:27, 49 등`). 이는 architecture boundary 정책("application/domain은 Spring Web type을 던지지 않는다")과 충돌하지는 않지만, validator는 adapter.in.web에 위치하므로 OK이긴 하다. 다만 reusable한 다른 validator들도 같은 위치 규약을 지키는지 일제 점검(`FeedbackDocumentUploadValidator`는 `adapter.in.web`이므로 OK).
- **(Migration 누락 V2~V8)** `V1`, `V9`, `V10` 순으로 점프된다. 누락된 V2-V8이 의도된 것인지 history rebase에서 누락된 것인지 `MySqlFlywayMigrationTest` 결과로 확인하고, 의도적이면 README/local-setup에 1줄 명시.
- **(트랜잭션 isolation)** `GoogleLoginService`는 `@Transactional(isolation = Isolation.READ_COMMITTED)`를 명시하는데, 다른 service는 명시하지 않는다. MySQL 기본은 REPEATABLE_READ이므로 join + write가 섞이는 `HostSessionCommandService`, `InvitationService`도 isolation 의도를 결정해 명시.
- **(Notification kafka enabled flag)** `application.yml`의 `readmates.notifications.kafka.enabled`, `readmates.notifications.enabled`, `readmates.notifications.worker.enabled` 3개의 flag가 따로 있어 enable 매트릭스가 복잡하다. flag 조합 표(notifications=on, kafka=off, worker=on 같은 경우)를 `application.yml` 위 주석 또는 `docs/development/architecture.md`에 명시하면 운영자 혼선 줄어든다.

### 우선순위: 중간 (P1)

---

## 3. 프론트엔드

### 현황

- React `19.2.5`, React Router `7.14.1`, Vite `8.0.9`, TypeScript `5.8.x`.
- 거대 컴포넌트 다수: `archive-page.tsx`(1074), `host-session-editor.tsx`(857), `host-notifications-page.tsx`(856), `current-session-mobile.tsx`(798), `member-session-detail-page.tsx`(776), `feedback-document-page.tsx`(705), `current-session-page.tsx`(703).
- CSS는 `front/src/styles/globals.css`(1620 LOC) + `front/shared/styles/tokens.css`(913) + `front/shared/styles/mobile.css`(1485). 총 4018 LOC가 단일 디렉토리에 모여 있고 모듈 단위 격리가 없다.
- Cloudflare Pages Functions BFF(`front/functions/api/bff/[[path]].ts`)는 path traversal/cross-origin/club slug 검증을 잘 처리한다.
- API 클라이언트(`front/shared/api/client.ts`)는 401 시 `loginPathForReturnTo(currentRelativeReturnTo())`로 자동 redirect하고 `parseReadmatesResponse`로 안전 파싱을 한다.

### 개선사항

- **(거대 컴포넌트 분해)** 우선순위 순으로 나누어 지원할 수 있다.
  - `front/features/archive/ui/archive-page.tsx`: `ArchiveDesktop` / `ArchiveMobile`이 같은 파일 안에 있고, 두 변형이 prop 시그니처를 거의 똑같이 받는다. `archive-desktop.tsx` / `archive-mobile.tsx` / `archive-tab-list.tsx` / `archive-report-row.tsx`로 split.
  - `front/features/host/ui/host-session-editor.tsx`: 이미 `session-editor/{attendance-panel, basic-session-panel, document-state-panel, mobile-editor-tabs, publication-panel, session-editor-panel}`로 일부 split됐지만 1차 entry point에 form orchestration + side effect + scopedHostRedirectHref가 남아 있다. `host-session-editor-form.tsx`(form state) + `host-session-editor-effects.tsx`(navigation/scoped redirects) split.
  - `front/features/host/ui/host-notifications-page.tsx`: `events`, `deliveries`, `audit` 3개의 ledger tab UI가 한 파일에 있다. `host-notifications-ledger-events.tsx`, `host-notifications-ledger-deliveries.tsx`, `host-notifications-test-mail.tsx`로 split.
  - `front/features/current-session/ui/current-session-mobile.tsx`와 `current-session-page.tsx`: 같은 데이터를 desktop/mobile 두 변형으로 그리는 구조라면 layout primitive(`CurrentSessionLayout`)로 모으고 변형별 props만 다르게.
- **(CSS 모듈화)** `front/src/styles/globals.css`에 모든 page-level 스타일이 들어가 변경 영향이 글로벌이다. `front/features/<name>/ui/*.module.css`로 feature 단위 CSS module 또는 vanilla-extract / panda-css 도입 검토. 최소 단계로 `globals.css`를 page section별로 split만 해도 review surface가 줄어든다.
- **(타입 중복)** `front/features/host/ui/host-notifications-page.tsx`에서 `NotificationEventOutboxStatus`, `NotificationDeliveryStatus`, `NotificationChannel`, `HostNotificationEventType`을 다시 선언한다. `front/features/notifications/api/notifications-contracts.ts` 또는 `host-contracts.ts`에 이미 있으면 import해 single source of truth 유지. 신규 타입은 `host-contracts.ts`로 집계.
- **(`any` / unsafe cast)** Frontend source 전반에 `console.log`/`debugger`는 없는 점은 좋다. 추가로 `JsonResponse<T> = Response & { json(): Promise<T> }`(host-session-editor.tsx:74) 같은 ad-hoc cross-cast를 share helper로 추출(`shared/api/typed-response.ts`).
- **(react-router v7 loader/action 일관성)** `front/src/app/router.tsx`에서 routes는 잘 정의됐지만 일부 route는 `errorElement`만 있고 `hydrateFallbackElement`가 없는 형태가 섞여 있다(`/admin`, `/app/pending`, `/clubs/:clubSlug/app/pending`). UX 일관성을 위해 모든 protected route에 `hydrateFallbackElement` 명시.
- **(빌드 청크 사이즈)** `vite.config.ts`의 `chunkSizeWarningLimit: 600`은 경고 한도를 푼 것이지 청크가 작다는 뜻이 아니다. `dist/assets/*.css`(1620+1485+913 = 4 MB 미만이지만 단일 chunk 위험)를 `import()`-aware로 split. 라우트 단위 lazy loading으로 archive/host/notifications page를 split하면 초기 진입 LCP 가 개선될 가능성.
- **(Cloudflare Pages Functions 타입)** `front/functions/api/bff/[[path]].ts`에서 `PagesFunction<Env>`를 직접 정의한다. `@cloudflare/workers-types`를 devDependency로 추가해 공식 타입을 쓰면 향후 Cloudflare API 변경 추적이 쉬워진다.

### 우선순위: 중간 (P1)

---

## 4. 인프라 / 배포

### 현황

- `compose.yml`은 로컬 개발 전용. MySQL 8.4, Redis 7.4-alpine, Redpanda v24.3.7 + healthcheck 포함.
- 운영 stack은 `deploy/oci/compose.yml`, `deploy/oci/compose.infra.yml`, `Caddyfile`, `readmates-stack.service`(systemd) 조합.
- GitHub Actions 3개: `ci.yml`(PR + main), `deploy-front.yml`(tag/manual → Wrangler Pages deploy), `deploy-server.yml`(tag/manual → GHCR ARM64 image push).
- Action은 모두 SHA-pinned이고, `pull_request_target` 미사용, `permissions: { contents: read }` 명시.
- `.github/CODEOWNERS`는 추가됐고(`.github/workflows/** @beyondwin`), `.gitleaks.toml`은 ReadMates 전용 룰 추가본 사용.
- Server image 두 개 공존: `Dockerfile`(builder + runtime, full multi-stage) / `Dockerfile.release`(jar copy only).

### 개선사항

- **(이미지 보안)** GHCR 이미지에 SBOM(`docker buildx --sbom=true --provenance=true`) 또는 Syft + Grype 단계가 없다. `deploy-server.yml` build-and-push job 뒤에 `anchore/scan-action` 또는 Trivy를 추가하고 HIGH 이상이면 fail.
- **(JVM 의존성 CVE)** 보안 리포트의 "남은 리스크"에서 명시했듯 OSV Scanner / OWASP Dependency-Check / Snyk 결과가 CI에 없다. `ci.yml`의 `backend` job 마지막에 `actions-osv/scanner-action`(Gradle target) 또는 `dependency-check` step 추가. fail criteria는 첫 실행 후 baseline 정한 뒤 점진적 강화.
- **(이미지 이중화 정리)** `server/Dockerfile`은 build-from-source 경로, `server/Dockerfile.release`는 pre-built jar 경로다. release CI는 `Dockerfile.release`만 쓰므로 `server/Dockerfile`은 삭제하거나 `server/Dockerfile.local`로 이름을 바꿔 의도를 명시. 둘이 비슷한 USER/EXPOSE 설정을 갖고 있어 sync 누락 위험이 있다.
- **(compose secret)** `compose.yml`은 `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`를 env interpolation으로 받는데, Redis와 Redpanda는 인증 자체가 없다. 로컬 전용이라 OK이지만 README/local-setup에 "compose 네트워크는 host bind이고 인증 없는 Redis/Kafka가 외부 노출되지 않게 하라"는 1문 추가. 또는 `redis:7.4-alpine` 명령에 `--requirepass ${READMATES_LOCAL_REDIS_PASSWORD:-readmates}`를 더해 dev에서도 password 흐름을 검증.
- **(Caddyfile / OCI compose)** `deploy/oci/Caddyfile`의 TLS, `deploy/oci/compose.yml`의 service networking, `readmates-stack.service`의 systemd lifecycle은 분리돼 있어 hand-off가 깔끔하지만, 운영자 onboarding을 줄이기 위해 `deploy/oci/README.md` 또는 `docs/deploy/compose-stack.md`에 "처음부터 끝까지 단일 명령으로 실행하는 dry-run 흐름" 1개를 별도로 정리.
- **(Cloudflare Pages Functions 환경 변수)** `READMATES_API_BASE_URL`, `READMATES_BFF_SECRET`은 Pages dashboard에서 set 한다. `deploy/cloudflare/deploy-front.sh` 또는 `docs/deploy/cloudflare-pages.md`에 두 변수의 secret rotation 체크리스트를 명시(rotate 시점에 BFF 양쪽이 동시에 갱신되도록 sequencing).
- **(GHCR image retention)** `deploy-server.yml`은 tag별 push 만 하고 retention/cleanup 정책이 없다. `actions/delete-package-versions`로 90일 이상 된 untagged 버전 삭제 step을 추가하거나, 운영 절차 문서에 정기 cleanup 명시.
- **(Health vs management port)** `application.yml`의 `management.server.port: 8081`이 기본이고 `/internal/health`는 main port에 노출된다. Caddy/OCI 운영에서 8081을 노출하지 않도록 firewall 룰 + README 추가 점검 권장.

### 우선순위: 중간 (P1) — secret/CVE 가드는 높음, 그 외는 보통

---

## 5. 보안

### 현황

- BFF 이중 가드: Cloudflare Pages Functions가 path/club slug/Origin 검증을 하고, Spring `BffSecretFilter`가 `X-Readmates-Bff-Secret` constant-time 비교 + Origin/Referer allowlist를 강제한다(`MessageDigest.isEqual`). 두 계층이 Defense in depth.
- Rate limit이 invitation preview/accept, OAuth start/callback, host mutation, feedback upload별로 sensitive=true/false를 구분하고 IP는 `CF-Connecting-IP` → `X-Forwarded-For`로 BFF secret을 통과한 요청에서만 trust(`RateLimitFilter.kt`).
- Feedback 문서 업로드: `.md`/`.txt`, UTF-8 (REPORT on malformed/unmappable), filename traversal/NUL byte, 512KB size guard(`FeedbackDocumentUploadValidator.kt`).
- 세션 cookie: `HttpOnly` + `SameSite=Lax` + production `Secure`. raw token은 hash로만 저장(`auth_sessions.session_token_hash`).
- `.gitleaks.toml`은 사이트 전용 secret 패턴(BFF_SECRET, GOOGLE_CLIENT_SECRET, OCI OCID, GitHub PAT, OpenAI/Google API key) 추가본을 정의.

### 개선사항

- **(P0: 공개 전 history 정비)** 보안 리포트 Finding 1/2가 그대로 남아 있다. 조치 전까지 현재 repo를 public으로 전환하지 말고:
  1. `git filter-repo` 또는 fresh public repo로 `docs/superpowers/**` 제거.
  2. `git log --all --format='%ae%n%ce' | sort -u`에서 본인 Gmail이 보이면 `git filter-repo --mailmap`으로 GitHub `noreply` 주소로 변환.
  3. clean release candidate(`./scripts/build-public-release-candidate.sh`)만 별도 public repo에 push.
- **(P1: CODEOWNERS 강화)** 현재 `.github/CODEOWNERS`가 `.github/workflows/**`만 cover한다. `server/src/main/kotlin/com/readmates/auth/**`, `server/src/main/kotlin/com/readmates/shared/security/**`, `front/functions/**`, `server/src/main/resources/db/mysql/migration/**`, `.gitleaks.toml`, `scripts/**`도 추가해 보안/배포 surface 변경에 대한 review boundary를 명시.
- **(P1: BFF secret rotation)** `BffSecretFilter`는 단일 secret만 받는다. rotation 중 양쪽 secret을 동시에 받기 위해 `READMATES_BFF_SECRETS=secret-a,secret-b` 형태로 multi-secret allowlist 지원을 검토(rotation window를 0초로 줄이지 않아도 zero-downtime rotation 가능).
- **(P1: 1xx/3xx redirect 처리)** Cloudflare Pages Functions BFF가 `redirect: "manual"`로 upstream redirect를 그대로 패스하지만, 그 redirect Location의 host가 BFF host가 아닐 수 있다(`functions/api/bff/[[path]].ts:158`). Spring API가 의도적으로 redirect를 보내지 않더라도 `Location` host allowlist 또는 redirect 자체를 reject하는 가드를 BFF에 추가하면 SSRF/open-redirect 가능성을 줄일 수 있다.
- **(P2: rate limit fail-open 명시)** `application.yml`의 `readmates.rate-limit.fail-closed-sensitive: false`가 기본이다. invitation accept(`sensitive = true`)와 feedback upload는 fail-closed로 두고, 그 외 read flow는 fail-open으로 명시한 정책 표를 `docs/development/architecture.md` "Optional Redis 계층"에 추가.
- **(P2: feedback 문서 multipart MIME 검사)** 현재 size/UTF-8/filename은 검사하지만 multipart `Content-Disposition`의 `filename*` UTF-8 encoded 변형, RTL override 문자, zero-width 문자 등 화이트리스트 outside 확장자를 우회하는 입력은 추가로 normalize 후 검사. (현실 위험은 낮으나 portfolio-level safe-by-default 향상.)
- **(P2: log redaction)** `BffSecretFilter`/`RateLimitFilter`가 `request.remoteAddr`를 그대로 로깅한다(`BffSecretFilter.kt:46-50`). production에서 ALB/Cloudflare 통과 후 `remoteAddr`이 PII가 아닐 가능성이 높지만, IP는 hash 후 로그하는 `RateLimitFilter`의 패턴을 BFF rejection log에도 적용해 일관성 유지.
- **(P2: secrets in env)** `.env.example`이 `<oci-smtp-username>`, `<google-oauth-client-secret>` placeholder를 두지만 운영자가 실제 값을 root `.env`에 두는 흐름이다. `docs/deploy/security-public-repo.md` 또는 `compose.yml` 위에 "운영 secret은 GHCR/Cloudflare secret store/OCI vault에 두고 root `.env`는 development 전용" 1문 명시.

### 우선순위: 보안 history 정비는 **높음 (P0)**, 나머지는 중간 (P1)

---

## 6. 테스트

### 현황

- 서버: 107개 테스트 파일 / 약 28.6k LOC. 패키지별로 `architecture`, `archive`, `auth`, `club`, `feedback`, `note`, `notification`, `performance`, `publication`, `session`, `shared`, `support` 폴더가 명시.
- ArchUnit `ServerArchitectureBoundaryTest`, `ServerQueryBudgetTest`, `MySqlQueryPlanTest`, `MySqlFlywayMigrationTest` 같은 가드레일 테스트 존재.
- 프런트 unit: 51개 spec(`api-contract-fixtures`, `frontend-boundaries`, `cloudflare-bff`, `cloudflare-oauth-proxy`, `cloudflare-spa-redirects`, route별 page test 등).
- 프런트 e2e: 9개 Playwright spec(`google-auth-invite-flow`, `google-auth-viewer`, `member-lifecycle`, `multi-club-flow`, `responsive-navigation-chrome`, `dev-login-session-flow`, `member-profile-permissions`, `public-auth-member-host`, `logout-flow`).
- Testcontainers MySQL/Kafka/Redis 사용. Colima socket auto-detect 로직 포함.

### 개선사항

- **(e2e 브라우저 매트릭스)** `responsive-navigation-chrome.spec.ts` 이름에서 보이듯 Chrome 단일 프로젝트 가정. Playwright `projects` array에 `webkit`/`firefox`/`mobile-chrome`을 추가해 cross-browser regression 검출. CI에서는 `--project=chromium`만 default로 두고 `workflow_dispatch`로 multi-browser run 분리.
- **(e2e sharding)** 9개 spec이지만 invitation/auth flow는 시간이 오래 걸린다. `playwright.config.ts`의 `workers` + GitHub Actions matrix sharding으로 wall time을 줄이는 ROI 검토.
- **(JVM mutation testing 미도입)** PIT 또는 Stryker(Kotlin/JVM은 PIT) 같은 mutation testing은 도입돼 있지 않다. `notification.application.model.NotificationEmailTemplates`(340 LOC) 같은 pure helper 영역부터 PIT mutator 적용해 dead branch 검출.
- **(OWASP/OSV scanner CI 통합)** 보안 6번 항목과 연동. JVM 쪽은 `org.owasp.dependencycheck` Gradle plugin 또는 OSV `actions-osv/scanner-action`. 프런트는 `pnpm audit --prod` 결과를 CI step으로 추가하고 critical/high 발생 시 fail.
- **(unit + e2e 사이의 contract test 격차)** `front/tests/unit/api-contract-fixtures.test.ts`가 contract fixture를 검증한다. 그 fixture가 server `WebDtos.kt`와 Real schema-tested response가 생성하는 JSON 모양과 일치하는지 한 곳에서 enforce할 mechanism이 없다. `MockMvc`로 호출한 controller 응답을 fixture와 diff 하는 test나, OpenAPI emission(예: `springdoc-openapi`) + frontend의 `openapi-typescript` codegen으로 contract drift를 컴파일 타임에 잡는 방법 검토.
- **(테스트 flakiness signal)** Flyway checksum mismatch 회피를 위해 E2E DB 이름을 fingerprint로 두는 패턴은 좋다. Test 실패 발생 시 `target/test-results`/`front/test-results` 산출물을 GitHub Actions artifact로 자동 upload하는 step이 빠져 있다(현재 workflow에 보이지 않음). `actions/upload-artifact` 단계를 ci.yml frontend/backend job 끝에 추가.
- **(query budget 가드)** `ServerQueryBudgetTest`가 가드레일을 한다고는 하지만, 새 endpoint 추가 시 budget 갱신을 사람이 PR diff에서 잡아야 한다. 현재 budget을 노출하는 `docs/development/test-guide.md` 또는 별도 budget table을 두면 review가 쉬워진다.

### 우선순위: 중간 (P1) — CI artifact upload, OWASP CI는 즉시 도움이 큼

---

## 7. 개발자 경험 (DX)

### 현황

- README, AGENTS.md, `docs/agents/{front, server, design, docs}.md`, `docs/development/{architecture, local-setup, technical-decisions, test-guide, versioning, release-management}.md`, `docs/deploy/{cloudflare-pages, multi-club-domains, oci-backend, oci-mysql-heatwave, security-public-repo, compose-stack}.md`까지 풍부한 문서 구조.
- `pnpm --dir front <cmd>`/`./server/gradlew -p server <cmd>` 패턴을 읽기 쉽게 정리.
- `.gitleaks.toml`, public release candidate scanner, smoke production integration script 등 portfolio 공개 안전성을 자동화.

### 개선사항

- **(통합 task runner 부재)** `Makefile` 또는 `Justfile`이 없어 `lint+test+build`를 한 번에 실행하려면 4개 명령을 입력해야 한다. `Justfile`(또는 `package.json`/`pnpm` 워크스페이스 dev script)에 다음을 추가.
  - `just check` → `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build && ./server/gradlew -p server test`
  - `just e2e` → docker compose up + frontend dev + e2e
  - `just release-check` → `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate`
- **(local-setup이 길다)** `docs/development/local-setup.md`는 단계별 설명이 좋지만 새 contributor가 첫 5분에 실행할 명령은 README/AGENTS 안에서 다시 찾아야 한다. README의 "로컬 실행 요약" section을 그대로 복사한 `docs/development/quickstart.md` 또는 README 상단 "5분 만에 켜기" 1단계 명령 묶음으로 통합.
- **(pnpm workspace 통합)** 현재 frontend만 pnpm-managed이고 root는 workspace가 아니다. `pnpm-workspace.yaml`을 root에 두고 `front`/`scripts`(node script)를 workspace로 정의하면 `pnpm -r run lint` 같은 cross-package 명령이 가능. 단, scripts는 bash이므로 ROI 신중히.
- **(IDE config)** `.idea`가 추적되지만 `.editorconfig`나 `.vscode/extensions.json` 없음. cross-IDE 일관성을 위해 최소 `.editorconfig`(LF + 2/4 space + UTF-8) 추가.
- **(CHANGELOG/Release 자동화)** CHANGELOG.md를 수기 관리한다. release-please 또는 changesets로 PR title/label 기반 자동 entry 생성을 검토(특히 patch/minor 빈도가 높으므로).
- **(Spring Boot dev 경험)** `bootRun`은 cli command 길다. `server/.tmp/run-dev.sh`(또는 `scripts/run-server-dev.sh`)를 두고 README env 묶음을 그 안에 두면 onboarding curve가 줄어든다. `READMATES_BFF_SECRET=<shared-bff-secret>` 같은 dev placeholder는 `.gitleaks.toml` allowlist에 이미 들어가 있으므로 안전.
- **(error fingerprint)** Server log는 잘 정리됐지만 5xx 발생 시 trace id가 클라이언트로 보이지 않는다. `ApiErrorResponse`에 `traceId`(server-generated, not exposing internals) 추가해 사용자가 호스트에게 신고할 때 quick lookup 가능하게.
- **(문서 링크 검증)** README의 docs 링크 25개+이 모두 git에 있는지 자동 검증 step이 없다. `lychee` 또는 `markdown-link-check`를 `ci.yml`에 docs 변경 path-filter로 추가.

### 우선순위: 낮음~중간 (P2)

---

## 8. 단기 액션 아이템 (1~2주 내 처리 가능)

| 순서 | 항목 | 예상 소요 | 파일/위치 |
| --- | --- | --- | --- |
| 1 | `docs/superpowers/**` history 정리 또는 fresh public repo로 release candidate만 게시 | 0.5d | repo 전체, `scripts/build-public-release-candidate.sh` |
| 2 | Git history author/committer email을 `<github-username>@users.noreply.github.com`로 mailmap rewrite | 0.5d | `git filter-repo --mailmap` |
| 3 | CI에 OWASP/OSV JVM dependency CVE step 추가 | 0.5d | `.github/workflows/ci.yml` backend job |
| 4 | CI에 `pnpm audit --prod` step 추가 | 0.25d | `.github/workflows/ci.yml` frontend job |
| 5 | CI에 `actions/upload-artifact` (test results, playwright traces) | 0.25d | `.github/workflows/ci.yml` |
| 6 | `.github/CODEOWNERS`에 auth/security/migration/scripts/.gitleaks.toml path 추가 | 0.25d | `.github/CODEOWNERS` |
| 7 | `JdbcFeedbackDocumentStoreAdapter`의 `select *` 두 곳을 explicit column projection으로 교체 | 0.25d | `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt:36,73` |
| 8 | `host-notifications-page.tsx`에서 중복 선언된 notification status 타입을 `notifications-contracts.ts`/`host-contracts.ts`에서 import | 0.5d | `front/features/host/ui/host-notifications-page.tsx:12-19` |
| 9 | `server/Dockerfile`(local-from-source) vs `server/Dockerfile.release` 하나로 정리 또는 명확한 이름 | 0.25d | `server/Dockerfile`, `server/Dockerfile.release` |
| 10 | `Justfile`(또는 root `package.json` script) 도입해 `just check`, `just release-check` 단일 명령 제공 | 0.5d | `/Justfile` |
| 11 | `.editorconfig` 추가(LF, UTF-8, indent_style) | 0.1d | `.editorconfig` |
| 12 | Flyway `V2~V8` 누락에 대한 의도 표기를 `docs/development/local-setup.md` 또는 migration README에 1줄 명시 | 0.1d | `docs/development/local-setup.md` |
| 13 | `BffSecretFilter` 로그에서 `request.remoteAddr`를 hash 처리 | 0.25d | `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt:42-64` |
| 14 | BFF에 redirect Location host allowlist 가드 추가 | 0.5d | `front/functions/api/bff/[[path]].ts:154-168` |

---

## 9. 중장기 로드맵 (1~3개월)

### Phase A: 가독성/응집도 리팩터 (1개월)

- 거대 Kotlin adapter 4개(`JdbcMemberAccountAdapter`, `JdbcNotesFeedAdapter`, `JdbcHostInvitationStoreAdapter`, `JdbcMemberLifecycleStoreAdapter`)를 `*Queries` + `*WriteOperations` + `*RowMappers` + `Jdbc*Adapter` 패턴으로 split. 모범 사례는 `session.adapter.out.persistence`.
- 거대 React 컴포넌트 5개(`archive-page`, `host-session-editor`, `host-notifications-page`, `current-session-mobile`, `member-session-detail-page`)를 desktop/mobile/feature-section 단위로 나누고, route loader가 주는 prop shape는 그대로 유지.
- `HostSessionCommandService`를 lifecycle/draft/read 3 service로 split하고 각 use-case 인터페이스는 그대로 유지.
- `globals.css` 1620 LOC를 page section별 CSS module 또는 `front/features/<name>/ui/*.module.css`로 점진 마이그레이션.

### Phase B: 보안/신뢰성 강화 (1개월, A와 병행 가능)

- **History scrub + public repo 분리**(아직 안 했다면 먼저 처리).
- BFF multi-secret rotation 지원: `READMATES_BFF_SECRETS` 형태로 콤마 구분 받기.
- OpenAPI emission(`springdoc-openapi`) + 프런트 codegen으로 contract drift를 컴파일 단계에서 잡음. `front/tests/unit/api-contract-fixtures.test.ts`는 codegen 결과로 옮긴다.
- Image SBOM/Provenance 활성화(`docker buildx --sbom=true --provenance=true`) + Trivy/Grype scan step.
- Notification slice 안에서 SMTP retry/dead 처리, multi-tenant feature flag, audit redaction 정책을 sub-package로 격리.

### Phase C: 운영/배포 향상 (1개월)

- e2e 브라우저 매트릭스 + sharding으로 wall time 단축 + cross-browser regression coverage 확장.
- Notification kafka relay/consumer를 backend bootRun과 별도 worker process(separate Spring Boot module 또는 Java module-path split)로 분리할지 ADR 작성. 단일 모듈 유지를 선택해도 결정 근거는 `docs/development/technical-decisions.md`에 기록.
- Server multi-module Gradle 도입 검토: `server-shared`, `server-feature-*`, `server-app`. ArchUnit + Gradle 의존 그래프 두 가드를 함께 두면 향후 Spring Boot 5/Kotlin 3.x 이행 비용 줄어듦.
- CHANGELOG 자동화 + release-please tag 기반 GitHub Releases publish.
- `docs/development/quickstart.md` + `Justfile`을 새 contributor onboarding 자료로 정착.
- Client trace id(error fingerprint) 도입과 user-facing 신고 흐름 정비.

### Phase D: 사용자 가치 확장 (선택, 3개월~)

- AI-assisted 콘텐츠 생성을 앱 내부에서 옵션으로 켜는 흐름(현재는 외부 워크플로우 결과만 저장). 이 경우 `docs/development/architecture.md`의 "AI-assisted 콘텐츠 운영" 절을 다시 쓰고, server에 LLM port + adapter, 프런트에 streaming UI를 추가.
- Public site SEO(serverless + Cloudflare Pages SSR mode)와 RSS 피드.
- Notification 채널 확장(Web Push, KakaoTalk, Slack), preference matrix 변경 + new outbox row type 추가.

---

## 부록: 측정 기준과 참고 명령

- **변경 후 권장 검증 묶음**(README/AGENTS 기준):
  - `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
  - `./server/gradlew -p server clean test`
  - 인증/route 변경 시 `pnpm --dir front test:e2e`
  - public release 검증 시 `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate`
- **본 보고서가 참조한 위치**(repo-relative path):
  - 보안 리포트: `.gstack/security-reports/2026-04-27-194155+0900-readmates-security-posture.md` (local ignored report)
  - 아키텍처 SoT: `docs/development/architecture.md`
  - 서버 entry: `server/build.gradle.kts`, `server/src/main/resources/application.yml`
  - 보안 wiring: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`, `BffSecretFilter.kt`, `RateLimitFilter.kt`
  - 거대 파일 후보:
    - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt` (612 LOC)
    - `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt` (576)
    - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryQueries.kt` (574)
    - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteOperations.kt` (540)
    - `front/features/archive/ui/archive-page.tsx` (1074)
    - `front/features/host/ui/host-session-editor.tsx` (857)
    - `front/features/host/ui/host-notifications-page.tsx` (856)
    - `front/features/current-session/ui/current-session-mobile.tsx` (798)
  - CI 워크플로우: `.github/workflows/{ci,deploy-front,deploy-server}.yml`
  - BFF: `front/functions/api/bff/[[path]].ts`, `front/functions/_shared/proxy.ts`
  - DB 마이그레이션: `server/src/main/resources/db/mysql/migration/` (V1, V9~V22)
  - `.gitleaks.toml`: `.gitleaks.toml`

이 문서의 각 항목은 PR 단위로 잘게 끊어 처리해도 안전하게 동작하도록 의도해 정렬했고, 우선순위는 보안 history 정비(P0) → 아키텍처/거대 파일 분해/보안 강화(P1) → DX/문서 자동화(P2) 순서를 권장합니다.
