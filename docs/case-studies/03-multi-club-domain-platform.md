# Case Study 03 — Multi-club domain platform — host vs slug 우선순위

> 한 ReadMates 인스턴스가 여러 독서모임을 호스팅합니다. 클럽이 custom domain (`my-club.com`)을 가질 수도, path-routed shared fallback (`readmates.pages.dev/clubs/<slug>`)으로도 접근될 수 있어야 했습니다. `X-Readmates-Club-Slug` 헤더 우선 + `X-Readmates-Club-Host` 헤더 fallback 정책으로 두 경로를 동일 codepath로 묶었지만, dev/prod parity가 깨진 실제 incident를 통해 BFF 호스트 정책의 한계를 학습했습니다.

## 문제

**한 인스턴스, N개 클럽**

ReadMates는 단일 배포로 여러 독서모임(club)을 호스팅합니다. 각 클럽의 데이터, 멤버십, 세션은 서로 격리되며, backend가 요청마다 "어떤 클럽의 요청인가"를 식별해야 합니다.

**두 가지 entry point**

- **Custom domain**: 클럽 owner가 자체 도메인(`my-club.com`)을 사용합니다. 도메인이 확정된 뒤 `club_domains` 테이블에 `status = 'ACTIVE'`로 등록합니다.
- **Shared fallback**: `readmates.pages.dev/clubs/<slug>` — 클럽 생성 직후 즉시 사용 가능한 경로. custom domain 없이도 운영 가능합니다.

두 경로 모두 동일한 backend code를 통과해야 합니다. 요청에서 "어떤 클럽인가"를 어떻게 식별할 것인가가 핵심 질문이었습니다.

**비자명한 지점**

- custom domain 경로에서는 host를, shared fallback 경로에서는 URL path를 읽어야 합니다. 두 정보가 서로 다른 계층에 있습니다.
- BFF(Cloudflare Pages Function / Vite dev proxy)가 이 정보를 어떻게 표준화해서 backend에 전달할지 결정해야 합니다.
- dev 환경(Vite proxy)과 prod 환경(Pages function)이 다르게 동작하면, prod에서만 재현되는 버그 클래스가 생깁니다.

## 접근

| 대안 | 기각 이유 |
|------|----------|
| slug only (URL path 기준만) | custom domain 경로에서 path가 어색합니다 (`my-club.com/clubs/my-club/...`). 도메인 소유자가 원하는 URL 구조가 아닙니다. |
| host only | shared fallback이 같은 host(`readmates.pages.dev`)로 묶임 → 클럽 식별 불가. |
| Cloudflare Worker가 host→slug 변환 후 단일 채널 | edge config 운영 부담. 새 클럽 추가가 Worker 재배포를 요구합니다. |
| 서브도메인 (`my-club.readmates.com`) | DNS 와일드카드 + TLS 운영 부담. custom domain 사용자 요구를 만족하지 못합니다. |

**선택: `X-Readmates-Club-Slug` (명시) > `X-Readmates-Club-Host` (DB lookup) > unscoped 우선순위**

BFF가 두 헤더를 상황에 따라 부착하고, backend는 slug 헤더를 먼저, 없으면 host 헤더를 사용합니다. ADR-0013 이후 backend는 `ClubContextSource`로 slug miss와 host fallback miss를 구분합니다.

## 구현

### backend — ClubContextResolver

`server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`는 `HttpServletRequest`의 확장 함수로 구현됩니다. 우선순위 로직이 단일 파일에 응집되어 있습니다.

```kotlin
// server/.../club/adapter/in/web/ClubContextResolver.kt
fun HttpServletRequest.resolveClubContext(resolveClubContextUseCase: ResolveClubContextUseCase): RequestedClubContext {
    val slug = getHeader(ClubContextHeader.CLUB_SLUG)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
    if (slug != null) {
        return RequestedClubContext(
            supplied = true,
            source = ClubContextSource.SLUG,
            context = resolveClubContextUseCase.resolveBySlug(slug),
        )
    }

    val host = getHeader(ClubContextHeader.CLUB_HOST)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
    if (host != null) {
        return RequestedClubContext(
            supplied = true,
            source = ClubContextSource.HOST_FALLBACK,
            context = resolveClubContextUseCase.resolveByHost(host),
        )
    }

    return RequestedClubContext(
        supplied = false,
        source = ClubContextSource.NONE,
        context = null,
    )
}
```

