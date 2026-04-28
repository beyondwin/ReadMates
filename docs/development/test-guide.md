# 테스트 가이드

ReadMates의 테스트는 frontend lint/unit/build, Playwright E2E, backend Gradle test, 공개 릴리즈 후보 점검으로 나뉩니다.

GitHub Actions CI는 frontend job에서 Node.js 24와 `pnpm@10.33.0`을 사용해 lint/test/build를 실행하고, backend job에서 JDK 21로 `./server/gradlew -p server clean test`를 실행합니다.

## Frontend

의존성 설치:

```bash
pnpm --dir front install --frozen-lockfile
```

Lint:

```bash
pnpm --dir front lint
```

Unit test:

```bash
pnpm --dir front test
```

Frontend unit suite에는 `front/tests/unit/frontend-boundaries.test.ts`도 포함됩니다. 이 테스트는 route-first 구조의 shared/feature/model/route/ui import 경계, 제거된 `shared/api/readmates` compatibility import, legacy boundary exception 사용 여부를 확인합니다.

Frontend 경계만 빠르게 확인하려면 Vitest를 직접 실행합니다.

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
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
- E2E backend는 `SPRING_PROFILES_ACTIVE=dev`, `READMATES_FLYWAY_LOCATIONS=classpath:db/mysql/migration,classpath:db/mysql/dev`, BFF secret placeholder로 실행됩니다.
- E2E database 연결은 `READMATES_E2E_DB_HOST`, `READMATES_E2E_DB_PORT`, `READMATES_E2E_DB_USER`, `READMATES_E2E_DB_PASSWORD`, `READMATES_E2E_DB_NAME`으로 조정할 수 있습니다. 공개 문서에서는 정확한 로컬 DB 이름 대신 placeholder를 사용합니다.
- Playwright config는 `mysql` CLI로 E2E database를 생성하므로 로컬 MySQL server와 MySQL client가 필요합니다.

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

멤버 표시 이름과 권한 경계만 빠르게 확인하려면 관련 E2E spec을 직접 지정할 수 있습니다.

```bash
pnpm --dir front test:e2e -- member-profile-permissions
```

## Backend

전체 backend test:

```bash
./server/gradlew -p server clean test
```

Backend test suite에는 MySQL 기반 repository/controller 검증이 포함되어 있습니다. `server/build.gradle.kts`는 `org.testcontainers:testcontainers-mysql`을 사용하고, Docker가 필요합니다. Colima를 쓰는 로컬 환경에서는 기본 Docker socket env가 비어 있고 Colima socket이 있으면 Gradle test task가 `DOCKER_HOST`와 `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`를 설정합니다.

Backend Gradle test는 Testcontainers가 필요한 MySQL lifecycle을 직접 관리합니다. 로컬 `compose.yml`의 MySQL은 서버를 수동으로 띄우거나 Playwright E2E database를 준비할 때 쓰며, `./server/gradlew -p server clean test`를 실행하기 전에 `docker compose up`을 먼저 실행할 필요는 없습니다.

## Redis-Backed Server Features

Redis-backed 기능은 Redis가 꺼진 기본 상태와 Redis가 켜진 adapter test 양쪽에서 확인합니다.

```bash
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

Targeted Redis adapter test는 Testcontainers Redis를 직접 띄우므로 수동 Redis server가 필요하지 않습니다. Rate limit, auth session cache, public cache, notes cache, read-cache invalidation을 바꾸면 관련 `Redis*AdapterTest`, application cache test, `ServerArchitectureBoundaryTest`를 함께 확인합니다.

Backend test suite에는 ArchUnit 기반 아키텍처 경계 테스트도 포함됩니다. `ServerArchitectureBoundaryTest`는 전환된 web adapter가 legacy repository, `JdbcTemplate`, outbound persistence adapter에 직접 의존하지 않는지 확인하고, 전환된 application package가 adapter, Spring JDBC, Spring DAO 세부사항에 의존하지 않는지 확인합니다. 세션/노트 쓰기 흐름을 수정했다면 아래 focused command로 경계 테스트와 관련 controller/service test를 먼저 확인할 수 있습니다.

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
  --tests com.readmates.session.application.service.HostSessionCommandServiceTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionBffSecurityTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.publication.api.PublicControllerDbTest \
  --tests com.readmates.archive.api.ArchiveControllerDbTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --tests com.readmates.support.ReadmatesMySqlSeedTest
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
