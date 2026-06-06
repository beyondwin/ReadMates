# 테스트 가이드

ReadMates의 테스트는 frontend lint/unit/build, Playwright E2E, backend Gradle test, 공개 릴리즈 후보 점검, 배포 연동 smoke로 나뉩니다.

GitHub Actions CI는 frontend job에서 Node.js 24와 `pnpm@10.33.0`을 사용해 lint, coverage 포함 unit test, build, Zod fixture freshness check를 실행하고, design-system job에서 `pnpm design:check`를 실행합니다. Backend job은 JDK 21로 `./gradlew check`를 실행하며, `check` 안에서 unit test, architectureTest, ktlint, detekt, JaCoCo가 함께 돕니다. Testcontainers 기반 integration suite는 별도 `backend-integration` job의 `./gradlew integrationTest`로 병렬 실행합니다. E2E job은 MySQL service를 띄운 뒤 Playwright suite를 3개 shard로 나눠 실행합니다.

검증은 변경 surface와 위험도에 맞춰 고릅니다. 완료 보고에는 실행한 명령, 실패 또는 스킵한 명령과 이유, 남은 리스크를 함께 남깁니다. 실패한 검증을 무시하고 완료로 표시하지 않습니다.

외부 배포 smoke는 실제 운영 상태를 볼 수 있으므로 결과 전문, 운영 domain 목록, provider 응답 본문을 공개 문서나 Git에 붙이지 않습니다.

## Pre-Push Aggregate

CI에서 자주 실패하는 게이트를 로컬에서 먼저 묶어 확인할 때는 아래 스크립트를 사용합니다.

```bash
./scripts/pre-push-check.sh
```

기본 모드는 `git diff --check`, frontend lint, coverage 포함 unit test, frontend build, Zod fixture freshness, backend `check`를 실행합니다. `docs/`, `scripts/`, `deploy/`, `.github/`, `README.md`처럼 공개 후보에 영향을 주는 경로가 바뀌면 clean public release candidate를 만들고 scanner도 실행합니다.

릴리즈 또는 태그 배포 직전에는 integration/E2E까지 포함합니다.

```bash
./scripts/pre-push-check.sh --full --release
```

명령 목록만 확인하려면 `--dry-run`을 사용합니다. Public release scanner를 수동으로 생략할 때는 `--no-release`를 쓰되, release-sensitive 경로 변경에서는 완료 보고에 생략 이유를 남깁니다.

## Frontend

의존성 설치:

```bash
pnpm install --frozen-lockfile
```

루트 pnpm workspace가 `front`, `design/system`, `design/docs`를 함께 관리합니다. Frontend-only 명령은 계속 `pnpm --dir front ...`로 실행합니다.

Lint:

```bash
pnpm --dir front lint
```

Unit test:

```bash
pnpm --dir front test
```

Vitest는 `front/vitest.config.ts`의 project split으로 순수 Node 단위 테스트와 `jsdom`/React/BFF 성격 테스트를 나눠 실행합니다. 새 테스트를 추가할 때 DOM, Web API, Testing Library가 필요하면 `jsdom` project include 대상에 두고, 순수 model/contract 계산이면 Node project에 남깁니다.

신규 단위 테스트는 source 파일 옆에 `*.test.{ts,tsx}` 형식으로 co-locate합니다(예: `features/host/ui/host-foo.tsx` → `features/host/ui/host-foo.test.tsx`). `vitest.config.ts`의 `include`가 `src/**/*.test.{ts,tsx}`, `features/**/*.test.{ts,tsx}`, `shared/**/*.test.{ts,tsx}`와 기존 `tests/unit/**`를 모두 매치합니다. 기존 `front/tests/unit/`는 server testcontainer가 `readmates.frontend.fixtures.dir` system property로 참조하므로 이동하지 않습니다. 새 fixture가 서버에서도 사용되는 경우에만 `tests/unit/__fixtures__/`에 둡니다.

Coverage 게이트:

```bash
pnpm --dir front test:coverage
```

