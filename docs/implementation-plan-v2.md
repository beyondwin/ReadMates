# ReadMates 구현 플랜 v2

*작성일: 2026-05-08 / `docs/improvements-v2.md` 기반 / 대상 버전: v1.5.2 이후*

## 개요

본 문서는 `docs/improvements-v2.md`(두 번째 시야 분석)에서 도출된 항목을
**PR 단위로 실행 가능한 30개 task(TASK-V2-001 ~ TASK-V2-030)**로 분해한 실행
계획이다. v1 plan(`docs/implementation-plan.md`, TASK-001 ~ TASK-076)이 거대 파일
분해/CI 가드/보안 history 정비에 집중했다면, v2 plan은 **도메인 모델 진화,
트랜잭션·관측성 경계, UseCase 인터페이스 디자인, 무료 플랜에서의 사용자 체감
성능, 멀티 클럽 운영 가시화**를 다룬다.

### v1 plan과의 관계

- **번호 규칙**: v1은 `TASK-XXX`(3자리). v2는 `TASK-V2-XXX` prefix를 둬서
  collision을 피한다.
- **Phase 명명**: v1은 Phase 0~5(시간 순). v2는 Phase 0/A/B/C/D/E(주제별).
  두 plan의 Phase를 1:1로 매핑하지 말 것 — 의도가 다르다.
- **중복 방지**: v1이 이미 다루는 항목(거대 파일 분해, history scrub, CSS split,
  typed-response, lazy loading 자체, OpenAPI codegen, multi-secret rotation 등)은
  v2에서 다시 만들지 않는다. 보강이 필요한 경우 `v1 연관` 필드에 cross-ref만
  남긴다.
- **권장 진행 순서**: v1 Phase 0 + v2 Phase 0 → v1 Phase 1·2 + v2 Phase A·B → ...

### v1 선행 작업 미완료 현황 (2026-05-08 기준)

아래 v1 작업들이 아직 main에 머지되지 않은 상태에서 v2 plan을 실행한다.
각 v2 task별 **standalone 구현 경로**를 명시하며, 실행 시 이 섹션을 우선 참고한다.

| 미완료 v1 task | 영향받는 v2 task | 분류 | standalone 경로 |
| --- | --- | --- | --- |
| TASK-017 (RateLimit IP hash helper) | TASK-V2-028 | 소프트 | `ClientIpHashing.kt` 파일이 없으면 신규 생성 후 진행 |
| TASK-025 (HostSessionCommandService split) | TASK-V2-010 | 소프트 | 기존 단일 `HostSessionCommandService`에 두 인터페이스를 `implements`하는 방식으로 구현 |
| TASK-027 (@Transactional isolation 명시) | TASK-V2-012 | 소프트 | isolation 명시 없이 `@Transactional` 위치 이동만 수행 |
| TASK-042 (form/effects split) | TASK-V2-021 | 소프트 | split 미완료 상태의 전체 `HostSessionEditorPage.tsx`(또는 현재 파일명)에 useReducer + memo 적용 |
| TASK-050 (라우트별 lazy loading) | TASK-V2-019 | 소프트 | React Router v7 `lazy()` option으로 독립 구현. v1 TASK-050 conflict 없음 |
| TASK-071 (BFF multi-secret rotation) | TASK-V2-029 | **하드** | **SKIP** — multi-secret alias 개념 없이 구현 불가. v1 TASK-071 머지 후 재개 |
| TASK-072 (e2e cross-browser matrix) | TASK-V2-027 | 소프트 | chromium-only parallel + shard 독립 적용. v1 TASK-072 머지 후 matrix 확장 |
| TASK-075 (Kafka worker ADR only) | TASK-V2-018 | 소프트 | ADR을 본 task에서 신규 작성. v1 TASK-075가 없으므로 ADR + feature flag + conditional bean 모두 본 task에서 초안 |

> **실행 규칙**: 위 표에서 "소프트"로 표시된 task는 standalone 경로로 구현한다.
> "하드"로 표시된 TASK-V2-029는 자동으로 **SKIP**한다.

### 무료 Cloudflare 플랜 전제 조건

- public API의 캐싱 전략은 **CDN Cache Rules에 의존하지 않는다**. 대신 다음
  2단 구조를 사용한다.
  1. Spring server가 `Cache-Control: public, max-age=..., s-maxage=...`를 응답으로
     보내 **브라우저의 HTTP cache**가 stale-while-revalidate를 수행하게 한다.
  2. Pages Functions BFF가 `caches.default` Cache API로 GET-only `/api/bff/api/public/**`
     응답을 in-PoP 캐시한다(무료 플랜에서도 사용 가능). cookie/credential은 cache key에
     포함하지 않는다.
- Pages Functions(Workers runtime)는 `caches.default.match`/`put` API를 사용할 수
  있고 `ctx.waitUntil`로 background revalidate를 큐잉할 수 있다.

### Flyway version 사전 할당

V22까지 사용 중. v2 plan에서 추가하는 migration은 다음과 같이 미리 예약한다.

| version | 사용 task | 내용 |
| --- | --- | --- |
| `V23__sessions_state_visibility_invariant.sql` | TASK-V2-003 | sessions state×visibility CHECK 제약 |
| `V24__legacy_password_hash_rename.sql` | TASK-V2-022 | `users.password_hash` → `legacy_password_hash` rename |
| `V25__drop_legacy_password_hash.sql` | TASK-V2-023 (후속) | 다음 release tag에서 drop |
| `V26__notification_test_mail_audit_index.sql` | (선택) | reserved, 본 plan 범위 밖 |

---

## Phase별 구현 계획

### Phase 0: Quick Wins (1주 이내)

- TASK-V2-001 Backlog Gauge 캐싱 (P0)
- TASK-V2-002 Public API Cache-Control + BFF Cache API (P1)
- TASK-V2-003 sessions state×visibility check constraint (P1)
- TASK-V2-004 BFF Set-Cookie Domain attribute strip (P1)
- TASK-V2-005 RoleHierarchy bean 도입 (P2)
- TASK-V2-006 traceId MDC + response header (P1)

### Phase A: 아키텍처 정리 (2~4주)

- TASK-V2-010 UseCase 인터페이스 분할(`HostSessionLifecycleUseCase` /
  `HostSessionDraftUseCase`)
- TASK-V2-011 `auth/application/` 직속 service를 `auth/application/service/`로 이동
- TASK-V2-012 `@Transactional`을 adapter→application service로 이동
- TASK-V2-013 `MembershipStatus` finite state machine 명시

### Phase B: 관측성·신뢰성 (2~4주, A와 병행)

- TASK-V2-015 metric tag policy ADR + 코드 주석
- TASK-V2-016 Dynamic allowed origins resolver(`AllowedOriginPort`)
- TASK-V2-017 health endpoint liveness/readiness 구분 문서화
- TASK-V2-018 Kafka relay/consumer worker process 분리 ADR (v1 TASK-075 보강)

### Phase C: 사용자 체감 성능·UX (2~4주)

- TASK-V2-019 라우트 lazy 분할(`router.tsx`)
- TASK-V2-020 archive detail query batching (14 → ≤ 4 prepareStatement)
- TASK-V2-021 `host-session-editor` useReducer + memo
- TASK-V2-025 frontend zod runtime validator (host-side critical contract만)

### Phase D: 멀티 클럽 운영 (선택, 4~8주)

- TASK-V2-014 `ClubLifecycleService` 도입 (`SETUP_REQUIRED→ACTIVE` 전이 응축)
- TASK-V2-022 `users.password_hash` → `legacy_password_hash` rename (Step 1)
- TASK-V2-023 legacy password column drop (Step 2, 후속 release)
- TASK-V2-024 `support_access_grants` 운영 procedure + audit UI surface

### Phase E: Contract 자동화 (2~4주, A 완료 후)

- TASK-V2-026 server-side contract bridge test (frontend fixture key set 비교)
- TASK-V2-027 e2e parallel + shard 설정 (v1 TASK-072 보강)
- TASK-V2-028 IP hash salt 주간 회전
- TASK-V2-029 BFF rotation audit log table (v1 TASK-071 보강)
- TASK-V2-030 frontend zod schema CI gate (TASK-V2-025 → TASK-V2-026 cross-validate)

---

## Task 목록

### TASK-V2-001: Backlog Gauge 캐싱

- **Phase**: 0
- **우선순위**: P0
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/notification/application/service/CachedNotificationBacklogProvider.kt` (신규)
  - `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt` (Gauge 콜백 → cached snapshot 사용으로 교체)
  - `server/src/main/kotlin/com/readmates/ReadmatesApplication.kt` (`@EnableScheduling` 미적용 시 추가)
  - `server/src/test/kotlin/com/readmates/notification/application/service/CachedNotificationBacklogProviderTest.kt` (신규)
- **구현 단계**:
  1. `notification/application/service/` 패키지에 `CachedNotificationBacklogProvider`를
     `@Service`로 신규 생성. 같은 패키지의 다른 service는 모두 `@Service`이므로
     일관성을 위해 `@Component`가 아닌 `@Service`를 사용한다.
     ```kotlin
     package com.readmates.notification.application.service

     import com.readmates.notification.application.model.NotificationDeliveryBacklog
     import com.readmates.notification.application.port.out.NotificationDeliveryPort
     import org.springframework.scheduling.annotation.Scheduled
     import org.springframework.stereotype.Service
     import java.util.concurrent.atomic.AtomicReference

     @Service
     class CachedNotificationBacklogProvider(
         private val notificationDeliveryPort: NotificationDeliveryPort? = null,
     ) {
         private val cached = AtomicReference(EMPTY)

         @Scheduled(fixedDelay = REFRESH_INTERVAL_MS, initialDelay = INITIAL_DELAY_MS)
         fun refresh() {
             val port = notificationDeliveryPort ?: return
             cached.set(port.deliveryBacklog())
         }

         fun snapshot(): NotificationDeliveryBacklog = cached.get()

         private companion object {
             const val REFRESH_INTERVAL_MS = 60_000L
             const val INITIAL_DELAY_MS = 5_000L
             val EMPTY = NotificationDeliveryBacklog(pending = 0, failed = 0, dead = 0, sending = 0)
         }
     }
     ```
  2. `ReadmatesOperationalMetrics`의 생성자에 `cachedBacklogProvider`를 추가하고
     `registerOutboxBacklogGauges()` 안의 콜백을 cached snapshot 호출로 교체한다.
     ```kotlin
     class ReadmatesOperationalMetrics(
         private val meterRegistry: MeterRegistry,
         private val notificationDeliveryPort: NotificationDeliveryPort? = null,
         private val cachedBacklogProvider: CachedNotificationBacklogProvider? = null,
     ) {
         // ...
         private fun registerOutboxBacklogGauges() {
             val provider = cachedBacklogProvider ?: return
             OutboxBacklogStatus.entries.forEach { status ->
                 Gauge.builder("readmates.notifications.outbox.backlog") {
                     provider.snapshot().count(status).toDouble()
                 }
                     .description("Current email notification delivery rows by status")
                     .tag("status", status.tag)
                     .register(meterRegistry)
             }
         }
     }
     ```
     `notificationDeliveryPort` 생성자 인자는 backward compat을 위해 그대로 둔다(테스트
     의존성 주입 호환). registration은 provider 기준.
  3. `ReadmatesApplication.kt`에 `@EnableScheduling`이 없으면 추가. 이미 있으면
     skip.
  4. `CachedNotificationBacklogProviderTest`로 (a) 초기 snapshot이 EMPTY이고
     (b) `refresh()` 호출 후 port 결과로 cached가 갱신됨을 검증.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*CachedNotificationBacklogProvider*' --tests '*ReadmatesOperationalMetrics*'`
  - 로컬 boot 후 `curl -s :8081/actuator/prometheus | grep readmates_notifications_outbox_backlog`로
    값 노출 확인.
  - `MySqlQueryPlanTest`/`ServerQueryBudgetTest` 회귀 없음.
