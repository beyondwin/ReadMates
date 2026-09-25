# Server Agent Guide

Read this for work under `server/`.

The server is a Kotlin Spring Boot API in one module.

Successful server changes keep HTTP parsing in inbound adapters, authorization and domain rules in application services, persistence details behind outbound ports/adapters, and public data exposure tied to the documented visibility model.

New or migrated feature code follows feature-local clean architecture:

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

Preferred feature layout:

```text
com.readmates.<feature>
  adapter.in.web
  adapter.out.persistence
  application.port.in
  application.port.out
  application.service
  application.model
  domain
```

Controller responsibilities: route annotations, request parsing/validation, `CurrentMember` parameter intake, use case calls, response mapping, HTTP status.

Controller must not own SQL, inject `JdbcTemplate`, inject legacy repositories directly, call persistence adapters, or hold complex authorization logic.

Application services own orchestration, membership/role/session authorization, domain rules, and outbound port calls.

Application services must not throw Spring web/http exceptions. Use feature application errors and map them in `adapter.in.web`.

Persistence adapters own JDBC SQL, DB rows, and column mapping. New persistence work should inject the required `JdbcTemplate` directly and fail fast if database wiring is missing.

Operational Flyway migrations live only under `server/src/main/resources/db/mysql/migration`; `server/src/main/resources/db/dev` holds the repeatable local dev seed only. Do not add production migrations anywhere else.

CQRS read/write package split: write-side feature(`auth`, `club`, `session`, `notification`)는 entity와 도메인 invariant를 갖는 `domain/` 패키지와 트랜잭션 mutation을 수행하는 application service를 둡니다. Read-side feature(`note`, `publication`, `archive`, `browse` 등)는 `domain/` 없이 `application/model/`의 read DTO와 `JdbcXxxAdapter` 직접 query만 두고, application service에 `@ReadOnlyApplicationService` 마커(`com.readmates.shared.architecture`)를 부착합니다. `feedback`은 조회 API만 두고 live 문서 교체는 session-record apply가 맡으며, `sessionimport`는 preview read path와 commit write path를 함께 가진 mixed slice입니다. 둘 다 read-only marker 미부착입니다. Read-only service는 mutation port(`*SavePort`/`*UpdatePort`/`*DeletePort`/`*WriterPort`/`*StorePort`/`*WritePort` suffix in `*.port.out.*`)와 `@Transactional`을 모두 금지합니다 — `ServerArchitectureBoundaryTest`가 강제합니다. 자세한 컨벤션은 [docs/development/architecture.md](../development/architecture.md)의 "CQRS Read vs Write Package Split" 섹션을 참고합니다.

Recent architecture work classifies server slices as write-side, read-side, ops read-side, or workflow-side. `admin.audit` is read-side, `admin.health` is ops read-side, and `aigen` is workflow-side. Workflow-side slices may orchestrate transactions and side effects, but provider SDKs, Redis, JDBC, Kafka, and mail details stay behind outbound ports/adapters.

Security boundaries:

- Browser traffic should go through Cloudflare/Vite same-origin BFF routes.
- Server API should treat `X-Readmates-Bff-Secret`, session cookies, membership status, role, and attendance as authorization boundaries.
- Public APIs must expose only records whose publication visibility is `PUBLIC`; do not assume `sessions.state=PUBLISHED` is the only public exposure path.
- Password login and password invitation-acceptance endpoints are removed (they return `410 Gone`); do not revive password auth unless explicitly requested.

Read another guide when the server task crosses surfaces:

- Frontend API client, route behavior, BFF proxy, or user-flow changes: `docs/agents/front.md`.
- UI or copy changes caused by server behavior: `docs/agents/design.md`.
- README, deploy docs, scripts docs, or agent instructions: `docs/agents/docs.md`.

Ask before editing if the required authorization boundary, migration behavior, or API compatibility expectation is unclear from current code and `docs/development/architecture.md`. Stop and report if a change would expose private records, raw tokens, credentials, real member data, or deployment identifiers.

Checks:

```bash
./scripts/server-ci-check.sh
```

이 wrapper는 `./server/gradlew -p server --no-build-cache --rerun-tasks check`를 실행하며, CI backend job도 같은 wrapper를 호출합니다. `check`는 ktlint(baseline), detekt(`server/config/detekt/detekt.yml` + baseline), `unitTest`, `architectureTest`, JaCoCo line coverage ≥ 0.43을 묶습니다. 정적 분석/coverage가 영향받는 변경에서도 같은 wrapper를 실행합니다.

Docker/Testcontainers 기반 MySQL, Flyway, API contract, query budget evidence가 필요하면 integration lane을 별도로 실행합니다.

```bash
./server/gradlew -p server integrationTest
```

기본 Gradle `test` task는 비활성화(`enabled = false`)되어 있으므로 단위 테스트는 `unitTest`로 실행합니다. 개발 중에는 `unitTest`, `architectureTest`, 또는 `integrationTest --tests ...` focused lane을 사용할 수 있지만 PR-level wrapper를 대체하지 않습니다.

For API, auth, BFF, or user-flow changes, also run:

```bash
pnpm --dir front test:e2e
```

Done when the changed slice respects the adapter/service/port boundary, relevant tests are run or explicitly reported as skipped, and any API contract change is reflected in the matching frontend or documentation surface.
