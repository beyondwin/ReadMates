# ADR-0013: BFF host 헤더 정책 — slug 명시 누락 vs host fallback 분기

- 상태: Accepted
- 결정일: 2026-05-11
- 작성자: server, security
- 관련: ADR-0001 (Cloudflare Pages BFF), ADR-0008 (multi-club domain — host header + slug 우선순위),
  post-mortem `docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`,
  spec `docs/superpowers/specs/2026-05-11-bff-host-header-policy-design.md`,
  plan `docs/superpowers/plans/2026-05-11-bff-host-header-policy-implementation-plan.md`,
  `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`,
  `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthMeController.kt`,
  `front/functions/api/bff/[[path]].ts`,
  `front/vite.config.ts`

## 컨텍스트

2026-05-11 production-only incident — `readmates.pages.dev`의 모든 클럽에서 멤버가 current session route에서 reading progress 저장, RSVP, 질문/한줄평 작성 직후 페이지가 "아직 열린 세션이 없습니다" 빈 상태로 collapse. dev에서는 미재현. 데이터 손실 없음. 자세한 timeline은 post-mortem 본문 참조.

### Root cause (코드 차원)

BFF(`front/functions/api/bff/[[path]].ts`, ADR-0001)는 **모든 요청**에 `X-Readmates-Club-Host` 헤더를 첨부한다 — 프런트엔드 API client가 route param을 `clubSlug` query로 붙였을 때만 BFF가 정규화한 `X-Readmates-Club-Slug`를 추가로 첨부한다.

Server `ClubContextResolver` (`server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt:19-47`)는 slug → host 순으로 lookup. 본 fix 이전 시그니처는 `RequestedClubContext(supplied: Boolean, context: ResolvedClubContext?)` 2개 필드. host로 supplied된 후 lookup이 실패하면 `supplied=true, context=null`로 반환되었다.

`AuthMeController.me()` (`server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthMeController.kt:25-71`)는 `supplied && context==null` 분기에서 `AuthMemberResponse.authenticatedUser(...)`(membershipStatus 없음)를 반환. 이 응답을 받은 frontend는 `canUseMemberApp(auth) == false`로 평가 → guest fallback path → 현재 라우트가 club-scoped인데도 빈 화면 렌더.

Dev에서는 Vite proxy(`front/vite.config.ts`)가 `X-Readmates-Club-Host`를 strip하므로 host fallback 자체가 발생하지 않는다 → dev/prod parity 깨짐 → production-only bug class.

Incident의 즉시 fix(commit `422a117`)는 frontend refresh handler에서 `useParams()`로 slug를 명시 전달해 *현장 1건*을 막은 것. 그 시점에는 BFF가 여전히 모든 요청에 host 헤더를 첨부하고, server가 host supplied + lookup miss를 *degraded auth*로 분기했으므로 동일 클래스 bug가 다른 라우트에서 잠복해 있었다.

### 결정해야 했던 문제

`supplied=true && context=null`이 두 가지 의미를 동시에 갖는다:

1. 클라이언트가 `X-Readmates-Club-Slug`로 명시적 slug를 supplied 했는데 해당 club이 `club_domains` / `clubs`에 존재하지 않음 → *클라이언트 버그* (잘못된 slug).
2. 클라이언트가 slug를 보내지 않았고 BFF가 자동으로 host 헤더를 첨부했는데 host가 등록된 club 도메인이 아님 (예: shared fallback `readmates.pages.dev`) → *명시적 club 식별 없음*과 동등.

기존 controller 분기는 이 두 경우를 같은 degraded 응답으로 처리해 dev/prod parity가 깨졌고, slug 명시 + lookup 실패가 *명시적 에러*로 surface되지 않았다.

## 결정

`ClubContextResolver`가 *resolution source*를 반환하도록 시그니처를 확장하고, `AuthMeController.me()`가 source에 따라 분기한다.

`server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt:7-17`:

```kotlin
enum class ClubContextSource {
    SLUG,
    HOST_FALLBACK,
    NONE,
}

data class RequestedClubContext(
    val supplied: Boolean,
    val source: ClubContextSource,
    val context: ResolvedClubContext?,
)
```

`AuthMeController.me()` 분기 (`server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthMeController.kt:35-54`):

- `source == SLUG && context == null` → `AuthApplicationException(CLUB_NOT_FOUND)` throw. `InvitationErrorHandler` (`server/src/main/kotlin/com/readmates/auth/adapter/in/web/InvitationErrorHandler.kt:49`)가 `HttpStatus.NOT_FOUND` + `code = "CLUB_NOT_FOUND"`로 매핑.
- `source == HOST_FALLBACK && context == null` → `AuthMemberResponse.from(sessionProfileMember, joinedClubs, platformAdmin)` 반환 — unscoped session profile. dev에서 host 헤더가 stripped된 경우와 동등한 응답.
- 그 외(club 식별 성공 + 멤버 없음 등)는 기존 "guest at other club" 분기 유지.

BFF, Vite proxy, frontend, DB schema 변경 없음.

## 근거