- **v1 연관**: 없음 (v1 plan에 backlog gauge 항목 없음).

---

### TASK-V2-002: Public API Cache-Control + BFF Cache API

- **Phase**: 0
- **우선순위**: P1
- **난이도**: M
- **예상 소요**: 1일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/{public,club,session}/adapter/in/web/*.kt` —
    `/api/public/**` GET endpoint에 `CacheControl` 추가
  - `front/functions/api/bff/[[path]].ts` (cache hit/miss 로직 + `ctx.waitUntil` 추가)
  - `front/functions/_shared/cache.ts` (신규: cache key 빌더, 적격성 판정)
  - `front/tests/unit/cloudflare-bff.test.ts` (cache hit/miss 케이스)
  - `docs/development/architecture.md`("Optional Redis 계층" 아래 "Public API browser+BFF cache" subsection)
- **구현 단계**:
  1. `/api/public/**` GET endpoint들 중 응답 body가 stable한 것(`/api/public/clubs/{slug}`,
     `/api/public/clubs/{slug}/sessions/{sessionId}`, public records 목록 등)에
     `CacheControl` 헤더를 추가한다.
     ```kotlin
     // server/src/main/kotlin/com/readmates/public/adapter/in/web/PublicClubController.kt 예시
     @GetMapping("/api/public/clubs/{slug}")
     fun getPublicClub(@PathVariable slug: String): ResponseEntity<PublicClubResponse> {
         val response = useCase.find(slug)
         return ResponseEntity.ok()
             .cacheControl(
                 CacheControl.maxAge(Duration.ofMinutes(2))
                     .cachePublic()
                     .staleWhileRevalidate(Duration.ofMinutes(10)),
             )
             .body(response)
     }
     ```
     주의: 사용자 식별 정보가 응답에 들어가는 endpoint(예: `Set-Cookie`가 동반되는 경로)는
     **public cache 대상에서 제외**. PII가 없는 club/session/records 응답에만 적용.
  2. `front/functions/_shared/cache.ts`에 cache 정책 helper를 만든다.
     ```ts
     // front/functions/_shared/cache.ts
     export const PUBLIC_CACHEABLE_PATH_PREFIXES = [
       "/api/public/clubs/",
       "/api/public/records",
     ] as const;

     export function isPublicCacheableRequest(method: string, upstreamPath: string): boolean {
       if (method !== "GET") return false;
       return PUBLIC_CACHEABLE_PATH_PREFIXES.some((p) => upstreamPath.startsWith(p));
     }

     export function buildPublicCacheKey(request: Request, upstreamPath: string): Request {
       const url = new URL(request.url);
       // 동일 path에 query만 다르면 별도 cache entry로 다룸; cookie/auth는 무시.
       const cacheUrl = new URL(url.pathname + url.search, url.origin);
       return new Request(cacheUrl.toString(), { method: "GET" });
     }

     export function isCacheableUpstreamResponse(response: Response): boolean {
       if (!response.ok) return false;
       const cacheControl = response.headers.get("Cache-Control") ?? "";
       if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;
       // upstream이 set-cookie를 보내면 PII 가능성, cache 대상 제외
       const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] })
         .getSetCookie?.() ?? [];
       if (setCookies.length > 0) return false;
       // Vary: Cookie 또는 Vary: Authorization도 회피 — 이번 응답엔 cookie가 없어도
       // upstream이 cookie 별 분기 의도를 표시한 것이라 cache가 잘못된 응답을 반환할
       // 위험이 있다.
       const vary = response.headers.get("Vary")?.toLowerCase() ?? "";
       if (vary.includes("cookie") || vary.includes("authorization")) return false;
       return cacheControl.includes("public") || cacheControl.includes("max-age");
     }
     ```
  3. `front/functions/api/bff/[[path]].ts`의 `onRequest`에 cache 분기 추가.
     ```ts
     import {
       buildPublicCacheKey,
       isCacheableUpstreamResponse,
       isPublicCacheableRequest,
     } from "../../_shared/cache";

     type PagesFunction<Env> = (context: {
       request: Request;
       env: Env;
       params: Record<string, string | string[] | undefined>;
       waitUntil: (promise: Promise<unknown>) => void;
     }) => Response | Promise<Response>;

     // ... onRequest 안에서, upstream fetch 직전 ...
     const cacheable = isPublicCacheableRequest(context.request.method, upstreamPath);
     const cacheKey = cacheable ? buildPublicCacheKey(context.request, upstreamPath) : null;

     if (cacheKey) {
       const hit = await caches.default.match(cacheKey);
       if (hit) {
         const headers = new Headers(hit.headers);
         headers.set("X-Readmates-Cache", "HIT");
         return new Response(hit.body, { status: hit.status, headers });
       }
     }

     // 기존 fetch ...
     const upstream = await fetch(/* ... */);

     const responseBody = /* 기존 로직 */;
     const responseHeaders = copyUpstreamHeaders(upstream.headers);
     const finalResponse = new Response(responseBody, {
       status: upstream.status,
       headers: responseHeaders,
     });

     if (cacheKey && isCacheableUpstreamResponse(upstream)) {
       const toCache = finalResponse.clone();
       context.waitUntil(caches.default.put(cacheKey, toCache));
       finalResponse.headers.set("X-Readmates-Cache", "MISS");
     }

     return finalResponse;
     ```
     주의:
     - `caches.default`는 PoP-local 캐시이며, 무료 플랜에서도 사용 가능.
     - `context.waitUntil`은 Pages Functions context의 표준 멤버. `PagesFunction<Env>`
       타입 정의에 추가해야 한다(현재 자체 정의). v1 TASK-051이 `@cloudflare/workers-types`를
       도입하므로 그 후 재정의 가능.
     - cookie/`Authorization` header는 cache key에 포함하지 않는다. PII 누수
       방지 차원에서 `isCacheableUpstreamResponse`가 `Set-Cookie`를 검출하면 cache-skip.
  4. `front/tests/unit/cloudflare-bff.test.ts`에 다음 케이스 추가:
     - 첫 GET `/api/bff/api/public/clubs/sample`: upstream 1회 호출, 응답에
       `X-Readmates-Cache: MISS`.
     - 동일 두 번째 호출: upstream 0회 호출, `X-Readmates-Cache: HIT`.
     - upstream이 `Set-Cookie`를 보내면 cache-put 호출되지 않음.
     - POST는 cache 분기 진입하지 않음.
     - cache stub: `globalThis.caches = { default: { match: vi.fn(), put: vi.fn() } }`.
  5. `docs/development/architecture.md`의 "Optional Redis 계층" section 아래에
     subsection 추가: "Public API browser+BFF cache: 무료 Cloudflare 플랜에서 CDN
     Cache Rules 없이 (1) Spring `Cache-Control` 헤더로 브라우저 캐시 (2) Pages
     Functions `caches.default`로 PoP 캐시를 사용한다."
- **검증 방법**:
  - `pnpm --dir front lint && pnpm --dir front test --filter cloudflare-bff`
  - `./server/gradlew -p server test --tests '*PublicClubController*'`
  - 로컬 dev server에서 동일 public endpoint를 두 번 호출하고 두 번째에서
    `X-Readmates-Cache: HIT` 확인 (`pnpm --dir front dev` + curl).
- **v1 연관**: v1 TASK-051 (`@cloudflare/workers-types` 도입) 완료 후
  `PagesFunction<Env>` 타입을 공식 타입으로 교체 권장.

---

### TASK-V2-003: sessions state×visibility CHECK 제약

- **Phase**: 0
- **우선순위**: P1
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `server/src/main/resources/db/mysql/migration/V23__sessions_state_visibility_invariant.sql` (신규)
  - `server/src/test/kotlin/com/readmates/migration/MySqlFlywayMigrationTest.kt` (자동 회귀)
  - `server/src/test/kotlin/com/readmates/session/.../SessionInvariantConstraintTest.kt` (신규, 위반 시 SQLException 검증)
- **구현 단계**:
  1. Flyway migration 생성:
     ```sql
     -- V23__sessions_state_visibility_invariant.sql
     -- PUBLISHED 세션은 HOST_ONLY로 둘 수 없다(공개 발행 의미와 충돌).
     alter table sessions
       add constraint sessions_published_visibility_check
         check (state <> 'PUBLISHED' or visibility in ('MEMBER', 'PUBLIC'));

     -- DRAFT 세션을 곧바로 PUBLIC으로 두는 것은 application 정책상 위험하므로
     -- HOST_ONLY 또는 MEMBER 범위만 허용한다(`docs/development/architecture.md`
     -- 'sessions.visibility' 섹션 참고).
     alter table sessions
       add constraint sessions_draft_visibility_check
         check (state <> 'DRAFT' or visibility in ('HOST_ONLY', 'MEMBER'));
     ```
  2. 기존 row가 위반하지 않는지 사전 확인 SQL을 PR 본문에 첨부:
     ```sql
     select id, state, visibility from sessions
       where (state = 'PUBLISHED' and visibility = 'HOST_ONLY')
          or (state = 'DRAFT' and visibility = 'PUBLIC');
     ```
     운영 dump에서 매치되는 row가 있으면 그 row를 먼저 정정하는 backfill SQL을
     동일 migration의 `update` 절로 함께 둔다.
  3. `SessionInvariantConstraintTest`에서 `INSERT ... PUBLISHED + HOST_ONLY` 시도 시
     `DataIntegrityViolationException`이 발생하는지 확인.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*MySqlFlywayMigrationTest*' --tests '*SessionInvariantConstraintTest*'`
  - `./server/gradlew -p server test`(전체 회귀, 기존 fixture row가 invariant 위반하지
    않는지)
- **v1 연관**: 없음.

---

### TASK-V2-004: BFF Set-Cookie Domain attribute strip

- **Phase**: 0
- **우선순위**: P1
- **난이도**: S
- **예상 소요**: 1시간
- **관련 파일**:
  - `front/functions/_shared/proxy.ts` (`copyUpstreamHeaders` 안의 set-cookie 처리)
  - `front/tests/unit/cloudflare-bff.test.ts` (Domain strip 케이스)
- **구현 단계**:
  1. `proxy.ts`에 cookie sanitizer 추가:
     ```ts
     // front/functions/_shared/proxy.ts
     export function stripCookieDomain(rawSetCookie: string): string {
       // ;space*Domain=... 부분(다음 ; 또는 EOL까지) 제거
       return rawSetCookie.replace(/;\s*Domain=[^;]*/i, "");
     }
     ```
  2. `copyUpstreamHeaders`에서 set-cookie를 append할 때 모두 `stripCookieDomain`을
     거치도록 변경:
     ```ts
     export function copyUpstreamHeaders(headers: Headers) {
       const copiedHeaders = new Headers(headers);
       copiedHeaders.delete("set-cookie");
       copiedHeaders.delete("x-readmates-bff-secret");
       copiedHeaders.delete("x-readmates-client-ip");
       copiedHeaders.delete("x-readmates-club-host");
       copiedHeaders.delete("x-readmates-club-slug");

       const setCookies = (headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
       for (const cookie of setCookies) {
         copiedHeaders.append("set-cookie", stripCookieDomain(cookie));
       }

       if (setCookies.length === 0) {
         const setCookie = headers.get("set-cookie");
         if (setCookie) {
           copiedHeaders.append("set-cookie", stripCookieDomain(setCookie));
         }
       }

       return copiedHeaders;
     }
     ```
  3. 테스트 케이스 3종 추가:
     - upstream이 `Set-Cookie: foo=bar; Path=/; Domain=upstream.example.com; HttpOnly`를
       보내면 BFF가 forward한 cookie에 `Domain=`이 없어야.
     - Domain attribute가 없는 cookie는 변경 없이 forward.
     - 여러 Set-Cookie line(`getSetCookie()` 다중 반환) 모두에 대해 strip 적용.