반환 타입 `RequestedClubContext`의 `source` 필드가 중요합니다. `source = SLUG && context = null`은 잘못된 slug이고, `source = HOST_FALLBACK && context = null`은 등록되지 않은 host fallback입니다. ADR-0013 전에는 이 두 경우가 모두 `supplied = true && context = null`로만 표현되어 incident의 트리거가 됐습니다.

### backend — JdbcClubContextAdapter

`server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcClubContextAdapter.kt`의 `loadByHostname`은 `club_domains.status = 'ACTIVE'` 조건을 포함합니다. shared fallback 호스트(`readmates.pages.dev`)는 이 테이블에 없으므로 host lookup이 `null`을 반환합니다.

```kotlin
// server/.../JdbcClubContextAdapter.kt:34-53
override fun loadByHostname(hostname: String): ResolvedClubContext? {
    return jdbcTemplate.query(
        """
        select clubs.id, clubs.slug, clubs.name, clubs.status, club_domains.hostname
        from club_domains
        join clubs on clubs.id = club_domains.club_id
        where club_domains.hostname = ?
          and club_domains.status = 'ACTIVE'
          and clubs.status in ('ACTIVE', 'SETUP_REQUIRED')
        limit 1
        """.trimIndent(),
        { resultSet, _ -> resultSet.toResolvedClubContext() },
        hostname,
    ).firstOrNull()
}
```

### BFF prod — Pages function

`front/functions/api/bff/[[path]].ts`는 모든 요청에 host 헤더를 붙이고, `clubSlug` query가 있을 때만 slug 헤더를 추가합니다. `clubSlug` query는 프런트엔드 API client가 `/clubs/:clubSlug/...` route param에서 붙입니다.

```typescript
// front/functions/api/bff/[[path]].ts (prod)
headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(context.request));
if (clubSlug) {
  headers.set("X-Readmates-Club-Slug", clubSlug);
}
```

### BFF dev — Vite proxy

`front/vite.config.ts`는 반대 방향으로 동작합니다. 브라우저가 보낸 두 헤더를 모두 제거한 뒤 `clubSlug` query에서 slug를 재추출해 부착합니다. host 헤더는 **전송하지 않습니다.**

```typescript
// front/vite.config.ts (dev — host 헤더 strip)
proxy.on("proxyReq", (proxyReq) => {
  proxyReq.removeHeader("X-Readmates-Club-Slug");
  proxyReq.removeHeader("X-Readmates-Club-Host");
  const clubSlug = normalizedClubSlugFromProxyPath(proxyReq.path);
  if (clubSlug) {
    proxyReq.setHeader("X-Readmates-Club-Slug", clubSlug);
  }
});
```

**dev/prod parity 차이**: dev는 host 헤더를 전송하지 않으므로 backend `requestedClubContext.source`가 `NONE`입니다. prod는 host 헤더를 항상 전송하므로 shared fallback miss에서 `HOST_FALLBACK`입니다. ADR-0013 전에는 이 차이가 production-only bug 클래스의 원인이 됐고, 현재는 `AuthMeController`가 host fallback miss를 unscoped session profile로 처리합니다.

## 검증

**unit test**

```bash
./server/gradlew -p server test --tests "*ClubContext*"
```

`ClubContextResolver`의 slug-first / host-fallback / unscoped 세 경로와, `JdbcClubContextAdapter`의 `loadByHostname`이 `club_domains.status = 'ACTIVE'` 조건만 통과함을 검증합니다.

**E2E (Playwright)**

multi-club 시나리오: shared fallback URL(`/clubs/<slug>/...`)과 custom domain 경로가 동일 세션 데이터를 반환함을 확인합니다.

**custom domain alias health check**

