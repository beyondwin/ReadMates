# 주니어 개발자를 위한 ReadMates 인수인계 가이드

이 문서는 ReadMates를 처음 맡는 주니어 개발자가 제품 목적, 저장소 구조, 요청 흐름, 프론트엔드, BFF, 백엔드, 데이터 계층, Redis, Kafka, 인증, 검증 절차를 한 번에 잡을 수 있게 돕는 입문 문서입니다.

현재 동작의 source of truth는 코드, 테스트, migration, scripts, [아키텍처 문서](architecture.md), [ADR](adr/README.md)입니다. 이 가이드는 그 문서들을 대체하지 않고, 처음 읽는 순서와 실무 연결점을 제공합니다.

## 먼저 보는 전체 그림

ReadMates는 여러 정기 독서모임의 공개 소개, 멤버 세션 준비, 호스트 운영, 공개 기록, 참석자 전용 피드백 문서를 하나의 클럽별 권한 흐름으로 묶는 invite-only reading-club app입니다.

가장 중요한 실행 흐름은 아래와 같습니다.

```text
Browser
  -> Cloudflare Pages SPA
  -> Pages Functions BFF (/api/bff/**, /oauth2/**, /login/oauth2/**)
  -> Spring Boot API
  -> MySQL/Flyway
  -> optional Redis
  -> optional Kafka/Redpanda workers
```

MySQL과 Flyway가 durable source of truth입니다. Redis는 기본 off인 보조 계층이고, Kafka/Redpanda는 알림과 AI 생성 같은 비동기 workflow를 운영하기 위한 파이프라인입니다. Redis나 Kafka가 멈춰도 핵심 회원, 세션, 공개 기록 데이터가 Redis/Kafka에만 남아 있으면 안 됩니다.

## 처음 읽는 순서

1. [루트 README](../../README.md)에서 제품 목적과 기술 스택을 확인합니다.
2. 이 문서에서 전체 흐름과 어디를 고쳐야 하는지 감을 잡습니다.
3. [아키텍처 문서](architecture.md)에서 current source of truth를 확인합니다.
4. 기술 선택 배경이 필요하면 [ADR 목록](adr/README.md)과 [기술 결정 문서](technical-decisions.md)를 읽습니다.
5. 로컬 실행은 [local-setup.md](local-setup.md), 테스트는 [test-guide.md](test-guide.md)를 따릅니다.
6. 배포나 운영 절차는 [deploy 문서](../deploy/README.md)와 [operations 문서](../operations/README.md)로 넘어갑니다.

## 저장소 구조

| 경로 | 역할 | 처음 볼 때 확인할 것 |
| --- | --- | --- |
| `front/` | Vite React SPA, React Router route, feature modules, Cloudflare Pages Functions BFF | `front/package.json`, `front/src/app/router.tsx`, `front/features/`, `front/functions/` |
| `server/` | Kotlin/Spring Boot API, Spring Security, JDBC, Flyway, Redis/Kafka adapter | `server/build.gradle.kts`, `server/src/main/kotlin/com/readmates`, `server/src/main/resources/db/mysql/migration` |
| `docs/development/` | 개발자가 따라야 할 현재 구조, 실행, 테스트 문서 | `architecture.md`, `local-setup.md`, `test-guide.md`, `adr/README.md` |
| `docs/deploy/` | Cloudflare, OCI, Compose, public release 관련 runbook | 실제 운영값 대신 placeholder만 사용합니다. |
| `docs/operations/` | 관측, runbook, postmortem, 운영 반복 절차 | 장애 분석이나 배포 후 확인에 사용합니다. |
| `design/` | 디자인 시스템 workspace와 catalog | UI를 바꿀 때 design guide와 함께 봅니다. |
| `scripts/` | public release, smoke, safety helper | 릴리즈 안전성이나 문서 public-safety 확인에 사용합니다. |

## 프론트엔드

ReadMates 프론트엔드는 Next.js가 아니라 `React 19 + TypeScript + Vite + React Router 7` SPA입니다. 서버 렌더링이나 React Server Component 구조가 아니므로 `"use client"` 같은 Next/React Server Component 지시어를 추가하지 않습니다.

핵심 책임은 route-first 구조입니다.

```text
front/src/app
  -> front/src/pages
  -> front/features
  -> front/shared
```

