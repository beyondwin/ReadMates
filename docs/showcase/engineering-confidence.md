# Engineering Confidence

코드베이스가 커져도 바꾸기 쉬운 상태로 남기 위한 경계, 테스트, 품질 게이트를 정리합니다.

## Boundary Evidence

| 경계 | 가드 | 막는 회귀 |
| --- | --- | --- |
| Frontend route-first architecture | `front/tests/unit/frontend-boundaries.test.ts` | shared가 app/page/feature를 거꾸로 import하거나, feature UI가 route/API를 직접 부르는 것 |
| Server clean architecture | `ServerArchitectureBoundaryTest`(ArchUnit) | web adapter가 persistence/JDBC를 직접 쓰거나, application package가 Spring Web/adapter에 의존하는 것 |
| CQRS read/write 규칙 | `@ReadOnlyApplicationService` + ArchUnit rule | read-only service가 mutation port나 write transaction을 갖는 것 |
| 서버 코드 품질 | detekt(`server/config/detekt/detekt.yml`, `baseline.xml`) | 복잡도·스타일 기준을 넘는 새 코드 |
| Frontend/server 응답 contract | `pnpm --dir front zod:export-fixtures`, `FrontendZodSchemaContractTest` | frontend schema와 서버 MockMvc 응답의 top-level drift |
| Host/member reading loop | `front/shared/model/reading-loop.test.ts`, member/host/current-session route test, `dev-login-session-flow.spec.ts` | 호스트 운영 상태와 멤버 읽기 상태의 의미가 갈라지거나 admin 전용 신호가 새는 것 |
| Flyway migration 호환 | `MySqlFlywayMigrationTest`, `scripts/check-flyway-migration-immutability.py` | MySQL 전용 migration, collation, FK 호환 문제와 적용된 migration 수정 |
| Query budget | `ServerQueryBudgetTest` | 주요 화면의 의도치 않은 N+1 query |
| Query plan | `MySqlQueryPlanTest`, `LargeReadPathFixture` | archive 목록·상세, notes feed 같은 read path가 큰 fixture에서 index를 타지 않는 것(EXPLAIN) |
| Admin/host/member 화면 증거 | `front/tests/e2e/admin-analytics.spec.ts`, `host-club-operations.spec.ts`, `member-reading-momentum.spec.ts` | mock 운영·읽기 화면의 desktop/mobile layout drift와 private data 노출 |
| Route-critical 시각 회귀 | `pnpm --dir front test:ct:docker`, `pnpm --dir front test:ct:update:docker`, `front/__screenshots__/` | host closing board, platform-admin support, public records 같은 반복 UI의 pixel drift |
| Lighthouse diagnostic | `pnpm --dir front lighthouse:diagnose` | public/member/host/admin dev-seed route의 진입 실패와 릴리즈에서 고칠 품질 문제 누락 |
| 공개 릴리즈 안전 | `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh` | 공개 후보에 private state, 로컬 경로, secret 모양 데이터가 섞이는 것 |

## Frontend Server-State Migration

기준 문서: `docs/development/server-state-migration.md`

TanStack Query 이관은 public read path와 platform admin 운영 화면까지 끝났습니다. 새 server state도 같은 규칙을 따릅니다. route module이 loader/action 조율을 맡고, UI 컴포넌트는 props/callback만 받고, Query helper는 `front/features/<feature>/queries/`에 둡니다.

## Server Boundary Follow-Ups

session package는 draft, lifecycle, attendance, publication, query service로 이미 나뉘어 있습니다. 트랜잭션 경계 규칙은 `docs/development/technical-decisions.md`의 Transaction Boundary Policy에 있습니다. adapter에 남은 `@Transactional`은 서비스가 이미 트랜잭션을 가진 경우에 한해 테스트로 동작을 고정한 뒤 좁게 정리합니다.

## Validation Commands

Frontend:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front lighthouse:diagnose -- --group public --limit 2
pnpm --dir front test:ct:docker
```

Server:

```bash
./scripts/server-ci-check.sh                  # check = detekt + unitTest + architectureTest
./server/gradlew -p server unitTest
./server/gradlew -p server architectureTest
./server/gradlew -p server integrationTest    # Testcontainers MySQL/Redis
```

Gradle 기본 `test` task는 꺼져 있습니다.

Public release:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```