`@vitest/coverage-v8`로 측정하며, threshold는 현재 baseline에서 정수 -2pp floor로 고정합니다(lines/statements 87, functions 83, branches 84). CI front job은 `pnpm test:coverage`로 게이트를 강제하고 `front-coverage` 아티팩트를 always upload(14일 보존)합니다. Threshold를 올릴 때는 안정적으로 통과하는 측정치 -2pp(정수 floor)를 기준으로 갱신합니다.

Frontend unit suite에는 `front/tests/unit/frontend-boundaries.test.ts`도 포함됩니다. 이 테스트는 route-first 구조의 shared/feature/model/route/ui import 경계, `shared/ui`의 `src/app` import 금지, 제거된 `shared/api/readmates` compatibility import, `ui`가 있는 feature의 `components` public import 금지, route-owned action type 노출 여부를 확인합니다. Legacy boundary exception 목록은 비어 있어야 합니다.

API contract schema나 fixture를 바꿨다면 export 결과가 최신인지 확인합니다. CI frontend job도 같은 검사를 실행합니다.

```bash
pnpm --dir front zod:export-fixtures
git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
```

Frontend 경계만 빠르게 확인하려면 Vitest를 직접 실행합니다.

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

BFF/OAuth proxy header forwarding을 바꿨다면 Cloudflare Functions unit test를 먼저 실행합니다. 이 테스트는 browser-supplied internal header를 trusted BFF/server-derived 값으로 덮어쓰는지, `_shared/proxy.ts` helper가 upstream response의 internal `x-readmates-*` header를 제거하는지, OAuth proxy의 forwarded header policy가 authorization start와 callback에서 드리프트하지 않는지 확인합니다.

```bash
pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts
```

Production build:

```bash
pnpm --dir front build
```

## Playwright E2E

```bash
pnpm --dir front test:e2e
```

`front/playwright.config.ts`는 E2E 실행 중 backend와 frontend dev server를 함께 띄웁니다.

- 기본 frontend port는 `PLAYWRIGHT_PORT`가 없으면 `3100`입니다.
- 기본 backend origin은 `READMATES_API_BASE_URL`이 없으면 `http://127.0.0.1:18080`입니다.
- `READMATES_E2E_DB_NAME`이 없으면 E2E database 이름은 현재 운영 migration과 dev seed SQL 내용의 fingerprint를 붙인 `readmates_e2e_<hash>` 형태로 정합니다. migration 파일이 바뀌면 기본 schema 이름도 바뀌므로 오래된 로컬 `readmates_e2e` schema의 Flyway checksum history가 기본 명령을 막지 않습니다.
- E2E backend의 Actuator management port는 `READMATES_MANAGEMENT_PORT=0`으로 실행해 로컬 `8081` 점유 상태와 충돌하지 않게 합니다. Playwright readiness는 여전히 backend API origin의 `/internal/health`를 기준으로 확인하므로 backend startup failure는 숨기지 않습니다.
- E2E backend는 `SPRING_PROFILES_ACTIVE=dev`, `READMATES_FLYWAY_LOCATIONS=classpath:db/mysql/migration,classpath:db/mysql/dev`, BFF secret placeholder, IP hash base secret placeholder로 실행됩니다. 이는 non-production blank IP hash secret도 명시 opt-in 없이는 실패하는 server validation과 맞춥니다.
- 테스트에서 운영 migration 경로를 지정할 때도 `classpath:db/mysql/migration`을 사용합니다. `dev` profile 또는 E2E seed가 필요한 경우에만 `classpath:db/mysql/dev`를 뒤에 추가합니다.
- E2E database 연결은 `READMATES_E2E_DB_HOST`, `READMATES_E2E_DB_PORT`, `READMATES_E2E_DB_USER`, `READMATES_E2E_DB_PASSWORD`, `READMATES_E2E_DB_NAME`으로 조정할 수 있습니다. 공개 문서에서는 정확한 로컬 DB 이름 대신 placeholder를 사용합니다.
- Playwright config는 `mysql` CLI로 E2E database를 생성하므로 로컬 MySQL server와 MySQL client가 필요합니다. E2E user에 `CREATE DATABASE` 권한이 없다면 admin 계정으로 별도 E2E schema를 미리 만들고 해당 schema에만 E2E user 권한을 부여한 뒤 `READMATES_E2E_DB_NAME`으로 지정합니다. 직접 지정한 기존 schema에서 Flyway checksum mismatch가 나면 `repair`나 drop 대신 `READMATES_E2E_DB_NAME`을 비우거나 새 schema 이름을 지정하는 편이 안전합니다.

