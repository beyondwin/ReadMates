# Engineering Confidence

이 문서는 ReadMates가 커진 뒤에도 변경 가능한 코드베이스로 남기 위해 사용하는 경계, 테스트, 품질 게이트를 정리합니다.

## Boundary Evidence

| Boundary | Guardrail | What it prevents |
| --- | --- | --- |
| Frontend route-first architecture | `front/tests/unit/frontend-boundaries.test.ts` | shared가 app/page/feature를 거꾸로 import하거나 feature UI가 route/API를 직접 잡는 회귀 |
| Server clean architecture | `ServerArchitectureBoundaryTest` | web adapter가 persistence/JDBC를 직접 잡거나 application package가 Spring Web/adapter에 의존하는 회귀 |
| CQRS read/write convention | `@ReadOnlyApplicationService` + ArchUnit rules | read-only service가 mutation port나 write transaction을 갖는 회귀 |
| Flyway migration compatibility | `MySqlFlywayMigrationTest` | MySQL-specific migration, collation, FK compatibility 회귀 |
| Query budget | `ServerQueryBudgetTest` | 주요 화면의 accidental N+1 query 회귀 |
| Public release safety | `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh` | public candidate에 private state, local path, secret-shaped data가 포함되는 회귀 |

## Frontend Server-State Migration

Current source: `docs/development/server-state-migration.md`

Completed:

- `host/invitations` — list query, create/revoke mutation, loader handoff

Next candidates:

1. `host/members`
2. `host/notifications`
3. `host/sessions`

Migration rule: route modules own loader/action coordination, UI components stay prop/callback driven, and new Query helpers live under `front/features/<feature>/queries/`.

## Server Boundary Follow-Ups

The session package already has separate draft, lifecycle, attendance, publication, and query services. The next useful server confidence work is transaction boundary documentation and a narrow cleanup of adapter-level transaction annotations where application services already own the transaction.

## Validation Commands

Frontend:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Server:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server architectureTest
./server/gradlew -p server check
```

Public release:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```