| 영역 | 책임 |
| --- | --- |
| `front/src/app` | router, layout, guard, provider, route continuity |
| `front/src/pages` | route compatibility shell, feature route module 위임 |
| `front/features/<name>/api` | BFF endpoint 호출과 request/response contract |
| `front/features/<name>/queries` | TanStack Query key, `queryOptions`, mutation hook, invalidation |
| `front/features/<name>/model` | React/router/fetch 없는 순수 계산과 화면 모델 |
| `front/features/<name>/route` | loader/action, route state, API/model 호출, UI prop 조립 |
| `front/features/<name>/ui` | props와 callback만 받는 presentation |
| `front/shared` | feature에 묶이지 않는 primitive, auth helper, routing helper, 공통 UI |

서버 상태는 TanStack Query v5로 점진 이관 중입니다. 새 server state는 feature의 `queries`에 query key와 invalidation 정책을 두고, route module이 loader/action과 UI props 조립을 책임지는 방식으로 유지합니다.

Zod는 API response shape를 개발 모드에서 검증하고, fixture export를 통해 서버 contract test와 연결합니다. production bundle에서는 schema가 제거되도록 설계되어 있으므로 runtime validation을 무조건 production 비용으로 이해하면 안 됩니다.

주의할 점:

- `ui`는 직접 `fetch`, feature API, feature query, route module을 import하지 않습니다.
- `shared`는 app/page/feature code를 import하지 않습니다.
- `VITE_*`, `NEXT_PUBLIC_*` 같은 browser-exposed env에 BFF secret이나 server secret을 넣지 않습니다.
- 제거된 `shared/api/readmates` compatibility surface를 되살리지 않습니다.
- UI, layout, copy를 바꾸면 [design agent guide](../agents/design.md)도 함께 확인합니다.

## BFF와 OAuth Proxy

운영에서 browser-facing origin은 Cloudflare Pages입니다. 브라우저는 Spring API origin을 직접 신뢰 경계로 사용하지 않고, 같은 origin의 `/api/bff/**`를 호출합니다.

```text
Browser
  -> /api/bff/**
  -> front/functions/api/bff/[[path]].ts
  -> Spring /api/**
```

BFF는 upstream Spring 요청에 `X-Readmates-Bff-Secret`, trusted club context header, forwarded cookie, client IP 관련 header를 조립합니다. 브라우저가 보낸 내부 `x-readmates-*` header는 권한이나 club context의 근거로 신뢰하지 않습니다. Shared helper는 upstream response에서도 내부 header와 secret이 브라우저로 새지 않게 정리합니다.

OAuth도 같은 boundary를 따릅니다.

```text
Browser
  -> /oauth2/authorization/google
  -> Pages Functions OAuth proxy
  -> Spring OAuth start
  -> /login/oauth2/code/google
  -> Pages Functions callback proxy
  -> Spring success handler
  -> readmates_session cookie
```

주요 파일:

- `front/functions/api/bff/[[path]].ts`
- `front/functions/_shared/proxy.ts`
- `front/functions/oauth2/authorization/[[registrationId]].ts`
- `front/functions/login/oauth2/code/[[registrationId]].ts`
- `front/shared/auth/login-return.ts`

## 백엔드

백엔드는 단일 `Kotlin/Spring Boot` 모듈입니다. 기능 코드는 가능한 범위에서 feature-local clean architecture를 따릅니다.

```text
adapter.in.web
  -> application.port.in
  -> application.service
  -> application.port.out
  -> adapter.out.persistence
```

| Layer | 책임 | 하지 않는 일 |
| --- | --- | --- |
| `adapter.in.web` | route annotation, request parsing/validation, `CurrentMember`, use case 호출, response mapping | SQL 작성, `JdbcTemplate` 직접 주입, 복잡한 권한 로직 소유 |
| `application.port.in` | controller/scheduler/listener가 호출하는 use case contract | HTTP request/response detail |
| `application.service` | orchestration, membership/role/session authorization, domain rule, transaction boundary | Spring Web exception 직접 throw, adapter 구현체 직접 의존 |
| `application.port.out` | persistence, Redis, Kafka, mail, provider 호출 contract | JDBC/Redis/Kafka SDK detail |
| `adapter.out.*` | JDBC SQL, Redis operation, Kafka publish, SMTP, 외부 HTTP/provider 구현 | controller 역할이나 UI contract 조립 |

서버 slice는 write-side, read-side, ops read-side, workflow-side로 나뉩니다. 새 기능이나 전환된 기능은 이 구분을 보고 domain package, read DTO, transaction, outbound port 책임을 결정합니다. `ServerArchitectureBoundaryTest`가 application layer의 Spring Web/JDBC/Redis/Kafka 구현 detail 의존 같은 주요 회귀를 막습니다.