기본 Playwright worker 수는 seeded database state를 공유하는 현재 E2E 흐름 때문에 1로 유지합니다. state isolation을 확인한 뒤 병렬 실행을 실험할 때만 명시적으로 opt-in합니다.

```bash
PLAYWRIGHT_WORKERS=2 pnpm --dir front test:e2e
```

반복 실행에서 database cleanup 충돌이 없다는 증거가 쌓이기 전에는 worker 병렬화를 기본값으로 바꾸지 않습니다.

기본 `compose.yml`의 MySQL을 쓴다면 먼저 실행합니다.

```bash
docker compose up -d mysql
```

다른 MySQL을 쓴다면 E2E 환경 변수를 맞춥니다.

```bash
READMATES_E2E_DB_HOST=127.0.0.1 \
READMATES_E2E_DB_PORT=3306 \
READMATES_E2E_DB_USER='<e2e-db-user>' \
READMATES_E2E_DB_PASSWORD='<e2e-db-password>' \
READMATES_E2E_DB_NAME='<e2e-db-name>' \
pnpm --dir front test:e2e
```

예정 세션 흐름을 확인하는 `front/tests/e2e/dev-login-session-flow.spec.ts`는 호스트가 `DRAFT` 세션을 만들고, `MEMBER` 공개로 바꾼 뒤, 멤버 홈의 `/api/sessions/upcoming` 표시와 `OPEN` 전환을 함께 검증합니다. `CLOSED`/`PUBLISHED` 기록 lifecycle은 현재 backend DB test와 frontend unit test에서 더 촘촘히 검증합니다.

Member/host reading-loop route smoke:

```bash
pnpm --dir front test:e2e -- tests/e2e/dev-login-session-flow.spec.ts
```

세션 기록 JSON 가져오기 흐름은 frontend model unit test와 backend DB integration test가 1차 검증합니다.

```bash
pnpm --dir front exec vitest run features/host/model/session-import-model.test.ts
./server/gradlew -p server test --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest
```

멤버 표시 이름과 권한 경계만 빠르게 확인하려면 관련 E2E spec을 직접 지정할 수 있습니다.

```bash
pnpm --dir front test:e2e -- member-profile-permissions
```

플랫폼 admin 첫 화면의 today operations ledger만 빠르게 확인하려면 아래 spec을 지정합니다. 이 spec은 public-safe BFF 응답을 route mock으로 고정해 OWNER가 queue/brief를 보는 흐름과 SUPPORT가 mutation CTA를 실행할 수 없는 흐름을 검증합니다.

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-today.spec.ts
```

Admin analytics visual evidence:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

The spec captures desktop and mobile screenshots into Playwright `test-results` using public-safe mocked analytics data. Generated screenshots are evidence artifacts only and are not committed.

Host/member visual evidence:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
pnpm --dir front test:e2e -- tests/e2e/member-reading-momentum.spec.ts
```

These specs capture desktop and mobile screenshots into Playwright `test-results` using public-safe route mocks or dev fixtures. Generated screenshots are evidence artifacts only and are not committed.

## 시각 회귀 (컴포넌트 하니스)

**목적:** `shared/ui` primitive의 렌더링 회귀를 화면 흐름 E2E와 분리해, 컴포넌트 단위 스냅샷으로 빠르게 잡습니다. 위의 host/member/admin visual evidence가 화면 흐름 증거(커밋하지 않는 산출물)인 것과 달리, 컴포넌트 하니스의 baseline 스냅샷은 Git에 커밋해 회귀 게이트로 사용합니다.

