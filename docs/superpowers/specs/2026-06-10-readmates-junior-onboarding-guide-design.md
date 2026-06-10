# ReadMates 주니어 인수인계 가이드 설계

## 목적

처음 ReadMates를 맡는 주니어 개발자가 제품 목적, 저장소 구조, 프론트엔드, BFF, 백엔드, 데이터 계층, 비동기 파이프라인, 검증 절차를 한 문서에서 따라갈 수 있게 한다.

이 문서는 새로운 아키텍처 결정을 만들지 않는다. 현재 코드, 설정, 테스트, `docs/development/architecture.md`, ADR, runbook에 흩어진 사실을 주니어 개발자 눈높이에 맞게 연결해 설명하는 온보딩 가이드를 추가하기 위한 설계다.

## 배경

ReadMates는 이미 상세 문서를 많이 보유하고 있다.

- `README.md`: 제품과 기술 스택의 첫 진입점
- `docs/development/architecture.md`: 현재 아키텍처 source of truth
- `docs/development/technical-decisions.md`와 `docs/development/adr/`: 기술 선택 배경과 trade-off
- `docs/development/local-setup.md`, `docs/development/test-guide.md`: 로컬 실행과 검증 절차
- `docs/case-studies/`: BFF, 알림 outbox, multi-club domain, AI generation deep dive
- `docs/deploy/`, `docs/operations/`: 배포와 운영 runbook

하지만 처음 프로젝트를 인수받는 개발자에게는 문서가 많다는 점 자체가 진입 장벽이다. 새 가이드는 기존 문서의 대체물이 아니라 읽는 순서와 실무 연결점을 제공하는 안내서가 되어야 한다.

## 대상 독자

1순위 독자는 ReadMates를 처음 맡는 주니어 개발자다.

독자는 React, Spring, SQL의 기본 개념은 알지만, 이 프로젝트의 경계와 운영 판단은 모른다고 가정한다. 따라서 단순 기술 나열보다 다음 질문에 답해야 한다.

- 이 저장소에서 프론트엔드, BFF, 서버, DB, 운영 문서는 어디에 있는가?
- 요청 하나가 브라우저에서 Spring과 MySQL까지 어떻게 이동하는가?
- 어떤 기술이 왜 선택되었고, 어떤 단점을 감수했는가?
- Redis와 Kafka는 필수 source of truth인가, 선택적 운영 계층인가?
- 기능을 추가할 때 어느 layer와 test를 먼저 봐야 하는가?
- 어떤 값은 문서나 코드 예시에 절대 넣으면 안 되는가?

## 산출물 위치

새 가이드는 다음 파일로 추가한다.

```text
docs/development/junior-onboarding-guide.md
```

`docs/development/README.md`의 바로 가기 표에도 링크를 추가한다. 루트 `README.md`는 이미 개발자 문서 허브를 링크하므로, 중복 링크는 필요할 때만 최소로 추가한다.

## 문서 경계

가이드는 current behavior를 설명하되 source of truth가 되지 않는다.

- 아키텍처 사실이 모호하면 `docs/development/architecture.md`와 실제 코드가 우선이다.
- 기술 선택 이유는 ADR을 요약하고, 세부 근거는 ADR 링크로 보낸다.
- 운영 절차, secret, 배포값은 runbook으로 링크하고 실제 값을 쓰지 않는다.
- `docs/superpowers/`의 과거 계획은 현재 동작의 근거로 사용하지 않는다.
- Next.js를 사용한다고 설명하지 않는다. 현재 프론트엔드는 `React 19`, `Vite`, `React Router 7` SPA이며, BFF는 `Cloudflare Pages Functions`다.
- `NEXT_PUBLIC_*` 같은 browser-exposed secret 패턴은 금지 예시로만 다루고, 실제 secret 형태의 예시는 넣지 않는다.

## 권장 문서 구조

### 1. 먼저 알아야 할 한 장 요약

ReadMates를 invite-only reading-club app으로 소개하고, 전체 흐름을 한눈에 설명한다.

```text
Browser
  -> Cloudflare Pages SPA
  -> Pages Functions BFF
  -> Spring Boot API
  -> MySQL/Flyway
  -> optional Redis
  -> optional Kafka/Redpanda workers
```

여기서 MySQL/Flyway가 durable source of truth이고, Redis/Kafka는 보조 계층이라는 점을 초반에 못박는다.

### 2. 저장소 구조와 읽는 순서

주요 디렉터리를 설명한다.