## MySQL과 Flyway

MySQL compatible database가 ReadMates의 durable source of truth입니다. 세션, 멤버십, 공개 기록, 알림 outbox, 감사 ledger 같은 핵심 데이터는 Redis나 Kafka가 아니라 MySQL row로 남아야 합니다.

Flyway migration은 운영 schema 변경의 기준입니다.

- 운영 migration: `server/src/main/resources/db/mysql/migration`
- dev/test seed: 운영 migration과 분리된 dev/test 경로
- persistence code: feature별 `adapter.out.persistence`에서 JDBC SQL과 row mapping 관리

JPA/Hibernate를 쓰지 않고 JDBC 중심으로 SQL을 명시하는 이유는 schema와 query를 직접 통제하고, Flyway migration과 application SQL 사이의 drift를 테스트로 드러내기 위해서입니다.

Schema를 바꾸는 작업은 migration, persistence adapter SQL, server test, frontend contract, active docs를 함께 확인해야 합니다.

## Redis

Redis는 기본 off인 optional 보조 계층입니다. `READMATES_REDIS_ENABLED=true`와 기능별 flag를 켠 환경에서만 Redis-backed 기능이 동작합니다.

| 사용 범위 | 저장/처리하는 것 | 장애 시 기대 |
| --- | --- | --- |
| Rate limit | hash된 client/session counter | 기본 fail-open, 민감 요청은 설정으로 fail-closed 가능 |
| Auth session cache | session metadata cache | MySQL session row 검증과 fallback 유지 |
| Public/notes cache | 공개 API, notes read model cache | decode 실패나 Redis 장애 시 MySQL fallback |
| Cache invalidation | mutation commit 뒤 best-effort key 삭제 | invalidation 실패가 domain mutation rollback 이유가 되면 안 됨 |
| AI generation job state | job hash, transcript TTL, result TTL, cost counters | AI job은 실패/만료될 수 있지만 기존 세션/멤버 데이터는 MySQL에 남음 |

Redis key와 metric label에는 raw session token, 초대 token, BFF secret, OAuth code, private feedback document body, 이메일, 표시 이름을 넣지 않습니다. AI transcript 본문은 짧은 TTL의 job handoff 값에만 둘 수 있고 Kafka, MySQL audit, metric tag, operator log로 복사하지 않습니다.

## Kafka와 Redpanda

ReadMates는 Kafka-compatible Redpanda를 비동기 pipeline에 사용합니다. 핵심은 domain mutation과 외부 side effect를 분리하는 것입니다.

알림 pipeline:

```text
domain mutation
  -> notification_event_outbox row in the same MySQL transaction
  -> relay scheduler publishes to readmates.notification.events.v1
  -> Kafka consumer calculates recipients and channels
  -> notification_deliveries / member_notifications rows
  -> delivery worker sends retryable EMAIL side effect
```

이 구조를 쓰는 이유:

- mutation 성공과 outbox 적재가 같은 transaction 안에서 원자적으로 보장됩니다.
- Kafka나 SMTP가 일시적으로 죽어도 domain mutation 자체를 잃지 않습니다.
- relay/consumer/delivery worker가 재시도와 DEAD 상태를 명시적으로 다룹니다.
- 호스트 수동 알림도 별도 즉시 SMTP 경로가 아니라 같은 outbox pipeline을 사용합니다.

AI generation에서는 Kafka에 transcript 본문을 넣지 않습니다. Kafka message는 `readmates.aigen.jobs.v1` 같은 AI generation metadata queue의 job routing metadata 중심이고, worker가 Redis TTL key에서 transcript를 읽어 provider adapter를 호출한 뒤 검증된 결과만 commit path로 넘깁니다.

## 인증과 권한

운영 로그인은 Google OAuth입니다. 성공하면 Spring이 server-side session을 만들고 `readmates_session` HttpOnly cookie를 발급합니다. Raw session token은 DB에 그대로 저장하지 않고 `auth_sessions.session_token_hash` 같은 hash column에 저장합니다.

권한은 두 축으로 나뉩니다.

| 축 | 설명 |
| --- | --- |
| Club membership | 클럽별 `HOST`, `MEMBER`, 둘러보기/정식 멤버 상태를 기준으로 member/host route와 API 접근을 판단합니다. |
| Platform admin | `OWNER`, `OPERATOR`, `SUPPORT` 같은 플랫폼 운영 권한입니다. Club host 권한과 별개이며 `platform_admins`가 별도 source입니다. |