**설정 파일:** `front/playwright-ct.config.ts`. E2E용 `front/playwright.config.ts`와 별개이며, backend나 frontend dev server를 띄우지 않습니다(`@playwright/experimental-ct-react`가 컴포넌트를 직접 렌더).

**테스트 위치:** `front/shared/ui/**/*.ct.tsx`로 source 옆에 co-locate합니다. `.ct.tsx` 확장자라 Vitest `*.test.{ts,tsx}`나 E2E `tests/e2e/**`와 충돌하지 않습니다.

**스냅샷 경로:** baseline은 `front/__screenshots__/shared/ui/<test>.ct.tsx/<name>.png`에 생성되며 커밋 대상입니다(`testDir="."`). 초기 커버리지는 ReadmatesBrandMark, BookCover(이미지 없는 fallback), AvatarChip입니다.

**명령:**

```bash
pnpm --dir front test:ct
pnpm --dir front test:ct:update
pnpm --dir front test:ct:update:docker
```

- `test:ct`는 로컬 렌더 확인용입니다. 로컬 렌더러는 CI(linux)와 폰트 렌더링이 달라 이 결과로 baseline을 커밋하지 않습니다.
- `test:ct:update`는 로컬 baseline 갱신용이지만, 위와 같은 렌더러 차이로 커밋하지 않습니다.
- `test:ct:update:docker`가 baseline 생성의 **유일한 정규 경로**입니다. `mcr.microsoft.com/playwright:v1.60.0-jammy` 이미지 안에서(`CI=true`) 실행해 CI 렌더러와 일치시킵니다.

**darwin(macOS) 제약:** macOS에서는 Vite 8의 `@rolldown/binding-darwin-arm64` 네이티브 바인딩이 없어 CT suite가 로컬에서 부팅조차 되지 않습니다. 따라서 macOS에서는 검증과 baseline 생성 모두 **Docker 경로만** 사용합니다. 로컬(특히 Apple Silicon)에서 `test:ct`가 부팅에 실패하면 `test:ct:update:docker`(또는 동일 이미지의 Docker 실행)로 진행합니다. macOS 로컬에서 생성한 baseline은 폰트 렌더링 차이로 CI를 깨뜨리므로 절대 커밋하지 않습니다.

**flake 정책:** 애니메이션과 caret을 끄고, 고정 viewport `480x360`, `maxDiffPixelRatio: 0.02`로 픽셀 노이즈를 흡수합니다. darwin 로컬에서 생성한 baseline은 커밋하지 않습니다.

**experimental API 주의:** `@playwright/experimental-ct-react`는 experimental이고 Vite 8 / React 19 조합은 bleeding-edge입니다. 부팅이 실패하면 임시 우회를 강제하지 말고 이슈로 기록한 뒤 진행합니다.

## Backend

Backend tests are expected to run on JDK 21. `server/build.gradle.kts` pins the Gradle `Test` JVM to the Java 21 toolchain so local shells using a newer current JVM do not change test runtime behavior. If Gradle cannot find a JDK 21 toolchain locally, install one or set `JAVA_HOME` to a JDK 21 installation before running backend tests.

전체 backend test (단위 + 아키텍처 + integration 묶음):

```bash
./server/gradlew -p server clean unitTest architectureTest integrationTest
```

기본 `:test` task는 비활성화되어 있습니다 — 태그 필터가 없어 `:unitTest`, `:integrationTest`, `:architectureTest`와 동일 테스트를 중복 실행하기 때문입니다. `./gradlew check`는 `:unitTest + :architectureTest + :detekt + JaCoCo`를 의존성으로 한 번씩만 실행하며, integration은 Docker가 필요해 명시적으로 호출할 때만 돕니다.