- `front/`: Vite React SPA, route-first frontend, Cloudflare Pages Functions
- `server/`: Kotlin/Spring Boot API, feature-local clean architecture
- `docs/development/`: 개발자가 따라야 할 현재 기술 문서
- `docs/deploy/`, `docs/operations/`: 배포와 운영 절차
- `design/`: design system workspace
- `scripts/`: public release, smoke, safety helper

처음 읽을 순서는 `README.md` -> `docs/development/junior-onboarding-guide.md` -> `architecture.md` -> 필요한 ADR/runbook으로 제안한다.

### 3. 프론트엔드 구조

현재 구조를 Next.js가 아닌 Vite SPA로 설명한다.

- `React 19`, `TypeScript`, `Vite`
- `React Router 7`: route module, loader/action, guarded route
- `TanStack Query v5`: server state, query key, invalidation
- `Zod`: 개발 모드 API response validation과 contract fixture export
- `@readmates/design-system`: 공통 UI foundation
- `front/src/app -> front/src/pages -> front/features -> front/shared` 의존 방향
- feature 내부 `api`, `queries`, `model`, `route`, `ui` 책임

주의사항:

- UI 컴포넌트는 props/callback 중심으로 유지한다.
- `ui`에서 직접 fetch/API/query/route를 import하지 않는다.
- browser bundle에 server secret을 넣지 않는다.
- `shared/api/readmates` 같은 제거된 compatibility surface를 되살리지 않는다.

### 4. BFF와 인증 요청 흐름

Cloudflare Pages Functions BFF가 하는 일을 설명한다.

- 브라우저는 same-origin `/api/bff/**`를 호출한다.
- BFF는 Spring `/api/**`로 proxy하면서 trusted header와 BFF secret을 붙인다.
- browser가 보낸 내부 `x-readmates-*` header는 신뢰하지 않는다.
- OAuth start/callback도 Pages Functions를 통해 Spring으로 전달된다.
- local Vite proxy는 production BFF와 유사한 구조를 흉내 낸다.

주요 파일:

- `front/functions/api/bff/[[path]].ts`
- `front/functions/_shared/proxy.ts`
- `front/functions/oauth2/authorization/[[registrationId]].ts`
- `front/functions/login/oauth2/code/[[registrationId]].ts`
- `front/shared/auth/*`

### 5. 백엔드 구조

Spring Boot 단일 모듈 안에서 feature-local clean architecture를 설명한다.

```text
adapter.in.web
  -> application.port.in
  -> application.service
  -> application.port.out
  -> adapter.out.persistence
```

설명해야 할 핵심:

- controller는 HTTP parsing, validation, `CurrentMember`, response mapping을 맡는다.
- application service는 권한, 도메인 규칙, orchestration을 맡는다.
- persistence adapter는 JDBC SQL과 row mapping을 맡는다.
- application package는 Spring Web, JDBC, Redis, Kafka 구현 detail에 직접 의존하지 않는다.
- ArchUnit boundary test가 주요 위반을 막는다.
- write-side, read-side, ops read-side, workflow-side slice 구분을 설명한다.

### 6. 데이터 계층

MySQL과 Flyway를 중심으로 설명한다.

- MySQL compatible DB가 source of truth다.
- Flyway migration은 `server/src/main/resources/db/mysql/migration`에 둔다.
- dev/test seed는 운영 migration과 분리한다.
- JPA/Hibernate 대신 JDBC 중심으로 SQL을 명시한다.
- transaction boundary는 application service가 소유한다.

주의사항:

- schema 변경은 migration, adapter SQL, 테스트, 문서를 함께 본다.
- 운영 DB dump, 실제 회원 데이터, private deployment state를 문서에 넣지 않는다.

### 7. Redis 계층

Redis는 기본 off이며 optional 보조 계층으로 설명한다.

사용 범위:

- rate limit counter
- auth session metadata cache
- public/notes read-through cache
- cache invalidation
- AI generation job handoff, transcript TTL, cost counter

핵심 원칙:

- Redis 유실이 session, membership, publication 같은 durable data 손실로 이어지면 안 된다.
- Redis 장애 시 가능한 범위에서 MySQL fallback 또는 fail-open/fail-closed 정책을 따른다.
- raw token, secret, email, 표시 이름을 key나 metric label에 넣지 않는다.
- AI transcript는 짧은 TTL의 job handoff 값에만 둘 수 있고, Kafka/MySQL/metrics로 복사하지 않는다.

### 8. Kafka/Redpanda와 비동기 파이프라인

Kafka는 notification과 AI generation workflow를 중심으로 설명한다.

알림 흐름:

```text
domain mutation
  -> notification_event_outbox row in same DB transaction
  -> relay scheduler publishes to Kafka topic
  -> Kafka consumer creates notification_deliveries/member_notifications
  -> delivery worker sends retryable email side effect
```

