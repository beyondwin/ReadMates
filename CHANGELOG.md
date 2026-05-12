# CHANGELOG

ReadMates는 Git tag와 GitHub Releases를 함께 사용합니다. 이 파일은 저장소 안에 남는 릴리즈 기록이고, GitHub Releases는 태그별 공개 릴리즈 노트로 사용합니다.

버전 규칙과 릴리즈 절차는 [docs/development/release-management.md](docs/development/release-management.md)를 기준으로 합니다.

## Unreleased

### Highlights

v1.7.0 이후 누적된 운영자/사용자 가시 변경을 한 묶음으로 정리합니다. 핵심은 (1) OCI compose 배포가 attempt-stage ledger와 이미지 verification, post-deploy watch를 자동으로 실행하도록 굳어진 운영 워크플로 채택, (2) read-only 진단/수집 스크립트와 새 운영 런북 셋, (3) 셸 스크립트 syntax/shellcheck·공개 release 안전·release 이미지 Trivy 스캔을 묶은 CI 강화, (4) 공개 저장소에 프론트 테스트 산출물이 흘러 들어가지 않도록 빌더 manifest를 좁히는 위생 강화, (5) BFF 시크릿 감사 적재량을 평상시 0에 수렴시키는 audit-mode 도입과 rate-limit 필터의 다중 시크릿 신뢰 정렬, (6) 플랫폼 관리자 영속 어댑터의 Web/HTTP 의존 제거로 인한 아키텍처 경계 정리입니다. DB migration 없음.

### Fixed

- **공개 release 안전 — 프론트 테스트 산출물 누출 차단**: 공개 release 후보 빌더가 `front/test-results`, `front/playwright-report`, `front/coverage`, `front/.nyc_output` 디렉토리를 후보 tree에서 제외합니다. 같은 회귀를 막기 위한 fixture를 함께 추가했습니다.
- **rate-limit 필터의 BFF 시크릿 신뢰 정렬**: `RateLimitFilter`가 BFF 인증과 동일한 다중 시크릿 설정(`READMATES_BFF_SECRETS` + 단일 `READMATES_BFF_SECRET` fallback)을 신뢰하도록 맞췄습니다. rotation 중인 환경에서 정상 BFF 트래픽이 rate-limit 단에서 떨어질 가능성을 닫았습니다.
- **플랫폼 관리자 영속 어댑터의 Web/HTTP 의존 제거**: `JdbcPlatformAdminAdapter`가 더 이상 `HttpStatus`/`ResponseStatusException`을 던지지 않습니다. HTTP 매핑은 `PlatformAdminErrorHandler`로 이동했고, 영속 어댑터는 도메인 예외만 던집니다.
- **BFF 시크릿 감사 executor graceful shutdown (DEF-001)**: `BffSecretAuditExecutorConfig`가 `setWaitForTasksToCompleteOnShutdown=true` + `awaitTerminationSeconds=10`을 적용해 컨테이너 종료 시 큐에 남은 audit 태스크 손실을 줄입니다. 폐기 발생 시 `bff.audit.shutdown.dropped` counter가 증가합니다.
- **`READMATES_IP_HASH_BASE_SECRET` 운영 프로파일 필수화 (DEF-002)**: `ClientIpHashing` salt base secret이 운영 프로파일(`spring.profiles.active`가 비어 있거나 production 포함)에서 비어 있으면 startup이 명시적 메시지와 함께 실패합니다. test 프로파일에서는 빈 값을 허용하되 WARN을 남깁니다.
- **member-app 라우트 가드의 clubSlug 우회 제거 (DEF-003)**: `RequireMemberApp` / `RequireHost`가 club slug 유무와 무관하게 `canUseMemberApp` / `canUseHostApp`을 항상 확인합니다. INACTIVE/non-member 사용자가 다른 club slug URL로 우회 진입하던 가능성을 닫았습니다.
- **AuthContext 401 처리 분리 + 리다이렉트 쿨오프 (DEF-004)**: 401 응답을 `session_expired`(만료된 세션)과 미인증으로 분리하고, 새 `AuthState` variant + `ReadMatesSessionExpiredError`를 도입했습니다. 1500ms cool-off로 redirect loop 가능성을 차단합니다.
- **알림 발송 UNKNOWN 상태 재시도 (DEF-005)**: `NotificationDispatchService`가 SMTP 결과가 `UNKNOWN`인 경우를 dead-letter가 아닌 retryable로 처리합니다. 새 counter `notification.dispatch.unknown_status`로 발생 빈도를 추적합니다.

### Documented

- **Notification outbox dedupeKey 정책 (LOGIC-001)**: `ADR-0015 notification-outbox-dedupe-policy`를 추가해 dedupeKey 생성 규약과 멱등성 보장 범위를 명시했습니다. `NotificationEventService`의 관련 메서드 KDoc도 보강했습니다.
- **`MemberAuthoritiesFilter` null-context 분기 의도 (LOGIC-004)**: club context가 null인 경로의 의도된 동작과 fallback 의미를 KDoc + 테스트로 고정했습니다.

### Added

- **OCI compose 배포 attempt ledger**: `deploy/oci/05-deploy-compose-stack.sh`가 시도/스테이지/결과를 ledger 행으로 기록합니다. 각 행의 필드 의미는 `docs/operations/runbooks/deploy-attempts.md`에 정리되어 있습니다.
- **이미지 verification + post-deploy watch 자동 실행**: 배포 스크립트가 게시된 server image와 실제 실행 중 image의 mismatch를 검출해 ledger에 기록하고, 배포 직후 post-deploy watch 스크립트(`deploy/oci/watch-compose-post-deploy.sh`)를 자동으로 실행합니다. 환경 제약으로 watch가 생략된 경우에도 그 사실이 ledger에 남습니다.
- **운영 진단 스크립트**: read-only compose 진단 수집기(`deploy/oci/readmates-collect.sh`), 해당 수집기를 호스트에 설치하는 installer(`deploy/oci/install-readmates-collector.sh`), 강화된 post-deploy watch 스크립트(`deploy/oci/watch-compose-post-deploy.sh`)를 추가했습니다.
- **운영 런북 셋**: `docs/operations/runbooks/deploy-attempts.md`, `docs/operations/runbooks/post-deploy-watch.md`, `docs/operations/runbooks/read-only-diagnostics.md`와 인덱스 페이지를 추가했습니다. 공개 release 후보 manifest가 이 운영 런북을 포함하도록 함께 갱신했습니다.
- **CI 강화 잡**: 모든 셸 스크립트에 대한 `bash -n` syntax 검증과 `shellcheck` 잡, 공개 release 안전 검사 잡, release 이미지 Trivy 스캔 잡을 추가했습니다.
- **BFF 시크릿 감사 audit-mode**: `BffSecretFilter`가 `readmates.security.bff.audit-mode` 설정을 따르도록 변경됐고, 기본값은 `rotation-only`입니다. 감사 기록은 bounded `ThreadPoolTaskExecutor`로 비동기 처리됩니다.

### Changed