Backend fast lanes:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest
./server/gradlew -p server architectureTest
```

이 fast lane은 개발 중 빠른 피드백용이며 release baseline을 대체하지 않습니다. `unitTest`는 `integration`, `container`, `architecture` tag를 제외하고, `integrationTest`는 Spring/Testcontainers 성격 tag를 포함하며, `architectureTest`는 ArchUnit boundary만 실행합니다. Backend 변경을 ship하기 전에는 위 세 lane을 모두 실행합니다.

`./server/gradlew -p server clean test` may be a no-op for integration-tagged confidence checks. For release-risk review that touches SQL plans, API contracts, or query budgets, run the targeted integration lane explicitly:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.contract.FrontendZodSchemaContractTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

`:unitTest`는 JUnit5 클래스 단위 병렬 + Gradle `maxParallelForks=availableProcessors()/2`(기본)로 실행합니다. CI에서는 `READMATES_TEST_FORKS` env로 fork 수를 명시할 수 있고, sweep harness(`scripts/bench/sweep-forks.sh`)로 머신별 최적값을 측정할 수 있습니다.

PR-level quality gate는 단일 `check` task로 통합되어 있습니다.

```bash
./server/gradlew -p server check
```

`check`는 다음 게이트를 한 번에 검증합니다.

- **ktlint baseline gate**: `org.jlleitschuh.gradle.ktlint` 12.1.1 + ktlint tool 1.7.1. 기존 위반은 `server/config/ktlint/baseline.xml`로 grandfather, 신규 위반만 차단합니다. Auto-format은 `./server/gradlew -p server ktlintFormat`로 적용합니다.
- **detekt baseline gate**: detekt 1.23.7 + `server/config/detekt/detekt.yml`. 기존 위반은 `server/config/detekt/baseline.xml`로 grandfather. detekt 1.23.x가 호스트 JDK 25에서 동작하도록 `server/gradle/gradle-daemon-jvm.properties`에서 daemon JVM을 Java 21로 pin하고, detekt classpath는 Kotlin 2.0.10으로 고정합니다.
- **JaCoCo line coverage gate**: `unitTest`의 `JacocoTaskExtension`이 `build/jacoco/unitTest.exec`를 생성하고, `jacocoTestCoverageVerification`이 LINE `COVEREDRATIO` 최소 0.23(측정치 -2pp)을 강제합니다. `Application`/`dto`/`config`는 report에서 제외합니다. Threshold를 올릴 때는 측정치 -2pp baseline rule을 유지합니다.

CI backend job은 `./gradlew check` 단일 호출로 구성되어 있습니다 — `check`가 `:unitTest + :architectureTest + :detekt + :jacoco*`를 모두 의존하므로 별도 architectureTest step은 불필요(2026-05-16 제거). ktlint/detekt/JaCoCo report 아티팩트는 `if: always()`로 항상 업로드합니다(실패시 `backend-reports` 별도 업로드 유지).

Backend test suite에는 MySQL 기반 persistence adapter/controller 검증이 포함되어 있습니다. `server/build.gradle.kts`는 `org.testcontainers:testcontainers-mysql`을 사용하고, Docker가 필요합니다. Colima를 쓰는 로컬 환경에서는 기본 Docker socket env가 비어 있고 Colima socket이 있으면 Gradle test task가 `DOCKER_HOST`와 `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`를 설정합니다.

Backend Gradle test는 Testcontainers가 필요한 MySQL lifecycle을 직접 관리합니다. 로컬 `compose.yml`의 MySQL은 서버를 수동으로 띄우거나 Playwright E2E database를 준비할 때 쓰며, `./server/gradlew -p server clean test`를 실행하기 전에 `docker compose up`을 먼저 실행할 필요는 없습니다.

로컬 image 재현성 검증은 `docker build -t readmates-server:local server`를 사용하며, 이 명령은 `server/Dockerfile`을 사용합니다. Release workflow는 CI가 jar를 빌드한 뒤 `server/Dockerfile.release`로 이미지를 만들고, 같은 digest를 scan한 다음 promote합니다.

### Testcontainers 재사용 (로컬 전용)

MySQL / Redis / Kafka Testcontainer는 모두 `withReuse(true)`로 표시되어 있어, 개발자가 한 번 옵트인하면 후속 backend test 실행에서 컨테이너 시작 단계를 건너뜁니다. 다음 줄을 추가해 활성화합니다.

```bash
echo "testcontainers.reuse.enable=true" >> ~/.testcontainers.properties
```

이 설정은 holder 머신 단위라 CI에는 영향이 없습니다(매 runner가 새 환경). 컨테이너 상태가 stale로 의심되면 다음으로 수동 정리합니다.

```bash
docker rm -f $(docker ps -a --filter "label=org.testcontainers.session-id" -q)
```

Refs: `docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md` §4.5.

## Notification Operations

알림 event outbox, Kafka relay/consumer, OCI Email Delivery adapter 설정, retry delay 설정, 운영 metrics, host dashboard/notification operations UI, 멤버 알림 설정과 알림함을 바꿨다면 아래 targeted command를 먼저 실행합니다. Kafka notification integration test는 Testcontainers Kafka를 사용하므로 Docker 또는 Colima가 실행 중이어야 합니다.

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.kafka.*'
./server/gradlew -p server test --tests 'com.readmates.notification.*'
./server/gradlew -p server test --tests com.readmates.archive.api.MemberArchiveReviewControllerTest
./server/gradlew -p server clean test
pnpm --dir front exec vitest run tests/unit/host-dashboard.test.tsx
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
pnpm --dir front exec vitest run tests/unit/host-session-notifications.test.tsx
pnpm --dir front exec vitest run tests/unit/member-notifications.test.tsx
pnpm --dir front exec vitest run tests/unit/my-page.test.tsx
pnpm --dir front lint
```