- **검증 방법**:
  - `pnpm --dir front test --filter cloudflare-bff`
  - `pnpm --dir front lint && pnpm --dir front build`
- **v1 연관**: 없음 (v1 TASK-016 BFF redirect host allowlist와 별개의 surface).

---

### TASK-V2-005: RoleHierarchy bean 도입

- **Phase**: 0
- **우선순위**: P2
- **난이도**: S
- **예상 소요**: 1시간
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
    (`hasAnyRole(...)` → `hasRole(...)` 단순화, `RoleHierarchy` bean 추가)
  - `server/src/test/kotlin/com/readmates/auth/.../SecurityRoleHierarchyTest.kt` (신규)
- **구현 단계**:
  1. `SecurityConfig`에 다음 bean 추가(같은 파일 또는 같은 패키지의 신규 파일):
     ```kotlin
     import org.springframework.security.access.hierarchicalroles.RoleHierarchy
     import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl

     @Bean
     fun roleHierarchy(): RoleHierarchy {
         val hierarchy = RoleHierarchyImpl()
         hierarchy.setHierarchy(
             """
             ROLE_PLATFORM_ADMIN > ROLE_HOST
             ROLE_HOST > ROLE_MEMBER
             ROLE_MEMBER > ROLE_VIEWER
             """.trimIndent(),
         )
         return hierarchy
     }

     @Bean
     fun methodSecurityExpressionHandler(roleHierarchy: RoleHierarchy) =
         org.springframework.security.web.access.expression.DefaultWebSecurityExpressionHandler().apply {
             setRoleHierarchy(roleHierarchy)
         }
     ```
     주의: `RoleHierarchy` 빈의 자동 감지는 Spring Security **6.3+**의
     `WebExpressionAuthorizationManager`부터 작동한다. 본 task 시작 시점의
     `server/build.gradle.kts` Spring Security 버전을 먼저 확인하고, 6.3 미만이면
     `securityFilterChain` 내부에서 `WebExpressionAuthorizationManager`에 명시적으로
     `RoleHierarchy`를 주입해야 한다(검증:
     `./server/gradlew -p server test --tests '*SecurityRoleHierarchyTest*'`로 VIEWER가
     `/api/archive/**`에 접근 가능한지 확인).
  2. `SecurityConfig`의 `authorizeHttpRequests` 블록 단순화:
     ```kotlin
     // 기존: hasAnyRole("HOST", "MEMBER", "VIEWER")
     // 변경: hasRole("VIEWER")  -- VIEWER 이상이면 통과
     .requestMatchers(HttpMethod.GET, "/api/sessions/current").hasRole("VIEWER")
     .requestMatchers(HttpMethod.GET, "/api/sessions/upcoming").hasRole("VIEWER")
     .requestMatchers(HttpMethod.GET, "/api/archive/**").hasRole("VIEWER")
     .requestMatchers(HttpMethod.GET, "/api/notes/**").hasRole("VIEWER")
     .requestMatchers(HttpMethod.GET, "/api/app/me").hasRole("VIEWER")
     .requestMatchers(HttpMethod.GET, "/api/feedback-documents/me").hasRole("VIEWER")
     .requestMatchers(RegexRequestMatcher("^/api/sessions/[^/]+/feedback-document$", "GET"))
       .hasRole("VIEWER")
     // 기존: hasAnyRole("HOST", "MEMBER")
     // 변경: hasRole("MEMBER")
     .requestMatchers(HttpMethod.GET, "/api/**").hasRole("MEMBER")
     .requestMatchers("/api/**").hasRole("MEMBER")
     ```
     주의: PLATFORM_ADMIN은 `/api/admin/**`에서만 사용하므로 그대로 둔다(`HOST` 도구
     접근은 별도 club membership 권한이 필요하다는 정책 — `architecture.md` line 99 참고).
  3. `SecurityRoleHierarchyTest`로 다음 시나리오 검증:
     - VIEWER → `/api/archive/sessions` 200
     - MEMBER → `/api/me/membership/leave` 200
     - HOST → `/api/host/sessions` 200
     - VIEWER → `/api/host/sessions` 403
- **검증 방법**:
  - `./server/gradlew -p server test`
  - 기존 e2e (`google-auth-viewer`, `member-lifecycle`) 회귀 없음.
- **v1 연관**: 없음.

---

### TASK-V2-006: traceId MDC + response header

- **Phase**: 0
- **우선순위**: P1
- **난이도**: S
- **예상 소요**: 2시간
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt` (신규)
  - `server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilterRegistration.kt` (신규)
  - `server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt` (`traceId` 옵셔널 필드 추가)
  - `server/src/main/kotlin/com/readmates/shared/adapter/in/web/SharedApplicationErrorHandler.kt` (traceId 주입)
  - `server/src/main/resources/logback-spring.xml` (`%X{requestId}` pattern 추가)
  - `front/shared/api/client.ts` (response의 `X-Readmates-Request-Id` capture)
  - `front/tests/unit/.../request-id-filter.test.ts` 또는 server-side test
- **구현 단계**:
  1. `RequestIdFilter` — `@Component`를 붙이지 **않는다**. Spring Boot는 context에
     등록된 모든 `Filter` bean을 default order로 자동 등록하기 때문에, `@Component` +
     `FilterRegistrationBean` 조합은 같은 filter가 두 번 install되어 첫 인스턴스가
     default order로 먼저 실행된다. 본 프로젝트의 `RateLimitFilter`도 이를 피하기 위해
     `FilterRegistrationBean(rateLimitFilter).apply { isEnabled = false }`로
     auto-registration을 끈다. 본 task는 `@Component` 없이 `FilterRegistrationBean`
     하나로만 등록한다(cleanest).
     ```kotlin
     package com.readmates.shared.observability

     import jakarta.servlet.FilterChain
     import jakarta.servlet.http.HttpServletRequest
     import jakarta.servlet.http.HttpServletResponse
     import org.slf4j.MDC
     import org.springframework.web.filter.OncePerRequestFilter
     import java.util.UUID

     class RequestIdFilter : OncePerRequestFilter() {
         override fun doFilterInternal(
             request: HttpServletRequest,
             response: HttpServletResponse,
             filterChain: FilterChain,
         ) {
             val incoming = request.getHeader(HEADER)
             val id = if (incoming != null && ALLOWED.matches(incoming)) {
                 incoming
             } else {
                 UUID.randomUUID().toString().replace("-", "").take(12)
             }
             MDC.put(MDC_KEY, id)
             response.setHeader(HEADER, id)
             try {
                 filterChain.doFilter(request, response)
             } finally {
                 MDC.remove(MDC_KEY)
             }
         }

         companion object {
             const val HEADER = "X-Readmates-Request-Id"
             const val MDC_KEY = "requestId"
             // 외부 입력은 hex/하이픈 12-64자만 허용(주입 방지).
             private val ALLOWED = Regex("^[A-Za-z0-9-]{12,64}$")
         }
     }
     ```
  2. `BffSecretFilter`보다 먼저 실행되도록 `RequestIdFilterRegistration`에서
     `Ordered.HIGHEST_PRECEDENCE`로 등록한다. `RequestIdFilter`는 위에서 `@Component`를
     달지 않았으므로 본 `@Bean`이 유일한 instance이다.
     ```kotlin
     @Configuration
     class RequestIdFilterRegistration {
         @Bean
         fun requestIdFilter(): RequestIdFilter = RequestIdFilter()

         @Bean
         fun requestIdFilterRegistrationBean(filter: RequestIdFilter) =
             FilterRegistrationBean(filter).apply {
                 order = Ordered.HIGHEST_PRECEDENCE
                 addUrlPatterns("/*")
             }
     }
     ```
  3. `ApiErrorResponse`에 `traceId` 옵셔널 필드 추가(v1 TASK-031과 통일된 shape):
     ```kotlin
     data class ApiErrorResponse(
         val code: String,
         val message: String,
         val status: Int,
         val traceId: String? = null,
     )
     ```
     `apiErrorResponse(...)` 헬퍼는 `MDC.get("requestId")` 값을 traceId로 채워서
     ResponseEntity body에 넣는다.
  4. `logback-spring.xml`(없으면 신규)에 패턴 추가:
     ```xml
     <pattern>%d{ISO8601} [%X{requestId:-no-req}] %-5level %logger{36} - %msg%n</pattern>
     ```
  5. `front/shared/api/client.ts`의 `parseReadmatesResponse`에서 응답 header
     `X-Readmates-Request-Id`를 capture해 `ReadmatesApiError.traceId`로 보존(error
     toast/page에 짧은 id를 노출). v1 TASK-031과 동일한 contract이므로 v1 PR에서
     이미 처리되었다면 본 task는 server side만 담당.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*RequestIdFilter*'`
  - 로컬에서 임의 GET 요청 시 응답 header에 `X-Readmates-Request-Id`가 12자 hex로
    노출되는지 curl로 확인. 같은 id가 server log에도 찍히는지 stdout 확인.
- **v1 연관**: v1 TASK-031과 contract를 통일. v1이 먼저 머지되면 본 task는 filter
  도입 + MDC pattern만 다루고 traceId 필드 추가는 skip.

---

### TASK-V2-010: UseCase 인터페이스 분할

- **Phase**: A
- **우선순위**: P1
- **난이도**: M
- **예상 소요**: 1.5일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
    (`ManageHostSessionUseCase` → `HostSessionLifecycleUseCase` + `HostSessionDraftUseCase`로
    split)
  - `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
    (controller가 두 인터페이스를 받도록 변경)
  - `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
    또는 v1 TASK-025로 분할된 `HostSessionLifecycleService`/`HostSessionDraftService`
    (인터페이스 implements 목록 갱신)
  - `server/src/test/kotlin/com/readmates/session/.../*Test.kt` (Mock 대상 변경)
