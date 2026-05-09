# CHANGELOG

ReadMates는 Git tag와 GitHub Releases를 함께 사용합니다. 이 파일은 저장소 안에 남는 릴리즈 기록이고, GitHub Releases는 태그별 공개 릴리즈 노트로 사용합니다.

버전 규칙과 릴리즈 절차는 [docs/development/release-management.md](docs/development/release-management.md)를 기준으로 합니다.

## Unreleased

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
