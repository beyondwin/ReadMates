# ReadMates Architecture Refactor Design

## 목적

ReadMates의 현재 아키텍처는 큰 방향이 맞다. 프런트엔드는 route-first 경계를 문서화하고 boundary test로 일부 강제한다. 서버는 feature-local clean architecture를 목표로 `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence` 흐름을 상당 부분 적용했다. BFF도 브라우저와 Spring API 사이의 신뢰 경계를 분리한다.

이번 리팩토링의 목적은 구조를 다시 만드는 것이 아니라, 남아 있는 예외와 성능 위험을 제거해 목표 아키텍처를 실제 코드 기준으로 더 엄격하게 만드는 것이다. 하위 호환을 위한 레거시 API contract, legacy component import, 배열 응답 형태는 유지하지 않는다. 가장 좋은 새 구조로 서버와 프런트를 함께 바꾼다.

## 현재 진단

### 서버

- `domain` 패키지는 대부분 enum만 담고 있다. 핵심 규칙은 application service와 JDBC adapter에 흩어져 있다.
- 일부 `application` 코드가 `ResponseStatusException`, `HttpStatus`, `@ResponseStatus` 같은 HTTP 타입을 직접 사용한다.
- `OAuthReturnState`는 security infrastructure인데 active club domain 조회를 위해 `JdbcTemplate`을 직접 사용한다.
- `JdbcNotificationDeliveryAdapter`, `JdbcHostSessionWriteAdapter`, `JdbcArchiveQueryAdapter` 같은 persistence adapter가 SQL 실행, row mapping, 상태 전이, read model 조립을 한 파일에서 처리한다.
- `CurrentMember`가 inbound/outbound port와 application command에 넓게 전달된다. 지금 당장 깨진 구조는 아니지만, application 모델과 web/security 모델의 경계가 흐려진다.

### 프런트엔드

- 목표 의존 방향인 `src/app -> src/pages -> features -> shared`는 적절하다.
- `shared/ui` 일부 컴포넌트가 `src/app/router-link`와 `src/app/route-continuity`를 import한다. shared가 app을 아는 방향이라 경계가 뒤집힌다.
- host feature는 `ui`가 있는데도 `features/host/components`가 route/data의 public surface처럼 남아 있다.
- 큰 UI 파일이 많다. `host-dashboard`, `host-session-editor`, `host-members`, `archive/ui/my-page`는 화면 섹션과 계산 모델 분리가 필요하다.

### DB, 트랜잭션, 성능

- 기존 DB 최적화 작업으로 피드백 목록 metadata projection, batch write, notes/feed 계열 인덱스 일부는 반영되어 있다.
- 여전히 한 요청 안에서 여러 query를 순차 실행하는 hot path가 있다. 대표 후보는 current session, archive detail, public club/session, deletion preview다.
- 트랜잭션 선언이 application service와 persistence adapter 양쪽에 섞여 있다.
- `FOR UPDATE`, `FOR UPDATE SKIP LOCKED`, batch write, unique constraint가 함께 쓰이지만, 트랜잭션 필요 조건과 MySQL 실행계획을 명시적으로 검증하는 방어선은 부족하다.
- 여러 목록 API가 배열 전체를 반환한다. 오래 운영될수록 세션, 질문, 리뷰, 피드백 문서, 멤버, 초대 목록이 커진다.

## 설계 원칙

1. 기존 목표 아키텍처를 유지한다. 새 프레임워크나 별도 모듈 분리는 하지 않는다.
2. 레거시 호환을 보존하지 않는다. 서버 contract와 프런트 loader/UI를 같은 작업에서 새 구조로 이동한다.
3. application layer는 HTTP, JDBC, Redis, Cloudflare, React Router 세부사항을 알지 않는다.
4. persistence adapter는 SQL과 DB row mapping을 소유하지만, 상태 전이와 권한 판단을 숨은 business logic으로 키우지 않는다.
5. 페이지네이션은 offset이 아니라 keyset cursor를 기본으로 한다.
6. 성능 개선은 EXPLAIN, query count, transaction boundary test로 검증 가능한 작업만 채택한다.

## 서버 리팩토링

### Application Error 정리

각 feature application은 HTTP exception 대신 application-owned error를 던진다.

예시:

- `FeedbackDocumentError`
- `ArchiveError`
- `PlatformAdminError`
- `NotificationOperationError`

