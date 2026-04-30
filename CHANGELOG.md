# CHANGELOG

ReadMates는 Git tag와 GitHub Releases를 함께 사용합니다. 이 파일은 저장소 안에 남는 릴리즈 기록이고, GitHub Releases는 태그별 공개 릴리즈 노트로 사용합니다.

버전 규칙과 릴리즈 절차는 [docs/development/release-management.md](docs/development/release-management.md)를 기준으로 합니다.

## Unreleased

No changes yet.

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