`/.well-known/readmates-domain-check.json` GET 응답으로 custom domain alias가 ReadMates Pages project에 연결됐는지 확인합니다. Platform admin 상태 확인 action이 marker를 확인해 `club_domains.status`를 `ACTIVE` 또는 `FAILED`로 갱신하며, 이 DB 상태와 실제 marker 응답이 모두 맞아야 운영 도메인으로 승인합니다.

## 운영 incident — 2026-05-11

### 증상

URL `https://readmates.pages.dev/clubs/reading-sai/app/session/current`에서 멤버가 reading progress를 저장했을 때:

- 저장 요청: HTTP 200 OK, DB row 기록 성공.
- 페이지: 저장 직후 "아직 열린 세션이 없습니다" 빈 상태로 collapse.
- 재현: 페이지 새로 고침하면 정상 복구. prod에서만 발생, 로컬 Vite dev에서는 재현되지 않음.

### root cause — 단계별 추적

1. **클라이언트 refresh path**: 저장 성공 후 route refresh 핸들러가 `loadCurrentSessionRouteData()`를 **인수 없이** 호출합니다. `clubSlug`가 전달되지 않습니다.

2. **BFF prod 동작**: `front/functions/api/bff/[[path]].ts:151`이 `X-Readmates-Club-Host: readmates.pages.dev`를 자동 첨부합니다. slug 헤더 없음.

3. **backend 처리**: `ClubContextResolver`에서 slug 헤더가 없으므로 host lookup 경로로 진입합니다. `JdbcClubContextAdapter.loadByHostname("readmates.pages.dev")`는 `club_domains`에 해당 호스트가 없어 `null` 반환 → 당시에는 `RequestedClubContext(supplied = true, context = null)`, 현재는 `source = HOST_FALLBACK, context = null`.

4. **AuthMeController**: `supplied = true && context = null` 조합으로 `authenticatedUser` 응답을 반환하지만 `membershipStatus`가 없습니다.

5. **클라이언트 fallback**: `canUseMemberApp(auth)`가 `membershipStatus` 없음으로 `false` 반환 → `loadCurrentSessionRouteData`가 `{ currentSession: null }`을 반환 → 빈 상태 렌더링.

**왜 dev에서 재현되지 않았는가**: dev는 `X-Readmates-Club-Host`를 전송하지 않으므로 `source = NONE`. backend가 email 기반 fallback으로 멤버십을 조회해 정상 응답.

| 계층 | Dev | Prod |
|---|---|---|
| BFF host 헤더 | 미전송 | 항상 전송 |
| `requestedClubContext.source` | `NONE` | `HOST_FALLBACK` |
| backend fallback | email 기반 멤버십 조회 | `authenticatedUser` (membershipStatus 없음) |
| `canUseMemberApp(auth)` | `true` | `false` |
| refresh 결과 | 세션 데이터 정상 | `currentSession: null` |

### 영구 수정

`front/features/current-session/route/current-session-route.tsx`의 refresh 핸들러에서 `useParams()`로 slug를 가져와 명시적으로 전달합니다.

```tsx
// front/features/current-session/route/current-session-route.tsx
const params = useParams();
// ...
const refresh = () => {
  void loadCurrentSessionRouteData({ params })   // ← params 명시 전달
    .then((nextData) => { ... })
    .catch(() => { /* 마지막 성공 데이터 유지 */ });
};
```

React Router가 이미 URL 파라미터의 단일 출처를 소유하고 있습니다. 초기 loader가 `args.params`로 받는 것과 같은 출처를 refresh에도 연결하는 것이 올바른 형태입니다.

설계 근거 및 기각된 대안은 spec `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`에 상세 기록되어 있습니다.

### 대응 타임라인

git log 실측치:

| 시각 (KST) | commit | 내용 |
|---|---|---|
| 2026-05-11 11:48 | `0a72ed3` | docs: spec and plan current-session refresh club context fix |
| 2026-05-11 11:51 | `422a117` | fix(current-session): forward useParams to refresh handler |
| 2026-05-11 11:54 | `63e166e` | test(current-session): regression test for clubSlug in route refresh |

spec 작성부터 구현·테스트 완료까지 약 6분. 재현 조건 확정(dev vs prod 분기 추적)이 분석 시간의 대부분을 차지했습니다.

