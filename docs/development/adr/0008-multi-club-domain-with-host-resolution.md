# ADR-0008: Multi-club domain — host header + slug 우선순위

- 상태: Accepted
- 결정일: 2026-04-30
- 작성자: 서버/프런트엔드 아키텍처
- 관련: ADR-0001 (BFF), ADR-0007 (MySQL + Flyway), ADR-0013 (BFF host header policy),
  `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`,
  `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextHeader.kt`,
  `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcClubContextAdapter.kt`,
  `server/src/main/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateChecker.kt`,
  `server/src/main/resources/db/mysql/migration/V21__multi_club_platform.sql`,
  `front/functions/api/bff/[[path]].ts`,
  `front/vite.config.ts`,
  `docs/development/architecture.md`

## 컨텍스트

ReadMates는 여러 독서모임(club)이 한 인스턴스에서 운영되는 멀티테넌트 플랫폼이다. 각 클럽은 자체 도메인을 가질 수 있어야 한다(예: `club-a.example.com`). 동시에 플랫폼 shared URL(`readmates.pages.dev/clubs/<slug>`) 기반의 path-routed fallback도 지원해야 한다.

### 멀티클럽 전환 배경

v1.3.x까지는 단일 클럽 인스턴스였다. `V21__multi_club_platform.sql`에서 `club_domains` 테이블이 추가되면서 멀티테넌트 구조로 전환됐다. 이 migration에서 추가된 주요 테이블:

- `club_domains`: 클럽별 도메인 alias 관리
  - `kind`: `SUBDOMAIN`, `CUSTOM_DOMAIN`
  - `status`: `REQUESTED → ACTION_REQUIRED → PROVISIONING → ACTIVE / FAILED / DISABLED`
  - `is_primary`, `verified_at`, `last_checked_at`, `provisioning_error_code`
  - `unique key club_domains_hostname_uk (hostname)` — hostname 중복 불가
- `platform_admins`: 플랫폼 관리자 역할 (`OWNER`, `OPERATOR`, `SUPPORT`)
- `club_audit_events`, `platform_audit_events`: 감사 이벤트 테이블
- `support_access_grants`: 지원 접근 권한 (`METADATA_READ`, `HOST_SUPPORT_READ` scope)

V21 이전 `clubs` 테이블은 status 컬럼이 없었다. V21이 `clubs.status`를 추가하고 `check constraint`로 `SETUP_REQUIRED`, `ACTIVE`, `SUSPENDED`, `ARCHIVED` 4개 상태로 제한한다.

### 결정해야 했던 문제

두 가지 club context 결정 방식이 자연스럽게 나뉜다:

1. **Custom domain 방식**: 사용자가 `https://club-a.example.com`에 접근하면 host 헤더로 어느 클럽인지 결정. DNS가 해결된 상태.
2. **Path-routed 방식**: 사용자가 `https://readmates.pages.dev/clubs/<slug>`에 접근하면 URL slug로 클럽 결정.

이 두 채널을 단일 club context resolution 메커니즘으로 통합해야 했다.

**추가 제약 조건**:
- Spring 서버는 BFF를 통해서만 접근된다. 브라우저는 Spring의 origin을 직접 알지 못한다.
- BFF(Cloudflare Pages Functions, ADR-0001)가 trusted host를 헤더로 전달하고, 프런트엔드 API client가 route slug를 `clubSlug` query로 표준화해 Spring에 전달해야 한다.
- 로컬 개발 환경에서는 Vite proxy가 BFF 역할을 대신해야 한다.

### 고려한 접근법

- **단일 slug 채널**: BFF에서 host → slug 변환 후 slug만 Spring에 전달. BFF가 `club_domains` 조회를 직접 수행해야 한다.
- **단일 host 채널**: host 헤더만 사용. path-routed URL에서 slug를 host로 변환하는 로직이 필요하다.
- **dual header 채널**: BFF가 slug와 host 모두를 헤더로 전달. Spring이 우선순위 로직을 결정.

## 결정

Club context 결정 우선순위를 다음과 같이 정한다:

**1순위: `X-Readmates-Club-Slug` 헤더 (명시 우선)**

BFF가 `clubSlug` query에서 slug를 정규화해 헤더로 전달한다. 이 query는 프런트엔드 API client가 `/clubs/:clubSlug/...` route param에서 붙인다. Spring의 `ClubContextResolver`가 이 헤더를 먼저 확인한다.

