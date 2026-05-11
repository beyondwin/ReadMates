# BFF Host Header Policy — Implementation Plan (ADR-0011)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** server-side `ClubContextResolver` + `AuthMeController` 분기 보강 + ADR-0011 본문 작성. Frontend / BFF / Vite proxy / DB schema 변경 없음. host fallback에서 lookup 실패한 경우를 *unscoped*로 처리해 dev/prod parity 확보.

**Architecture:** 
- `RequestedClubContext`에 `source: ClubContextSource` enum 추가 (SLUG / HOST_FALLBACK / NONE).
- `AuthMeController`가 source에 따라 분기 — slug + lookup 실패는 4xx, host_fallback + lookup 실패는 unscoped membership 응답.
- 다른 controller의 `requestedClubContext` 사용처는 본 plan 범위 밖 (audit 후속).

**Tech Stack:** Spring Boot 4 + Kotlin 2.2.0 + JDK 21. Spring controller / DTO / enum. Testcontainers MySQL. `ServerArchitectureBoundaryTest` 통과 필수.

**Spec:** `docs/superpowers/specs/2026-05-11-bff-host-header-policy-design.md`

---

## File map

수정 (server):
- `server/src/main/kotlin/com/readmates/club/.../ClubContextResolver.kt`
- `server/src/main/kotlin/com/readmates/club/.../RequestedClubContext.kt` (또는 동등 위치)
- `server/src/main/kotlin/com/readmates/auth/.../AuthMeController.kt`
- `server/src/main/kotlin/com/readmates/auth/.../AuthMemberResponse.kt` (필요 시)

신규 (server):
- `server/src/main/kotlin/com/readmates/club/.../ClubContextSource.kt` (enum, 또는 `RequestedClubContext.kt` 안에 sealed/enum)
- `server/src/main/kotlin/com/readmates/auth/.../ClubNotFoundException.kt` (이미 있으면 재사용)

수정 (test):
- `server/src/test/kotlin/com/readmates/club/.../ClubContextResolverTest.kt`
- `server/src/test/kotlin/com/readmates/auth/.../AuthMeControllerTest.kt`
- `server/src/test/kotlin/com/readmates/.../FrontendZodSchemaContractTest.kt` (response shape 변경 검증)

신규 (docs):
- `docs/development/adr/0011-bff-host-header-policy.md` (ADR 본문)
- (수정) `docs/development/adr/README.md` — 인덱스 행 추가

수정 금지:
- `front/functions/api/bff/[[path]].ts` (BFF 변경 없음)
- `front/vite.config.ts`
- `front/shared/api/client.ts`, `front/shared/auth/member-app-loader.ts`
- DB migration / schema
- 다른 controller (SessionsController 등) — 후속 audit
- `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md` (이미 머지된 incident spec)

---

## Task 1: 코드 인용 및 디렉토리 정확 위치 확인

**Files:** read-only

본 plan의 다른 모든 task가 의존. 라인 drift 흡수.

- [ ] **Step 1: ClubContextResolver / RequestedClubContext 정확 위치**

```bash
find server/src/main/kotlin -name "ClubContextResolver*" -o -name "RequestedClubContext*"
```

기대: 각 1개 파일. 위치를 메모.

- [ ] **Step 2: AuthMeController + AuthMemberResponse 정확 위치**

```bash
find server/src/main/kotlin -name "AuthMeController*" -o -name "AuthMemberResponse*"
```

- [ ] **Step 3: ClubContextHeader 위치**

```bash
grep -rn "ClubContextHeader" server/src/main/kotlin | head -5
```

- [ ] **Step 4: 현재 `RequestedClubContext` 시그니처 확인**

```bash
sed -n '1,40p' <Step 1에서 찾은 RequestedClubContext.kt 경로>
sed -n '1,80p' <Step 1에서 찾은 ClubContextResolver.kt 경로>
```