- **구현 단계**:
  1. `HostSessionUseCases.kt`의 `ManageHostSessionUseCase`를 두 개로 분할:
     ```kotlin
     interface HostSessionLifecycleUseCase {
         fun open(command: HostSessionIdCommand): HostSessionDetailResponse
         fun close(command: HostSessionIdCommand): HostSessionDetailResponse
         fun publish(command: HostSessionIdCommand): HostSessionDetailResponse
         fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
         fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse
         fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse
     }

     interface HostSessionDraftUseCase {
         fun list(host: CurrentMember, pageRequest: PageRequest): CursorPage<HostSessionListItem>
         fun create(command: HostSessionCommand): CreatedSessionResponse
         fun detail(command: HostSessionIdCommand): HostSessionDetailResponse
         fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
     }
     ```
     기존 `ManageHostSessionUseCase`는 두 인터페이스를 동시에 extends하는 deprecated
     alias로 잠시 둔다(controller migration window).
     ```kotlin
     @Deprecated("split into HostSessionLifecycleUseCase + HostSessionDraftUseCase",
         level = DeprecationLevel.WARNING)
     interface ManageHostSessionUseCase :
         HostSessionLifecycleUseCase,
         HostSessionDraftUseCase
     ```
  2. `HostSessionController.kt` 생성자에서 `manageHostSessionUseCase` 한 개를 받지 않고
     두 개를 분리해서 받는다:
     ```kotlin
     @RestController
     @RequestMapping("/api/host/sessions")
     class HostSessionController(
         private val hostSessionLifecycleUseCase: HostSessionLifecycleUseCase,
         private val hostSessionDraftUseCase: HostSessionDraftUseCase,
     ) { /* ... */ }
     ```
  3. `HostSessionCommandService`(또는 v1 TASK-025의 split된 service)는 `implements`
     목록을 두 인터페이스로 분리. v1 TASK-025가 이미 머지된 상태라면
     `HostSessionLifecycleService` → `HostSessionLifecycleUseCase`,
     `HostSessionDraftService` → `HostSessionDraftUseCase`로 짝지어진다.
  4. 마지막 PR에서 `@Deprecated` `ManageHostSessionUseCase` alias 제거(별도 follow-up
     PR로 끊는 게 안전).
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*HostSessionController*' --tests '*HostSession*Service*'`
  - `ServerArchitectureBoundaryTest` 통과(인터페이스 위치는 그대로 `application.port.in`).
  - controller 테스트가 두 mock(`@MockBean HostSessionLifecycleUseCase`,
    `@MockBean HostSessionDraftUseCase`)을 받도록 갱신.
- **v1 연관**: v1 TASK-025 (`HostSessionCommandService` 3-service split)와 짝.
  v1이 먼저 머지된 후 본 task가 인터페이스를 split하면 service 클래스는 더 이상 두
  use-case를 동시에 implements하지 않게 된다. v1과 본 task 모두 머지 후 ArchUnit에
  "service 한 개가 lifecycle + draft를 동시에 implements하면 안 됨" 룰 추가 가능.

---

### TASK-V2-011: `auth/application/` 직속 service를 `auth/application/service/`로 이동

- **Phase**: A
- **우선순위**: P1
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일** (이동 대상):
  - `server/src/main/kotlin/com/readmates/auth/application/AcceptInvitationUseCase.kt` (실제로는 `@Service`. 파일명을 `AcceptInvitationService.kt`로 rename + `application/service/`로 이동. 인터페이스 alias는 `auth/application/port/in/` 신설 또는 기존 위치로 분리)
  - `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt` → `auth/application/service/AuthSessionService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt` (`@Component`) → `auth/application/service/AuthenticatedMemberResolver.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt` → `auth/application/service/GoogleLoginService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt` → `auth/application/service/InvitationService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/InvitationTokenService.kt` (`@Component`) → `auth/application/service/InvitationTokenService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt` → `auth/application/service/MemberApprovalService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt` → `auth/application/service/MemberLifecycleService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/PendingApprovalReadService.kt` → `auth/application/service/PendingApprovalReadService.kt`
- **이동하지 않을 파일** (service가 아님 — 패키지 그대로 둠):
  - `AuthApplicationException.kt` (exception)
  - `MemberLifecycleModels.kt` (DTO)
  - `HostMemberListItemMapper.kt` (mapper helper)
  - `model/`, `port/`, `service/` 하위 폴더들
- **구현 단계**:
  1. `AcceptInvitationUseCase.kt`는 이름은 UseCase지만 `@Service`이고 implementation을
     포함한다 — 이는 인터페이스/구현 split이 안 된 잔재이다. **2단계로 진행**:
     - PR 1 (본 task): 파일을 그대로 `application/service/`로 이동 + rename
       (`AcceptInvitationUseCaseService.kt`로 둘지, 인터페이스 split을 동반할지는
       v2 TASK-V2-010 정신과 동일하게 분리하는 게 맞으나, 본 task는 mechanical
       move만 다룬다).
     - PR 2 (별도 follow-up, 본 plan 범위 밖): `AcceptInvitationUseCase`
       인터페이스를 `application/port/in/`으로 분리하고 service는 implementation 책임만.
  2. 각 파일을 `git mv`로 이동 + `package` 선언 갱신:
     ```kotlin
     // before: package com.readmates.auth.application
     // after:  package com.readmates.auth.application.service
     ```
  3. import를 사용하는 모든 파일에서 import path 갱신
     (`com.readmates.auth.application.GoogleLoginService` →
     `com.readmates.auth.application.service.GoogleLoginService`). IntelliJ refactor
     또는 `find ... -exec sed -i ''` 일괄 변경.
  4. `ServerArchitectureBoundaryTest`에 다음 룰 추가:
     ```kotlin
     // server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
     @Test
     fun `auth application services live in application service package`() {
         classes()
             .that().resideInAPackage("com.readmates.auth.application")
             .and().areAnnotatedWith(Service::class.java)
             .should().resideInAPackage("com.readmates.auth.application.service")
             .check(authClasses)
     }
     ```
  5. 동일 룰을 다른 feature(`session`, `notification`, `feedback` 등)에도 일반화한
     공통 ArchUnit rule 추가 검토(별도 PR 권장).
- **검증 방법**:
  - `./server/gradlew -p server test`
  - import 누락 0건(컴파일 통과로 검증).
  - `ServerArchitectureBoundaryTest` 신규 룰 통과.
- **v1 연관**: 없음.

---

### TASK-V2-012: `@Transactional`을 adapter→application service로 이동

- **Phase**: A
- **우선순위**: P1
- **난이도**: M
- **예상 소요**: 1.5일 (notification slice 우선, 나머지는 follow-up)
- **관련 파일** (1차 범위):
  - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapter.kt`
    (`@Transactional` 5개 제거)
  - `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
    (호출 경로의 method에 `@Transactional` 추가)
  - `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryEngine.kt`
    (해당 method에 `@Transactional` 추가)
  - `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/*.kt`
    (scheduler → service 호출 시 service가 tx owner인지 확인)
  - `server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/*.kt`
    (Kafka listener → service 호출 시 동일)
- **구현 단계**:
  1. `JdbcNotificationDeliveryAdapter`의 `@Transactional` 5개를 모두 제거하고,
     adapter의 책임을 SQL execution + row mapping으로 한정한다.
  2. application service의 호출 경로를 따라 tx owner를 명시한다. 예시:
     ```kotlin
     // NotificationDeliveryProcessingService.kt
     @Service
     class NotificationDeliveryProcessingService(
         private val deliveryPort: NotificationDeliveryPort,
         private val deliveryEngine: NotificationDeliveryEngine,
     ) {
         @Transactional
         fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> =
             deliveryPort.persistPlannedDeliveries(message)

         @Transactional
         fun claimAndSend(deliveryId: UUID) {
             val claimed = deliveryPort.claimEmailDelivery(deliveryId) ?: return
             deliveryEngine.send(claimed)
         }
     }
     ```
     scheduler/Kafka listener inbound adapter는 service 메서드를 1회 호출하고,
     tx 경계는 service annotation이 소유한다.
  3. propagation 의도 확인: outer service가 `@Transactional`이고 그 안에서 다른
     `@Transactional` service를 호출하면 default `Propagation.REQUIRED`로 같은 tx에
     join한다. **별도 tx로 끊어야 하는 경우**(예: `markDeliveryDead`는 outer 실패와
     무관하게 commit돼야 하는 경우)는 `@Transactional(propagation = REQUIRES_NEW)`을
     명시하고 PR description에 근거를 적는다.
  4. `MySqlQueryPlanTest`/`ServerQueryBudgetTest` 회귀 확인. tx 경계가 변하면
     prepareStatement 카운트가 변할 수 있다 — budget 갱신이 필요하면 PR 분리.
  5. **2차 범위(별도 PR로 끊을 것)**: `auth/adapter/out/persistence/`의 22개
     `@Transactional` 사례를 동일 패턴으로 이동. notification slice가 정착된 후 진행.
- **검증 방법**:
  - `./server/gradlew -p server test`
  - 부하 부분 회귀: 동일 트랜잭션 안에서 `claimEmailDelivery` + `markDeliverySent`
    호출 시 single tx commit 확인하는 통합 테스트.
- **v1 연관**: v1 TASK-027(트랜잭션 isolation 명시)와 짝. v1 TASK-027이 먼저 머지되면
  isolation 명시 위치도 application service로 통일된다.

---

### TASK-V2-013: `MembershipStatus` finite state machine 명시

- **Phase**: A
- **우선순위**: P2
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`
    (`canTransitionTo` 메서드 + transitions map 추가)
  - `server/src/main/kotlin/com/readmates/auth/application/service/MemberLifecycleService.kt`
    (mutation 시 transition 검증 호출)
  - `server/src/test/kotlin/com/readmates/auth/domain/MembershipStatusTest.kt` (신규)
- **구현 단계**:
  1. `MembershipStatus` enum 확장:
     ```kotlin
     enum class MembershipStatus {
         INVITED,
         VIEWER,
         ACTIVE,
         SUSPENDED,
         LEFT,
         INACTIVE;

         fun canTransitionTo(next: MembershipStatus): Boolean =
             next in (TRANSITIONS[this] ?: emptySet())

         companion object {
             // 출처: docs/development/architecture.md "멤버십과 역할 모델" + V11/V21 migration.
             // 향후 상태 추가는 이 표를 함께 갱신해야 한다.
             private val TRANSITIONS: Map<MembershipStatus, Set<MembershipStatus>> = mapOf(
                 INVITED to setOf(VIEWER, ACTIVE, INACTIVE, LEFT),
                 VIEWER to setOf(ACTIVE, INACTIVE, LEFT),
                 ACTIVE to setOf(SUSPENDED, INACTIVE, LEFT),
                 SUSPENDED to setOf(ACTIVE, INACTIVE, LEFT),
                 // LEFT, INACTIVE는 terminal state — outbound transition 없음.
                 LEFT to emptySet(),
                 INACTIVE to emptySet(),
             )
         }
     }
     ```
  2. `MemberLifecycleService.kt`의 status mutation method에서 transition 검증 호출:
     ```kotlin
     fun transitionMembershipStatus(membershipId: UUID, target: MembershipStatus) {
         val current = port.findCurrentStatus(membershipId)
             ?: throw AuthApplicationException("MEMBERSHIP_NOT_FOUND", ...)
         if (!current.canTransitionTo(target)) {
             throw AuthApplicationException(
                 "INVALID_MEMBERSHIP_TRANSITION",
                 "$current → $target is not allowed",
             )
         }
         port.updateStatus(membershipId, target)
     }
     ```
  3. `MembershipStatusTest`에서 모든 (from, to) 조합을 enumerated하고 transitions
     map과 일치하는지 검증.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*MembershipStatus*' --tests '*MemberLifecycleService*'`
  - 기존 e2e (`member-lifecycle`) 회귀 없음.
- **v1 연관**: 없음.

---

### TASK-V2-014: `ClubLifecycleService` 도입