1. **단일 변경 지점**: 결정이 server-side 한 곳에 응집. BFF에 shared fallback host 목록을 두면 신규 클럽 도메인 추가 시 Cloudflare 환경 변수 갱신 + Pages 배포가 강제된다.
2. **책임의 응집**: club context resolution은 server의 도메인 로직(ADR-0008). BFF는 *전송*만 담당하는 게 자연스럽다.
3. **Dev/prod parity 자연스럽게 확보**: dev에서는 host 헤더가 없어 unscoped로 처리된다. server-side에서 HOST_FALLBACK + lookup 실패를 unscoped로 통일하면 prod 응답이 dev와 동일해진다.
4. **명시적 에러 분리**: slug supplied + lookup 실패는 진짜 클라이언트 버그(잘못된 slug). silent fallback이 아니라 명시적 404로 surface해야 후속 디버깅이 가능하다.
5. **Frontend 무변경**: incident의 즉시 fix(`useParams()` 명시 전달)는 *각 라우트의 책임*이고, 본 ADR은 *backend 안전망*. 두 layer가 독립적으로 동작.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| A — BFF-side: shared fallback host 목록을 BFF 환경 변수로 두고 그 호스트일 때만 host 헤더 미전송 | 신규 클럽 도메인 추가마다 BFF 배포 강제. 결정이 BFF와 server에 분산 → drift 위험. ADR-0008의 "BFF는 헤더 주입만 담당, 조회는 server"가 깨짐. |
| **B — Server-side: `source=HOST_FALLBACK && context==null`을 unscoped로 처리 (채택)** | (위 근거) |
| C — Combined (A + B) | 동일 결정이 두 곳에 강제됨. B만으로 충분. drift 위험만 추가. |
| D — `RequestedClubContext`에 raw host를 보존하고 controller가 직접 `club_domains`를 재조회 | resolver의 책임을 controller로 끌어옴. adapter/application 경계(ADR-0002) 위배. |
| E — `source` 필드 없이 `context == null`을 일괄 unscoped 처리 | slug 명시 + lookup 실패가 silent fallback으로 숨음. 잘못된 slug를 보내는 클라이언트 버그가 surface되지 않음. |
| F — BFF가 알 수 없는 host에 magic value(`__unknown__`) 전송 | server가 magic value를 해석. 디버그 가능성 ↓. 헤더 시맨틱이 "host 자체"에서 "host or marker"로 흐려짐. |

## 결과

긍정적:
- dev/prod parity 자연스럽게 확보 — server-side에서 HOST_FALLBACK + lookup 실패를 unscoped로 통일하면 prod 응답이 dev와 동일.
- 신규 클럽 도메인 추가 시 BFF 배포 부담 0. `club_domains`에 row 추가 + DNS 설정만으로 가능(ADR-0008과 동일 운영 모델).
- slug 명시 + lookup 실패가 *명시적 404 (`CLUB_NOT_FOUND`)*로 surface — silent fall-through 제거. 잘못된 slug를 보내는 클라이언트 버그가 즉시 드러남.
- `ClubContextSource` enum이 *명시적 의도*를 타입에 표현 — 향후 controller가 SLUG/HOST_FALLBACK 차이에 분기할 때 typed 접근 가능.

부정적/감수한 비용:
- `ClubContextSource`는 현재 `AuthMeController`만 사용. 다른 controller (`CurrentMemberArgumentResolver`, `MemberAuthoritiesFilter`, `SessionCookieAuthenticationFilter`)가 동일한 SLUG/HOST_FALLBACK 분기를 필요로 하는지는 후속 audit이 필요.
- Host fallback은 *약한 신호*다. 알 수 없는 host는 unscoped를 *hint*할 뿐, 명시적 에러는 아니다. 운영자가 "BFF가 잘못된 host를 보내고 있다"는 상황을 감지하려면 별도 로깅이 필요.
- `RequestedClubContext`에 default 인자를 두지 않았기 때문에 향후 `RequestedClubContext(...)` 직접 생성하는 코드가 추가되면 source 명시가 강제됨 — 의도된 비용(컴파일 타임에 책임 강제).

## 검증

신규 단위 테스트 — `ClubContextSource` enum이 정확히 분기되는지:
- `server/src/test/kotlin/com/readmates/club/adapter/in/web/ResolveClubContextRequestExtensionTest.kt` (6 시나리오: slug-only success/miss, host-only success/miss, slug+host 동시 supplied, 양쪽 없음).

업데이트된 controller 테스트 — `AuthMeController`의 신규 분기:
- `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt` — 기존 "slug supplied + unresolved" 케이스가 *degraded auth 응답* 기대 → *404 `CLUB_NOT_FOUND`* 기대로 변경. HOST_FALLBACK + lookup 실패 케이스 2건 추가 (incident 재현 + 정상 unscoped 응답 확인).

명령:

```bash
./server/gradlew -p server test          # 706+ tests green
./server/gradlew -p server test --tests "*ArchitectureBoundary*"
./server/gradlew -p server test --tests "*AuthMe*" --tests "*ClubContext*" --tests "*ResolveClubContextRequestExtension*"
```

Public-repo 게이트:

```bash
./scripts/public-release-check.sh
```

## 후속 작업

- `RequestedClubContext` 다른 consumer의 source-aware 분기 audit — `CurrentMemberArgumentResolver`, `MemberAuthoritiesFilter`, `SessionCookieAuthenticationFilter`가 SLUG vs HOST_FALLBACK 차이에 분기할 필요가 있는지 확인. 필요 시 별도 spec.
- Parity test (incident action item #1, P1) 재평가 — server-side 분기로 incident class를 잠갔으므로 시급성 더 낮아짐. BFF 헤더 의존 코드가 추가될 때 재평가.
- `club_domains.is_shared_fallback` 컬럼 검토 — host가 *명시적 fallback*인지 데이터 레이어에 표현. 본 ADR과 직교이지만, "BFF가 항상 host를 보낸다" + "어떤 host는 의도적으로 unmatched"를 명시화하는 후속 결정 후보.
- BFF host 헤더의 운영 가시성 보강 — 응답에 `X-Readmates-Resolved-Club-Source` echo 등 디버그 헤더 추가 검토. 별도 spec.
