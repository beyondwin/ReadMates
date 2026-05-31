# ReadMates Architecture Flexibility Design

작성일: 2026-05-27
상태: APPROVED DESIGN SPEC

## 1. Context / Current State

ReadMates는 이미 클린아키텍처와 route-first frontend 경계를 주요 source of truth로 둔다. 서버는 feature-local package 안에서 inbound adapter, application port/service, outbound port/adapter를 나누고, 프론트엔드는 `src/app -> src/pages -> features -> shared` 방향을 유지한다. 이 경계는 `docs/development/architecture.md`, `docs/development/adr/0002-server-clean-architecture-with-archunit.md`, `docs/development/adr/0003-frontend-route-first-architecture.md`, `ServerArchitectureBoundaryTest`, `frontend-boundaries.test.ts`에 반영되어 있다.

최근 확장된 표면은 이 원칙을 더 넓고 일관되게 적용해야 하는 단계에 들어왔다.

- `admin.audit`, `admin.health`, `aigen`은 기존 feature보다 운영, provider, workflow 성격이 강하다.
- `platform-admin` frontend는 `api`, `queries`, `model`, `route`, `ui` 계층이 빠르게 늘고 있다.
- frontend/server/BFF/API contract가 함께 움직이는 vertical slice가 많아져, feature 단위 완료 기준이 더 중요해졌다.

이 spec은 현재 아키텍처 source of truth를 대체하지 않는다. 승인된 개선 방향을 하나의 설계 문서로 묶고, 이후 implementation plan에서 문서, boundary test, pilot refactor를 순차 실행할 수 있게 한다.

Source documents:

- `docs/development/architecture.md`
- `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- `docs/development/adr/0003-frontend-route-first-architecture.md`
- `docs/agents/front.md`
- `docs/agents/server.md`
- `docs/agents/docs.md`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `front/tests/unit/frontend-boundaries.test.ts`

## 2. Goals

ReadMates를 "클린아키텍처를 쓰는 코드베이스"에서 한 단계 더 나아가, 새 기능이 들어와도 경계가 흐려지지 않고 변경 영향이 feature 단위로 닫히는 구조로 만든다.

Goals:

- 서버 clean architecture 경계를 `admin.*`, `aigen` 같은 최근 확장 영역까지 일관되게 적용한다.
- 서버 feature를 write-side, read-side, mixed/workflow-side로 분류하고 slice type별 규칙을 명확히 한다.
- 프론트 feature 내부의 `api`, `queries`, `model`, `route`, `ui` 책임을 문서와 테스트로 고정한다.
- frontend/server vertical slice의 표준 흐름을 정의해 API contract, route/query/model/ui, server use case, tests가 기능 단위로 같이 움직이게 한다.
- SOLID 원칙을 추상적인 이론이 아니라 실제 파일 배치, 의존 방향, 테스트 규칙의 판단 기준으로 사용한다.
- 구현 단계가 바로 이어질 수 있도록 단계별 roadmap, verification strategy, residual risk를 함께 남긴다.

## 3. Non-Goals

- Gradle multi-module, Spring Modulith, framework replacement, full rewrite를 이번 설계의 직접 범위로 삼지 않는다.
- 신규 제품 기능을 추가하지 않는다.
- 모든 legacy 또는 historical planning record를 현재 architecture source of truth로 승격하지 않는다.
- 작은 feature에 무조건 모든 folder와 port를 강제해 보일러플레이트를 늘리지 않는다.
- public repo safety를 약화하지 않는다. real member data, private domain, deployment state, local absolute path, OCID, secret, token-shaped example은 문서나 fixture에 추가하지 않는다.
- `docs/development/architecture.md`와 기존 ADR을 덮어쓰지 않는다. 구현 단계에서 필요한 변경만 current source of truth 문서에 반영한다.

## 4. ReadMates Architecture Principles

ReadMates의 기본 구조 원칙은 feature-local boundary, route-first composition, public-safe operation이다.

```text
Server: adapter.in -> application.port.in -> application.service -> application.port.out -> adapter.out
Frontend: src/app -> src/pages -> features -> shared
Vertical slice: product surface -> server contract -> frontend contract -> route/query/model/ui -> tests
```

SOLID는 ReadMates에서 다음처럼 해석한다.

```text
SRP: 한 파일과 계층은 하나의 변경 이유만 가진다.
OCP: 새 운영 카드, audit source, AI provider는 기존 orchestration을 뜯지 않고 추가된다.
LSP: port 구현체는 fallback, error, paging, security shape까지 contract를 깨지 않는다.
ISP: 거대한 use case interface 대신 route, scheduler, ops 목적별 input port를 둔다.
DIP: route, controller, application은 concrete adapter가 아니라 contract에 의존한다.
```

경계 판단은 "이 코드를 어느 폴더에 둘까"보다 "누가 누구를 알아도 되는가"로 결정한다.

- Controller와 route module은 외부 입력을 해석하고 use case를 호출할 수 있지만 persistence detail을 알면 안 된다.
- Application service는 authorization, orchestration, domain rule을 알 수 있지만 HTTP, React, JDBC, Redis, provider SDK를 알면 안 된다.
- UI는 화면 상태를 표현할 수 있지만 API 호출, server-state freshness, route redirect 정책을 직접 소유하면 안 된다.
- Shared code는 제품 전체의 primitive일 때만 승격한다. feature-specific formatting, copy, layout, provider helper는 feature 내부에 남긴다.

추상화는 변경 가능성이 확인된 곳에만 둔다. `admin.health`의 card provider, `admin.audit`의 source projection, `aigen`의 provider adapter처럼 실제 변형 축이 있는 곳은 extension point를 둔다. 반대로 route-specific authorization, DTO mapper, feature-specific copy는 재사용 욕심으로 과도하게 shared화하지 않는다.

## 5. Server Clean Architecture Hardening

서버는 기존 단일 Spring Boot module을 유지한다. 변경점은 package model이 아니라 경계 강제 범위와 slice classification이다.

### 5.1 Slice Types

서버 feature를 다음 세 타입으로 분류한다.

```text
Write-side
  상태 변경과 domain invariant 보유
  예: auth, club, session, notification