- **Phase**: D
- **우선순위**: P2
- **난이도**: M
- **예상 소요**: 1일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/club/application/port/in/ClubLifecycleUseCase.kt` (신규)
  - `server/src/main/kotlin/com/readmates/club/application/service/ClubLifecycleService.kt` (신규)
  - `server/src/main/kotlin/com/readmates/club/application/port/out/ClubLifecyclePort.kt` (신규)
  - `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcClubLifecycleAdapter.kt` (신규)
  - `server/src/main/kotlin/com/readmates/auth/application/service/InvitationService.kt`
    (호출부 위임)
  - `server/src/main/kotlin/com/readmates/admin/.../PlatformAdminController.kt`
    (호출부 위임)
- **구현 단계**:
  1. `clubs.status` 4개 상태(`SETUP_REQUIRED`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`)의
     transition을 한 service에 응축한다:
     ```kotlin
     interface ClubLifecycleUseCase {
         fun activateAfterFirstHostJoin(clubId: UUID)
         fun suspend(clubId: UUID, actor: CurrentPlatformAdmin, reason: String)
         fun restore(clubId: UUID, actor: CurrentPlatformAdmin)
         fun archive(clubId: UUID, actor: CurrentPlatformAdmin)
     }
     ```
  2. `ClubLifecycleService` 구현 + `ClubStatus` enum + transitions map(TASK-V2-013과
     동일 패턴).
  3. `InvitationService`/`PlatformAdminController`에서 club status mutation을 직접 SQL로
     하지 않고 `ClubLifecycleUseCase`를 통해 호출하도록 변경.
  4. 모든 status transition은 `club_audit_events` table(V21에서 도입됨)에 audit
     row를 함께 INSERT.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*ClubLifecycle*'`
  - 기존 platform admin e2e 회귀 없음.
- **v1 연관**: 없음.

---

### TASK-V2-015: metric tag policy ADR + 코드 주석

- **Phase**: B
- **우선순위**: P2
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `docs/development/technical-decisions.md` (ADR 항목 추가)
  - `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt`
    (KDoc 주석 추가)
- **구현 단계**:
  1. `technical-decisions.md`에 다음 ADR 항목 추가:
     ```markdown
     ## ADR: Metric tag cardinality policy

     **결정**: Prometheus metric tag에는 enum/low-cardinality 값만 사용한다.

     **금지 tag**: `club_id`, `user_id`, `membership_id`, `recipient_email`,
     `event_id`, `delivery_id`, `session_id` 등 row-id/사용자 식별자.

     **이유**: Cardinality 폭발(N개 클럽 × M개 status × K개 channel)이 무료
     Prometheus storage(retention/cardinality limit)를 빠르게 소진한다.

     **대안**: 클럽별 통계가 필요하면 (a) audit table(`club_audit_events`,
     `notification_event_outbox`) JOIN 쿼리, (b) Grafana table panel + DB
     datasource로 별도 운영.
     ```
  2. `ReadmatesOperationalMetrics`의 모든 public method에 KDoc:
     ```kotlin
     /**
      * Notification 발송 성공 카운터.
      *
      * Metric tag policy: enum(low cardinality) tag만 허용한다.
      * `eventType`은 4개 enum으로 안전. `clubId`, `recipientEmail`, `eventId`는
      * 절대 tag로 추가하지 말 것 — `docs/development/technical-decisions.md`
      * "Metric tag cardinality policy" 참고.
      */
     fun sent(eventType: NotificationEventType) { /* ... */ }
     ```
- **검증 방법**:
  - 코드 변경 없음(주석만). `./server/gradlew -p server compileKotlin`만 통과 확인.
  - PR review에서 새 metric 추가 시 reviewer가 ADR을 참조할 수 있는지 확인.
- **v1 연관**: 없음.

---

### TASK-V2-016: Dynamic allowed origins resolver

- **Phase**: B
- **우선순위**: P1
- **난이도**: M
- **예상 소요**: 1.5일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/auth/application/port/out/AllowedOriginPort.kt` (신규)
  - `server/src/main/kotlin/com/readmates/club/application/port/out/ActiveClubDomainPort.kt` (신규)
  - `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcActiveClubDomainAdapter.kt` (신규)
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/StaticAndClubDomainAllowedOriginAdapter.kt` (신규, `AllowedOriginPort` 합성 구현)
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
    (`hasAllowedOrigin` → `AllowedOriginPort` 사용으로 변경)
  - `server/src/test/kotlin/com/readmates/auth/.../BffSecretFilterDynamicOriginTest.kt` (신규)
- **구현 단계**:
  1. 두 port 정의 — `auth`는 origin 정책의 owner, `club`는 club_domains의 owner이므로
     port를 패키지 별로 나눈다.
     ```kotlin
     // server/src/main/kotlin/com/readmates/auth/application/port/out/AllowedOriginPort.kt
     package com.readmates.auth.application.port.out

     interface AllowedOriginPort {
         fun isAllowed(origin: String): Boolean
     }
     ```
     ```kotlin
     // server/src/main/kotlin/com/readmates/club/application/port/out/ActiveClubDomainPort.kt
     package com.readmates.club.application.port.out

     interface ActiveClubDomainPort {
         /** club_domains.status='ACTIVE' row의 hostname에서 파생된 origin이면 true. */
         fun isActiveOrigin(origin: String): Boolean
     }
     ```
  2. `JdbcActiveClubDomainAdapter`로 `ActiveClubDomainPort` 구현:
     `club_domains` table에서 `status='ACTIVE'`인 row를 query하고 결과를 60초
     in-memory TTL cache(`AtomicReference<Pair<Instant, Set<String>>>`)에 보관 —
     새 alias가 활성화되면 1분 안에 allowlist에 반영. hostname → origin 변환은
     scheme(`https`만)과 `BffSecretFilter.parseAllowedOrigins`의 normalizer를 동일
     사용.
  3. Static + dynamic 합성 adapter — `AllowedOriginPort`를 구현하고 두 source를
     OR-결합:
     ```kotlin
     // server/src/main/kotlin/com/readmates/auth/infrastructure/security/StaticAndClubDomainAllowedOriginAdapter.kt
     @Component
     class StaticAndClubDomainAllowedOriginAdapter(
         @Value("\${readmates.allowed-origins:}") allowedOrigins: String,
         @Value("\${readmates.app-base-url:http://localhost:3000}") appBaseUrl: String,
         private val activeClubDomainPort: ActiveClubDomainPort,
     ) : AllowedOriginPort {
         private val staticOrigins =
             BffSecretFilter.parseAllowedOrigins(allowedOrigins, appBaseUrl)

         override fun isAllowed(origin: String): Boolean {
             if (origin in staticOrigins) return true
             return activeClubDomainPort.isActiveOrigin(origin)
         }
     }
     ```
  4. `BffSecretFilter`의 `hasAllowedOrigin`이 `AllowedOriginPort`를 사용하도록 변경:
     ```kotlin
     @Component
     class BffSecretFilter(
         /* ... */
         private val allowedOriginPort: AllowedOriginPort,
     ) : OncePerRequestFilter() {
         private fun hasAllowedOrigin(request: HttpServletRequest): Boolean {
             val origin = request.getHeader("Origin")?.toOrigin()
                 ?: request.getHeader("Referer")?.toOrigin()
                 ?: return false
             return allowedOriginPort.isAllowed(origin)
         }
     }
     ```
     기존 `private val allowedOriginSet`/`parseAllowedOrigins`는 static adapter
     생성에 재사용하므로 visibility만 `internal`로 변경(또는 helper로 추출).
  5. `BffSecretFilterDynamicOriginTest`로:
     - `club_domains`에 ACTIVE row insert 후 그 host의 origin이 allowed.
     - SUSPENDED 상태로 변경 후 60초 TTL 만료 시 거부.
     - static origin은 항상 allowed.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*BffSecretFilter*' --tests '*AllowedOrigin*'`
  - `docs/deploy/multi-club-domains.md`에 "운영자가 새 alias를 ACTIVE로 변경하면
    backend 재시작 없이 1분 내 allowlist에 반영됨" 추가.
- **v1 연관**: 없음.

---

### TASK-V2-017: health endpoint liveness/readiness 구분 문서화

- **Phase**: B
- **우선순위**: P2
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/shared/adapter/in/web/HealthController.kt`
    (KDoc 주석 추가, 응답 body에 `kind` 명시)
  - `docs/deploy/oci-backend.md` (health check 계약 1단락 추가)
  - `server/src/main/resources/application.yml` (actuator readiness/liveness probe
    명시)
- **구현 단계**:
  1. `HealthController`에 KDoc:
     ```kotlin
     /**
      * Liveness probe. process가 살아 있고 servlet container가 응답하는지만 확인한다.
      *
      * - 8080 `/internal/health`: liveness. DB/Redis/Kafka 의존성을 검사하지 않는다.
      * - 8081 `/actuator/health`: readiness. Spring Boot Actuator가 DB/Redis/Kafka
      *   health indicator를 종합한다(`management.endpoint.health.probes.enabled=true`).
      *
      * 운영 health check는 readiness(8081)를 사용하고, infra-level은 liveness(8080)
      * 사용. 자세한 계약은 `docs/deploy/oci-backend.md` "Health check contract" 참고.
      */
     @GetMapping("/internal/health")
     fun health(): Map<String, String> = mapOf("status" to "UP", "kind" to "liveness")
     ```
  2. `application.yml`에 readiness probe 활성화:
     ```yaml
     management:
       endpoint:
         health:
           probes:
             enabled: true
           show-details: never
       endpoints:
         web:
           base-path: /actuator
           exposure:
             include: health,prometheus
     ```
  3. `docs/deploy/oci-backend.md`에 "Health check contract" 1 subsection 추가:
     ```markdown
     ## Health check contract

     - liveness: `GET http://<server>:8080/internal/health` → `{ "status": "UP", "kind": "liveness" }`.
       process up이면 항상 UP. systemd `ExecStartPost`/Caddy `health_uri`가 사용.
     - readiness: `GET http://<server>:8081/actuator/health/readiness` → DB/Redis/Kafka
       health 종합. Pages Functions 또는 Caddy upstream 등록 시 readiness를 사용.
     - 8081 internal port는 firewall에서 외부 접근을 막는다(이미 v1에서 인지).
     ```
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*HealthController*'`
  - 로컬 boot 후 `curl :8080/internal/health` + `curl :8081/actuator/health/readiness`
    각각 200 + 적절한 body.
- **v1 연관**: 없음.

---

### TASK-V2-018: Kafka relay/consumer worker process 분리 ADR

- **Phase**: B
- **우선순위**: P2
- **난이도**: S (ADR만; 실행은 별도 task)
- **예상 소요**: 0.5일
- **관련 파일**:
  - `docs/development/technical-decisions.md` (ADR 항목 추가, v1 TASK-075를 보강)
  - `server/src/main/kotlin/com/readmates/notification/application/config/NotificationWorkerConfiguration.kt`
    (신규: `@ConditionalOnProperty(name="readmates.notification.worker.enabled", havingValue="true")` 가드 도입)
- **구현 단계**:
  1. `technical-decisions.md`에 ADR:
     ```markdown
     ## ADR: Notification kafka relay/consumer worker process

     **상황**: 현재 single Spring Boot process에서 web + scheduler + Kafka listener가
     함께 boot. process 1개 죽으면 web과 notification 발송이 함께 정지.

     **선택지**:
     - A: 단일 process 유지 + `readmates.notification.worker.enabled=false` flag로
       web replica 늘리고 worker 1개만 켠다(같은 jar, 다른 systemd service).
     - B: Gradle multi-module로 `server-relay`(spring-kafka + scheduler), `server-app`
       (web + scheduler 외) 분리.

     **결정**: 1차는 A. infra cost 0(기존 jar 재사용), failure isolation 충분.
     B는 2 instance 이상 운영하게 됐을 때 재검토.
     ```
  2. `NotificationWorkerConfiguration`로 worker bean(scheduler trigger, Kafka listener
     container factory)을 flag로 가드:
     ```kotlin
     @Configuration
     @ConditionalOnProperty(name = ["readmates.notification.worker.enabled"], havingValue = "true", matchIfMissing = true)
     class NotificationWorkerConfiguration {
         // Kafka listener container, scheduler trigger registration을 이쪽으로 이동
     }
     ```
  3. `application.yml`에 새 flag default(`true`)와 주석 추가:
     ```yaml
     readmates:
       notification:
         worker:
           # 단일 instance에서는 true(기본). web replica를 늘려 운영하는 경우
           # web replica는 false, dedicated worker instance만 true로 둔다.
           enabled: true
     ```