수동 알림 발송의 세션 선택, preview/confirm, duplicate resend, 멤버별 포함/제외, in-app 수신 확인까지 바꿨다면 아래 E2E spec도 함께 확인합니다. 이 spec은 Playwright가 띄우는 dev backend와 E2E MySQL schema가 필요합니다.

```bash
pnpm --dir front test:e2e -- manual-notifications
```

## Redis-Backed Server Features

Redis-backed 기능은 Redis가 꺼진 기본 상태와 Redis가 켜진 adapter test 양쪽에서 확인합니다.

```bash
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

Targeted Redis adapter test는 Testcontainers Redis를 직접 띄우므로 수동 Redis server가 필요하지 않습니다. Testcontainers가 로컬 `localhost`를 반환하면 test helper는 Redis URL host를 `127.0.0.1`로 정규화해 IPv6 localhost에서 다른 로컬 서비스와 port가 겹치는 flake를 피합니다. Rate limit, auth session cache, public cache, notes cache, read-cache invalidation을 바꾸면 관련 `Redis*AdapterTest`, application cache test, `ServerArchitectureBoundaryTest`를 함께 확인합니다.

Backend test suite에는 ArchUnit 기반 아키텍처 경계 테스트도 포함됩니다. `ServerArchitectureBoundaryTest`는 전환된 web adapter가 legacy repository, `JdbcTemplate`, outbound persistence adapter에 직접 의존하지 않는지 확인하고, 전환된 application package가 adapter, Spring JDBC, Spring DAO, Spring Web/HTTP 세부사항에 의존하지 않는지 확인합니다. Application service에서 `ResponseStatusException`, `HttpStatus`, Spring Web type을 쓰지 말고 feature application error를 `adapter.in.web`에서 HTTP response로 매핑합니다. 세션/노트 쓰기 흐름을 수정했다면 아래 focused command로 경계 테스트와 관련 controller/service test를 먼저 확인할 수 있습니다.

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --tests com.readmates.session.application.service.SessionMemberWriteServiceTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

목록 조회, archive/notes/host/public detail query, 또는 cursor pagination SQL을 수정했다면 query budget과 EXPLAIN guardrail을 먼저 확인합니다. `ServerQueryBudgetTest`는 주요 HTTP flow의 query 수가 관찰된 budget을 넘지 않는지 확인하고, `MySqlQueryPlanTest`는 핵심 목록/detail SQL이 의도한 index plan을 유지하는지 확인합니다.

Admin analytics overview도 query budget 대상입니다. `/api/admin/analytics/overview?window=30d`는 admin session validation과 운영 분석 aggregate/bucket query를 함께 지나는 authenticated request입니다. `ServerQueryBudgetTest`가 bounded query count를 핀해 accidental N+1 회귀를 막습니다.

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

```bash
./server/gradlew -p server test \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