기대: spec에 인용된 시그니처와 일치. 다르면 본 plan의 Task 2~4를 *실제 시그니처에 맞춰 보정*.

- [ ] **Step 5: 다른 controller에서 `RequestedClubContext` 사용처 grep**

```bash
grep -rn "RequestedClubContext\|requestedClubContext" server/src/main/kotlin | grep -v "^.*\.test\." | head -30
```

결과를 메모 — 본 plan 범위 밖 사용처는 *시그니처 변경에 대한 영향*만 평가, 본문 동작은 변경 안 함.

- [ ] **Step 6: client-side에서 의도적으로 잘못된 slug를 보내는 곳 grep**

```bash
grep -rn "clubSlug:" front/src front/features --include="*.ts" --include="*.tsx" | grep -v "test\|spec" | head
```

slug supplied + lookup 실패 케이스가 새 4xx로 변경됨. 영향 받는 client 코드가 있으면 plan에서 처리.

기대: 0건 또는 명시적으로 잘못된 slug를 보내는 곳 없음.

---

## Task 2: `ClubContextSource` enum + `RequestedClubContext` 확장

**Files:** 수정 `server/.../RequestedClubContext.kt` (신규 enum 같은 파일에 두는 게 깔끔)

- [ ] **Step 1: enum 정의 추가**

`RequestedClubContext.kt` 상단에 enum 추가:

```kotlin
enum class ClubContextSource {
    SLUG,           // X-Readmates-Club-Slug header가 supplied
    HOST_FALLBACK,  // X-Readmates-Club-Host header만 supplied (slug 없음)
    NONE,           // 두 header 모두 없음
}
```

- [ ] **Step 2: `RequestedClubContext` data class 확장**

기존 정의:

```kotlin
data class RequestedClubContext(
    val supplied: Boolean,
    val context: ClubContext?,
)
```

다음으로 변경:

```kotlin
data class RequestedClubContext(
    val supplied: Boolean,
    val source: ClubContextSource,
    val context: ClubContext?,
) {
    companion object {
        fun unsupplied(): RequestedClubContext =
            RequestedClubContext(supplied = false, source = ClubContextSource.NONE, context = null)
    }
}
```

- [ ] **Step 3: 기존 사용처 컴파일 오류 수정**

다른 controller의 `RequestedClubContext(supplied = ..., context = ...)` 호출이 새 `source` 인자 없이 호출 → compile fail. 두 옵션:

(A) 모든 호출처에 `source` 명시 추가 — 안전한 default 값으로.
(B) 생성자에 default 값을 부여:

```kotlin
data class RequestedClubContext(
    val supplied: Boolean,
    val source: ClubContextSource = ClubContextSource.NONE,
    val context: ClubContext?,
)
```

→ **(A) 채택**. default를 두면 *명시적 supplied 의도*가 흐려짐. 컴파일 오류로 모든 호출처를 강제로 본다.

Task 1 Step 5에서 식별한 다른 controller의 사용처를 모두 grep하여 source 인자를 추가. 기존 동작과 동등한 source 값을 부여 (예: 기존 fallback에서 만든 것은 `HOST_FALLBACK`, slug 기반은 `SLUG`).

- [ ] **Step 4: 컴파일 통과 확인**

```bash
./server/gradlew -p server compileKotlin
```

기대: BUILD SUCCESSFUL. 실패 시 호출처 수정.

---

## Task 3: `ClubContextResolver` 분기 변경

**Files:** 수정 `server/.../ClubContextResolver.kt`

- [ ] **Step 1: 기존 `resolve(...)` 메서드 본문 교체**

