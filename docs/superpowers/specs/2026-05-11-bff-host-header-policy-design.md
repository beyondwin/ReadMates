# BFF Host Header Policy 설계 (ADR-0011 후보)

상태: draft (작성자 검토 대기)
작성일: 2026-05-11
오너: server / front
관련 incident: `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`
관련 ADR: ADR-0001 (BFF 채택), ADR-0008 (multi-club domain)

## 목적

2026-05-11 incident에서 노출된 BFF host header 정책의 잠재 위험을 *명시적 결정*으로 정착시킨다. 동일 클래스의 client-side bug — *명시적 club 식별이 없는 요청이 production에서 host 헤더로 implicit context를 받아 degraded auth로 fall through* — 을 영구 차단한다.

본 spec은 두 가지 산출물을 만든다:

1. **ADR-0011** — 결정의 영구 기록 (Accepted, 코드 변경 함께 머지).
2. **코드 변경** — server-side `AuthMeController` + `ClubContextResolver` 분기 보강 (선택지 B 채택). BFF는 변경 없음.

## 현재 맥락

### 코드 사실

`front/functions/api/bff/[[path]].ts:151-154`:

```typescript
headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(context.request));
if (clubSlug) {
  headers.set("X-Readmates-Club-Slug", clubSlug);
}
```

→ Pages function이 **모든** 요청에 `X-Readmates-Club-Host`를 첨부. `clubSlug`는 path에서 추출되었을 때만 첨부.

`front/vite.config.ts:43-50`:

```typescript
proxyReq.removeHeader("X-Readmates-Club-Slug");
proxyReq.removeHeader("X-Readmates-Club-Host");
const clubSlug = normalizedClubSlugFromProxyPath(proxyReq.path);
if (clubSlug) {
  proxyReq.setHeader("X-Readmates-Club-Slug", clubSlug);
}
```

→ Vite proxy는 두 헤더 모두 strip 후 slug만 path에서 추출해 첨부. **host 헤더는 dev에서 절대 첨부되지 않음**.

`server/.../ClubContextResolver.kt` (incident spec에서 인용):

```kotlin
val slug = getHeader(ClubContextHeader.CLUB_SLUG)?.trim()?.takeIf { it.isNotEmpty() }
if (slug != null) {
  return RequestedClubContext(supplied = true, context = resolveBySlug(slug))
}
val host = getHeader(ClubContextHeader.CLUB_HOST)?.trim()?.takeIf { it.isNotEmpty() }
if (host != null) {
  return RequestedClubContext(supplied = true, context = resolveByHost(host))
}
return RequestedClubContext(supplied = false, context = null)
```

→ slug 우선, host fallback. host로 lookup 실패 시 `supplied=true && context=null`.

`server/.../AuthMeController.kt:23-44` (incident spec 인용):

```kotlin
if (sessionProfileMember != null) {
  val requestedMember = requestedClubContext.context
    ?.let { context -> resolveByUserAndClub(...) }
  if (requestedClubContext.supplied && requestedMember == null) {
    return AuthMemberResponse.authenticatedUser(
      userId = ..., email = ..., joinedClubs = ..., platformAdmin = ...,
    )                                                  // ← no membershipStatus
  }
}
```

→ `supplied=true && context=null` (host로 supplied 후 lookup 실패) → degraded `authenticatedUser` 응답 (membershipStatus 없음) → 클라이언트 `canUseMemberApp(auth) == false` → 빈 화면 fallback.

### 잠재 위험의 일반 형태

- BFF가 `host`를 *credential*로 취급. server는 `host`를 *hard signal*로 취급해 degraded 분기 트리거.
- 미래에 어떤 client-side 코드가 의도적으로 *unscoped* fetch를 시도하면 (현재 5개 파일 — auth-api, platform-admin-api, club-selection-data, platform-admin-loader 등 — 모두 의도된 사용), production에서 host 헤더가 첨부되어 *implicit context*가 침투.
- 현재는 다른 5개 사용처가 모두 *unscoped 의도*인 페이지에서 사용되어 사용자 영향 없음. 단 미래 코드 추가 시 같은 클래스 bug 재발 가능.