- **검증 방법**:
  - `./server/gradlew -p server test`(flag default true이므로 회귀 없음).
  - 별도 PR/staging에서 `enabled=false`로 boot 시 Kafka listener가 등록되지 않는지
    log 확인.
- **v1 연관**: v1 TASK-075의 ADR을 본 task가 보강(실제 flag + conditional bean 추가).

---

### TASK-V2-019: 라우트 lazy 분할

- **Phase**: C
- **우선순위**: P1
- **난이도**: M
- **예상 소요**: 1일
- **관련 파일**:
  - `front/src/app/router.tsx` (route definitions에 `lazy` 옵션 적용)
  - `front/src/pages/{archive,host-route-elements,my-page,notes,member-session,...}.tsx` (lazy import target)
  - `front/vite.config.ts` (`build.chunkSizeWarningLimit` 350으로 강화)
  - `front/tests/unit/router.test.tsx` (lazy 라우트 hydration 회귀 테스트)
- **구현 단계**:
  1. React Router v7 `lazy` 옵션을 사용해 무거운 페이지를 분할. 예시:
     ```tsx
     // front/src/app/router.tsx
     {
       path: "archive",
       lazy: async () => {
         const m = await import("@/src/pages/archive");
         return {
           Component: m.default,
           loader: (await import("@/features/archive/route/archive-list-data")).archiveListLoader,
           errorElement: <ArchiveRouteError />,
           hydrateFallbackElement: <ArchiveRouteLoading label="아카이브를 불러오는 중" />,
         };
       },
     },
     {
       path: "sessions/:sessionId",
       lazy: async () => {
         const page = await import("@/src/pages/member-session");
         const data = await import("@/features/archive/route/member-session-detail-data");
         return {
           Component: page.default,
           loader: data.memberSessionDetailLoader,
           errorElement: <ArchiveRouteError />,
           hydrateFallbackElement: <ArchiveRouteLoading label="지난 세션 기록을 불러오는 중" />,
         };
       },
     },
     ```
  2. 분할 후보 라우트(예상 최대 효과):
     - `/clubs/:clubSlug/app/archive` (archive page + member-session detail)
     - `/clubs/:clubSlug/app/host/**` (host dashboard, members, invitations,
       notifications, session editor — public landing 진입자가 다운로드 안 해도 됨)
     - `/admin` (platform admin)
     - `/clubs/:clubSlug/app/feedback/:sessionId` + `/print` (피드백 문서/print)
  3. `vite.config.ts`의 `build.chunkSizeWarningLimit`을 350으로 강화. 빌드 결과
     `dist/assets/index-*.js`(현재 441KB)가 ~200KB 이하로 분할되는지 확인.
  4. v1 TASK-049의 `hydrateFallbackElement` 일관화와 충돌하지 않도록 lazy route에도
     fallback을 명시.
- **검증 방법**:
  - `pnpm --dir front build` 후 `dist/assets/*.js` 파일 크기 측정. 단일 청크 ≤ 350KB.
  - `pnpm --dir front test:e2e --grep responsive-navigation`로 navigation 회귀 확인.
  - Network 탭에서 archive route 진입 시 `archive.*.js`가 lazy load되는 것 확인.
- **v1 연관**: v1 TASK-050 (라우트별 lazy loading)과 동일 의도이지만, v1은 phase 3
  분해(TASK-041~043) 후 진행 예정으로 의존성이 길다. v2 본 task는 React Router v7
  `lazy()` 옵션을 사용해 컴포넌트 분해 없이도 라우트 단위 split을 먼저 적용한다.
  v1 TASK-050이 머지되면 두 PR이 같은 영역을 다루므로 conflict 해소가 필요.

---

### TASK-V2-020: archive detail query batching

- **Phase**: C
- **우선순위**: P1
- **난이도**: M
- **예상 소요**: 1.5일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchive*Adapter.kt`
    (review/feedback/history/attendance section을 4 query 이내로 묶음)
  - `server/src/main/kotlin/com/readmates/archive/application/service/ArchiveDetailService.kt`
    (4-section batch fetch로 변경)
  - `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
    (budget 14 → 4 또는 5로 강화)
- **구현 단계**:
  1. 현재 `ServerQueryBudgetTest.kt:71`의 budget 14가 nail down된 상태이다 — 어떤
     14 prepareStatement가 실행되는지 `MySqlQueryPlanTest` log로 먼저 enumerate.
  2. 4개 section(review/feedback/history/attendance)을 application 레벨에서 batch:
     - 각 section의 read는 같은 sessionId/clubId를 share — outbound port를
       `ArchiveDetailBatchReadPort`로 묶고 `JdbcArchiveDetailBatchReadAdapter`에서
       연속된 4 prepareStatement(혹은 multi-result set query)로 처리.
     - 예시 단순 합성:
       ```kotlin
       interface ArchiveDetailBatchReadPort {
           fun loadDetail(clubId: UUID, sessionId: UUID, viewer: CurrentMember): ArchiveDetailFragments
       }

       data class ArchiveDetailFragments(
           val review: ReviewSection,
           val feedback: FeedbackSection,
           val history: HistorySection,
           val attendance: AttendanceSection,
       )
       ```
  3. budget 갱신 PR을 본 task와 같은 PR로 묶지 말 것 — 먼저 batch 적용 후 별도
     follow-up commit으로 budget만 수정해 회귀 디버깅이 쉬워진다.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*ArchiveDetail*' --tests '*ServerQueryBudgetTest*'`
  - 동일 endpoint의 응답 shape이 변경되지 않았는지 frontend `archive-page.test.tsx`
    fixture 회귀 없음.
- **v1 연관**: v1 TASK-022a (`loadNoteSessions` correlated subquery rewrite)와 별개
  영역 — notes feed가 아니라 archive detail.

---

### TASK-V2-021: `host-session-editor` useReducer + memo

- **Phase**: C
- **우선순위**: P2
- **난이도**: M
- **예상 소요**: 1.5일
- **관련 파일**:
  - `front/features/host/ui/host-session-editor.tsx` (현재 30 useState + 0 useCallback)
  - `front/features/host/model/host-session-editor-form-state.ts` (신규: reducer + action types)
  - `front/features/host/ui/session-editor/{attendance-panel,basic-session-panel,publication-panel,document-state-panel}.tsx`
    (`React.memo` wrapping)
  - `front/tests/unit/host-session-editor.test.tsx` (회귀 테스트)
- **구현 단계**:
  1. `host-session-editor-form-state.ts`에 form state shape + action union 정의:
     ```ts
     // front/features/host/model/host-session-editor-form-state.ts
     export type HostSessionEditorFormState = {
       title: string;
       bookTitle: string;
       bookAuthor: string;
       bookLink: string;
       bookImageUrl: string;
       date: string;
       startTime: string;
       locationLabel: string;
       meetingUrl: string;
       meetingPasscode: string;
       recordVisibility: SessionRecordVisibility;
       summary: string;
       hasPublicationRecord: boolean;
       sessionState: HostSessionDetailResponse["state"];
       attendanceStatuses: Record<string, AttendanceStatus>;
       feedbackDocument: FeedbackDocumentStatus;
       // ... transient ui state는 별도 reducer로 분리 가능
     };

     export type HostSessionEditorAction =
       | { type: "SET_FIELD"; field: keyof HostSessionEditorFormState; value: unknown }
       | { type: "HYDRATE"; payload: HostSessionEditorFormState }
       | { type: "UPDATE_ATTENDANCE"; membershipId: string; status: AttendanceStatus }
       | { type: "PUBLICATION_SAVED"; summary: string; visibility: SessionRecordVisibility }
       | { type: "FEEDBACK_DOCUMENT_UPDATED"; document: FeedbackDocumentStatus };

     export function hostSessionEditorReducer(
       state: HostSessionEditorFormState,
       action: HostSessionEditorAction,
     ): HostSessionEditorFormState { /* ... */ }

     export function initialHostSessionEditorState(
       session: HostSessionDetailResponse | null | undefined,
     ): HostSessionEditorFormState { /* hydrateHostSessionFormValues 활용 */ }
     ```
  2. `host-session-editor.tsx`의 30개 `useState`를 `useReducer(hostSessionEditorReducer, ...)`
     단일화. handler는 `dispatch`로 변경하고 `useCallback`으로 wrap한 dispatcher
     생성.
  3. 4개 panel을 `React.memo`로 wrap:
     ```tsx
     // front/features/host/ui/session-editor/attendance-panel.tsx
     export const AttendancePanel = React.memo(function AttendancePanel(props: AttendancePanelProps) {
       /* ... */
     });
     ```
     panel props는 `useCallback`으로 안정화된 callback + primitive prop만 받도록 정리.
     object/array prop이 매 렌더 새로 만들어지지 않게 `useMemo` 사용.
  4. transient UI state(`saveState`, `toast`, `deleteModalOpen` 등)는 form state reducer
     와 별도로 두는 게 좋다 — useReducer 1개로 모든 state를 합치면 dispatch noise가
     커진다.
- **검증 방법**:
  - `pnpm --dir front test --filter host-session-editor`
  - `pnpm --dir front lint && pnpm --dir front build`
  - React DevTools profiler로 attendance status 토글 시 panel re-render 횟수 측정
    (수기 검증). before/after를 PR description에 기록.
- **v1 연관**: v1 TASK-042 (form/effects split)와 짝. v1이 split해 두면 본 task의
  reducer + memo 적용 영역이 좁아진다. 가능하면 v1 TASK-042 → v2 TASK-V2-021 순서로
  진행.

---

### TASK-V2-022: `users.password_hash` → `legacy_password_hash` rename (Step 1)

- **Phase**: D
- **우선순위**: P2
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `server/src/main/resources/db/mysql/migration/V24__legacy_password_hash_rename.sql` (신규)
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMember*.kt`
    (column 참조 grep — `password_hash` 사용 위치를 모두 `legacy_password_hash`로 변경)
  - `server/src/test/kotlin/com/readmates/migration/MySqlFlywayMigrationTest.kt` (회귀)
- **구현 단계**:
  1. Flyway V24 migration:
     ```sql
     -- V24__legacy_password_hash_rename.sql
     -- 운영은 Google OAuth만 사용하므로 password column은 dead.
     -- Step 1: rename으로 deprecated 의도를 schema에 표기.
     -- Step 2(V25): 다음 release tag에서 drop.
     alter table users
       change column password_hash legacy_password_hash varchar(255) null,
       change column password_set_at legacy_password_set_at datetime(6) null;
     ```
  2. Application 코드의 `password_hash` 문자열 참조를 모두 `legacy_password_hash`로
     변경(grep로 확인). 대부분 raw `select` 문자열 안에 있을 것.
  3. PR description에 "Step 2 follow-up: V25에서 column drop 예정"을 명시하고
     issue/follow-up task(TASK-V2-023)로 link.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*MySqlFlywayMigrationTest*'`
  - 전체 테스트 통과(application code의 column 참조가 모두 갱신됐다는 증거).