Read-side
  조회 projection, cursor, aggregate read model 중심
  예: note, publication, archive, admin.audit

Mixed / Workflow-side
  외부 provider, queue, Redis handoff, commit/recovery orchestration 포함
  예: feedback, sessionimport, aigen
```

`admin.health`는 provider 기반 ops read-side로 다룬다. 운영 지표 provider와 deploy ledger adapter를 읽지만, route 자체는 mutation surface가 아니다.

### 5.2 Boundary Rules

공통 규칙:

- `application` package는 Spring Web/HTTP/Security, JDBC, Redis, concrete adapter에 의존하지 않는다.
- `adapter.in.web`은 persistence adapter, Redis adapter, `JdbcTemplate`, legacy repository에 직접 의존하지 않는다.
- `adapter.out.persistence`는 SQL, row mapping, JDBC detail을 소유한다.
- Provider adapter는 external SDK, HTTP client, provider response detail을 소유한다.
- Application error는 application layer에서 정의하고, HTTP status와 response mapping은 inbound web adapter가 맡는다.

Read-side 규칙:

- Read-only application service는 mutation outbound port에 의존하지 않는다.
- Read-only application service는 `@Transactional`을 사용하지 않는다.
- Raw metadata, provider raw error, private body는 read model fallback으로 노출하지 않는다.

Workflow-side 규칙:

- Transaction boundary와 side effect boundary를 명시적으로 둔다.
- Provider SDK, queue, Redis, persistence detail은 outbound port/adapter 뒤에 둔다.
- Commit, cancel, retry, recovery 같은 state transition은 application service에서 orchestration하되, external side effect는 port를 통해 호출한다.

### 5.3 Boundary Test Direction

`ServerArchitectureBoundaryTest`는 현재 migrated package 배열과 일부 named exception rule을 갖고 있다. 구현 단계에서는 이를 slice registry 형태로 정리한다.

Expected direction:

- `admin.audit`, `admin.health`, `aigen.application`을 일반 application purity rule에 포함한다.
- `aigen`처럼 workflow-side인 slice는 허용되는 side-effect boundary를 별도 rule name으로 드러낸다.
- Read-side marker와 mutation port 금지 규칙을 유지하고, 새 read-side slice가 누락되지 않게 한다.
- Outbound port default runtime failure 금지, persistence adapter framework leakage 금지, application HTTP/security type 금지를 유지한다.
- Named special-case rules는 가능한 한 pattern-based rule로 바꾸고, 남는 예외는 reason과 removal condition을 테스트 안에 남긴다.

## 6. Frontend Route-First / FSD-Lite Hardening

프론트는 기존 route-first 방향을 유지한다. 이번 설계의 핵심은 feature 내부에서 server state, route state, view model, presentation 책임을 더 선명하게 나누는 것이다.

Standard feature shape:

```text
features/<name>/api
  BFF/API 호출, Zod schema, request/response contract