```kotlin
// ClubContextResolver.kt
fun HttpServletRequest.resolveClubContext(resolveClubContextUseCase: ResolveClubContextUseCase): RequestedClubContext {
    val slug = getHeader(ClubContextHeader.CLUB_SLUG)
        ?.trim()?.takeIf { it.isNotEmpty() }
    if (slug != null) {
        return RequestedClubContext(
            supplied = true,
            source = ClubContextSource.SLUG,
            context = resolveClubContextUseCase.resolveBySlug(slug),
        )
    }
    // ...
}
```

**2순위: `X-Readmates-Club-Host` 헤더 (도메인 alias 조회)**

slug가 없으면 BFF가 현재 요청의 host를 `X-Readmates-Club-Host`로 전달한다. Spring이 `club_domains` 테이블에서 `hostname = ? AND status = 'ACTIVE'`로 클럽을 조회한다.

```kotlin
// JdbcClubContextAdapter.kt:34-53
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

**3순위: Unscoped 또는 host fallback miss**

두 헤더가 모두 없으면 `RequestedClubContext(supplied = false, source = NONE, context = null)`을 반환한다. Host 헤더가 있었지만 조회 결과가 없으면 `source = HOST_FALLBACK, context = null`로 남긴다. ADR-0013 이후 `AuthMeController`는 slug miss만 `CLUB_NOT_FOUND`로 처리하고, host fallback miss는 dev에서 host 헤더가 없는 경우와 같은 unscoped session profile로 처리한다.

**헤더 상수 위치**: `ClubContextHeader.kt:4-5` — `CLUB_HOST = "X-Readmates-Club-Host"`, `CLUB_SLUG = "X-Readmates-Club-Slug"`.

**BFF에서의 헤더 주입**: `front/functions/api/bff/[[path]].ts`

```typescript
headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(context.request));
if (clubSlug) {
    headers.set("X-Readmates-Club-Slug", clubSlug);
}
```

**로컬 dev 헤더 주입**: `front/vite.config.ts` — Vite proxy는 browser가 보낸 내부 club 헤더를 제거한 뒤 `clubSlug` query에서 정규화된 slug 헤더만 다시 주입한다. Host 헤더는 전송하지 않으므로, production host fallback miss와 dev unscoped 응답은 ADR-0013의 server-side 분기가 맞춘다.

**Custom domain 등록 흐름**:
1. Platform admin이 domain alias를 생성하면 `club_domains`에 신규 row가 `ACTION_REQUIRED` 상태로 저장된다.
2. 운영자가 Cloudflare Pages custom domain과 DNS/인증서 연결을 완료한다.
3. Platform admin 상태 확인 action이 `HttpClubDomainActualStateChecker`를 통해 해당 도메인의 well-known marker endpoint를 HTTPS로 확인한다.
4. 도메인이 Cloudflare Pages로 routing되고 ReadMates marker response를 반환하면 `ACTIVE`, 실패하면 `FAILED`로 전환한다.
5. `ACTIVE` 상태인 hostname만 `loadByHostname` 조회에 사용

## 근거

### 두 채널이 다른 UX에 자연스럽다

- **Slug 기반**: `readmates.pages.dev/clubs/<slug>` path에서 slug가 URL에 명시되어 있다. path-routed fallback 사용자에게 자연스럽다. React Router의 route parameter로 slug를 추출한다.
- **Host 기반**: `https://club-a.example.com`에 접근하는 사용자는 URL에 slug가 없다. host가 club identity 그 자체다. path에 club 식별 정보를 포함시키면 URL이 복잡해진다.

두 채널 중 하나를 강제하면 한쪽 UX가 깨진다:
- Slug-only라면 custom domain 사용자가 모든 URL에 slug를 포함해야 한다. `https://club-a.example.com/clubs/club-a/sessions`처럼 slug가 중복된다.
- Host-only라면 path-routed shared fallback이 없어 custom domain 없는 클럽이 서비스를 못 받는다.

### BFF에서 표준화 — Spring은 헤더만 본다

BFF(`front/functions/api/bff/[[path]].ts:118-153`)가 두 헤더를 모두 Spring으로 전달한다:
- `X-Readmates-Club-Host`: 항상 현재 request host로 설정
- `X-Readmates-Club-Slug`: API request의 `clubSlug` query가 있을 때만 추가. 이 query는 프런트엔드 API client가 React Router의 `/clubs/:clubSlug/...` route param에서 붙인다.