- **v1 연관**: 없음.

---

### TASK-V2-023: legacy password column drop (Step 2)

- **Phase**: D
- **우선순위**: P3
- **난이도**: S
- **예상 소요**: 0.25일
- **관련 파일**:
  - `server/src/main/resources/db/mysql/migration/V25__drop_legacy_password_hash.sql` (신규)
  - 기존 `legacy_password_hash` 참조 코드 제거
- **구현 단계**:
  1. **선행 조건**: TASK-V2-022가 production에 배포된 후 최소 1 release tag가 지났을 때.
  2. Flyway V25:
     ```sql
     alter table users
       drop column legacy_password_hash,
       drop column legacy_password_set_at;
     ```
  3. application의 모든 `legacy_password_hash` 참조 제거.
- **검증 방법**:
  - `./server/gradlew -p server test`
- **v1 연관**: TASK-V2-022 직접 의존.

---

### TASK-V2-024: `support_access_grants` 운영 procedure + audit UI surface

- **Phase**: D
- **우선순위**: P2
- **난이도**: L
- **예상 소요**: 3일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/admin/application/port/in/SupportAccessGrantUseCase.kt` (신규)
  - `server/src/main/kotlin/com/readmates/admin/application/service/SupportAccessGrantService.kt` (신규)
  - `server/src/main/kotlin/com/readmates/admin/adapter/in/web/SupportAccessGrantController.kt` (신규)
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
    (active grant 동안 platform admin → ROLE_HOST 일시 부여)
  - `front/features/platform-admin/ui/support-access-grants-panel.tsx` (신규)
  - `docs/deploy/oci-backend.md` "Emergency support access flow" subsection 추가
- **구현 단계**:
  1. V21에서 도입된 `support_access_grants` table을 application에서 read/write하는
     use case 정의:
     - grant 생성: actor(platform_admin), club_id, expires_at(default +1h),
       reason 필수.
     - grant revoke: actor, grant_id.
     - active grant list: club_id 또는 actor 기준.
  2. `MemberAuthoritiesFilter`(또는 `PlatformAdminAuthoritiesFilter`)에서 active
     `support_access_grants` row를 검사해 platform admin이 특정 club의 host endpoint를
     호출할 때 일시적으로 `ROLE_HOST`를 부여. 만료 시점에는 부여하지 않음(즉 매 요청
     마다 active grant 검사 — 1분 in-memory cache로 최적화 가능).
  3. 모든 grant 생성/revoke/auto-expire는 `platform_audit_events`에 row 추가.
  4. Frontend `/admin` 라우트에 `SupportAccessGrantsPanel` 추가 — active grant 목록,
     grant 생성 form, revoke 버튼.
  5. `docs/deploy/oci-backend.md`에 emergency support flow 명시(누가 grant 발급, 만료
     기본값, audit trail 위치).
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*SupportAccessGrant*'`
  - e2e 신규: platform admin이 grant 생성 → host endpoint 호출 200 → grant revoke →
    같은 endpoint 403.
- **v1 연관**: 없음.

---

### TASK-V2-025: frontend zod runtime validator (host-side critical contract)

- **Phase**: C
- **우선순위**: P2
- **난이도**: M
- **예상 소요**: 1일
- **관련 파일**:
  - `front/package.json` (`zod` devDependency 추가)
  - `front/features/host/api/host-contracts.ts` (zod schema 정의 + parser export)
  - `front/features/host/api/host-session-detail.ts` 등 critical fetcher (개발 모드에서만
    parse)
  - `front/tests/unit/host-contract-zod.test.ts` (신규)
- **구현 단계**:
  1. `pnpm --dir front add -D zod`. dev-only 사용을 위해 production bundle에 포함되지
     않게 dynamic import 또는 `import.meta.env.DEV` 가드를 둔다.
  2. `host-contracts.ts`에 critical contract zod schema 정의:
     ```ts
     // front/features/host/api/host-contracts.ts
     import { z } from "zod";

     export const HostSessionDetailSchema = z.object({
       sessionId: z.string().uuid(),
       state: z.enum(["DRAFT", "OPEN", "CLOSED", "PUBLISHED"]),
       visibility: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]),
       sessionNumber: z.number().int().nonnegative(),
       bookTitle: z.string(),
       /* ... */
     });

     export type HostSessionDetail = z.infer<typeof HostSessionDetailSchema>;

     export function parseHostSessionDetail(value: unknown): HostSessionDetail {
       if (import.meta.env.DEV) {
         return HostSessionDetailSchema.parse(value);
       }
       return value as HostSessionDetail;
     }
     ```
  3. host fetcher들은 `parseHostSessionDetail(json)` 결과를 사용. dev 모드에서
     contract drift 즉시 throw, prod에선 fast path.
  4. Critical contract만 적용(host session detail, host notification delivery,
     host invitation list). member-side는 본 task 범위 밖.
- **검증 방법**:
  - `pnpm --dir front test --filter host-contract-zod`
  - `pnpm --dir front build` 후 `dist/assets/*.js`를 `grep "zod"` — production
    bundle에 zod 코드가 inline되지 않는지 확인(dev guard가 잘 작동하면 vite tree-shake
    가 제거).
- **v1 연관**: v1 TASK-070 (OpenAPI emission + codegen)이 정공법. 본 task는 그
  중간 단계로, codegen 도입 전 host-side critical surface만 보호.

---

### TASK-V2-026: server-side contract bridge test

- **Phase**: E
- **우선순위**: P2
- **난이도**: M
- **예상 소요**: 1.5일
- **관련 파일**:
  - `server/build.gradle.kts` (`testFixtures` source set 또는 `processTestResources`로
    frontend fixture path 노출)
  - `server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt` (신규)
  - `front/tests/unit/__fixtures__/*.json` (존재 확인 + path 표준화)
- **구현 단계**:
  1. `server/build.gradle.kts`에 frontend fixture path를 test classpath로 노출:
     ```kotlin
     // server/build.gradle.kts
     tasks.test {
         systemProperty("readmates.frontend.fixtures.dir", rootProject.file("../front/tests/unit/__fixtures__").absolutePath)
     }
     ```
  2. `FrontendFixtureContractTest`:
     ```kotlin
     @SpringBootTest
     @AutoConfigureMockMvc
     class FrontendFixtureContractTest @Autowired constructor(
         private val mockMvc: MockMvc,
         private val objectMapper: ObjectMapper,
     ) {
         private val fixturesDir = Paths.get(System.getProperty("readmates.frontend.fixtures.dir"))

         @Test
         fun `current session empty response matches frontend fixture key set`() {
             val response = mockMvc.perform(
                 get("/api/sessions/current").with(memberAuth(...)),
             ).andReturn().response.contentAsString
             val actual = objectMapper.readTree(response)
             val expected = objectMapper.readTree(fixturesDir.resolve("current-session-empty.json").toFile())
             assertThat(actual.fieldNames().asSequence().toSet())
                 .isEqualTo(expected.fieldNames().asSequence().toSet())
         }
     }
     ```
  3. 우선 4~5개 critical fixture만 cover(current session, archive list, host session
     detail, host notification list, member notification list).
  4. 한쪽이 추가 field를 보내면 test fail — 의도적이라면 fixture 갱신 PR을 함께 머지.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*FrontendFixtureContractTest*'`
  - frontend fixture에 의도적 field 추가 PR로 fail 확인 → 다시 양쪽 일치 확인.
- **v1 연관**: v1 TASK-070(OpenAPI codegen)으로 가는 중간 단계. codegen이 도입되면
  본 test는 곧장 codegen 결과 비교로 대체 가능.

---

### TASK-V2-027: e2e parallel + shard 설정

- **Phase**: E
- **우선순위**: P2
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `front/playwright.config.ts` (`fullyParallel: true`, `workers` 조정)
  - `.github/workflows/ci.yml` (matrix shard)
- **구현 단계**:
  1. `playwright.config.ts`:
     ```ts
     export default defineConfig({
       fullyParallel: true,
       workers: process.env.CI ? 4 : 2,
       /* ... */
       projects: [
         { name: "chromium", use: { ...devices["Desktop Chrome"] } },
       ],
     });
     ```
     test 안의 shared mutable state(예: 같은 user account에 대한 mutation)가 있으면
     `test.describe.configure({ mode: "serial" })`로 그 describe만 직렬화.
  2. CI shard:
     ```yaml
     e2e:
       strategy:
         matrix:
           shard: ["1/3", "2/3", "3/3"]
       steps:
         - run: pnpm --dir front test:e2e -- --shard=${{ matrix.shard }}
     ```
  3. webServer block은 그대로 두되, shard마다 별도 boot이 비싸므로 reusable port를
     CI에서 활용하거나 dedicated server fixture를 매 shard 1회만 띄우는 옵션 고려.
- **검증 방법**:
  - PR로 머지 전 `pnpm --dir front test:e2e -- --shard=1/3` 로컬 실행.
  - CI wall time이 직렬 대비 절반 이하로 감소.
- **v1 연관**: v1 TASK-072와 동일 의도. v1이 cross-browser matrix까지 다루는 반면
  본 task는 우선 chromium-only parallel + shard만 적용해 wall time을 즉시 줄인다.
  v1 TASK-072가 머지되면 shard 설정은 그대로 둘 수 있다.

---

### TASK-V2-028: IP hash salt 주간 회전

- **Phase**: E
- **우선순위**: P2
- **난이도**: S
- **예상 소요**: 0.5일
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/shared/security/ClientIpHashing.kt` (v1 TASK-017
    가 추출했을 가능성. 없으면 신규)
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt`
    (salt source 변경)
  - `server/src/test/kotlin/com/readmates/.../ClientIpHashingTest.kt` (회전 시 키가
    바뀌는지 검증)
- **구현 단계**:
  1. salt source를 base secret + ISO week로 합성:
     ```kotlin
     object ClientIpHashing {
         fun hashClientIp(raw: String?, baseSecret: String, clock: Clock = Clock.systemUTC()): String {
             val ip = raw?.takeIf { it.isNotBlank() } ?: return "anonymous"
             val week = ZonedDateTime.now(clock).get(WeekFields.ISO.weekOfWeekBasedYear())
             val year = ZonedDateTime.now(clock).get(WeekFields.ISO.weekBasedYear())
             val salt = "${baseSecret}::${year}-W${week}"
             return MessageDigest.getInstance("SHA-256")
                 .digest("$salt::$ip".toByteArray(StandardCharsets.UTF_8))
                 .joinToString("") { "%02x".format(it) }
                 .take(32)
         }
     }
     ```
  2. RateLimitFilter는 base secret을 environment variable
     (`READMATES_IP_HASH_BASE_SECRET`)에서 받는다. 미설정 시 `READMATES_BFF_SECRET` fallback
     은 보안상 권장하지 않음 — 필수값으로 둔다.
  3. 주 경계에서 rate limit token bucket이 reset되는 의도된 부작용을 ADR에 기록
     (`docs/development/technical-decisions.md` 1단락).
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*ClientIpHashing*'`
  - 같은 IP, 다른 week → 다른 hash 확인.
- **v1 연관**: v1 TASK-017 (RateLimit IP hash 일관화)가 ClientIpHashing helper를
  추출. 본 task는 그 helper에 weekly salt rotation을 더함. v1 TASK-017이 먼저 머지된
  후 진행.

---