Spring은 BFF secret을 통과한 요청에서만 trusted club slug/host header를 신뢰합니다. 브라우저가 같은 header 이름을 직접 보냈다고 해서 club context나 권한으로 인정하지 않습니다.

## 주요 로직 Walkthrough

### 로그인

```text
/login
  -> /oauth2/authorization/google
  -> Pages Functions OAuth proxy
  -> Spring Security OAuth start
  -> /login/oauth2/code/google
  -> Pages Functions callback proxy
  -> Spring success handler
  -> readmates_session cookie
```

확인 파일: `front/functions/oauth2/authorization/[[registrationId]].ts`, `front/functions/login/oauth2/code/[[registrationId]].ts`, `server/src/main/kotlin/com/readmates/auth`.

### 멤버 현재 세션

```text
React Router loader/action
  -> feature API client
  -> /api/bff/**
  -> Spring controller
  -> application service authorization
  -> JDBC read model
  -> route UI props
```

확인 파일: `front/features/current-session`, `front/shared/auth/member-app-loader.ts`, `server/src/main/kotlin/com/readmates/session`, `server/src/main/kotlin/com/readmates/note`.

### 호스트 세션 발행

```text
Host route/action
  -> BFF API
  -> Spring command service
  -> MySQL transaction
  -> cache invalidation
  -> optional notification outbox event
```

확인 파일: `front/features/host`, `server/src/main/kotlin/com/readmates/session`, `server/src/main/kotlin/com/readmates/publication`, `server/src/main/kotlin/com/readmates/notification`.

### 알림 발송

```text
domain event row
  -> Kafka relay
  -> Kafka consumer
  -> delivery rows
  -> email/in-app delivery engine
```

확인 파일: `server/src/main/kotlin/com/readmates/notification`.

### AI 생성

```text
host transcript upload
  -> AI generation controller
  -> Redis job state and transcript TTL
  -> Kafka metadata message
  -> provider adapter
  -> validated result
  -> commit through session import path
```

확인 파일: `server/src/main/kotlin/com/readmates/aigen`, `front/features/host/aigen`, [AI runbook](../operations/runbooks/ai-session-generation.md).

## 기술 선택 이유와 Trade-off

| 기술 | 선택 이유 | 감수하는 점 |
| --- | --- | --- |
| React/Vite SPA | 정적 배포와 Cloudflare Pages에 단순하게 맞고, route-first 구조로 멤버/호스트/admin 화면을 명확히 나눌 수 있습니다. | Next.js SSR/RSC 이점은 쓰지 않습니다. SEO나 server rendering 요구가 생기면 별도 결정이 필요합니다. |
| React Router 7 | loader/action과 route module로 화면의 데이터 요구사항을 route 근처에 둘 수 있습니다. | route, model, UI 경계를 지키지 않으면 route 파일이 비대해질 수 있습니다. |
| TanStack Query | server state cache, invalidation, polling을 feature별 query key로 관리할 수 있습니다. | mutation 후 invalidation 정책을 빠뜨리면 오래된 화면이 남습니다. |
| Cloudflare Pages Functions BFF | same-origin API/OAuth proxy, trusted header 조립, secret 보호를 edge에서 통제합니다. | BFF helper 회귀가 모든 API 호출에 영향을 주므로 단위 테스트와 smoke가 중요합니다. |
| Kotlin/Spring Boot | Spring Security, OAuth, JDBC, Kafka, validation, actuator 같은 서버 기능을 안정적으로 묶습니다. | layer 경계를 두지 않으면 controller/service가 쉽게 비대해집니다. |
| JDBC + Flyway + MySQL | SQL과 schema migration을 명시적으로 관리하고 MySQL을 durable source of truth로 둡니다. | ORM 편의 기능이 적으므로 row mapping과 query test 책임이 커집니다. |
| Optional Redis | cache, rate limit, AI job state 같은 재생성 가능하거나 짧은 TTL 상태를 빠르게 처리합니다. | source of truth가 아니므로 fallback, TTL, invalidation 정책을 함께 유지해야 합니다. |
| Kafka/Redpanda + outbox | mutation과 이메일/in-app/AI worker side effect를 분리하고 재시도와 replay를 가능하게 합니다. | local/dev 운영 복잡도와 backlog 모니터링 책임이 생깁니다. |
| Zod contract fixture | frontend가 기대하는 response shape를 fixture로 내보내 서버 contract test와 연결합니다. | schema 변경 시 fixture 갱신과 서버 test를 같이 봐야 합니다. |
| Playwright/Testcontainers/ArchUnit | browser flow, 실제 infra 근접 integration, architecture boundary를 각각 검증합니다. | 전체 검증은 느릴 수 있어 변경 표면별 최소 검증을 고르는 판단이 필요합니다. |

