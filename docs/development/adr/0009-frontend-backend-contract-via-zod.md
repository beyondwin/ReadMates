# ADR-0009: Frontend-backend contract test (Zod schema)

- 상태: Accepted
- 결정일: 2026-05-06
- 작성자: 프런트엔드/서버
- 관련: ADR-0003 (frontend route-first), ADR-0007 (MySQL + Flyway),
  `front/features/host/api/host-contracts.ts`,
  `front/scripts/export-zod-fixtures.ts`,
  `front/tests/unit/__fixtures__/zod-schemas/`,
  `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`,
  `front/package.json`

## 컨텍스트

ReadMates의 API contract는 Spring Boot 서버(Kotlin)와 React 프런트엔드(TypeScript) 사이에서 유지된다. 두 언어, 두 빌드 파이프라인이 동일한 API response shape을 가정한다. 초기 개발에서 이 contract가 깨지는 패턴이 반복됐다.

### 실제로 발생한 contract 불일치 패턴

1. **Server field 추가, 프런트엔드 코드 미반영**: 서버에서 response에 필드를 추가하면, 프런트엔드는 런타임에 그 필드를 모른다. TypeScript 컴파일은 통과하지만 UI에서 새 필드가 렌더링되지 않는다.

2. **Server field 제거, 프런트엔드 코드 미반영**: 서버에서 사용하지 않는 필드를 제거하면, 프런트엔드의 `as Type` assertion은 여전히 그 필드가 있다고 가정한다. `undefined`가 렌더링되거나 런타임 오류가 production까지 전파된다.

3. **TypeScript 타입만으로는 런타임 검증 불가**: TypeScript 타입은 컴파일 타임 안전성을 제공한다. 그러나 서버에서 반환하는 실제 JSON shape이 타입과 일치하는지를 런타임에 검증하지 않는다. `as Type` 또는 `fetch().then(r => r.json() as MyType)` 패턴은 잘못된 경우 런타임 오류가 production까지 전파된다.

### 검토한 접근법

**Zod + fixture export + server-side contract test**:
- 프런트엔드가 Zod schema를 정의
- schema에서 JSON fixture를 export
- 서버 테스트가 실제 response와 fixture를 비교

**OpenAPI + code generation**:
- Spring → `springdoc-openapi` → OpenAPI spec → TypeScript client 생성
- 완전한 API contract 명세를 유지하지만 빌드 파이프라인이 복잡해진다
- 생성된 코드를 직접 편집하기 어렵고, generator의 타입 매핑이 완벽하지 않다

**tRPC**:
- 서버도 Node.js/TypeScript여야 한다. Spring Boot Kotlin 서버를 전면 교체해야 한다.

**GraphQL**:
- schema-first 접근이 강력하지만 새 런타임과 클라이언트 라이브러리가 필요하다. REST API를 전면 교체하는 것과 같다.

### 실제 스키마 구조

`front/features/host/api/host-contracts.ts:451-537`에 세 가지 Zod schema가 정의되어 있다:

**`HostSessionDetailResponseSchema`** (line 457): 세션 상세 — `sessionId`, `sessionNumber`, `title`, `bookTitle`, `bookAuthor`, `bookLink`, `bookImageUrl`, `locationLabel`, `meetingUrl`, `meetingPasscode`, `date`, `startTime`, `endTime`, `questionDeadlineAt`, `visibility`, `publication`, `state`, `attendees`, `feedbackDocument`.

**`HostNotificationDeliveryListResponseSchema`** (line 499): notification delivery 목록 — `items` 배열(id, eventId, channel, status, recipientEmail, attemptCount, updatedAt), `nextCursor`.

**`HostInvitationListPageSchema`** (line 517): 초대 목록 — `items` 배열(invitationId, email, name, role, status, effectiveStatus, expiresAt, acceptedAt, createdAt, applyToCurrentSession, canRevoke, canReissue), `nextCursor`.

각 schema는 `import.meta.env.DEV ? z.object({...}) : (null as never)` 패턴으로 감싸진다:

```typescript
// host-contracts.ts:452-454
// Each schema constant is wrapped in `import.meta.env.DEV ? ... : null as never`
// so Rollup dead-code-eliminates all z.* references in production, allowing
// the `import { z } from "zod"` import to be tree-shaken from the bundle.
export const HostSessionDetailResponseSchema = import.meta.env.DEV
  ? z.object({ ... })
  : (null as never);
```

## 결정

**Frontend-defined Zod schema + server-side contract test** 방식을 채택한다.

### 프런트엔드 측

모든 API response를 Zod schema로 정의한다(`front/features/host/api/host-contracts.ts:1` — `import { z } from "zod"`).

Zod schema는 production 빌드에서 tree-shaking된다. `import.meta.env.DEV` 조건부로 schema를 `null as never`로 대체하면 Rollup이 dead-code로 제거한다. runtime validation 비용이 production에서 0.

`pnpm --dir front zod:export-fixtures` (`front/package.json:13` — `"zod:export-fixtures": "tsx scripts/export-zod-fixtures.ts"`)가 Zod schema의 valid fixture JSON을 `front/tests/unit/__fixtures__/zod-schemas/`에 내보낸다.

`front/scripts/export-zod-fixtures.ts`가 각 schema의 top-level key set을 대표하는 샘플 fixture JSON을 작성한다. fixture는 실제 API 호출 결과가 아니라, "서버가 이 key set을 반환해야 한다"는 schema-driven 계약서다.

CI에서 `pnpm zod:export-fixtures && git diff --exit-code`로 fixture drift를 차단한다.

### 서버 측

`FrontendZodSchemaContractTest` (`server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`)가 Spring MockMvc로 실제 API endpoint를 호출하고, 응답의 top-level key set을 fixture JSON과 비교한다.

시스템 프로퍼티 `readmates.frontend.zod.fixtures.dir`로 fixture 디렉토리를 주입받는다:

```kotlin
private val zodFixturesDir = Paths.get(
    System.getProperty("readmates.frontend.zod.fixtures.dir")
        ?: error("System property 'readmates.frontend.zod.fixtures.dir' is not set"),
)
```

fixture 불일치 시 "Run `pnpm --dir front zod:export-fixtures`" 안내 메시지와 함께 실패한다.

5개 테스트 메서드:
- `host session detail response matches zod schema fixture key set` — `/api/host/sessions/{id}` 응답 vs `host-session-detail.json`
- `host notification delivery list response matches zod schema fixture key set` — `/api/host/notifications/deliveries` 응답 vs `host-notification-delivery-list.json`
- `host invitation list response matches zod schema fixture key set` — `/api/host/invitations` 응답 vs `host-invitation-list.json`
- `admin analytics overview response matches zod schema fixture key set` — `/api/admin/analytics/overview?window=30d` 응답 vs `admin-analytics-overview.json`
- `current session response matches zod schema fixture key set` — `/api/sessions/current` 응답 vs `current-session.json`

현재 fixture 목록:
- `front/tests/unit/__fixtures__/zod-schemas/host-invitation-list.json`
- `front/tests/unit/__fixtures__/zod-schemas/host-notification-delivery-list.json`
- `front/tests/unit/__fixtures__/zod-schemas/host-session-detail.json`
- `front/tests/unit/__fixtures__/zod-schemas/admin-analytics-overview.json`
- `front/tests/unit/__fixtures__/zod-schemas/current-session.json`

## 근거

### Schema-first 계약을 양쪽에서 강제

프런트엔드가 Zod schema로 "서버가 어떤 shape의 response를 줘야 하는가"를 정의한다. 서버 테스트가 실제 response가 이 shape을 만족하는지 검증한다. 한쪽이 변경되면 CI가 차단한다:

- 서버에서 field를 제거하면 → `FrontendZodSchemaContractTest` 실패 (`expectedKeys - actualKeys`에 필드 목록)
- 프런트엔드 Zod schema가 변경되면 → `pnpm zod:export-fixtures && git diff --exit-code` 실패 (fixture 갱신 없이 schema 변경 차단)
- 프런트엔드에서 fixture를 직접 수정하고 schema 갱신을 잊으면 → schema와 fixture 불일치 발견

이 두 방향 검증이 "schema drift는 CI에서 발견된다"는 보장을 제공한다.

### Production 번들에서 Zod 완전 제거

`import.meta.env.DEV ? z.object({...}) : (null as never)` 패턴이 production에서 Rollup/Vite의 dead-code elimination을 트리거한다. production 번들에서 Zod schema 전체가 제거된다. `import { z } from "zod"` 자체도 tree-shaking된다. 개발 모드에서는 schema validation이 활성화되어 API response 불일치를 즉시 발견할 수 있다.

### 최소한의 추가 의존성

기존 Spring MockMvc + TypeScript 스택에 추가되는 것:
- 프런트엔드: `zod` 패키지 추가 (`front/package.json:45` — `"zod": "^4.4.3"`). 기존 TypeScript 타입을 Zod schema로 표현.
- 서버: `FrontendZodSchemaContractTest` 한 클래스 추가. 기존 MockMvc 테스트 인프라 재사용. 새 라이브러리 의존성 없음.
- CI: `pnpm zod:export-fixtures && git diff --exit-code` 한 줄 추가.

OpenAPI + code generation 파이프라인(`springdoc-openapi` 라이브러리, code generator, 생성 코드 관리)과 비교하면 추가 복잡도가 현저히 낮다.

### 개발 모드 런타임 검증으로 조기 발견

`front/features/host/api/host-contracts.ts:544-563`에 각 schema에 대응하는 parse 함수가 있다:

```typescript
export function parseHostSessionDetailResponse(value: unknown): HostSessionDetailResponse {
  if (import.meta.env.DEV) {
    return HostSessionDetailResponseSchema.parse(value) as HostSessionDetailResponse;
  }
  return value as HostSessionDetailResponse;
}
```

개발 모드에서 Zod validation이 실패하면 즉시 예외가 발생한다. API response shape 불일치를 브라우저 devtools에서 즉시 발견할 수 있다. production에서는 `value as HostSessionDetailResponse`로 타입만 단언하여 런타임 비용이 0이다.

### 테스트 seeded data와 격리

`FrontendZodSchemaContractTest.kt`는 `seededHostSessionId = "00000000-0000-0000-0000-000000000301"`을 사용한다. 이 session은 Flyway dev migration(`classpath:db/mysql/dev`)으로 seed된다. 프로퍼티 `spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev`로 테스트 환경에서만 dev seed가 적용된다. 운영 DB에는 dev seed가 없다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| OpenAPI (springdoc-openapi) + 코드 생성 | `springdoc-openapi`, Java annotations, code generator, TypeScript client library가 모두 필요하다. 생성된 코드를 직접 편집하기 어렵다. generator의 타입 매핑이 완벽하지 않아 수동 override가 필요한 경우가 생긴다. 현재 팀 규모에서 파이프라인 복잡도가 과잉이다. |
| tRPC | 서버가 Node.js/TypeScript여야 한다. Spring Boot Kotlin 서버를 전면 교체해야 한다. 채택 비용이 너무 크다. |
| GraphQL (schema-first) | 새 GraphQL 런타임, 클라이언트 라이브러리(Apollo, urql), schema 파일 관리가 필요하다. REST API를 전면 교체하는 것과 같다. |
| 런타임 Zod validation 없이 TypeScript 타입만 | TypeScript 타입은 컴파일 타임 안전성을 제공하지만, 서버에서 반환하는 실제 JSON shape이 타입과 일치하는지를 런타임에 검증하지 않는다. `as Type` assertion이 잘못된 경우 런타임 오류가 production까지 전파된다. |
| Snapshot 테스트만 | 서버 응답 snapshot이 변경되면 테스트가 실패한다. 단, snapshot이 "프런트엔드가 기대하는 schema"를 명시적으로 표현하지 않는다. fixture-driven 방식이 계약의 의도를 더 명확히 표현한다. |
| Zod schema를 서버 쪽에서 정의 (proto-first 유사) | 단일 진실 소스를 서버에 두는 방식이다. 단, ReadMates에서 API shape을 더 자주 변경하는 쪽은 프런트엔드다. 프런트엔드가 schema를 정의하고 서버가 이를 따르는 것이 현실 개발 흐름에 맞다. |