```kotlin
fun resolve(request: HttpServletRequest): RequestedClubContext {
    val slug = request.getHeader(ClubContextHeader.CLUB_SLUG)
        ?.trim()?.takeIf { it.isNotEmpty() }
    if (slug != null) {
        return RequestedClubContext(
            supplied = true,
            source = ClubContextSource.SLUG,
            context = resolveBySlug(slug),
        )
    }
    val host = request.getHeader(ClubContextHeader.CLUB_HOST)
        ?.trim()?.takeIf { it.isNotEmpty() }
    if (host != null) {
        return RequestedClubContext(
            supplied = true,
            source = ClubContextSource.HOST_FALLBACK,
            context = resolveByHost(host),
        )
    }
    return RequestedClubContext.unsupplied()
}
```

(메서드 시그니처와 호출 방식은 Task 1 Step 4 결과에 맞춰 정확히 보정.)

- [ ] **Step 2: 검증**

```bash
./server/gradlew -p server compileKotlin
```

---

## Task 4: `AuthMeController` 분기 변경

**Files:** 수정 `server/.../AuthMeController.kt`

- [ ] **Step 1: 현재 분기 본문 확인**

`me(...)` 메서드의 `if (sessionProfileMember != null)` 블록을 spec의 결정 본문에 따라 교체.

- [ ] **Step 2: 새 분기 작성**

```kotlin
fun me(authentication: Authentication?, request: HttpServletRequest): AuthMemberResponse {
    val sessionProfileMember = authentication?.principal as? CurrentMember
    val requestedClubContext = clubContextResolver.resolve(request)

    if (sessionProfileMember == null) {
        return AuthMemberResponse.guest(/* 기존 guest 처리 */)
    }

    val requestedMember = requestedClubContext.context?.let { context ->
        memberDirectory.resolveByUserAndClub(sessionProfileMember.userId, context.clubId)
    }

    return when {
        // 명시적 슬러그 supplied + lookup 실패 — 클라이언트 잘못. 4xx.
        requestedClubContext.supplied
            && requestedClubContext.source == ClubContextSource.SLUG
            && requestedClubContext.context == null
        -> throw ClubNotFoundException(
            "Requested club slug not found in club_domains"
        )

        // 호스트 fallback supplied + lookup 실패 — implicit context로 간주, unscoped 응답.
        requestedClubContext.supplied
            && requestedClubContext.source == ClubContextSource.HOST_FALLBACK
            && requestedClubContext.context == null
        -> AuthMemberResponse.authenticatedUserWithMembership(
            userId = sessionProfileMember.userId,
            email = sessionProfileMember.email,
            joinedClubs = joinedClubs(sessionProfileMember.userId),
            platformAdmin = platformAdmin,
            membershipStatus = memberDirectory
                .resolveByUserUnscoped(sessionProfileMember.userId)
                ?.membershipStatus,
        )

        // 정상 club + member
        requestedMember != null
        -> AuthMemberResponse.authenticatedUserWithMembership(
            userId = sessionProfileMember.userId,
            email = sessionProfileMember.email,
            joinedClubs = joinedClubs(sessionProfileMember.userId),
            platformAdmin = platformAdmin,
            membershipStatus = requestedMember.membershipStatus,
        )

        // 명시적 supplied + member null (정상 — guest at other club)
        else
        -> AuthMemberResponse.authenticatedUser(
            userId = sessionProfileMember.userId,
            email = sessionProfileMember.email,
            joinedClubs = joinedClubs(sessionProfileMember.userId),
            platformAdmin = platformAdmin,
        )
    }
}
```

(메서드/타입 이름은 실제 코드와 일치하도록 Task 1 결과에 맞춰 보정. `resolveByUserUnscoped`가 기존에 없으면 *기존 unscoped path 재사용* 방법을 grep으로 확인.)

- [ ] **Step 2: `resolveByUserUnscoped` 또는 동등 메서드 확보**

```bash
grep -rn "resolveByUser\|memberDirectory\|membership" server/src/main/kotlin/com/readmates/auth | head -20
```

기존 코드에 *user 단독으로 active membership을 조회하는 path*가 있다면 그것을 재사용. 없다면:

- (옵션 X) `MemberDirectory` (또는 동등 port)에 `resolveByUserUnscoped(userId)` 메서드 추가.
- (옵션 Y) `joinedClubs` 결과 중 *기본 club*을 채택 (이전 dev 동작과 일치).

옵션 결정은 *기존 dev에서 unscoped 처리 방법*과 일치하도록. dev에서 `resolveByEmail(email)`가 active membership을 반환했다면 그것을 backend port로 노출.

- [ ] **Step 3: `ClubNotFoundException` 매핑**

ApiErrorResponse에서 `ClubNotFoundException`을 4xx로 매핑하는 핸들러가 있는지 확인:

```bash
grep -rn "ControllerAdvice\|ExceptionHandler" server/src/main/kotlin | head
```

없으면 spec의 `ApiErrorResponse` 정책에 맞춰 한 줄 핸들러 추가:

```kotlin
@ExceptionHandler(ClubNotFoundException::class)
fun handleClubNotFound(e: ClubNotFoundException): ResponseEntity<ApiErrorResponse> =
    ResponseEntity.status(HttpStatus.NOT_FOUND).body(
        ApiErrorResponse(
            code = "CLUB_NOT_FOUND",
            message = "Requested club slug is not registered",
            status = 404,
        )
    )
```

- [ ] **Step 4: 컴파일 통과**

```bash
./server/gradlew -p server compileKotlin
```

---

## Task 5: 단위/통합 테스트 추가/수정

**Files:** 수정/신규 `server/src/test/kotlin/...`

- [ ] **Step 1: `ClubContextResolverTest`**

다음 시나리오 단위 테스트:

- slug header만 있고 lookup 성공 → `(supplied=true, source=SLUG, context=non-null)`.
- slug header만 있고 lookup 실패 → `(supplied=true, source=SLUG, context=null)`.
- host header만 있고 lookup 성공 → `(supplied=true, source=HOST_FALLBACK, context=non-null)`.
- host header만 있고 lookup 실패 → `(supplied=true, source=HOST_FALLBACK, context=null)`.
- 두 header 모두 없음 → `(supplied=false, source=NONE, context=null)`.
- slug 우선순위: slug + host 둘 다 있어도 SLUG 우선.

- [ ] **Step 2: `AuthMeControllerTest`**

다음 시나리오:

- authenticated + slug supplied + lookup 성공 + member 있음 → 정상 membership 응답.
- authenticated + slug supplied + lookup 실패 → 4xx (`CLUB_NOT_FOUND`).
- authenticated + host fallback supplied + lookup 실패 (incident 재현) → unscoped membership 응답 (membershipStatus 채워짐).
- authenticated + host fallback supplied + lookup 성공 + member 없음 → guest at other club 응답.
- authenticated + 두 header 모두 없음 → 정상 unscoped 응답.

```bash
./server/gradlew -p server test --tests "*AuthMe*" --tests "*ClubContextResolver*"
```

- [ ] **Step 3: `FrontendZodSchemaContractTest` 보강**

response shape 변경 (membershipStatus가 더 자주 채워짐) — 기존 schema는 optional이므로 통과해야 함. 단 *추가된 분기*를 fixture로 고정:

```bash
./server/gradlew -p server test --tests "*FrontendZodSchemaContract*"
```

기대: 통과. 실패 시 fixture 갱신.

- [ ] **Step 4: ServerArchitectureBoundaryTest**

```bash
./server/gradlew -p server test --tests "*ArchitectureBoundary*"
```

기대: 통과 (adapter/application 경계 위배 없음).

- [ ] **Step 5: 전체 server test**

```bash
./server/gradlew -p server clean test
```

기대: 모두 통과.

---

## Task 6: Frontend zod fixture 일관성 확인

**Files:** 변경 가능 `front/tests/unit/__fixtures__/zod-schemas/...`

- [ ] **Step 1: fixture export 후 diff 확인**

```bash
pnpm --dir front zod:export-fixtures
git diff front/tests/unit/__fixtures__/zod-schemas/
```