features/<name>/queries
  TanStack Query queryOptions, query keys, mutation hooks, invalidation policy

features/<name>/model
  React, router, fetch, query client 없는 순수 view model 계산

features/<name>/route
  loader/action, auth/redirect, URL state, query prefetch, UI props 조립

features/<name>/ui
  props/callback 기반 presentation
```

Responsibilities:

- `route`는 화면 진입 계약을 소유한다. 로그인, 권한, redirect, URL search param, loader fallback, route error boundary가 여기에 속한다.
- `queries`는 server-state freshness와 mutation invalidation을 소유한다. UI가 query/API/client를 직접 호출하지 않는다.
- `model`은 server response를 화면 결정에 맞게 바꾸는 순수 계산층이다. React hook, QueryClient, API client를 import하지 않는다.
- `ui`는 상태를 보여주고 callback을 호출한다. `fetch`, `shared/api`, feature API, feature queries, route module을 직접 import하지 않는다.
- `shared`는 제품 전체의 primitive만 담는다. 두 feature에서 사용한다는 이유만으로 바로 shared로 올리지 않는다.

Feature 간 유연성은 직접 import 허용이 아니라 URL state, route composition, shared primitive, API contract로 확보한다. Admin dashboard가 health, audit, notifications를 조합해야 할 때도 `platform-admin` feature 안에서 composition하거나, 정말 공통인 cursor, paging, auth helper만 shared로 올린다.

### 6.1 Frontend Boundary Test Direction

`frontend-boundaries.test.ts`는 현재 import graph를 읽어 shared, feature, model, route, ui 규칙을 확인한다. 구현 단계에서는 다음을 확장한다.

- `queries` 계층을 공식 계층으로 인식한다.
- `model`에서 React, router, query, API client import를 금지한다.
- `queries`에서 UI, route, app, page import를 금지한다.
- `ui`에서 API, query, route, `shared/api`, direct `fetch`를 금지한다.
- route TSX render-only 규칙을 host 전용 파일 목록에서 가능한 pattern-based rule로 일반화한다.
- Legacy exception list가 생기면 reason과 removal condition을 필수로 둔다.

## 7. Frontend-Server Vertical Slice Standard

Vertical slice 표준은 기능 하나를 추가하거나 바꿀 때 server, BFF, frontend, tests가 어떤 순서와 책임으로 움직이는지 고정하는 규칙이다.

Standard flow:

```text
Product surface
  -> Server use case and API contract
  -> Persistence or provider adapter
  -> BFF / proxy / security boundary when affected
  -> Frontend feature api and Zod contract
  -> Query / loader / action
  -> Model / view model
  -> UI
  -> Boundary and behavior tests