## 결과

긍정적:
- Schema 변경이 서버와 프런트엔드 양쪽에서 명시적으로 보인다. CI가 drift를 차단한다.
- Production 번들에서 Zod schema가 tree-shaking되므로 런타임 비용 없다.
- 기존 Spring MockMvc + TypeScript 스택에 최소한의 의존성 추가.
- 개발 모드에서 API response 불일치를 즉시 발견. 브라우저 devtools에서 Zod 오류로 표면화.
- `FrontendZodSchemaContractTest`가 실제 MockMvc 호출 기반이라 integration test 수준의 검증이다.

부정적/감수한 비용:
- Schema 정의가 프런트엔드(TypeScript/Zod)에 위치한다. 서버는 "프런트엔드가 기대하는 schema"를 fixture 파일을 통해 간접적으로 알 뿐이다.
- `pnpm zod:export-fixtures`를 직접 실행해야 fixture가 갱신된다. CI에서 `git diff --exit-code`로 방어하고 있으나, 로컬에서 fixture를 갱신하지 않고 PR을 올리면 CI에서 처음 발견된다.
- Zod schema가 프런트엔드 코드에 분산되어 있다. 특정 endpoint의 contract를 찾으려면 해당 feature의 `api/` 디렉토리를 탐색해야 한다.
- 현재 fixture는 host session/notification/invitation, admin analytics overview, member current-session의 top-level response contract를 커버합니다. 모든 endpoint를 커버하지는 않으므로 신규 API contract를 추가할 때 fixture 후보에 포함할지 검토합니다.
- top-level key set만 비교하므로, 중첩 객체의 필드 변경은 현재 테스트에서 감지되지 않는다. `attendees[0].rsvpStatus` 필드가 제거되어도 `attendees` 키 자체가 있으면 테스트는 통과한다.

## 검증

프런트엔드 Zod schema 테스트:
```bash
pnpm --dir front test
```

서버 contract 테스트:
```bash
./server/gradlew -p server integrationTest --tests "com.readmates.contract.FrontendZodSchemaContractTest"
```

fixture drift CI 검증:
```bash
pnpm --dir front zod:export-fixtures && git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
```

기대: fixture 파일이 현재 Zod schema와 일치. 불일치 시 `FrontendZodSchemaContractTest`가 "Run `pnpm --dir front zod:export-fixtures`" 메시지와 함께 실패.

contract 불일치 수동 시뮬레이션:
- 서버 response에서 field 제거 → `FrontendZodSchemaContractTest` 실패하고 `expectedKeys - actualKeys`에 필드 목록 출력 확인
- Zod schema에 새 field 추가 후 fixture 미갱신 → `git diff --exit-code` 차단 확인

## 후속 작업

- 더 많은 핵심 API endpoint에 Zod schema와 fixture 추가. 현재는 host session/notification/invitation, admin analytics overview, member current-session을 우선 커버합니다.
- CI에서 `zod:export-fixtures && git diff --exit-code`를 PR 필수 check로 자동화.
- Nested field 검증으로 확장: top-level key set 비교 외에 중첩 객체/배열 element의 key set도 검증하는 deep contract test 추가.
- schema를 OpenAPI로 양방향 export하는 자동화. Zod schema → OpenAPI spec 변환 도구(`zod-to-openapi` 등) 검토. 해외 협업 또는 API client 배포 시.
- Production에서 Zod schema validation 선택적 활성화: 특정 endpoint에서만 production runtime validation을 켜는 feature flag.