Spring은 slug를 먼저 확인하므로, custom domain 사용자가 path에 slug를 포함해도(`club-a.example.com/clubs/club-a/sessions`) 올바르게 처리된다. slug 헤더가 있으면 host 헤더는 무시된다.

BFF가 헤더를 주입하기 때문에 Spring이 `club_domains` DB 조회를 완전히 제어한다. BFF는 조회 로직을 모른다.

### 신규 클럽 도메인 등록이 row 추가로 가능

새 custom domain을 등록하려면 platform admin UI/API로 domain row를 만들고, 운영자가 Cloudflare Pages custom domain과 DNS를 연결한 뒤, 상태 확인 action으로 marker를 검증해 `ACTIVE`로 전환한다. 코드 배포 없이 새 클럽 도메인을 운영에 반영할 수 있다. 현재 Cloudflare API provisioning과 live poller는 1차 구현 범위가 아니다.

### Marker file로 DNS 소유 검증

`HttpClubDomainActualStateChecker`가 해당 도메인의 well-known marker endpoint를 HTTPS로 확인한다. 도메인이 실제로 Cloudflare Pages로 routing되고 있는지(즉, 도메인 소유자가 DNS 설정을 완료했는지) 확인한다. 현재 구현은 Cloudflare API poller가 아니라 admin-triggered marker check이며, 통과 후 `ACTIVE`, 실패 시 `FAILED`로 전환된다.

이 검증이 없으면 임의의 hostname을 `club_domains`에 등록하면 해당 hostname으로 오는 모든 요청이 클럽으로 routing된다. marker 검증이 DNS 소유자만 도메인을 활성화할 수 있도록 보장한다.

### 단일 ClubContextResolver로 두 채널 통합

두 채널의 기본 resolve 로직이 `ClubContextResolver.kt` 한 곳에 있다. 새 채널이 생기면 여기에만 추가하면 된다. 대부분의 컨트롤러와 서비스 계층은 resolved context만 보면 되고, slug miss와 host fallback miss를 다르게 처리해야 하는 auth surface만 `ClubContextSource`로 분기한다.

### 로컬 개발 동일 메커니즘

`front/vite.config.ts`가 Vite proxy에서 browser-supplied 내부 헤더를 제거하고 `clubSlug` query에서 slug 헤더를 주입한다. 로컬에서 `/clubs/my-club/app` 경로의 API 호출은 프런트엔드 API client가 `clubSlug=my-club` query를 붙이고, Vite proxy가 `X-Readmates-Club-Slug: my-club`을 Spring에 전달한다. Production BFF는 여기에 host fallback 헤더도 추가하므로, dev/prod 차이는 ADR-0013의 source-aware server 분기로 흡수한다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| Slug-only (host 무시) | Custom domain 사용자가 모든 URL에 club slug를 포함해야 한다. `https://club-a.example.com`에서 club을 자동으로 결정할 수 없다. custom domain의 UX 메리트가 사라진다. |
| Host-only (slug 무시) | Path-routed shared fallback(`readmates.pages.dev/clubs/<slug>`) 지원이 불가능하다. 모든 클럽이 custom domain을 보유해야만 서비스를 받을 수 있다. |
| Cloudflare Worker에서 host → slug 변환 후 단일 slug 채널 | BFF에서 host를 slug로 변환하면 Spring은 slug만 처리하면 된다. 단, BFF가 `club_domains` 조회를 직접 수행해야 한다. BFF(edge)에서 MySQL을 직접 접근하는 것은 아키텍처 경계를 위반한다(ADR-0001). 별도 캐시/KV 동기화가 필요해 복잡도가 높아진다. |
| Tenant header (club_id 기반) | 내부 ID를 BFF 헤더에 노출하면 클라이언트가 club_id를 조작할 수 있다. slug 또는 host는 공개된 정보이지만, 조회는 Spring이 수행하므로 신뢰 관계가 유지된다. club_id를 URL에 노출하면 enumeration attack 표면이 넓어진다. |
| JWT에 club context를 embed | JWT에 club_id를 클레임으로 추가하면 매 요청마다 DB 조회 없이 club context를 확인할 수 있다. 단, 멤버가 여러 클럽에 속하는 경우 JWT를 클럽별로 발급해야 한다. 세션 쿠키 기반 아키텍처(ADR-0006)와 충돌한다. |