`adapter.in.web`은 이 error를 HTTP status와 response body로 매핑한다. 공통 매핑이 가능한 오류는 shared web advice로 모으되, feature별 응답 code/message가 필요한 경우 feature web adapter에 둔다.

완료 기준:

- `server/src/main/kotlin/com/readmates/*/application` 아래에서 `org.springframework.http`, `org.springframework.web.server.ResponseStatusException`, `org.springframework.web.bind.annotation.ResponseStatus` 의존을 제거한다. 예외는 security/session cookie처럼 명확히 Spring web artifact를 만드는 특수 application component만 별도 검토한다.
- boundary test에 application package의 web/http 의존 금지를 추가한다.

### Domain Rule 승격

도메인 패키지를 대규모 DDD 엔티티로 재작성하지 않는다. 반복되고 위험한 규칙부터 작은 domain policy로 옮긴다.

1차 후보:

- session state transition: `DRAFT -> OPEN -> CLOSED -> PUBLISHED`
- session visibility exposure: `HOST_ONLY`, `MEMBER`, `PUBLIC`
- membership access: viewer/member/host/platform admin 판정
- notification delivery transition: `PENDING`, `SENDING`, `SENT`, `FAILED`, `DEAD`, `SKIPPED`
- display name validation policy

application service는 이 policy를 호출해 결정을 받고, persistence adapter는 필요한 row를 읽고 쓰는 역할에 머문다.

### Security Persistence 분리

`OAuthReturnState`의 active club domain 조회를 outbound port로 이동한다.

목표 흐름:

```text
auth.infrastructure.security.OAuthReturnState
  -> auth.application.port.out.TrustedReturnHostPort
  -> club.adapter.out.persistence.JdbcTrustedReturnHostAdapter
```

`OAuthReturnState`는 HMAC state, TTL, redirect target shape, host trust policy만 담당한다. DB schema와 `JdbcTemplate`은 알지 않는다.

### JDBC Adapter 분해

대형 adapter는 facade를 유지하되 내부 책임을 분리한다.

대상:

- `JdbcNotificationDeliveryAdapter`
- `JdbcHostSessionWriteAdapter`
- `JdbcArchiveQueryAdapter`
- 필요 시 `JdbcCurrentSessionAdapter`

분리 기준:

- `*Queries`: SQL 실행
- `*RowMapper`: `ResultSet` mapping
- `*WriteOperations`: 상태 변경 단위 작업
- adapter facade: outbound port 구현과 transaction 진입점만 유지

이 작업은 API response shape를 바꾸지 않는다. 동작 변경 없이 파일 책임과 테스트 표면을 줄이는 작업이다.

### Transaction Boundary 정리

원칙:

- use case 단위 트랜잭션은 application service가 소유한다.
- persistence adapter의 `@Transactional`은 scheduler claim, `FOR UPDATE SKIP LOCKED`, 독립적으로 호출되는 atomic persistence operation에만 허용한다.
- service와 adapter가 같은 call chain에서 모두 `@Transactional`이면 제거하거나 의도를 주석과 테스트로 고정한다.
- `FOR UPDATE` 또는 `SKIP LOCKED`가 있는 메서드는 transaction 안에서만 호출되도록 테스트한다.

추가 점검:

- session open race: 같은 club에 open session이 하나만 유지되는지
- session number race: 번호 할당이 lock 또는 unique constraint로 보호되는지
- invite accept / Google login race: 동일 사용자와 membership 중복 생성 방지
- display name duplicate race: application lock과 DB unique constraint 동작 확인
- notification claim race: 중복 발행/중복 발송 방지

## DB 성능 감사와 최적화

### Query Budget

endpoint별 query budget을 둔다. 초과 path는 통합 projection, read model, cache 후보로 분류한다.

초기 budget:

| Endpoint | 목표 query 수 |
| --- | ---: |
| `/api/sessions/current` | 5 이하 |
| `/api/archive/sessions/{id}` | 8 이하 |
| `/api/public/clubs/{slug}` | 3 이하 |
| `/api/public/clubs/{slug}/sessions/{id}` | 3 이하 |
| `/api/host/sessions/{id}/deletion-preview` | 3 이하 |

현재 여러 query를 순차 실행하는 path는 바로 실패로 보지 않는다. 상세 페이지처럼 데이터 종류가 많은 endpoint는 query 수와 latency를 함께 보고 결정한다.

### EXPLAIN 감사

MySQL Testcontainer에서 주요 query에 대해 EXPLAIN을 수집한다. 문서화 대상은 인덱스 사용 여부, rows 추정치, filesort/temporary 발생 여부다.