- **공개 release 후보 manifest 정리**: 운영 런북을 포함하도록 manifest를 넓히는 한편, 프론트 테스트 산출물 같은 비공개 후보 디렉토리는 명시적으로 좁혔습니다.
- **BFF 시크릿 감사 기본 동작**: `bff_secret_rotation_audit` 테이블에 매 성공 요청을 적재하던 기존 동작 대신, 기본 모드 `rotation-only`에서는 rotation 확인용 비-primary alias(`secondary`, `index_N`)가 사용된 요청만 기록합니다. 모든 요청을 적재하던 기존 행동은 `audit-mode=full`로 명시 설정해야 활성화됩니다.
- **배포 ledger 필드 문서화**: deploy attempt 모델과 ledger 필드 정의를 운영 런북과 공개 문서에서 일치시켰습니다.
- **시크릿 비교 유틸리티 통합 (STRUCT-001)**: BFF 인증과 rate-limit 필터의 alias 매칭에 흩어져 있던 timing-uniform 시크릿 비교 로직을 공통 `SecretComparator`로 묶었습니다. `MessageDigest.isEqual` + 모든 후보를 끝까지 비교하는 방식은 그대로이며, 의미 변경은 없습니다. OAuth HMAC 검증 경로는 도메인이 달라 기존 구현을 유지합니다.
- **멤버 lifecycle 상태 전이 명시화 (LOGIC-002)**: 멤버 lifecycle 상태 전이를 `MemberLifecycleStatus` enum과 허용 전이 매트릭스로 명시했습니다. `JdbcMemberLifecycleStoreAdapter`가 UPDATE 전에 현재 상태를 조회해 허용되지 않은 전이를 `IllegalMemberStateTransitionException`으로 차단하며, 동시성 race는 기존 SQL `WHERE` 절이 계속 보호합니다.
- **권한 합성 로직의 application 계층 분리 (STRUCT-002)**: 권한 합성 로직을 `MemberAuthoritiesFilter`(infrastructure)에서 `AuthoritySynthesisService`(application)로 분리했습니다. filter는 transport 어댑터 역할만 수행하며 `ROLE_` 리터럴이 0개입니다. application 계층은 Spring Security `GrantedAuthority`나 web 어댑터 타입에 의존하지 않는 framework-neutral 시그니처(`Set<String>`, `ClubContextInput`)를 사용해 ArchUnit boundary를 준수합니다.

### Deployment Notes