### 본 라운드 grep으로 확인된 추가 사실

- `READMATES_ROUTE_REFRESH_EVENT`의 production 사용처는 1곳 (current-session). 동일 mechanism으로 같은 incident 재발 잠복은 *없음*.
- `{ clubSlug: undefined }` 명시 호출처 5개는 *모두 의도적 unscoped*. 이들은 빈 club 화면 트리거 페이지가 아님.

→ *지금 이 순간*의 사용자 영향은 0. 본 ADR은 **예방적 결정** + *명시적 정책 정착*.

## 결정

**Server-side 분기 보강 (Option B)** 채택.

`AuthMeController` (또는 동등 분기 위치)에서 **`supplied=true && context=null && via=HOST_FALLBACK`** 조건을 *unscoped* 응답으로 처리한다. 즉 host 헤더로 supplied 되었으나 lookup 실패한 경우는 *명시적 club scope가 없음*과 동등하게 취급.

`supplied=true && context=null && via=SLUG`(slug 명시했으나 lookup 실패)는 별도 분기 — `404 Not Found` 또는 명시적 에러 응답 (client가 fallback이 아니라 *오류*로 인식하도록).

### Resolver 시그니처 변경

`ClubContextResolver`가 `RequestedClubContext`에 *resolution source*를 함께 반환:

```kotlin
enum class ClubContextSource { SLUG, HOST_FALLBACK, NONE }

data class RequestedClubContext(
    val supplied: Boolean,
    val source: ClubContextSource,
    val context: ClubContext?,
)
```

분기 로직:

```kotlin
val slug = getHeader(ClubContextHeader.CLUB_SLUG)?.trim()?.takeIf { it.isNotEmpty() }
if (slug != null) {
  return RequestedClubContext(supplied = true, source = SLUG, context = resolveBySlug(slug))
}
val host = getHeader(ClubContextHeader.CLUB_HOST)?.trim()?.takeIf { it.isNotEmpty() }
if (host != null) {
  return RequestedClubContext(supplied = true, source = HOST_FALLBACK, context = resolveByHost(host))
}
return RequestedClubContext(supplied = false, source = NONE, context = null)
```

### Controller 분기 변경

`AuthMeController`:

```kotlin
val requestedMember = requestedClubContext.context
  ?.let { context -> resolveByUserAndClub(sessionProfileMember.userId, context.clubId) }

return when {
  // 명시적 슬러그가 supplied 되었는데 club을 못 찾음 — 클라이언트 잘못. 명시적 에러.
  requestedClubContext.supplied
    && requestedClubContext.source == ClubContextSource.SLUG
    && requestedClubContext.context == null
    -> throw ClubNotFoundException(slug)

  // 호스트로 implicit supplied 되었는데 lookup 실패 — unscoped와 동등.
  requestedClubContext.supplied
    && requestedClubContext.source == ClubContextSource.HOST_FALLBACK
    && requestedClubContext.context == null
    -> AuthMemberResponse.authenticatedUserWithMembership(
      userId, email, joinedClubs, platformAdmin,
      membershipStatus = resolveByUserUnscoped(userId)
    )

  // 정상 club scope 식별 + 멤버십 있음
  requestedMember != null
    -> AuthMemberResponse.authenticatedUserWithMembership(... requestedMember ...)

  // 명시적 supplied + member null (정상 동작 — guest at other club)
  else
    -> AuthMemberResponse.authenticatedUser(...)
}
```

→ host로 implicit supplied 된 경우 *email/userId 기반 fallback membership*을 제공 → dev와 prod 동작 일치 (dev에서는 host 헤더 자체가 없어 unscoped로 처리되므로 같은 결과).

### Frontend 변경

**없음**. BFF, Vite proxy, 모든 client 코드 무변경. server-side 단일 변경으로 dev/prod parity 확보.

## 근거

### 왜 Server-side (B)인가