### 후속 결정

즉시 수정은 frontend refresh handler가 `useParams()`를 명시 전달하는 방식이었고, 후속 안전망은 ADR-0013에서 server-side로 닫았습니다. `ClubContextResolver`가 `ClubContextSource.SLUG` / `HOST_FALLBACK` / `NONE`을 반환하고, `AuthMeController`는 slug supplied + lookup miss만 `CLUB_NOT_FOUND` 404로 처리합니다. Host fallback + lookup miss는 unscoped session profile로 다뤄 dev에서 host 헤더가 없는 경우와 같은 응답을 반환합니다. BFF는 여전히 host 헤더를 전송하지만, server가 shared fallback miss를 멤버십 없음으로 오해하지 않습니다.

## Trade-off와 한계

**dev/prod BFF parity 부재**

Vite proxy와 Pages function의 헤더 정책이 다릅니다. dev에서는 재현되지 않는 bug 클래스가 구조적으로 존재합니다. 위 incident가 그 첫 번째 instance였습니다.

**`club_domains` 운영 관리**

custom domain 등록은 이제 platform admin UI/API에서 domain row를 만들고 상태 확인 action으로 marker를 검증하는 흐름입니다. 다만 실제 Cloudflare Pages custom domain 연결, DNS, 인증서 준비는 여전히 운영자가 provider console에서 수행합니다. Cloudflare API provisioning이나 live poller는 1차 구현 범위가 아니므로, self-service는 "요청/상태 확인"까지만 자동화되어 있습니다.

**host lookup과 동적 origin allowlist 캐시**

club context host lookup은 요청마다 DB를 확인합니다. 반면 mutating request의 dynamic allowed-origin 확인은 `JdbcActiveClubDomainAdapter`가 `ACTIVE` hostname 목록을 60초 TTL로 캐시합니다. custom domain 요청이 크게 증가하면 club context lookup도 캐시 후보가 됩니다.

**`supplied = true && context = null` 의미론**

이 상태는 과거에 두 가지를 동시에 표현했습니다: "명시적 slug가 왔지만 클럽을 못 찾음"과 "등록되지 않은 host fallback". ADR-0013 이후에는 `ClubContextSource`가 두 경우를 분리합니다. 잘못된 slug는 `CLUB_NOT_FOUND`로 드러나고, 등록되지 않은 host fallback은 unscoped auth로 처리합니다.

## 다시 한다면

**dev/prod parity test 강제**

Vite proxy(`front/vite.config.ts`)와 Pages function(`front/functions/api/bff/[[path]].ts`)이 동일 입력에서 동일 헤더 집합을 만들어내는지를 단일 test로 강제합니다. 이 테스트가 있었다면 parity 차이가 코드 리뷰 시점에 발견되었을 것입니다.

**BFF host 헤더 운영 가시성**

ADR-0013은 BFF가 항상 host 헤더를 보내는 구조를 유지하되, server가 host fallback miss를 unscoped로 처리하도록 바꿨습니다. 다시 한다면 BFF와 Spring 양쪽에서 resolved source를 debug-safe metric 또는 log로 남겨, shared fallback miss와 custom domain miss를 운영자가 더 빨리 구분하게 하겠습니다.

**slug miss와 host fallback miss를 타입으로 분리**

이 분리는 ADR-0013에서 완료됐습니다. 다음 개선은 `CurrentMemberArgumentResolver`, `MemberAuthoritiesFilter`, `SessionCookieAuthenticationFilter` 같은 다른 consumer도 source-aware 분기가 필요한지 audit하는 일입니다.

## 관련

- **ADR-0008** — multi-club domain with host resolution 결정 기록.
- **ADR-0013** — BFF host header policy 후속 안전망.
- **spec** — `docs/superpowers/specs/2026-04-30-readmates-multi-club-domain-platform-design.md`.
- **incident spec** — `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md` (BFF divergence 분석, 수정 설계, 기각된 대안 포함).
- **incident plan** — `docs/superpowers/plans/2026-05-11-current-session-refresh-club-context-implementation-plan.md` (구현 단계).
- **post-mortem** — `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md` (post-mortem case study에서 작성).