## 결과

긍정적:
- 신규 클럽 도메인 등록이 platform admin domain row + provider console 연결 + marker 상태 확인으로 가능하다. 코드 배포 불필요.
- Custom domain과 shared fallback이 동일 codepath를 사용한다. club context resolution 이후 모든 서버 로직이 동일하게 동작한다.
- DNS 소유 검증(`HttpClubDomainActualStateChecker` + marker)이 자동화되어 있어 잘못된 도메인이 `ACTIVE` 상태가 되는 것을 방지한다.
- `ClubContextResolver.kt`가 두 채널을 단일 진입점으로 통합하고 `ClubContextSource`로 slug miss와 host fallback miss를 구분한다.
- `club_domains.status` 상태 머신이 `check constraint`로 DB 레벨에서 강제된다(`V21__multi_club_platform.sql:24`).

부정적/감수한 비용:
- Host 헤더 기반 resolution은 "어떤 요청이 어느 클럽으로 routing되었는가"를 추적하기 어렵다. 로깅에 resolved club_id를 포함해야 디버깅이 가능하다.
- BFF host 헤더 정책은 ADR-0013의 source-aware resolver로 보강됐다. Custom domain host는 `X-Readmates-Club-Host`로 전달하고, shared fallback host miss는 Spring이 club context supplied 상태로 오해하지 않도록 처리한다. 실제 인시던트: `2026-05-11 current-session-refresh-club-context` — BFF의 `/api/auth/current-session` refresh path에서 club context가 전달되지 않아 현재 세션 조회가 fallback 도메인에서 실패.
- `club_domains.status` 전환 로직이 복잡하다. `REQUESTED → ACTION_REQUIRED → PROVISIONING → ACTIVE / FAILED` 상태 머신이 올바르게 구현되지 않으면 유효한 도메인이 활성화되지 않거나, 잘못된 도메인이 활성화될 수 있다.
- `loadByHostname` 쿼리가 매 요청마다 `club_domains` 테이블을 조회한다. hostname 조회 index(`club_domains_hostname_uk`)가 있지만, 트래픽이 많아지면 캐시 계층이 필요할 수 있다.

## 검증

서버 ClubContext 테스트:
```bash
./server/gradlew -p server test --tests "*ClubContext*"
```

integration test — multi-club 시나리오:
- `X-Readmates-Club-Slug` 헤더 전송 → `ClubContextResolver`가 slug로 club 조회 확인
- `X-Readmates-Club-Host` 헤더 전송 (slug 없음) → host로 club 조회 확인, miss 시 `source = HOST_FALLBACK, context = null` 확인
- 두 헤더 모두 없음 → `RequestedClubContext(supplied = false, source = NONE, context = null)` 반환 확인
- `club_domains.status = 'ACTIVE'`인 hostname만 club 반환 확인 (`PROVISIONING`, `DISABLED`는 null 반환)

domain registration 흐름 검증:
```bash
# V21 migration 포함 Flyway 테스트
./server/gradlew -p server test --tests "com.readmates.support.MySqlFlywayMigrationTest"
```

기대: `V21__multi_club_platform.sql`이 정상 적용되고, `club_domains` 테이블의 `check constraint`가 허용된 status 값만 받는지 확인.

## 후속 작업

- Shared fallback domain host miss 처리는 ADR-0013에서 server-side safety net으로 확정됐다. 후속 변경이 필요하면 BFF host 전달 정책과 `ClubContextSource` 서버 해석을 함께 검토한다.
- `loadByHostname` 세션 캐시: 동일 hostname의 반복 조회를 캐시해 DB 쿼리를 줄인다. Optional Redis 계층과 연계해 검토한다.
- `club_domains.status` 자동 전환 운영 문서화: 도메인 등록 흐름의 각 단계, 실패 시 대응 방법, `HttpClubDomainActualStateChecker` 재시도 정책.
- Cloudflare API provisioning/live poller: 현재는 platform admin이 상태를 만들고 운영자가 provider console에서 연결한다. 자동 provisioning이 필요해지면 provider token 보관과 public-repo safety를 별도 ADR로 검토한다.
- club context resolution 결과를 로그에 포함: `clubId`, `resolvedBy`(`slug` | `host` | `none`)를 요청 로그에 추가해 debugging 가능성 향상.