1. **단일 변경 지점**: BFF 환경 변수 동기화 + 신규 클럽 도메인 추가 시 BFF 배포 부담 0.
2. **책임의 응집**: club context resolution은 server의 도메인 로직. BFF는 *전송*만 담당하는 게 자연스러움.
3. **Dev/prod parity 자연스럽게 확보**: dev에서는 host 헤더가 없어 unscoped로 처리되었음. server-side 분기를 *unscoped*로 통일하면 prod에서도 dev와 동일.
4. **명시적 에러 분리**: slug supplied + lookup 실패는 진짜 *클라이언트 버그* (잘못된 slug). 이건 명시적 404로 알려야 함. host fallback과 다른 의미.
5. **Frontend 무변경**: incident spec의 fix(`useParams()` 명시 전달)는 *각 라우트의 책임*. 본 ADR은 *backend 안전망*.

### 왜 BFF-side (A)가 아닌가

1. shared fallback host 목록을 BFF에 두면 신규 클럽 추가 시 *Cloudflare 환경 변수 갱신 + Pages 배포*가 강제됨. 운영 부담.
2. host가 *알 수 없음*인 경우의 처리가 BFF와 server에 *분산* — 결정 추적 어려움.
3. BFF 변경은 client-side 수정. 동일한 사고 원인을 server-side에서 *정책*으로 잠그는 게 아님.

### 왜 Combined (C)가 아닌가

- B만으로 충분. A를 *동시 적용*하면 두 곳에서 동일 결정을 강제 → drift 위험.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| **A — BFF-side**: shared fallback host 목록을 BFF 환경 변수로, 그 호스트일 때만 host 헤더 미전송 | 신규 클럽마다 BFF 배포. 책임 분산. 운영 부담. |
| **B — Server-side**: `supplied=true && context=null && source=HOST_FALLBACK`을 unscoped로 처리 (선택) | (위 근거) |
| **C — Combined (A + B)** | 두 곳 동시 변경 → drift 위험. B만으로 충분. |
| **D — `RequestedClubContext`에 *raw host*를 보존하고 controller가 직접 `club_domains` 재조회 후 분기** | resolver의 책임을 controller로 끌어옴. 설계 원칙(adapter/application 경계) 위배. |
| **E — `supplied`/`source`를 추가하지 않고 단순히 `context == null`을 unscoped로 처리** | slug 명시 + lookup 실패도 같이 unscoped로 fall through → 클라이언트 버그가 silent로 숨음. 명시적 에러 분리 가치 손실. |
| **F — Pages function이 host 헤더에 *알 수 없는 host* 표시 (예: `X-Readmates-Club-Host: __unknown__`)** | server가 magic value를 해석해야 함. 디버그 가능성 ↓. |

## 비목표

- BFF 측 변경. (Frontend 0 변경.)
- Multi-club 신규 도메인 등록 워크플로 변경.
- `club_domains` 테이블 schema 변경.
- 다른 controller (`SessionsController` 등)의 `requestedClubContext` 사용 패턴 일제 audit. 본 spec은 `AuthMeController`만 다룸. 다른 controller가 `supplied && context==null`을 어떻게 다루는지는 후속 audit.
- Parity test (incident action item P1). 본 spec이 *server-side 정책*으로 그 클래스를 잠그면 P1 시급성 더 낮아짐.
- ADR-0011 본문이 다루는 결정 외의 모든 follow-up.

## 영향 범위

- **변경 파일**: 
  - `server/.../club/.../ClubContextResolver.kt` (또는 동등 클래스)
  - `server/.../auth/.../AuthMeController.kt`
  - `server/.../shared/...` (`ClubContextSource` enum 신설)
  - 관련 테스트
- **API 응답 모양 변화**:
  - host fallback 케이스에서 `membershipStatus`가 *항상 채워짐* (unscoped path 사용). 클라이언트가 `canUseMemberApp(auth) == true`로 평가 → 정상 화면.
  - slug 명시 + lookup 실패는 새 4xx 에러. 현재 클라이언트는 이 케이스를 만들지 않으므로 *user-facing 영향 0*. 단 신규 케이스 발생 시 명시적 ApiErrorResponse.