설명해야 할 이유:

- mutation 성공과 outbox 적재를 원자적으로 묶는다.
- SMTP나 Kafka 장애가 domain mutation 자체를 잃게 만들지 않는다.
- dedupe key와 상태 머신으로 중복/재시도/DEAD row를 다룬다.
- 호스트 수동 알림도 같은 outbox pipeline을 사용한다.

AI generation은 transcript를 Kafka payload에 넣지 않고 Redis TTL key에만 두는 PII-safe handoff로 설명한다.

### 9. 주요 로직 walkthrough

처음 맡는 개발자가 실제 흐름을 따라갈 수 있게 대표 시나리오를 짧게 trace한다.

- 로그인: `/login` -> OAuth start -> callback -> `readmates_session`
- 멤버 현재 세션: route loader -> BFF API -> Spring auth/membership -> MySQL read model
- 호스트 세션 발행: host route/action -> server command service -> transaction -> cache invalidation/outbox
- 알림 발송: event outbox -> Kafka relay/consumer -> delivery engine
- AI 생성: host upload -> Redis job state -> Kafka metadata -> provider adapter -> validated commit

각 walkthrough는 상세 구현을 전부 복사하지 않고, 따라가야 할 파일과 실패 시 볼 테스트를 함께 제시한다.

### 10. 기술별 장단점과 실무 주의사항

주니어가 기술을 무비판적으로 외우지 않도록 각 선택의 장점, 단점, 고려사항을 표로 정리한다.

포함 대상:

- React/Vite vs Next.js
- React Router route-first 구조
- TanStack Query
- Cloudflare Pages Functions BFF
- Spring Boot + Kotlin
- JDBC + Flyway + MySQL
- Redis optional cache/workflow state
- Kafka/Redpanda + transactional outbox
- Zod contract fixture
- Testcontainers, Playwright, ArchUnit

### 11. 작업 절차와 검증

작업 유형별로 읽어야 할 guide와 최소 검증을 연결한다.

- frontend route/state/API: `docs/agents/front.md`
- server/auth/persistence/migration: `docs/agents/server.md`
- UI/copy/layout: `docs/agents/design.md`
- docs: `docs/agents/docs.md`

검증 명령은 기존 문서와 같은 기준을 따른다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
pnpm --dir front test:e2e
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

문서-only 구현에서는 변경 문서에 대해 `git diff --check -- <changed-docs>`와 public-safety scan을 우선 실행한다.

## 구현 계획 요약

1. 실제 코드와 현재 문서에서 기술 스택과 주요 파일 경로를 재확인한다.
2. `docs/development/junior-onboarding-guide.md`를 추가한다.
3. `docs/development/README.md`에 링크를 추가한다.
4. Next.js, Redis, Kafka, AI generation, public-safety처럼 오해하기 쉬운 부분을 current behavior 기준으로 정리한다.
5. 문서 내 경로, 명령어, 용어가 현재 코드와 맞는지 점검한다.
6. `git diff --check -- docs/development/junior-onboarding-guide.md docs/development/README.md`를 실행한다.
7. public-safety scan으로 secret/token/local path/private deployment 값이 들어가지 않았는지 확인한다.

## 성공 기준

- 처음 보는 개발자가 한 문서에서 제품, 실행 구조, 주요 기술 선택, 실제 request/data flow를 이해할 수 있다.
- 문서가 `architecture.md`와 ADR을 대체하지 않고, 필요한 곳으로 정확히 연결한다.
- Next.js 사용처럼 현재 코드와 다른 설명이 없다.
- Redis와 Kafka를 필수 durable store처럼 오해하게 만들지 않는다.
- 프론트/BFF/서버/DB/비동기 파이프라인의 책임 경계가 명확하다.
- 변경 문서는 public repo safety 기준을 지킨다.

## 비범위

- 새로운 기능 구현
- 아키텍처 변경
- Redis 또는 Kafka 운영 필수화
- Next.js 마이그레이션
- 실제 운영 secret, private domain, 실제 멤버 데이터, 배포 상태 기록
- 기존 `architecture.md` 전체 재작성

## 자체 검토

- Placeholder는 없다.
- 산출물 위치와 범위가 명확하다.
- current source of truth와 새 가이드의 관계를 분리했다.
- 사용자 요청의 핵심인 프론트/백엔드 분리, Spring 구조, Redis/Kafka, BFF, 기술 선택 이유, 장단점, 실무 주의사항을 모두 포함했다.
- 단일 구현 계획으로 처리 가능한 docs-only 작업이다.