### TASK-V2-029: BFF rotation audit log table ⛔ SKIP (v1 TASK-071 선행 필요)

> **이 task는 현재 실행에서 SKIP한다.** v1 TASK-071(BFF multi-secret rotation)이 머지되어
> `BffSecretFilter`에 alias 개념이 생긴 후에 실행 가능하다.

- **Phase**: E
- **우선순위**: P2
- **난이도**: M
- **예상 소요**: 1일
- **관련 파일**:
  - `server/src/main/resources/db/mysql/migration/V26__bff_secret_rotation_audit.sql` (신규, V25 다음)
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretRotationAuditPort.kt` (신규)
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcBffSecretRotationAuditAdapter.kt` (신규)
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
    (multi-secret match 시 어느 alias가 사용됐는지 audit row insert)
- **구현 단계**:
  1. Flyway V26:
     ```sql
     create table bff_secret_rotation_audit (
       id bigint unsigned not null auto_increment primary key,
       secret_alias varchar(64) not null,
       used_at datetime(6) not null,
       client_ip_hash char(64),
       request_path varchar(255),
       index bff_secret_rotation_audit_alias_used_at_idx (secret_alias, used_at)
     );
     ```
  2. v1 TASK-071이 multi-secret rotation을 도입하면 `BffSecretFilter`에서 secret 매치
     성공 시 alias(예: `primary`/`secondary`) + used_at + ip hash + path를 1줄 INSERT.
     hot path의 latency 영향을 최소화하기 위해 `@Async` 또는 별도 queue로 비동기 처리.
  3. 운영 procedure 문서: `docs/deploy/oci-backend.md`에 "Rotation drill"
     subsection — primary 발급 → secondary 추가 → secondary가 실제로 사용된
     이후에만 primary 폐기.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*BffSecretFilter*' --tests '*BffSecretRotationAudit*'`
  - 같은 secret으로 N번 호출 후 audit row N개 INSERT 확인.
- **v1 연관**: v1 TASK-071 (BFF multi-secret rotation) 직접 의존. 본 task는 v1 TASK-071이
  머지된 후 진행.

---

### TASK-V2-030: frontend zod schema → server contract bridge cross-validation

- **Phase**: E
- **우선순위**: P3
- **난이도**: M
- **예상 소요**: 1일
- **관련 파일**:
  - `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt` (신규)
  - `front/tests/unit/__fixtures__/zod-schemas/*.json` (각 zod schema의 sample valid
    payload export)
  - `package.json`(root 또는 front)에 `pnpm zod:export-fixtures` 스크립트
- **구현 단계**:
  1. TASK-V2-025의 zod schema에서 sample valid payload(zod-fixture 라이브러리 또는
     수기)로 fixture JSON을 생성. 빌드 step `pnpm --dir front zod:export-fixtures`로
     `front/tests/unit/__fixtures__/zod-schemas/host-session-detail.json` 등 생성.
  2. `FrontendZodSchemaContractTest`(TASK-V2-026과 같은 패턴)로 server `MockMvc`
     응답이 zod fixture key set과 일치하는지 검증 — TASK-V2-026이 frontend fixture
     비교라면 본 task는 zod 정의의 sample 비교.
  3. CI에서 `zod:export-fixtures`가 idempotent(diff 없음)인지 검증하는 step 추가.
- **검증 방법**:
  - `./server/gradlew -p server test --tests '*FrontendZodSchemaContractTest*'`
  - 의도적으로 server response에 새 field 추가 → zod schema 미갱신 시 fixture mismatch
    fail.
- **v1 연관**: v1 TASK-070(OpenAPI codegen)이 머지되면 본 task는 codegen output으로
  대체 가능. 그 전까지 host-side critical contract의 drift 가드.

---

## 의존성 그래프

```
Phase 0 (대부분 독립)
  TASK-V2-001 (backlog gauge)
  TASK-V2-002 (Cache-Control + BFF cache)
  TASK-V2-003 (sessions invariant)
  TASK-V2-004 (Set-Cookie domain strip)
  TASK-V2-005 (RoleHierarchy)
  TASK-V2-006 (traceId)  ── (v1 TASK-031 인지)

Phase A
  TASK-V2-010 (UseCase 분할) ◄── (v1 TASK-025 권장 선행)
  TASK-V2-011 (auth/application 정리)
  TASK-V2-012 (@Transactional 이동) ◄── (v1 TASK-027 권장 선행)
  TASK-V2-013 (MembershipStatus FSM)

Phase B
  TASK-V2-015 (metric tag policy ADR)
  TASK-V2-016 (Dynamic allowed origins)
  TASK-V2-017 (health endpoint 문서화)
  TASK-V2-018 (worker process ADR + flag) ◄── (v1 TASK-075 보강)

Phase C
  TASK-V2-019 (라우트 lazy 분할) ◄── (v1 TASK-049 권장 동반, v1 TASK-050과 conflict
                                         해소 필요)
  TASK-V2-020 (archive detail batching)
  TASK-V2-021 (host-session-editor reducer + memo) ◄── (v1 TASK-042 권장 선행)
  TASK-V2-025 (zod runtime validator)

Phase D
  TASK-V2-014 (ClubLifecycleService)
  TASK-V2-022 (legacy_password_hash rename Step 1)
  TASK-V2-023 (legacy_password_hash drop Step 2) ◄── TASK-V2-022 + 1 release window
  TASK-V2-024 (support access grants UI)

Phase E
  TASK-V2-026 (server contract bridge test) ◄── Phase A 정착 권장
  TASK-V2-027 (e2e parallel + shard) ◄── (v1 TASK-072와 conflict 해소 필요)
  TASK-V2-028 (IP hash salt rotation) ◄── v1 TASK-017
  TASK-V2-029 (BFF rotation audit table) ◄── v1 TASK-071
  TASK-V2-030 (zod cross-validation) ◄── TASK-V2-025 + TASK-V2-026
```

권장 병렬 트랙:

- **트랙 P (Quick Wins)**: TASK-V2-001 → TASK-V2-002 → TASK-V2-003 → TASK-V2-004 →
  TASK-V2-005 → TASK-V2-006 (1주)
- **트랙 Q (Architecture/Domain)**: TASK-V2-011 → TASK-V2-013 → TASK-V2-010 →
  TASK-V2-012 (3~4주)
- **트랙 R (Observability/Multi-club)**: TASK-V2-015 → TASK-V2-017 → TASK-V2-016 →
  TASK-V2-018 → TASK-V2-014 → TASK-V2-024 (3~5주)
- **트랙 S (Performance/UX)**: TASK-V2-019 → TASK-V2-020 → TASK-V2-021 →
  TASK-V2-025 (3주)
- **트랙 T (Contract/Quality)**: TASK-V2-026 → TASK-V2-030 →
  TASK-V2-027 → TASK-V2-028 → TASK-V2-029 (3~4주, v1 TASK-070/071/072가 머지된 이후)
- **트랙 U (Tech debt)**: TASK-V2-022 → (release tag 대기) → TASK-V2-023 (2 release window)

---

## 진행 체크리스트

### Phase 0 (Quick Wins)
- [ ] TASK-V2-001 Backlog Gauge 캐싱
- [ ] TASK-V2-002 Public API Cache-Control + BFF Cache API
- [ ] TASK-V2-003 sessions state×visibility check constraint
- [ ] TASK-V2-004 BFF Set-Cookie Domain attribute strip
- [ ] TASK-V2-005 RoleHierarchy bean 도입
- [ ] TASK-V2-006 traceId MDC + response header

### Phase A (아키텍처)
- [ ] TASK-V2-010 UseCase 인터페이스 분할
- [ ] TASK-V2-011 `auth/application/` → `auth/application/service/` 이동
- [ ] TASK-V2-012 `@Transactional` adapter→service 이동
- [ ] TASK-V2-013 `MembershipStatus` FSM 명시

### Phase B (관측성·신뢰성)
- [ ] TASK-V2-015 metric tag policy ADR + 코드 주석
- [ ] TASK-V2-016 Dynamic allowed origins resolver
- [ ] TASK-V2-017 health endpoint liveness/readiness 구분 문서화
- [ ] TASK-V2-018 Kafka worker process ADR + flag

### Phase C (성능·UX)
- [ ] TASK-V2-019 라우트 lazy 분할
- [ ] TASK-V2-020 archive detail query batching
- [ ] TASK-V2-021 `host-session-editor` useReducer + memo
- [ ] TASK-V2-025 frontend zod runtime validator (host-side)

### Phase D (멀티 클럽 운영)
- [ ] TASK-V2-014 `ClubLifecycleService` 도입
- [ ] TASK-V2-022 `legacy_password_hash` rename Step 1
- [ ] TASK-V2-023 password column drop Step 2
- [ ] TASK-V2-024 support access grants UI surface

### Phase E (Contract 자동화)
- [ ] TASK-V2-026 server contract bridge test
- [ ] TASK-V2-027 e2e parallel + shard
- [ ] TASK-V2-028 IP hash salt 주간 회전
- [x] ~~TASK-V2-029 BFF rotation audit log table~~ ⛔ SKIP (v1 TASK-071 선행 필요)
- [ ] TASK-V2-030 frontend zod schema cross-validation

---

## 부록: v1 plan과의 task-level cross-reference

| v2 task | v1 관련 | 관계 |
| --- | --- | --- |
| TASK-V2-001 | — | 신규 (backlog gauge 항목 v1에 없음) |
| TASK-V2-002 | v1 TASK-051 | `@cloudflare/workers-types` 도입 후 PagesFunction 타입 교체 |
| TASK-V2-003 | — | 신규 |
| TASK-V2-004 | — | v1 TASK-016(redirect host allowlist)과 별개 surface |
| TASK-V2-005 | — | 신규 |
| TASK-V2-006 | v1 TASK-031 | contract 통일(`ApiErrorResponse.traceId` + response header) |
| TASK-V2-010 | v1 TASK-025 | 인터페이스 분할(짝) |
| TASK-V2-011 | — | 신규 |
| TASK-V2-012 | v1 TASK-027 | isolation 명시 + 위치 통일 |
| TASK-V2-013 | — | 신규 |
| TASK-V2-014 | — | 신규 |
| TASK-V2-015 | — | 신규 |
| TASK-V2-016 | — | 신규 |
| TASK-V2-017 | — | 신규 |
| TASK-V2-018 | v1 TASK-075 | ADR + 실제 flag/conditional bean(보강) |
| TASK-V2-019 | v1 TASK-050 | 동일 의도, lazy 적용 방식 다름(conflict 해소 필요) |
| TASK-V2-020 | v1 TASK-022a | notes feed가 아닌 archive detail(별개) |
| TASK-V2-021 | v1 TASK-042 | split 후 reducer + memo 적용(짝) |
| TASK-V2-022 | — | 신규 |
| TASK-V2-023 | — | TASK-V2-022 follow-up |
| TASK-V2-024 | — | 신규 |
| TASK-V2-025 | v1 TASK-070 | codegen 도입 전 중간 단계(host-side critical만) |
| TASK-V2-026 | v1 TASK-070 | 동일 목표의 ROI-우선 중간 단계 |
| TASK-V2-027 | v1 TASK-072 | parallel 우선, cross-browser matrix는 v1이 보강 |
| TASK-V2-028 | v1 TASK-017 | helper 정리 후 weekly rotation 추가 |
| TASK-V2-029 | v1 TASK-071 | rotation 도입 후 audit log 추가(보강) |
| TASK-V2-030 | v1 TASK-070 | codegen 도입 후 대체 가능 |