- **DB / 마이그레이션**: 없음.
- **Cloudflare / Pages 배포**: 없음.

## 검증

1. **Unit / integration test**:
   - `ClubContextResolverTest` (또는 신설) — `source` 값이 SLUG/HOST_FALLBACK/NONE으로 정확히 분기.
   - `AuthMeControllerTest` — host fallback + lookup 실패 케이스에서 *unscoped membership 채워짐*. slug + lookup 실패에서 4xx.
   - `ServerArchitectureBoundaryTest` — adapter/application 경계 위배 없음.
2. **Contract test**: `FrontendZodSchemaContractTest`가 `AuthMeResponse` shape 변경에 정합 (membershipStatus optional → 채워짐 시 valid).
3. **Pre-fix manual repro**: `https://readmates.pages.dev/clubs/reading-sai/app/session/current` 접근 후 `/api/auth/me`를 *clubSlug 없이* 호출 → 빈 화면 fallback 재현.
4. **Post-fix manual repro**: 같은 호출 → unscoped membership 응답 → `canUseMemberApp(auth) == true` → 정상 화면.
5. **e2e**: `pnpm --dir front test:e2e` (auth flow + club context 변경이라 필수).
6. **Build / lint**: `./server/gradlew -p server clean test`, `pnpm --dir front lint test build`.

## 위험과 완화

| 위험 | 완화 |
|------|------|
| `supplied`/`source` 추가가 다른 controller의 `requestedClubContext` 사용처에 영향 | 사용처 grep 후 *모두 같은 분기 패턴 적용 여부 결정*. 본 spec은 `AuthMeController`만, 다른 controller는 *기존 분기 그대로 유지 + 별도 audit*. ServerArchitectureBoundaryTest 통과 필수. |
| host fallback에서 `resolveByUserUnscoped(userId)` 같은 새 메서드 도입이 도메인 모델 변경 | 실제로는 이미 dev에서 동등 동작 (header 없음 → unscoped). 새 코드가 아니라 *기존 unscoped path 재사용*. 메서드명/위치는 plan에서 정확히 정함. |
| slug supplied + lookup 실패가 4xx로 변경되면서 *기존 클라이언트가 fallback 의존* | grep으로 client-side에서 명시적으로 잘못된 slug를 보내는 곳 확인. 0건이면 영향 없음. >0이면 별도 spec. |
| ADR-0011이 ADR plan 0001~0010과 *동시 작성* — 번호 충돌 | 0011 번호는 ADR plan의 next-number 룰에 따라 reserved. plan 머지 순서에 따라 0011 또는 0012 재할당 가능. 본 spec은 *임시 ADR-0011 후보*로 표기. |
| Contract test가 `AuthMeResponse` shape 변경을 잡음 (false positive) | shape 변경이 *추가만* (membershipStatus가 더 자주 채워짐, optional은 여전 optional)이면 안전. *제거*는 없음. |
| dev에서 미재현 클래스의 *다른* incident가 잠복 | 본 spec은 host header 정책에 한정. 다른 클래스는 별도 spec/parity test (post-mortem action item P1, 시급성 낮음 — Deferred). |

## 후속

- `ClubContextSource`를 `RequestedClubContext` 사용처 전체로 전파 — 다른 controller에서도 *명시적 vs implicit* 분기 활용. 별도 spec.
- Parity test (incident P1) 재평가 — 본 ADR이 server-side에서 잠그면 시급성 더욱 낮아짐.
- `club_domains` 테이블에 `is_shared_fallback` 컬럼 추가 검토 — host가 *명시적으로 fallback*인지 표기. 본 spec과 직교.
- ADR-0011 본문 작성 후 ADR 인덱스(`docs/development/adr/README.md`) 갱신.
- post-mortem 본문의 follow-up 갱신 이력에 한 줄 추가 — `Action item #2 → Closed (ADR-0011 머지 완료)`.
- BFF host 헤더를 *디버그/로깅 전용*으로 명시 (응답 헤더에 echo 등) — 운영 가시성 보강. 별도 spec.