```

Rules:

- Server가 source of truth인 authorization, visibility, lifecycle rule은 application service와 server tests에 둔다.
- Frontend는 같은 rule을 보조적으로 표현할 수 있지만 security source of truth가 되면 안 된다.
- 화면 조립, empty state, tab/filter, copy tone은 frontend feature가 소유한다.
- API contract는 raw persistence row나 provider detail을 그대로 노출하지 않는 좁은 계약이어야 한다.
- Large dashboard response를 만들기 전에 route가 여러 endpoint를 조합할 책임인지, server aggregate endpoint가 맞는지 명시한다.
- BFF, club context, same-origin `/api/bff/**`, OAuth return flow, trusted header stripping이 영향받으면 Pages Functions와 E2E 검증도 slice 범위에 포함한다.
- Public-facing or release-sensitive slice는 raw email, token, private member data, deployment identifier가 contract나 fixture에 들어가지 않는지 safety scan을 둔다.

Slice completion criteria:

```text
1. Dependency direction passes.
2. Authorization and visibility source of truth is clear.
3. API contract and UI state agree.
4. Smallest relevant tests have run or skipped validation is explicitly reported.
```

## 8. Roadmap

Implementation should avoid a one-shot restructuring. Boundary tests and docs should be strengthened first, then pilot slices should reveal actual refactoring needs.

```text
Phase 1: Architecture registry 정리
Phase 2: Server boundary test 확장
Phase 3: Frontend boundary test 확장
Phase 4: Vertical slice checklist 도입
Phase 5: Admin / aigen pilot 적용
Phase 6: 문서와 guide 통합
```

### Phase 1: Architecture Registry

- Server slice registry를 문서와 테스트 양쪽에 명시한다.
- `admin.audit`, `admin.health`, `aigen`을 read-side, ops read-side, workflow-side로 분류한다.
- Frontend feature internal layers responsibility table을 architecture 문서와 frontend guide에 반영한다.

### Phase 2: Server Boundary Test Expansion

- `ServerArchitectureBoundaryTest`의 migrated package 목록을 slice type별 rule 적용 구조로 정리한다.
- `admin.audit`, `admin.health`, `aigen.application`을 application purity rule에 포함한다.
- Workflow-side에서 허용되는 transaction/side-effect boundary는 별도 rule name으로 드러낸다.
- Port naming, read-only marker, mutation port 금지, outbound adapter leakage 금지를 유지하거나 확대한다.

### Phase 3: Frontend Boundary Test Expansion

- `queries` 계층을 공식 계층으로 추가한다.
- `model`의 Query/React/API client import를 금지한다.
- `ui`의 query/API/client/direct fetch import를 금지한다.
- Route TSX render-only 규칙을 더 일반화한다.

### Phase 4: Vertical Slice Checklist

- Feature 추가/변경 시 사용할 checklist를 만든다.
- Checklist는 server use case, frontend contract, route/query/model/ui, BFF/auth 영향, tests, public-safety scan을 포함한다.
- `docs/agents/*`와 연결해 agent routing에서 같은 기준을 사용하게 한다.

### Phase 5: Admin / Aigen Pilot

- 최근 변경이 많은 `platform-admin`과 `aigen`을 pilot로 잡는다.
- Admin audit, health, notifications route와 server API가 새 규칙을 통과하는지 확인한다.
- 대규모 rename보다 새 규칙에 걸리는 실제 문제를 고친다.

### Phase 6: Documentation Integration

- 결과를 `docs/development/architecture.md`, ADR 후보, `docs/agents/*`에 반영한다.
- 완료 후 새 기능 개발자가 문서와 CI만 보고 파일 위치와 검증 명령을 판단할 수 있어야 한다.

## 9. Verification Strategy

검증 전략은 문서로 좋은 구조를 설명하는 데서 끝내지 않고 CI가 경계 위반을 잡도록 하는 데 초점을 둔다.

Server checks:

```text
./server/gradlew -p server architectureTest
./server/gradlew -p server unitTest
./server/gradlew -p server check
```

Server boundary rules to protect:

- Application package는 web/security/http/jdbc/redis/concrete adapter에 의존하지 않는다.
- Inbound web adapter는 persistence adapter, `JdbcTemplate`, legacy repository에 의존하지 않는다.
- Read-side service는 mutation port와 `@Transactional`을 사용하지 않는다.
- Workflow-side service는 side effect boundary를 port/out adapter 뒤에 둔다.
- Outbound port는 default runtime failure 구현으로 contract를 숨기지 않는다.
- Persistence/provider adapter는 HTTP response contract나 web DTO를 알지 않는다.

Frontend checks:

```text
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
pnpm --dir front test
pnpm --dir front lint
pnpm --dir front build
```

Frontend boundary rules to protect:

- Shared는 feature/app/page를 import하지 않는다.
- Feature 간 직접 import는 금지한다.
- Model은 React, router, query, API client를 import하지 않는다.
- Queries는 API contract와 shared query primitive는 알 수 있지만 UI/route/app/page를 알지 않는다.
- UI는 api/query/route/shared api client를 import하지 않고 direct fetch를 호출하지 않는다.
- Route는 app/page를 import하지 않고 route data/action과 render module 책임을 분리한다.

Vertical slice validation:

- Server-only change: architecture test plus relevant unit/integration tests.
- Frontend-only change: boundary/unit/build checks.
- API/BFF/auth change: matching frontend, server, and E2E checks.
- Public release or deploy-sensitive change: public release candidate scripts and targeted safety scans.

전체 테스트를 매번 무조건 요구하지 않는다. Existing ReadMates rule을 유지해 가장 작은 회귀 가능 surface를 검증하되, architecture boundary는 빠른 test로 자주 확인한다.

## 10. Risks

- 구조 강화가 실제 기능 개발 속도를 늦출 수 있다. 이번 설계는 새 layer를 늘리기보다 최근 확장된 surface를 같은 원칙 안에 넣는 데 집중한다.
- 작은 feature에 모든 folder와 port를 강제하면 SOLID가 아니라 보일러플레이트가 된다. Single-route/no-API feature는 간단한 구조로 시작할 수 있다.
- `shared`가 비대해질 수 있다. Shared 승격 기준은 "두 곳에서 쓴다"가 아니라 "제품 전체의 primitive다"여야 한다.
- Boundary test가 현재 파일명에 과하게 묶일 수 있다. 가능한 pattern-based rule로 바꾸고, 예외는 reason과 removal condition을 남긴다.
- Graphify나 historical spec이 현재 behavior처럼 오해될 수 있다. Architecture 판단은 current code, tests, migrations, scripts, `docs/development/architecture.md`를 기준으로 검증한다.

## 11. Follow-up ADR Candidates

이 설계는 하나의 umbrella design이다. 구현 후 안정화되면 다음 ADR로 나눠 current source of truth에 반영한다.

```text
ADR 후보 1: Server slice registry와 read/write/workflow 분류
ADR 후보 2: Frontend feature internal layers와 queries 계층 표준
ADR 후보 3: Vertical slice contract/checklist 표준
ADR 후보 4: shared 승격 기준과 shared package 성장 제어
```

Larger candidates outside this design:

- Gradle multi-module 또는 Spring Modulith 도입 기준
- jOOQ 기반 type-safe persistence adapter 전환
- Storybook 또는 visual regression gate
- Feature-level bundle size monitoring

## 12. Acceptance Criteria

- 이 설계문서가 하나의 approved design record로 저장된다.
- 사용자 review 후 implementation plan 단계로 넘어간다.
- Implementation plan은 server boundary test, frontend boundary test, vertical slice checklist, pilot refactor를 task 단위로 나눈다.
- 구현 단계에서는 변경 surface별 guide를 다시 읽고, `docs/development/architecture.md`와 current code/test를 source of truth로 재확인한다.
- Public repo safety constraints를 유지한다.