기대: 변경 없음 (response shape는 추가만, schema는 optional 유지). 변경이 있으면 의도 검토 후 commit.

- [ ] **Step 2: front lint/test/build**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

기대: 모두 통과.

- [ ] **Step 3: e2e (route + auth + BFF + 사용자 흐름 변경이라 필수)**

```bash
pnpm --dir front test:e2e
```

기대: 통과. 특히 `current-session` 시나리오와 club-scoped path mount.

---

## Task 7: ADR-0011 본문 작성

**Files:** 신규 `docs/development/adr/0011-bff-host-header-policy.md`

- [ ] **Step 1: ADR 번호 확인**

```bash
ls docs/development/adr/ | grep -E "^[0-9]{4}-" | sort | tail -3
```

기대: `0010-...` 가 마지막. `0011`이 다음 번호. 만약 0011 또는 0012가 이미 있으면 *다음 빈 번호 재할당*.

- [ ] **Step 2: 본문 작성**

ADR 템플릿(`docs/development/adr/template.md`) 그대로 사용. 섹션:

- **상태**: Accepted (코드와 함께 머지)
- **결정일**: 2026-05-11
- **작성자**: server / front
- **관련**: ADR-0001, ADR-0008, post-mortem `2026-05-11-current-session-refresh-club-context.md`, spec `2026-05-11-bff-host-header-policy-design.md`

- **컨텍스트**: 
  - 2026-05-11 production-only incident (current-session refresh 빈 화면 collapse).
  - root cause: BFF가 *모든 요청*에 host 헤더 첨부 + server가 *host로만 supplied*된 경우 lookup 실패 시 degraded auth로 fall through.
  - dev/prod parity 깨짐 — Vite proxy는 host 헤더 strip, Pages function은 항상 첨부.

- **결정**: server-side `ClubContextResolver`에 `ClubContextSource` (SLUG/HOST_FALLBACK/NONE) 추가. `AuthMeController`가 source에 따라 분기:
  - SLUG + lookup 실패 → 4xx (`CLUB_NOT_FOUND`).
  - HOST_FALLBACK + lookup 실패 → unscoped membership 응답 (dev와 동등).
  - 기타 → 기존 동작.
  - BFF / Vite / frontend 변경 없음.

- **근거**: spec의 "왜 Server-side (B)인가" 4가지 그대로 인용.

- **대안**: spec의 대안 표 그대로 (A/B/C/D/E/F).

- **결과 (긍정)**:
  - dev/prod parity 자연스럽게 확보.
  - 신규 클럽 도메인 추가 시 BFF 배포 부담 0.
  - slug 명시 + lookup 실패가 *명시적 에러*로 분리됨 (silent fall-through 제거).
- **결과 (감수)**:
  - `ClubContextSource` enum이 다른 controller로 점진 전파 필요 (후속 audit).
  - host fallback이 *unscoped로 폴백*되므로 host 기반 *명시적 club 격리*가 약해짐 — 단 이는 *원래 host가 hint인지 hard signal인지*의 명시적 결정.

- **검증**: 
  - `./server/gradlew -p server test --tests "*ClubContextResolver*" --tests "*AuthMe*"`.
  - `pnpm --dir front test:e2e` (current-session 시나리오 통과).
  - Production manual repro: incident 재현 절차 → 정상 화면 유지.

- **후속**:
  - 다른 controller의 `requestedClubContext.supplied && context==null` 사용처 audit.
  - parity test (post-mortem action item P1) 시급성 재평가.
  - `club_domains.is_shared_fallback` 컬럼 검토.

- [ ] **Step 3: 인덱스 갱신**

`docs/development/adr/README.md`의 인덱스 표에 0011 행 추가:

```markdown
| 0011 | BFF host 헤더 정책 (server-side fallback) | Accepted | 2026-05-11 | server, security |
```

- [ ] **Step 4: post-mortem follow-up 갱신 이력에 한 줄 추가**