- **DB migration**: 없음.
- **새 환경 변수/설정 후보**: `readmates.security.bff.audit-mode` (기본 `rotation-only`, 명시값 `full`로 모든 요청 감사 적재 복원 가능).
- **운영 프로파일 startup 변화 (DEF-002)**: `READMATES_IP_HASH_BASE_SECRET`가 비어 있으면 운영 프로파일에서 startup이 실패합니다. 배포 전 `/etc/readmates/readmates.env`에 값이 설정돼 있는지 확인하세요(`openssl rand -base64 32`로 생성, 1Password에 저장). 자세한 운영 절차는 [`docs/deploy/oci-backend.md`](docs/deploy/oci-backend.md#ip-hash-base-secret) 참고.
- **새 메트릭**: `bff.audit.shutdown.dropped` (BFF audit executor 종료 시 폐기된 태스크 — graceful shutdown 시 0이 정상), `notification.dispatch.unknown_status` (UNKNOWN 상태로 재시도 분기에 진입한 이메일 발송 횟수).
- 운영 가시성: BFF 시크릿 감사(audit-mode 기본 `rotation-only`)는 rotation 확인용 비-primary alias 사용만 기록합니다. 평상시 `bff_secret_rotation_audit` 적재량은 0에 수렴하므로 기존 알람 임계값을 점검하세요.
- **후속 권장**: 30일 이상 행을 정리하는 retention job 예시는 `docs/deploy/oci-backend.md`를 참고하세요.
- **배포 순서**: 서버 먼저, 그다음 프론트엔드. OCI compose stack 배포는 `Deploy Server Image` workflow가 release tag image를 GHCR에 게시한 후 `./deploy/oci/05-deploy-compose-stack.sh`로 실행합니다. 이번부터는 attempt ledger 행과 이미지 verification 결과, post-deploy watch 실행 여부를 함께 확인하세요.
- **CI 동작 변화**: PR/main push에서 셸 스크립트 syntax/shellcheck, 공개 release 안전 검사, release 이미지 Trivy 스캔이 새 실패 신호로 등장할 수 있습니다.

### Verification

- `git diff --check -- CHANGELOG.md` — 출력 없음.
- 공개 시크릿/호스트/개인 경로 스캔(`rg` 정규식) — 출력 없음.

## v1.7.0 - 2026-05-11

### Highlights

2026-05-11 production incident(current-session refresh 빈 화면)의 한 줄 fix와 server-side 후속 안전망(ADR-0013)을 함께 묶고, 그간의 portfolio polish — Architecture Decision Records 백필(0001~0010, 0013), Engineering Highlights와 case study deep-dive 3건, observability runbook(메트릭/대시보드/알람/SLO), incident post-mortem 실천(템플릿 + 1차 incident)을 한 릴리즈로 정착시킵니다. 사용자에게 보이는 변화는 (1) 빈 화면 incident 재발 차단, (2) `/api/auth/me`의 잘못된 club slug 명시 시 새 404 `CLUB_NOT_FOUND` 응답입니다. DB migration 없음.

### Fixed

- **2026-05-11 production incident — current-session refresh blank screen**: `clubSlug`가 route refresh event에서 누락되어 일부 라우트의 refresh path에서 빈 화면이 발생하던 회귀를 수정합니다. `front/features/current-session/route/current-session-route.tsx`가 `useParams()`의 값을 refresh handler에 명시적으로 forward하도록 조정했습니다. (post-mortem: `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`)
- **AuthMeController: slug 명시 누락 vs host fallback unknown 분리** (ADR-0013): BFF는 모든 요청에 `X-Readmates-Club-Host`를 첨부하지만 server가 host lookup miss를 supplied-with-no-context로 처리해 degraded `authenticatedUser` 응답을 내던 잠복 경로를 닫았습니다. 이제 `RequestedClubContext.source`로 분기:
  - `SLUG` 명시 + `club_domains`에 미등록 → 404 `CLUB_NOT_FOUND` (real client bug 명시).
  - `HOST_FALLBACK` + 미등록 host → unscoped 응답 (dev에서 host 헤더가 strip되어 동작하던 unscoped 경로와 일치).
  - "club 존재 + 사용자 미가입" 케이스는 기존 degraded UX 보존 (의도된 동작).

### Added

- **Architecture Decision Records 셋**: `docs/development/adr/`에 backfill 10개(`0001`~`0010`)와 신규 `0013-bff-host-header-policy.md`를 함께 정착. 인덱스(`README.md`), 작성 규약, 템플릿, 상태 라벨, 후보 ADR 목록을 포함합니다. ADR-0011(jOOQ migration)과 0012(Redis adoption)는 follow-up 후보로 등록.
- **Engineering Highlights + Case studies**: README 최상단에 **Engineering Highlights** 섹션을 추가해 운영 중 풀어낸 비자명한 문제 3건을 case study deep-dive로 연결합니다. `docs/case-studies/`에 BFF 보안과 secret rotation, notification outbox pipeline, multi-club domain platform 3건의 deep-dive를 추가 — 각 case는 문제 → 접근 → 구현 → 검증 → trade-off → 다시 한다면 흐름을 따르며, case 03은 2026-05-11 incident의 root cause와 영구 수정 서사를 담습니다.
- **Observability runbook** (`docs/operations/observability/`): 진입 README, 19개 custom 메트릭 카탈로그(근원 코드 인용), 22개 권장 dashboard panel(PromQL), 11개 alertmanager rule candidate, 3개 SLO 정의(API availability, read latency, notification delivery latency). `docs/operations/README.md` 진입점도 함께. 코드 변경 없음 — 현재 배포된 메트릭과 권장 구성만 정리.
- **Incident post-mortem 실천** (`docs/operations/postmortems/`): 디렉토리, 템플릿, severity 정의(SEV1~SEV4), 첫 incident(2026-05-11 current-session refresh club context degradation, SEV2)를 함께 등록. Post-mortem follow-up 갱신 이력 섹션으로 후속 변경 추적을 영구 보존합니다.
- **서버 코드**: `com.readmates.club.adapter.in.web.ClubContextSource` enum(SLUG / HOST_FALLBACK / NONE)과 `RequestedClubContext.source` 필드. 현재 `AuthMeController`만 분기에 사용; 다른 컨슈머(`CurrentMemberArgumentResolver`, `MemberAuthoritiesFilter`, `SessionCookieAuthenticationFilter`)는 후속 audit 대상으로 ADR-0013 후속 섹션에 명시.
- **테스트**: `ResolveClubContextRequestExtensionTest` (6 시나리오 — slug/host/neither/both × hit/miss)와 `AuthMeControllerTest`의 HOST_FALLBACK 시나리오 2건.

### Changed

- 2026-05-11 post-mortem의 Action items 표가 라운드 후속 평가 결과를 반영합니다 — #3 Closed (`READMATES_ROUTE_REFRESH_EVENT` grep audit 단일 사용처 확인), #2 Closed (ADR-0013 머지), #1 Deferred (parity test 시급성 재평가).
- 공개 저장소 위생 기준을 정리해 `.orchestrator/**`와 `.claude/settings.json`을 Git 추적 대상에서 제거하고, `.gitignore`에 `.claude/`와 `.orchestrator/`를 명시했습니다.
- `docs/improvements.md`의 workstation 절대경로를 repo-relative path로 바꾸고, release/public-safety 문서에 GitHub Release 누락 복구와 ignored 파일 제외 검증 기준을 보강했습니다.

### Deployment Notes

- **DB migration**: 없음. Flyway 버전 변경 없음.
- **배포 순서**: 서버 먼저(auth contract에 새 404 응답 경로 추가). 프론트는 새 응답을 만들지 않으므로 영향 없음 — 단 안전을 위해 server → frontend 순서를 권장합니다. release tag push가 `deploy-server.yml`(GHCR image publish)과 `deploy-front.yml`(Cloudflare Pages production deploy) workflow를 함께 시작합니다. OCI compose stack 배포는 `Deploy Server Image` workflow가 GHCR에 같은 tag image를 게시한 후 `./deploy/oci/05-deploy-compose-stack.sh`로 수동 실행합니다.
- **새 환경 변수**: 없음.
- **운영 smoke check 기대값**:

```text
GET /api/bff/api/auth/me                      (anonymous)              -> 200 (authenticated:false)
GET /api/bff/api/auth/me                      (logged-in, valid slug)  -> 200 (currentMembership present)
GET /api/bff/api/auth/me                      (logged-in, unknown slug) -> 404 {"code":"CLUB_NOT_FOUND"}   # 신규
GET /api/bff/api/auth/me                      (logged-in, no headers)   -> 200 (unscoped)
GET /api/bff/api/public/club                  (anonymous)              -> 200
GET /api/bff/api/sessions/upcoming            (anonymous)              -> 401
```

- **Production manual repro**: `https://readmates.pages.dev/clubs/reading-sai/app/session/current` 접근 → 멤버 로그인 → reading progress 조정 + 저장 → 빈 화면 미재발 확인.

### Verification

- `./server/gradlew -p server clean test` — BUILD SUCCESSFUL (707+ tests passing, no regression).
- `pnpm --dir front lint` — exit 0
- `pnpm --dir front test` — 706 passing / 53 files
- `pnpm --dir front build` — exit 0
- `./scripts/public-release-check.sh` — passed (gitleaks + 7 targeted content rules clean)
- `./scripts/verify-public-release-fixtures.sh` — passed
- **Skipped**: `pnpm --dir front test:e2e` — 이번 릴리즈 준비 환경에 e2e용 MySQL(:3306) + Spring + Vite dev 서버 오케스트레이션이 활성화되어 있지 않아 실행하지 못했습니다. 잔여 리스크: 새 404 응답이 프론트엔드에서 어떻게 표시되는지 e2e로 검증하지 못함. 단 (1) 현재 client 코드는 의도적으로 잘못된 slug를 보내지 않으며 grep audit으로 0건 확인, (2) Zod schema fixture는 변경 없음, (3) 서버 단위 + 통합 테스트가 새 분기를 cover합니다. 배포 후 위 production manual repro로 보완 권장.

## v1.6.0 - 2026-05-09

### Highlights

보안 강화, BFF secret 무중단 rotation, 성능 개선, 아키텍처 정리를 포함한 대규모 업데이트입니다. DB migration 3개(V24 legacy password rename, V25 drop, V26 BFF rotation audit)가 포함되며, 신규 환경 변수 `READMATES_IP_HASH_BASE_SECRET`가 추가됩니다.

### Security

- BFF secret 무중단 rotation 지원: `READMATES_BFF_SECRETS` 환경 변수에 쉼표로 구분된 여러 시크릿을 설정할 수 있습니다. 기존 `READMATES_BFF_SECRET`은 fallback으로 계속 동작합니다. 매칭은 timing-safe 방식으로 모든 후보를 끝까지 비교합니다.
- BFF rotation 감사 로그: 인증 성공 요청마다 사용된 secret alias("primary"/"secondary"/"index_N")를 `bff_secret_rotation_audit` 테이블에 비동기로 기록합니다. rotation 중 old-secret 트래픽이 0으로 떨어진 시점을 SQL로 확인할 수 있습니다. (V26 migration)
- `ClientIpHashing.kt`를 추가해 `RateLimitFilter`의 IP 해시 salt를 ISO 주차 기준으로 자동 rotate합니다. base secret은 `READMATES_IP_HASH_BASE_SECRET` 환경 변수로 주입하며, 미설정 시 빈 문자열 fallback을 사용하고 startup 시 WARN을 출력합니다. (TASK-V2-028)
- Spring Security role hierarchy를 `ROLE_PLATFORM_ADMIN > ROLE_MEMBER`, `ROLE_HOST > ROLE_MEMBER`로 정리했습니다. (TASK-V2-005)
- Set-Cookie `Domain` 속성 stripping fix를 적용해 cross-origin cookie 노출을 방지합니다. (TASK-V2-004)
- Support access grants: platform admin이 활성 `HOST_SUPPORT_READ` grant를 가지면 `CheckSupportAccessGrantUseCase`가 합성 HOST membership을 부여합니다. `MemberAuthoritiesFilter`, `CurrentMemberArgumentResolver`, `ClubContextResolver.kt`가 갱신됐습니다. (TASK-V2-024)
- Sessions invariant enforcement: 세션 상태 전이 불변식을 서버에서 검증합니다. (TASK-V2-003)

### Performance

- `CachedNotificationBacklogProvider.kt`를 추가해 notification backlog gauge를 1분 주기 scheduled refresh로 캐싱합니다. `ReadmatesOperationalMetrics`가 캐시된 snapshot을 사용합니다. (TASK-V2-001)
- 공개 endpoint에 `Cache-Control` 헤더를 추가하고 BFF cache를 연동했습니다. (TASK-V2-002)
- 프런트엔드 route lazy loading을 적용해 초기 번들 크기를 줄였습니다. (TASK-V2-019)
- archive detail batching으로 상세 페이지 API 호출 수를 줄였습니다. (TASK-V2-020)
- `HostSessionEditor`에 `useReducer` + `memo`를 적용해 불필요한 re-render를 제거했습니다. (TASK-V2-021)
- Dynamic CORS origins 지원을 추가했습니다. (TASK-V2-016)

### Removed

- Legacy password column dropped from `users` table (Flyway V24+V25 deployed together).
- `POST /api/auth/password-reset/{token}` and `POST /api/host/members/{id}/password-reset` endpoints removed (previously returned 410 GONE; now 404).

### Deployment Notes

**서버 배포 순서**

1. `/etc/readmates/readmates.env`에 신규 환경 변수 추가:
   ```
   READMATES_IP_HASH_BASE_SECRET=<openssl rand -base64 32으로 생성>
   ```
2. GHCR image `ghcr.io/<owner>/readmates-server:v1.6.0` pull 후 compose stack 재시작.
3. Flyway V24, V25, V26 migration 자동 적용 확인.
4. `/internal/health` 및 BFF smoke 확인.

**Flyway migration**

| 버전 | 내용 |
| --- | --- |
| V24 | `users.password_hash` → `legacy_password_hash` rename |
| V25 | `legacy_password_hash`, `legacy_password_set_at` drop |
| V26 | `bff_secret_rotation_audit` 테이블 생성 (감사 로그) |

**프론트엔드**

v1.6.0 tag push로 GitHub Actions `deploy-front.yml`이 Cloudflare Pages 배포를 자동 실행합니다. `zod`가 devDependency로 추가됐으므로 빌드 시 `pnpm install`이 정상 실행돼야 합니다.

### Verification

- 서버 테스트: 707개 통과 (baseline 696 + 11)
- 프론트 테스트: 705개 통과 (baseline 697 + 8)
- TypeScript 오류: 36개 (pre-existing, 신규 없음)

## v1.5.2 - 2026-05-06

### Fixed

- `Deploy Server Image` workflow의 Docker action pin을 Node.js 24 기반 release로 갱신해 GitHub Actions Node.js 20 deprecation warning을 제거했습니다.

## v1.5.1 - 2026-05-06

### Highlights

ReadMates v1.5.1은 v1.5.0 배포 중 확인된 server image release workflow 문제를 고친 patch release입니다. 애플리케이션 런타임 동작은 v1.5.0과 같고, GHCR server image를 OCI A1 VM에서 바로 실행할 수 있는 ARM64 image로 tag 기준 재현 가능하게 게시합니다.

### Fixed

- `Deploy Server Image` workflow의 `docker/login-action` pin을 실제 `v3.6.0` commit으로 고쳐 GHCR server image 게시가 tag/manual dispatch에서 시작되도록 했습니다.
- GHCR server image를 OCI A1 VM과 맞는 `linux/arm64` platform으로 게시하도록 QEMU/Buildx 설정을 추가했습니다.
- Release image workflow는 native runner에서 `bootJar`를 만든 뒤 별도 runtime Dockerfile로 ARM64 image를 조립해 Gradle build가 QEMU emulation에 묶이지 않게 했습니다.

## v1.5.0 - 2026-05-06

### Highlights

ReadMates v1.5.0은 서버, Cloudflare Pages Functions, 프런트엔드가 같은 public-safe API 오류 계약을 사용하도록 맞춘 릴리즈입니다. 사용자는 403/404/409/410/5xx 상황에서 내부 예외나 인프라 세부사항 대신 route context에 맞는 안전한 오류 화면을 보게 됩니다.

운영 측면에서는 GHCR server image 게시 workflow와 OCI compose image tag 배포 기준을 정리했고, 기본 Playwright E2E 실행이 오래된 로컬 Flyway schema history에 막히지 않도록 현재 migration fingerprint 기반 schema를 사용합니다.

### Added

- 서버 이미지를 GitHub Container Registry에 게시하는 `Deploy Server Image` workflow를 추가했습니다. Release tag push와 수동 `image_tag` 입력 모두 같은 Docker tag 검증 경로를 사용합니다.
- 공개 archive/public visibility regression coverage와 BFF header/club slug regression coverage를 추가했습니다.
- 알림 이메일 delivery를 dispatch path와 pending worker path가 공유하는 `NotificationDeliveryEngine`으로 분리하고 retry/dead 전환, redacted error 저장, metrics/logging을 한 곳에서 처리합니다.
- HostDashboard, MyPage, HostSessionEditor, HostMembers UI를 route/API 호출 없는 작은 presentation module로 분리했습니다.
- Spring API 오류 응답을 public-safe `{ code, message, status }` JSON body로 통일하는 shared `ApiErrorResponse`와 feature별 error handler coverage를 추가했습니다.
- Cloudflare Pages Functions BFF 자체 400/403/404 거절도 같은 오류 body shape를 반환하도록 shared error helper를 추가했습니다.
- React Router root/member/host/public/auth route error boundary와 unmatched route용 `NotFoundRoute`를 추가했습니다.
- Playwright E2E 기본 database 이름을 현재 운영 migration과 dev seed SQL fingerprint 기반으로 정하는 regression coverage를 추가했습니다.

### Changed

- 운영 Flyway source of truth를 `server/src/main/resources/db/mysql/migration`으로 고정하고, 사용하지 않는 `server/src/main/resources/db/migration` tree를 제거했습니다.
- 서버 application layer가 Spring Security/Web/JDBC 세부사항에 직접 의존하지 않도록 경계를 강화하고, persistence adapter는 필요한 `JdbcTemplate`을 직접 주입받아 wiring 오류를 빠르게 드러내도록 정리했습니다.
- Cloudflare Pages Functions와 Vite proxy가 같은 club slug validation helper를 사용하게 했고, auth API helper는 raw `401`을 유지해야 하는 preview/logout 흐름과 일반 BFF fetch 흐름을 분리했습니다.
- OCI compose release deploy는 GHCR image tag를 VM에서 pull하고, 로컬 non-GHCR tag는 build/save/load 전환 검증 경로로 남깁니다.
- Vite frontend source에서 불필요한 `"use client"` directive를 제거하고 agent guide에 재도입 금지 기준을 추가했습니다.
- 공개 릴리즈 후보 builder가 server image workflow도 후보 tree에 포함하도록 manifest를 갱신했습니다.
- 프런트엔드 `shared/api` parser가 non-OK 응답을 `ReadmatesApiError`로 변환하고, empty 또는 malformed response body는 HTTP status 기준 fallback code/message로 안전하게 처리합니다.
- Route error UI는 HTTP status와 public/member/host/auth context를 기준으로 안내 문구와 복귀 버튼을 선택하되, 공개 세션 없음이나 피드백 문서 unavailable 같은 feature-specific 상태는 각 feature가 계속 소유합니다.

### Fixed

- Redis Testcontainers가 `localhost`를 반환할 때 Redis URL host를 `127.0.0.1`로 정규화해, 로컬 IPv6 `localhost`의 다른 서비스와 mapped port가 겹치는 테스트 flake를 줄였습니다.
- 로그는 BFF secret rejection, notification relay/delivery, session lifecycle의 운영 이벤트를 남기되 raw secret, token, recipient 원문 같은 민감 값을 기록하지 않도록 보강했습니다.
- 기본 `pnpm --dir front test:e2e`가 오래된 로컬 `readmates_e2e` schema의 Flyway checksum mismatch에 막히던 리스크를 제거했습니다. 명시적 `READMATES_E2E_DB_NAME` override는 그대로 유지됩니다.

### Deployment Notes

이 변경 묶음은 새 운영 DB schema migration을 추가하지 않습니다. 사용하지 않는 legacy `server/src/main/resources/db/migration` tree를 제거했지만 운영 Flyway 경로는 `server/src/main/resources/db/mysql/migration`입니다.

서버 API, Cloudflare Pages Functions, 프런트엔드 route/API parser가 함께 바뀌므로 서버와 프런트엔드를 같은 `v1.5.0` tag 기준으로 배포합니다. 먼저 `Deploy Server Image` workflow로 `ghcr.io/<owner>/<repo>/readmates-server:v1.5.0` 이미지를 게시하고, OCI compose backend는 그 image tag를 pull해 배포합니다. 이후 같은 tag의 Cloudflare Pages frontend/Functions 배포가 완료됐는지 확인합니다.

배포 후에는 Spring `/internal/health`, Pages `/api/bff/api/auth/me`, OAuth start redirect, public club API, 그리고 public 404 route error 화면을 smoke합니다. 비정상 응답 body는 stack trace, SQL detail, upstream host, secret, token 원문, 내부 exception class name을 포함하지 않는 `{ code, message, status }` shape여야 합니다.

### Verification

- `pnpm --dir front lint`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test` - 50 files, 660 tests passed
- `pnpm --dir front build`
- `pnpm --dir front test:e2e` - 22 tests passed
- `git diff --check -- docs/development/architecture.md`
- `git diff --check -- docs/development/test-guide.md docs/superpowers/plans/2026-05-06-readmates-error-boundary-contract-implementation-plan.md front/playwright.config.ts front/tests/e2e/readmates-e2e-config.ts front/tests/e2e/readmates-e2e-db.ts front/tests/unit/playwright-e2e-config.test.ts`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.4.2 - 2026-05-05

### Added

- 대형 HostDashboard, MyPage, HostSessionEditor 컴포넌트 분리를 위한 후속 계획서 3개를 추가했습니다. 각 계획서는 characterization test, 명시적 검증 명령, rollback 기준을 포함합니다.
- 프런트엔드 route continuity/auth guard unit coverage를 확장해 route state parsing, storage, `returnTo` 보존 흐름을 더 구체적으로 검증합니다.

### Changed

- Notification email delivery retry delay를 `READMATES_NOTIFICATION_RETRY_DELAY_MINUTES`로 설정할 수 있게 했습니다.
- 로컬 `compose.yml`의 MySQL database/user/password/port 기본값을 root `.env`로 override할 수 있게 했고, `.env.example`과 local setup 문서에 public-safe sample을 추가했습니다.
- Host route state 타입을 shared helper로 정리해 host dashboard/session editor link state 중복을 줄였습니다.

### Fixed

- Profile PATCH API가 무세션 요청을 Spring Security 단계에서 빈 `401`로 차단하면서, 인증된 사용자의 membership/status/role 판단은 기존 service boundary에서 유지되도록 했습니다.
- OAuth return-state signing secret이 비어 있으면 production runtime이 fallback 없이 실패하도록 보강했습니다.
- Notification DLT recoverer가 원본 Kafka partition을 명시해 partition 검증을 건너뛰지 않도록 했습니다.
- 초대 email 길이를 persistence 전에 검증해 DB 길이 제한 초과가 structured invitation error로 반환되도록 했습니다.

### Deployment Notes

이 릴리즈는 서버 인증/알림 코드, 프론트엔드 route state helper, 로컬 Compose 설정, 문서와 테스트 계획을 함께 포함합니다. DB migration은 없고, 운영 DB가 `v1.4.1` 기준 Flyway 상태라면 추가 schema migration 없이 앱을 시작할 수 있습니다.

운영 서버에는 `readmates-server:v1.4.2` image를 배포해야 합니다. `READMATES_NOTIFICATION_RETRY_DELAY_MINUTES`는 email delivery retry 간격을 조정하는 선택 설정이며, 값을 지정하지 않으면 기본 `5,15,60,240`분을 사용합니다.

권장 순서는 서버 backend image를 `v1.4.2`로 먼저 배포하고 `/internal/health`, BFF auth smoke, OAuth start smoke를 확인한 뒤, `v1.4.2` tag push로 Cloudflare Pages frontend와 Pages Functions 배포를 시작하는 방식입니다. Profile PATCH 무세션 요청은 빈 `401`로 차단되는 것이 정상 기대값입니다.

### Verification

- `./server/gradlew -p server clean test`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `READMATES_E2E_DB_NAME=readmates_e2e_v142_permission_check pnpm --dir front test:e2e` - 로컬 MySQL 3306에서 22 tests passed
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- `git diff --check -- CHANGELOG.md docs/deploy/oci-backend.md docs/development/local-setup.md docs/development/test-guide.md .env.example compose.yml`

## v1.4.1 - 2026-04-30

### Highlights

ReadMates v1.4.1은 알림 이메일의 브랜드 표기와 문구를 클럽 중심으로 다듬는 patch release입니다. 테스트 preview는 샘플 클럽명 `읽는사이`로 렌더링하고, 실제 이벤트 메일은 DB의 `clubs.name`을 사용합니다.

### Added

- 알림 이메일 샘플 5종을 한 화면에서 확인할 수 있는 테스트 전용 HTML preview report를 추가했습니다.

### Changed

- 알림 이메일 상단 브랜드, plain text 첫 줄, 테스트 메일 제목/본문, footer가 `ReadMates` 고정값 대신 클럽명을 사용합니다.
- 일반 알림 이메일의 닫는 문구를 `다음 모임과 읽기 흐름에 맞춰 소식을 전합니다.`로 변경했습니다.
- 모임 리마인더, 피드백 문서, 새 서평 알림 summary를 제품명보다 클럽 맥락이 드러나는 자연스러운 안내 문구로 정리했습니다.
- 다음 책 공개 CTA를 `ReadMates에서 회차 확인하기`에서 `회차 확인하기`로 줄였습니다.

### Fixed

- 실제 알림 이벤트 메일 렌더링 경로가 `clubs.name`을 함께 로드하도록 보강해, 클럽별 이메일 copy가 올바른 이름으로 렌더링됩니다.

### Deployment Notes

이 릴리즈는 서버 알림 템플릿 코드와 테스트 전용 preview report만 변경합니다. DB migration은 없고, Cloudflare Pages frontend code 변경도 없습니다.

운영 이메일 copy를 반영하려면 서버 backend image를 `readmates-server:v1.4.1`로 재배포해야 합니다. `v1.4.1` tag push는 Cloudflare Pages workflow를 실행하지만, 서버 컨테이너 교체를 대신하지 않습니다.

### Verification

- `./server/gradlew -p server test --tests 'com.readmates.notification.application.model.NotificationEmailTemplatesTest' --tests 'com.readmates.notification.application.model.NotificationEmailTemplatePreviewTest'`
- `./server/gradlew -p server test --tests 'com.readmates.notification.*'`
- `./server/gradlew -p server clean test`
- `./server/gradlew -p server bootJar`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- `git diff --check`

## v1.4.0 - 2026-04-30

### Highlights

ReadMates v1.4.0은 운영 배포 경로를 OCI Docker Compose stack 기준으로 정리하고, 멤버가 받는 이메일 알림을 plain text fallback이 있는 HTML 템플릿으로 개선한 릴리즈입니다. 로그인 필요 화면에서 로그인 후 원래 앱 경로로 돌아오는 흐름도 safe `returnTo` 기준으로 정리했습니다.

### Added

- OCI backend Docker Compose stack 전환 보고서를 추가해 Caddy/Spring/Redis/Redpanda cutover, BFF secret 불일치 원인, 검증 명령, 후속 운영 과제를 공개-safe placeholder 기준으로 기록했습니다.
- 알림 이메일 subject/plain/HTML copy를 함께 렌더링하는 서버 템플릿 helper와 SMTP MIME 발송 경로를 추가했습니다.
- Docker 기반 OCI compose backend runtime과 versioned server image 배포 절차를 추가했습니다.
- 제품 릴리즈 버전 source of truth, server/frontend 공통 tag 기준, OCI server image tag 기준을 정리한 [버저닝 문서](docs/development/versioning.md)를 추가했습니다.

### Changed

- 현재 운영 runbook과 README 링크를 v1.3.0 이후 기준에 맞춰 Cloudflare Pages + OCI Compose stack 중심으로 정리했습니다. Legacy Spring Boot JAR 배포는 compose cutover 검증과 rollback 경로로만 문서화합니다.
- 로그인 guard, loader, API 401, dev-login, OAuth 시작 흐름이 안전한 relative `returnTo`만 보존하도록 정리했습니다.
- 호스트 테스트 메일은 redesigned template path를 사용하고, 실제 알림 이메일은 HTML body와 plain text fallback을 함께 발송합니다.
- Cloudflare Pages Functions의 BFF/OAuth proxy helper가 upstream origin, trusted forwarding header, internal response header stripping을 일관되게 처리하도록 정리했습니다.
- 릴리즈 배포 시 서버 image tag를 제품 tag와 맞춰 `readmates-server:vMAJOR.MINOR.PATCH`로 지정하는 기준을 문서화했습니다.

### Fixed

- Cloudflare Pages Functions는 `READMATES_API_BASE_URL`의 query string/fragment를 upstream origin으로 전달하지 않고, BFF secret source를 dedicated `READMATES_BFF_SECRET` 하나로 고정합니다.
- Compose Caddy와 legacy rollback Caddy 문서 기준을 request URI와 `Authorization`, `Cookie`, `X-Readmates-Bff-Secret` request header 미기록으로 맞췄습니다.
- 호스트 알림 상세 API가 raw plain/HTML 이메일 본문을 노출하지 않도록 문서화된 privacy boundary를 맞췄습니다.
- Kafka notification publisher adapter autowiring 경계를 정리해 Kafka flag가 꺼진 환경에서 불필요한 publisher bean 요구를 피합니다.

### Deployment Notes

이 릴리즈는 서버 코드, Cloudflare Pages Functions, 프론트엔드 route/auth 흐름, OCI backend compose 배포 스크립트를 함께 포함합니다. 권장 순서는 서버 compose stack을 `READMATES_SERVER_IMAGE=readmates-server:v1.4.0`으로 먼저 배포한 뒤 `v1.4.0` tag push로 Cloudflare Pages frontend와 Pages Functions를 배포하는 방식입니다.

`v1.3.0` 이후 새 Flyway migration 파일은 없습니다. 운영 DB는 기존 `V22 / note_count_query_indexes`까지 성공한 상태면 추가 schema migration 없이 앱을 시작할 수 있습니다. 그래도 서버 배포 전에는 기존 운영 백업 기준을 따르고, 배포 후 `/internal/health`, Cloudflare BFF auth smoke, OAuth start smoke를 확인합니다.

Frontend production 배포는 `v1.4.0` tag push가 `.github/workflows/deploy-front.yml`을 실행하면서 시작됩니다. `main` push만으로는 Cloudflare Pages production 배포가 시작되지 않습니다.

권장 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
READMATES_SERVER_IMAGE=readmates-server:v1.4.0 VM_PUBLIC_IP='<vm-public-ip>' CADDY_SITE=api.example.com ./deploy/oci/05-deploy-compose-stack.sh
git tag -a v1.4.0 -m "ReadMates v1.4.0"
git push origin main
git push origin v1.4.0
```

운영 smoke:

```bash
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test` - 49 files, 636 tests passed
- `pnpm --dir front build`
- `READMATES_E2E_DB_NAME=readmates_e2e_codex_shortname5 pnpm --dir front test:e2e` - 22 tests passed
- `./server/gradlew -p server clean test`
- `./server/gradlew -p server bootJar`
- `git diff --check -- <changed-docs>`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.3.0 - 2026-04-30

### Highlights

ReadMates v1.3.0은 단일 독서모임 앱을 멀티 클럽 운영 플랫폼으로 확장하고, 알림 운영과 읽기 성능을 운영 가능한 수준으로 끌어올린 릴리즈입니다. 멤버는 인앱/이메일 알림을 관리할 수 있고, 호스트는 알림 ledger와 테스트 메일을 확인할 수 있으며, 운영자는 클럽 도메인과 플랫폼 관리자 흐름을 다룰 수 있습니다.

### Added

- Redis 기반 session/rate-limit/public/notes read cache foundation을 추가했습니다. 기본값은 꺼져 있으며, 운영에서 `READMATES_REDIS_ENABLED`와 세부 cache flag를 켤 때만 Redis가 필수입니다.
- MySQL event outbox와 Kafka relay/consumer 기반 알림 pipeline을 추가했습니다.
- 멤버 인앱 알림함과 알림 읽음 처리 API를 추가했습니다.
- 멤버 My Page에서 이메일 알림 전체 설정과 이벤트별 수신 설정을 저장할 수 있게 했습니다.
- 호스트 알림 운영 페이지(`/app/host/notifications`)를 추가해 outbox 목록, 상세, 개별 retry, `DEAD` 복구, 고정 템플릿 테스트 메일, 테스트 메일 audit을 확인할 수 있게 했습니다.
- 발행된 회차에 공개 장문 서평이 처음 저장되면 opt-in 멤버에게 `REVIEW_PUBLISHED` 알림을 생성합니다.
- 플랫폼 관리자 shell과 클럽 도메인 provisioning 상태 확인 UI/API를 추가했습니다.
- 클럽 slug와 registered host를 기준으로 public/app route를 scope하는 멀티 클럽 URL 구조를 추가했습니다.
- 커서 pagination primitive와 host/member archive, notes, feedback, notification 목록 pagination을 추가했습니다.
- MySQL query budget, Flyway migration, Redis, Kafka, 멀티 클럽 user-flow regression test를 추가했습니다.
- 운영 metrics, Object Storage 백업 스크립트, production integration smoke 스크립트를 추가했습니다.
- 단일 VM 저사용량 운영을 위한 Redis/Redpanda 보조 인프라 compose 예시(`deploy/oci/compose.infra.yml`)를 추가했습니다.
- MySQL Flyway migration `V16__notification_outbox.sql`부터 `V22__note_count_query_indexes.sql`까지 추가했습니다.

### Changed

- 로그인 후 클럽이 하나면 해당 클럽 앱으로, 여러 개면 클럽 선택 화면으로 진입하도록 app entry 흐름을 바꿨습니다.
- OAuth 시작/콜백 proxy가 club path와 registered host return target을 보존하도록 정리했습니다.
- 기존 `NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED` 알림 생성은 멤버의 전역/이벤트별 알림 선호도를 반영합니다.
- 호스트 알림 API 응답은 recipient email을 masked 값으로 반환하고, detail metadata는 allowlist된 제품 metadata만 노출합니다.
- Archive, public, notes, host dashboard persistence query를 feature-local query class로 분리하고 hot path index를 추가했습니다.
- 서버 web adapter는 application exception을 feature별 error handler로 mapping하도록 정리했습니다.
- 프론트엔드 host UI와 route action/data 경계를 feature `route`/`ui` 구조로 정리했습니다.
- 공개 canonical URL, Pages Functions BFF header forwarding, OAuth proxy helper를 멀티 클럽 운영 기준에 맞게 정리했습니다.

### Fixed

- host pagination cursor가 route 전환 뒤 stale state로 남을 수 있는 문제를 수정했습니다.
- 빈 notes deep link와 archive paging consumer가 이전 API shape를 가정하던 문제를 수정했습니다.
- notification retry, delivery metrics, event payload persistence, Kafka publisher/consumer retry, DLQ wiring을 안정화했습니다.
- notification privacy field와 test mail error가 raw recipient 정보를 노출할 수 있는 경계를 막았습니다.
- mobile host/member notification tab과 responsive navigation regression을 수정했습니다.
- frontend router warning과 Playwright color env warning을 제거했습니다.

### Deployment Notes

이 릴리즈는 서버 API, DB migration, Pages Functions, 프론트엔드 route가 함께 바뀝니다. 프론트엔드만 먼저 배포하면 새 UI가 이전 서버에 멀티 클럽, 알림, pagination API를 호출하면서 `404` 또는 `405`를 볼 수 있습니다. 권장 순서는 서버 선배포 후 release tag push로 Cloudflare Pages 프론트엔드를 배포하는 방식입니다.

운영 DB는 Spring Boot 시작 시 Flyway가 MySQL migration `V22 / note_count_query_indexes`까지 적용해야 합니다. `V16`부터 `V22`까지는 새 알림/도메인/감사용 테이블과 여러 index를 만들므로 서버 배포 전에 운영 DB 백업 또는 snapshot을 만들고, 배포 직후 `flyway_schema_history`에서 `success=1`인 최신 migration이 `22 / note_count_query_indexes`인지 확인합니다. 큰 테이블이 있는 운영 DB에서는 index 생성 시간이 애플리케이션 시작 시간을 늘릴 수 있습니다.

운영 환경 변수 확인이 필요합니다.

- 기본 배포에서는 `READMATES_NOTIFICATIONS_ENABLED=false`, `READMATES_KAFKA_ENABLED=false`, `READMATES_REDIS_ENABLED=false`, cache/rate-limit/session-cache flag도 false로 둘 수 있습니다.
- 알림 발송을 켜려면 Kafka bootstrap/topic/DLQ/consumer group, SMTP host/user/password/sender, notification worker/attempt 값을 VM env에 넣은 뒤 켭니다.
- Redis cache나 rate limit을 켜려면 `READMATES_REDIS_URL`과 관련 enable flag를 같이 설정합니다. Redis를 켜고 endpoint가 죽어 있으면 health check와 runtime path가 실패할 수 있습니다.
- 멀티 클럽 도메인을 운영하려면 Cloudflare Pages custom domain 연결, Google OAuth callback, `READMATES_AUTH_BASE_URL`, `READMATES_ALLOWED_ORIGINS`, `VITE_PUBLIC_PRIMARY_DOMAIN`을 같은 rollout로 맞춥니다.
- management/metrics endpoint는 `READMATES_MANAGEMENT_ADDRESS=127.0.0.1`, `READMATES_MANAGEMENT_PORT=8081`로 VM loopback에만 바인딩합니다.

권장 순서:

1. 서버와 프론트엔드 검증을 실행합니다.
2. 운영 DB 백업 또는 snapshot을 만듭니다.
3. 운영 VM의 `/etc/readmates/readmates.env`에 새 optional env 값을 확인하거나 추가합니다.
4. Spring Boot JAR를 빌드하고 운영 VM에 먼저 배포합니다.
5. 서버 로그에서 Flyway가 `v22`까지 성공했고 애플리케이션이 정상 기동했는지 확인합니다.
6. `v1.3.0` tag를 push해 Cloudflare Pages 프론트엔드와 Pages Functions 배포를 시작합니다.
7. 공개 club route, OAuth start, 멤버 앱 entry, 클럽 선택, 호스트 알림 페이지, 멤버 알림함, platform admin guard를 smoke check합니다.

서버 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

운영 DB 확인 예시:

```sql
select version, description, success, installed_on
from flyway_schema_history
order by installed_rank desc
limit 10;
```

운영 smoke 예시:

```bash
CLUB_SLUG='{club-slug}'
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/app
curl -sS -o /dev/null -w '%{http_code}\n' https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://readmates.pages.dev/oauth2/authorization/google
curl -sS "https://readmates.pages.dev/api/bff/api/public/clubs/${CLUB_SLUG}"
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test` - 48 files, 622 tests passed
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test:e2e` - 22 tests passed
- `./server/gradlew -p server bootJar`
- `git diff --check -- CHANGELOG.md .env.example docs/deploy/oci-backend.md deploy/oci/compose.infra.yml docs/superpowers/plans/2026-04-30-readmates-architecture-refactor-detailed-implementation-plan.md`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.2.0 - 2026-04-25

### Highlights

ReadMates v1.2.0은 호스트의 세션 기록 발행 lifecycle을 명시적으로 분리한 릴리즈입니다. 호스트는 진행 중인 세션을 닫은 뒤 기록을 저장하고, 준비가 끝난 기록만 멤버/공개 표면에 발행할 수 있습니다. 멤버 홈, 아카이브, 노트, 공개 페이지는 `PUBLISHED` 상태와 공개 범위에 맞춰 기록을 더 일관되게 보여줍니다.

### Added

- 호스트 세션을 `OPEN`에서 `CLOSED`로 전환하는 API와 서버 검증을 추가했습니다.
- 닫힌 세션 기록을 `PUBLISHED`로 발행하는 API와 서버 검증을 추가했습니다.
- 호스트 세션 편집 화면에 닫기, 저장, 발행 흐름을 연결했습니다.
- 공개 릴리스 tag push로 Cloudflare Pages 프론트엔드 배포를 시작하는 workflow를 추가했습니다.
- 닫힌 기록과 발행된 기록이 아카이브/노트/공개 표면에서 다르게 보이는 regression test를 추가했습니다.

### Changed

- 공개 API는 `public_session_publications.visibility=PUBLIC`뿐 아니라 세션 상태가 `PUBLISHED`인 기록만 반환하도록 강화했습니다.
- 멤버 아카이브와 세션 상세의 기록 badge가 공개 범위가 아니라 lifecycle 상태를 기준으로 표시되도록 정리했습니다.
- 호스트 세션 편집 화면에서 host-only 기록은 외부 발행 action을 막고 저장 전환만 허용하도록 정리했습니다.
- 현재/예정/기록 세션 identity, 모바일 action label, 노트 필터, 아카이브 header copy를 더 짧고 일관되게 다듬었습니다.
- 공개 홈, 공개 클럽, 로그인 진입 copy를 초대 기반 독서모임 톤에 맞춰 조정했습니다.

### Fixed

- `CLOSED` 상태의 공개 범위 기록이 발행 전 공개 상세나 노트 표면에 보일 수 있는 경계를 막았습니다.
- 호스트 발행 action 뒤 화면이 이전 publication snapshot을 계속 들고 있을 수 있는 문제를 수정했습니다.
- 아카이브 상세에서 멤버 공개 기록을 이미 발행된 기록처럼 표시할 수 있는 badge 기준을 수정했습니다.
- 모바일 host/member 화면의 중복 예정 세션 label과 불필요하게 긴 action label을 정리했습니다.
- 공개 릴리스 후보 빌더가 로컬 플랫폼 상태 디렉터리를 후보에 복사한 뒤 자체 검증에서 실패할 수 있는 문제를 수정했습니다.

### Deployment Notes

이 릴리즈는 서버 API와 프론트엔드가 함께 바뀝니다. 프론트엔드만 먼저 배포하면 새 화면이 이전 서버에 `close`/`publish` 요청을 보내면서 `404` 또는 `405`를 볼 수 있습니다.

`v1.1.0` 이후 새 Flyway migration 파일은 추가하지 않았습니다. 다만 운영 DB가 아직 `V14__session_record_visibility.sql`, `V15__session_visibility.sql`을 적용하지 않은 상태라면 서버 재시작 중 Flyway가 `v15`까지 올려야 합니다. 서버 배포 전에 운영 DB 백업 또는 snapshot을 만들고, 서버 시작 로그 또는 `flyway_schema_history`에서 최신 성공 migration이 `15 / session_visibility`인지 확인합니다.

권장 순서:

1. 서버와 프론트엔드 검증을 실행합니다.
2. 운영 DB 백업 또는 snapshot을 만듭니다.
3. Spring Boot JAR를 빌드하고 운영 VM에 먼저 배포합니다.
4. 서버 로그에서 Flyway가 성공했고 애플리케이션이 정상 기동했는지 확인합니다.
5. `v1.2.0` tag를 push해 Cloudflare Pages 프론트엔드 배포를 시작합니다.
6. 공개, 멤버, 호스트 route와 세션 닫기/발행 흐름을 smoke check합니다.

서버 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

운영 DB 확인 예시:

```sql
select version, description, success, installed_on
from flyway_schema_history
order by installed_rank;
```

### Verification

- `./server/gradlew -p server clean test`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.1.0 - 2026-04-25

### Highlights

ReadMates v1.1.0은 세션 공개 범위와 예정 세션 운영 흐름을 추가한 릴리즈입니다. 호스트는 미래 모임을 미리 준비하고, 기록을 호스트 전용, 멤버 공개, 외부 공개로 나눠 관리할 수 있습니다. 멤버와 둘러보기 멤버는 공개 범위가 허용된 예정 세션만 볼 수 있습니다.

### Added

- 세션 기록 공개 범위(`HOST_ONLY`, `MEMBER`, `PUBLIC`)를 저장하는 서버/DB 흐름을 추가했습니다.
- 호스트가 세션 기록 공개 범위를 저장하고 수정할 수 있는 API와 화면 모델을 추가했습니다.
- 예정 세션(`DRAFT`)을 만들고 수정하고 현재 세션으로 시작하는 호스트 흐름을 추가했습니다.
- 멤버 홈에서 멤버 공개 또는 외부 공개 예정 세션을 볼 수 있게 했습니다.
- `/api/sessions/upcoming`, `/api/host/sessions` 계열 API contract와 테스트를 추가했습니다.
- MySQL migration `V14__session_record_visibility.sql`, `V15__session_visibility.sql`을 추가했습니다.

### Changed

- 공개 기록 노출 기준을 단순한 세션 상태가 아니라 `public_session_publications.visibility=PUBLIC` 기준으로 정리했습니다.
- 아카이브와 노트 조회에서 호스트 전용 기록이 멤버/공개 표면으로 새지 않도록 정리했습니다.
- 호스트 세션 편집 화면의 섹션 문구와 기본값을 정리했습니다.
- 공개 홈, 공개 세션, 소개, 로그인 CTA 문구를 초대 기반 독서모임 톤에 맞게 다듬었습니다.
- 공개 기록 페이지의 모바일 레이아웃과 문구를 조정했습니다.
- README와 개발/배포 문서가 세션 공개 범위와 예정 세션 운영 방식을 설명하도록 갱신했습니다.

### Fixed

- draft 또는 host-only 기록이 멤버/공개 조회에 섞일 수 있는 경계를 수정했습니다.
- dev seed의 공개 기록 visibility가 실제 공개 API 정책과 맞도록 수정했습니다.
- 호스트 예정 세션 화면의 상단 구분선과 stale test copy를 정리했습니다.
- 떠난 멤버 로그인 오류와 표시 이름 노출 관련 UX를 보완했습니다.

### Deployment Notes

이 릴리즈는 서버 API와 DB migration을 포함합니다. 프론트엔드만 배포하면 새 화면이 이전 서버 API를 호출하면서 `404` 또는 `405`를 볼 수 있습니다.

권장 순서:

1. 서버 테스트를 실행합니다.
2. Spring Boot JAR를 빌드하고 운영 VM에 배포합니다.
3. 서버 로그에서 Flyway가 `v15`까지 적용됐는지 확인합니다.
4. Cloudflare Pages frontend와 Pages Functions를 배포합니다.
5. 공개, 멤버, 호스트 route를 smoke check합니다.

서버 배포 명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
VM_PUBLIC_IP='<vm-public-ip>' ./deploy/oci/03-deploy.sh
```

비로그인 smoke에서 새 API가 `404` 또는 `405`를 반환하면 frontend/backend version skew를 의심합니다. 정상적인 비로그인 보호 응답은 `401` 또는 변경 요청의 경우 `403`일 수 있습니다.

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- fresh E2E DB 기준 `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`

## v1.0.0 - 2026-04-25

### Highlights

ReadMates v1.0.0은 초대 기반 독서모임 앱의 첫 공개 기준선입니다. 공개 사이트, 멤버 앱, 호스트 운영 도구, Google OAuth 로그인, Cloudflare Pages BFF, Spring Boot API, MySQL/Flyway persistence, 공개 릴리즈 안전 검사를 포함합니다.

### Core Features

- 공개 홈, 클럽 소개, 공개 기록, 공개 세션 상세 화면을 제공합니다.
- Google OAuth와 서버 측 `readmates_session` cookie 기반 로그인을 사용합니다.
- Cloudflare Pages Functions가 같은 origin BFF로 `/api/bff/**`, OAuth 시작, OAuth callback을 Spring으로 전달합니다.
- 게스트, 둘러보기 멤버, 정식 멤버, 호스트 권한 경계를 제공합니다.
- 멤버 앱에서 현재 세션, RSVP, 읽은 분량, 질문, 한줄평, 장문 서평, 아카이브, 노트, 본인 표시 이름을 다룹니다.
- 호스트 앱에서 멤버 관리, 초대 관리, 현재 세션 운영, 참석 확정, 기록 발행, 피드백 문서 업로드를 다룹니다.
- 피드백 문서는 호스트 또는 참석한 정식 멤버에게만 노출합니다.
- Spring Boot API는 MySQL과 Flyway migration을 사용합니다.
- Playwright E2E와 public release candidate scanner를 포함합니다.

### Deployment Notes

v1.0.0은 운영 구조의 기준선입니다.

- Frontend SPA와 Pages Functions는 Cloudflare Pages에서 실행합니다.
- Spring Boot API는 HTTPS reverse proxy 뒤의 VM에서 실행합니다.
- MySQL schema는 Spring 시작 시 Flyway가 적용합니다.
- 운영 secret은 Git에 넣지 않고 Cloudflare, VM runtime env, provider console, ignored local files에만 둡니다.

### Verification

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test:e2e`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