## 기능을 추가할 때 보는 순서

1. 어떤 surface인지 먼저 고릅니다.
   - frontend route/state/API: [front agent guide](../agents/front.md)
   - server API/auth/persistence/migration: [server agent guide](../agents/server.md)
   - UI/layout/copy: [design agent guide](../agents/design.md)
   - documentation: [docs agent guide](../agents/docs.md)
2. API contract를 바꾸면 frontend `api`/Zod schema와 server response/test를 같이 봅니다.
3. DB schema를 바꾸면 Flyway migration, persistence adapter SQL, integration test를 같이 봅니다.
4. 권한을 바꾸면 BFF trust boundary, Spring authorization, route guard, E2E를 같이 봅니다.
5. 알림이나 AI처럼 side effect가 있으면 outbox/Kafka/Redis/audit/log redaction까지 확인합니다.
6. 변경한 surface의 최소 검증을 실행하고, 못 돌린 명령은 이유를 남깁니다.

## 검증 명령

작업 표면별 최소 검증은 아래를 기준으로 합니다.

| 변경 표면 | 명령 |
| --- | --- |
| Frontend | `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build` |
| Server full backend | `./server/gradlew -p server clean unitTest architectureTest integrationTest` |
| API/auth/BFF/user-flow | `pnpm --dir front test:e2e` |
| Server architecture boundary | `./server/gradlew -p server architectureTest` |
| PR-level backend quality | `./server/gradlew -p server check` |
| Public release candidate | `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate` |
| Docs-only | `git diff --check -- <changed-docs>` |

테스트가 통과했다는 사실은 release risk가 없다는 증명이 아닙니다. release readiness를 물어보는 작업에서는 [release-readiness-review.md](release-readiness-review.md)를 별도로 따라야 합니다.

Backend의 기본 `test` task는 중복 실행을 피하기 위해 비활성화되어 있습니다. 서버 변경을 검증할 때 `./server/gradlew -p server clean test`만 실행하면 충분한 신호가 아닐 수 있으므로, 위 표의 explicit test lane이나 `check` task를 사용합니다.

## 절대 문서에 넣지 않는 값

ReadMates는 public repo safety를 전제로 관리합니다. 문서와 예시에 아래 값은 넣지 않습니다.

- 실제 멤버 데이터, 이름, 이메일
- 운영 secret, API key, OAuth code, session cookie, token-shaped example
- private domain, private deployment state, DB dump
- 로컬 절대 경로
- OCI OCID 또는 provider 계정 식별자
- raw transcript/private feedback body
- provider raw error, SMTP 상세 오류

예시가 필요하면 `https://api.example.com`, `<db-password>`, `host@example.com`처럼 placeholder를 사용합니다.

## 더 깊게 읽을 문서

| 알고 싶은 것 | 문서 |
| --- | --- |
| 전체 아키텍처 source of truth | [architecture.md](architecture.md) |
| 로컬 실행 | [local-setup.md](local-setup.md) |
| 테스트와 검증 | [test-guide.md](test-guide.md) |
| 기술 선택 배경 | [technical-decisions.md](technical-decisions.md), [ADR 목록](adr/README.md) |
| BFF 보안 경계 | [BFF case study](../case-studies/01-bff-security-and-secret-rotation.md), [ADR-0001](adr/0001-cloudflare-pages-functions-bff.md), [ADR-0005](adr/0005-bff-shared-secret-with-rotation.md) |
| Notification outbox/Kafka | [notification case study](../case-studies/02-notification-pipeline-with-outbox.md), [ADR-0004](adr/0004-transactional-outbox-with-kafka-relay.md) |
| Multi-club domain | [multi-club case study](../case-studies/03-multi-club-domain-platform.md), [ADR-0008](adr/0008-multi-club-domain-with-host-resolution.md) |
| AI generation | [AI case study](../case-studies/04-pii-safe-ai-session-generation.md), [AI runbook](../operations/runbooks/ai-session-generation.md) |
| 배포 | [deploy README](../deploy/README.md) |
| 운영 | [operations README](../operations/README.md) |