`docs/operations/postmortems/2026-05-11-current-session-refresh-club-context.md`의 *Follow-up 갱신 이력* 표에 행 추가:

```markdown
| 2026-05-11 | Action item #2 → Closed (ADR-0011 머지 완료) | `docs/development/adr/0011-bff-host-header-policy.md` |
```

(post-mortem-followup-consolidation plan에서 이 이력 표를 먼저 만들었음을 가정. 없으면 그 plan 먼저 실행.)

- [ ] **Step 5: public release 검증**

```bash
./scripts/public-release-check.sh
```

기대: 통과.

---

## Task 8: 최종 검증

- [ ] **Step 1: 전체 server test**

```bash
./server/gradlew -p server clean test
```

기대: 통과 (707개 + 신규 케이스).

- [ ] **Step 2: 전체 front check**

```bash
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build && pnpm --dir front test:e2e
```

기대: 모두 통과.

- [ ] **Step 3: Production manual repro 절차 (배포 후 권고)**

1. 배포 완료 확인 (`./scripts/smoke-production-integrations.sh`).
2. `https://readmates.pages.dev/clubs/reading-sai/app/session/current` 접근.
3. 멤버로 로그인. reading progress 조정 후 저장.
4. 빈 상태가 *발생하지 않음*을 확인.
5. (옵션) network panel에서 `/api/auth/me`가 `clubSlug` 없이 호출되더라도 `membershipStatus`가 응답에 포함됨 확인.

- [ ] **Step 4: 게이트**

```bash
./scripts/public-release-check.sh
./scripts/verify-public-release-fixtures.sh
```

---

## Task 9: Commit 분리

권고 commit 분리:

1. **server 코드 + 테스트** — `feat(auth): differentiate slug vs host-fallback club context source` 또는 `fix(auth): treat host-only club lookup miss as unscoped`.
2. **ADR-0011 + 인덱스 + post-mortem 갱신** — `docs(adr): add ADR-0011 BFF host header policy`.
3. **본 spec/plan** — `docs(superpowers): add 2026-05-11 BFF host header policy spec/plan`.

각 commit은 *독립적으로 build/test 통과*해야 함. spec/plan만 별도 push 가능.

(실제 commit은 사용자 트리거 시.)

---

## 위험과 완화 (실행 시점)

| 위험 | 완화 |
|------|------|
| 다른 controller의 `RequestedClubContext` 사용처가 컴파일 fail | Task 1 Step 5에서 사전 grep. Task 2 Step 3에서 모두 source 인자 추가 (default 없음). |
| `resolveByUserUnscoped` 메서드가 기존에 없음 | Task 4 Step 2에서 옵션 X/Y 결정. 기존 dev 동작과 일치. |
| ADR-0011 번호 충돌 (병행 ADR 세션이 0011~0012 reserved) | Task 7 Step 1에서 last 번호 확인 후 다음 빈 번호 재할당. spec/plan/post-mortem cross-link도 동기화. |
| Frontend Zod schema fixture가 변경 (membershipStatus가 더 자주 채워짐) | Task 6 Step 1에서 diff 검토. *추가만*은 schema optional이라 안전. |
| Production 배포 후 *기존 dev에서 못 본 edge case* 발견 | Step 3 manual repro에서 한 번 더. e2e가 club-scoped path mount를 커버하므로 1차 안전망. |
| `ClubNotFoundException`이 기존에 없거나 다른 의미로 사용됨 | Task 4 Step 3에서 grep으로 확인. 신규면 추가, 기존이면 의미 일치 여부 확인. |

---

## 완료 조건

- [ ] Task 1~9 모두 완료.
- [ ] Server / front 전체 테스트 통과.
- [ ] ADR-0011 본문 작성 + 인덱스 갱신 + post-mortem 이력 추가.
- [ ] Public release 게이트 green.
- [ ] (선택) Production 배포 후 manual repro로 incident 재발 없음 확인.