대상:

- archive sessions list
- archive session detail child collections
- current session detail
- notes sessions/feed
- public club/session
- host sessions/members/invitations
- notification event/delivery claim
- notification host lists

인덱스는 사용 중인 query shape에만 추가한다. speculative index는 넣지 않는다.

### N+1성 Read Path 정리

우선순위:

1. `JdbcCurrentSessionAdapter`: current session hot path. query count가 높으면 current session projection을 합치거나 child collection을 batched query로 묶는다.
2. `JdbcPublicQueryAdapter`: public cache miss path. stats와 recent sessions를 통합하거나 public read model을 검토한다.
3. `JdbcArchiveQueryAdapter.loadArchiveSessionDetail`: 상세 화면 query budget 초과 시 child collection batch projection을 검토한다.
4. `HostSessionDeletionQueries`: 여러 count를 single aggregate query로 줄인다.

## Cursor Pagination

레거시 배열 응답은 유지하지 않는다. 증가 가능한 목록 endpoint는 cursor pagination contract로 직접 변경한다.

공통 request:

```text
?limit=30&cursor=<opaque-cursor>
```

공통 response:

```json
{
  "items": [],
  "nextCursor": null
}
```

기본값:

| 목록 | 기본 limit | 최대 limit |
| --- | ---: | ---: |
| 일반 목록 | 30 | 100 |
| host/member 운영 목록 | 50 | 100 |
| notes feed | 60 | 120 |
| notification 목록 | 기존 기본값 유지 | 100 |

cursor는 opaque string으로 encode한다. 내부 payload에는 정렬 기준 값과 tie-breaker id를 넣는다. 클라이언트는 cursor 내용을 해석하지 않는다.

### 필수 적용 대상

- `GET /api/archive/sessions`
- `GET /api/archive/me/questions`
- `GET /api/archive/me/reviews`
- `GET /api/feedback-documents/me`
- `GET /api/notes/sessions`
- `GET /api/notes/feed`
- `GET /api/host/sessions`
- `GET /api/host/invitations`
- `GET /api/host/members`

### 보강 대상

- `GET /api/me/notifications`: 기존 `limit`에 cursor 추가
- `GET /api/host/notifications/items`
- `GET /api/host/notifications/events`
- `GET /api/host/notifications/deliveries`
- `GET /api/host/notifications/test-mail/audit`
- platform admin domain lists

### 정렬과 Cursor 기준

| 목록 | 정렬 | Cursor payload |
| --- | --- | --- |
| archive sessions | `number desc, id desc` | `number`, `id` |
| my questions | `session_number desc, priority asc, question_id desc` | `sessionNumber`, `priority`, `id` |
| my reviews | `session_number desc, created_at desc, id desc` | `sessionNumber`, `createdAt`, `id` |
| feedback documents | `session_number desc, document_created_at desc, document_id desc` | `sessionNumber`, `createdAt`, `id` |
| notes sessions | `number desc, id desc` | `number`, `id` |
| notes feed | `created_at desc, source_order asc, session_number desc, item_order asc, id desc` | listed sort fields plus `id` |
| host sessions | existing state priority, `session_date`, `number`, `id` | `stateRank`, `sessionDate`, `number`, `id` |
| host invitations | `created_at desc, id desc` | `createdAt`, `id` |
| host members | role/status rank, name/email, `id` | ranks, `displayName`, `email`, `id` |
| notifications | `updated_at desc, created_at desc, id desc` | `updatedAt`, `createdAt`, `id` |

Cursor predicates must match the exact order by. If a list cannot provide a stable key, add an id tie-breaker to the selected row.

## 프런트엔드 리팩토링

### Paged Contract 전환

프런트 API contract는 서버와 함께 breaking change로 전환한다.

예시:

```ts
type PagedResponse<T> = {
  items: T[];
  nextCursor: string | null;
};
```

route loader는 첫 페이지를 가져오고, UI는 더 보기 또는 infinite-scroll이 아니라 명시적 "더 보기" 액션을 제공한다. 운영 화면은 반복 작업이 많으므로 버튼 기반 pagination이 예측 가능하다.

### Shared UI 의존 역전 제거

`shared/ui`는 `src/app`을 import하지 않는다. shared navigation 컴포넌트는 link renderer 또는 navigation callback을 props로 받는다. `src/app/layouts.tsx`가 app-specific `Link`와 route continuity behavior를 주입한다.

완료 기준:

- `shared/ui`의 `src/app/*` import 제거
- `frontend-boundaries.test.ts`의 shared legacy exceptions 제거

### Host Components 정리

`features/host/components` public surface를 제거한다. host route는 `features/host/ui`만 import한다. action type은 `route` 또는 `model`로 이동한다.

완료 기준:

- route/data에서 `features/host/components/*` import 제거
- `frontend-boundaries.test.ts`의 host components exceptions 제거
- host UI 파일을 sections 단위로 분리

### 큰 UI 파일 분해

우선 대상:

- `features/host/components/host-dashboard.tsx`
- `features/host/components/host-session-editor.tsx`
- `features/host/components/host-members.tsx`
- `features/archive/ui/my-page.tsx`

분해 기준:

- `ui`: props 기반 rendering
- `model`: grouping, label, filter, validation display 계산
- `route`: loader/action, API 호출, mutation orchestration
- `api`: BFF contract

## BFF Functions 정리

Cloudflare Pages Functions의 중복 proxy logic을 `front/functions/_shared`로 모은다.

공통화 대상:

- upstream set-cookie copy
- secret-like request header 제거
- `X-Readmates-Bff-Secret` 재생성
- client IP forwarding
- normalized host forwarding
- safe route segment/path validation
- mutation same-origin validation

BFF shared helper는 browser-supplied `X-Readmates-*` header를 절대 그대로 전달하지 않는다. 이 정책은 unit test로 고정한다.

## 테스트와 검증

### 서버

- `ServerArchitectureBoundaryTest` 강화
  - application package의 Spring web/http 의존 금지
  - domain package의 Spring 의존 금지 유지
  - security infrastructure의 direct JDBC 의존 검토 또는 금지
- application error mapping controller tests
- cursor pagination contract tests
- MySQL migration tests
- EXPLAIN 또는 query-count 기반 hot path smoke tests
- transaction-required tests for lock/claim methods

### 프런트엔드

- `frontend-boundaries.test.ts` legacy exceptions 제거
- paged API contract fixtures 업데이트
- route loader 첫 페이지/다음 페이지 tests
- host/archive/notes UI pagination tests
- BFF shared proxy tests

### 전체 검증

최소 검증:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

auth/BFF 또는 route contract 변경을 포함하므로 다음도 실행한다.

```bash
pnpm --dir front test:e2e
```

## 단계별 실행 순서

1. Cursor pagination foundation
   - 공통 cursor encode/decode 모델
   - server paged response 모델
   - front `PagedResponse<T>` contract

2. Archive, feedback, notes pagination
   - 가장 빨리 커지는 member-facing 목록부터 전환
   - 프런트 route/UI 동시 전환

3. Host 운영 목록 pagination
   - host sessions, invitations, members 전환
   - 운영 UI에서 더 보기 액션 제공

4. Notification/admin pagination 보강
   - 기존 limit 기반 목록에 cursor 추가

5. Application HTTP dependency 제거
   - feature별 application error 도입
   - web adapter mapping 추가
   - boundary test 강화

6. Security persistence 분리
   - `OAuthReturnState` direct JDBC 제거
   - trusted return host port/adapter 도입

7. DB audit and query budget
   - hot endpoint query count 측정
   - EXPLAIN 결과 기록
   - 필요한 인덱스와 projection 변경만 추가

8. JDBC adapter 분해
   - notification delivery
   - host session write
   - archive query

9. Frontend boundary cleanup
   - shared UI app import 제거
   - host components legacy surface 제거
   - 큰 UI 파일 분해

10. BFF shared proxy helper
    - 중복 제거
    - security header forwarding tests 강화

## 비범위

- 별도 backend 모듈 분리
- JPA 또는 ORM 도입
- GraphQL 도입
- 기존 public release 문서 전면 개편
- 오래된 API 응답 형태 유지
- legacy frontend component import 유지

## 리스크와 완화

- API contract breaking change: 서버와 프런트 변경을 같은 계획 안에서 실행하고 contract fixture를 먼저 갱신한다.
- pagination cursor 버그: order by와 cursor predicate를 한 테스트 파일에서 쌍으로 검증한다.
- query 최적화 회귀: MySQL Testcontainer 기반 EXPLAIN/row-count smoke test를 추가한다.
- transaction 변경 회귀: lock/claim path에 동시성 테스트를 우선 추가한다.
- 리팩토링 범위 확산: pagination, architecture boundary, DB audit, frontend cleanup을 단계별로 나누고 각 단계마다 테스트를 통과시킨다.