멤버 프로필이나 표시 이름 검증을 수정했다면 아래 focused command로 controller, application, migration 경계를 먼저 확인할 수 있습니다.

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.MemberProfileControllerTest \
  --tests com.readmates.auth.api.HostMemberApprovalControllerTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest
```

세션 공개 범위, 예정 세션, `OPEN -> CLOSED -> PUBLISHED` lifecycle, 공개 기록 노출을 수정했다면 아래 focused command가 가장 빠른 1차 확인입니다.

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.application.service.HostSessionServicesTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionBffSecurityTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.publication.api.PublicControllerDbTest \
  --tests com.readmates.archive.api.ArchiveControllerDbTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --tests com.readmates.support.ReadmatesMySqlSeedTest
```

알림 이메일 템플릿 copy, subject, club name 렌더링, HTML preview를 수정했다면 아래 focused command로 순수 템플릿 테스트와 preview report 생성을 먼저 확인합니다. Report는 테스트 산출물이며 Git에 커밋하지 않습니다.

```bash
./server/gradlew -p server test \
  --tests com.readmates.notification.application.model.NotificationEmailTemplatesTest \
  --tests com.readmates.notification.application.model.NotificationEmailTemplatePreviewTest
```

## 공개 릴리즈 후보 점검

공개 저장소로 낼 수 있는 후보 tree를 만들고 검사합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```
현재 private working tree를 직접 검사할 수도 있습니다.

```bash
./scripts/public-release-check.sh
```

Release helper script의 scanner pattern을 바꿨다면 fixture 검증도 실행합니다.

```bash
./scripts/verify-public-release-fixtures.sh
```

세부 정책은 [공개 저장소 보안 문서](../deploy/security-public-repo.md)와 [scripts 문서](../../scripts/README.md)를 참고합니다. 이 검사는 secret/path 실수를 줄이는 guardrail이며, 운영 secret rotation이나 GitHub 공개 전환을 대신하지 않습니다.

## 배포 연동 Smoke

배포 후 Cloudflare Pages marker와 OAuth start redirect URI는 공개 릴리즈 후보 검사와 별개로 실제 배포 origin에 대해 확인합니다. 이 스크립트는 secret을 요구하지 않지만, 결과는 운영 상태일 수 있으므로 공개 문서나 Git에 붙이지 않습니다.

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```

Primary auth domain이나 registered club host를 함께 확인할 때는 placeholder를 운영 값으로 바꿔 실행합니다.

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://<primary-domain> \
READMATES_SMOKE_CLUB_HOST=https://<registered-club-host> \
./scripts/smoke-production-integrations.sh
```

`READMATES_SMOKE_STRICT_GOOGLE=true`는 Google 응답 본문에서 `redirect_uri_mismatch`를 추가로 찾으려는 옵션입니다. Google 로그인 화면 응답은 계정 상태와 지역에 따라 달라질 수 있으므로 기본 판정은 ReadMates가 생성한 provider redirect URL의 `redirect_uri`를 기준으로 합니다.

## 권장 확인 순서

작은 frontend 변경:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

인증, route, BFF, 화면 흐름 변경:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

Backend API, authorization, database 변경:

```bash
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

공개 배포 또는 public repo 후보 점검:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Release baseline:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

배포 후 OAuth/domain 연동 점검:

```bash
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev \
READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev \
./scripts/smoke-production-integrations.sh
```
