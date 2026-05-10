# ReadMates 개선방향 분석 v2

*분석 기준일: 2026-05-08 / 대상 버전: v1.5.2*

> 본 문서는 `2026-05-08-improvements-v1.md`(v1)과 `2026-05-08-implementation-plan-v1.md`(36 task plan)를
> 보완하는 **두 번째 시야**입니다. v1이 "보안 history 정비, 거대 파일 분해, CI 가드 추가" 같은
> 측정 가능한 단기 항목을 36개 PR로 정리했다면, v2는 **다음 1년 동안 ReadMates가 안정적으로
> 성장하기 위한 더 큰 lens** — 도메인 모델 진화, 트랜잭션·관측성 경계, UseCase 인터페이스
> 디자인, 프론트엔드 데이터 캐싱 전략, 제품 운영 메트릭 — 에 집중합니다. v1과 겹치는
> 항목은 "[v1 인지됨]" 태그로 짧게만 cross-reference 합니다.

---

## 개요

ReadMates는 React 19 + Vite SPA(Cloudflare Pages) → Cloudflare Pages Functions BFF →
Spring Boot 4 + Kotlin 2.2 API → MySQL 8 / Redis(opt) / Redpanda(opt) 흐름의 멀티 클럽
독서모임 SaaS 형태 사이드 프로젝트입니다. 코드 베이스는 hexagonal/clean 아키텍처
경계를 ArchUnit + frontend boundary 테스트로 강제하고, public-safe API 오류 계약,
multi-club context resolve, BFF 이중 가드, 알림 outbox→Kafka relay→consumer→delivery
파이프라인까지 한 monorepo 안에 자급적으로 구현되어 있습니다. 서버 251개 / 28.6k LOC,
프런트 259개 / 28.4k LOC, Flyway 마이그레이션 16개, 서버 테스트 107개라는 규모에 비해
"개인이 portfolio-grade로 끌어올리려는" 의지가 코드 곳곳에 보입니다.

다만 v1이 이미 도출한 거대 파일 분해/보안 history 정리/CI 가드 추가의 **다음 단계**
로서, 도메인 모델·트랜잭션·관측성 측면의 의도되지 않은 결합과, 프런트엔드 단일
청크/수동 데이터 동기화 같은 사용자 체감 성능 이슈, 그리고 멀티 채널 알림으로
확장될 때 드러날 ISP/SRP 위반 같은 응집도 문제는 별도로 다룰 가치가 있습니다.

---

## 현재 잘 되어있는 것

코드 evidence와 함께 정리합니다. 이 강점들은 개선이 아니라 **유지·확산**해야 할
실적입니다.

1. **데이터 무결성을 application이 아닌 schema에서 잠그는 패턴**.
   `notification_event_outbox`/`notification_deliveries`/`member_notifications` 3종
   table 사이에 단순 `event_id` FK가 아니라 `(event_id, club_id)` /
   `(delivery_id, event_id, club_id, recipient_membership_id)` 같은 **composite FK**를
   걸어 클럽 경계를 넘는 invalid join을 SQL 레벨에서 막는다
   (`V20__kafka_notification_pipeline.sql:50-86`). 멀티 클럽 환경에서 application 버그가
   나도 cross-club row가 만들어질 수 없다.
2. **Composite index를 query shape에 맞춰 정확히 제공**.
   `session_participants_club_session_status_member_idx`,
   `notification_event_outbox_status_next_idx`,
   `notification_deliveries_retry_idx` 같이 leader column이 검색 조건과 맞고 trailing
   column이 sort key까지 covering 한다(`V17__db_query_optimization.sql`,
   `V20__kafka_notification_pipeline.sql:22, 53-54`). 인덱스 추가가 schema migration에
   섞여 들어와 Flyway history로 추적된다.
3. **클린 아키텍처 경계가 ArchUnit으로 enforce**되고, 그 위에 `MySqlQueryPlanTest`,
   `ServerQueryBudgetTest`, `MySqlFlywayMigrationTest` 같은 **자가 가드레일 테스트**가
   추가되어 review 시 사람의 지적 없이도 회귀가 잡힌다. `current-session empty
   state ≤ 5 prepareStatement`, `archive detail ≤ 14`, `host deletion-preview ≤ 15`처럼
   쿼리 budget이 코드로 박혀 있다(`ServerQueryBudgetTest.kt:55, 71, 116`).
4. **public-safe 오류 계약이 server/BFF/frontend 3계층에서 통일**되어
   `{ code, message, status }` shape으로 전환됐다(v1.5.0). `ApiErrorResponse`,
   `defaultApiErrorCode`, BFF의 `bffErrorResponse`, 프런트 `ReadmatesApiError`까지
   같은 명세(`server/.../ApiErrorResponse.kt`,
   `front/functions/_shared/errors.ts`).
5. **Outbox + Kafka relay + consumer 패턴**으로 동기 mutation 트랜잭션과 SMTP/notification
   side effect를 분리해, mutation tx가 SMTP 지연/실패에 묶이지 않는다.
   `notification_event_outbox.dedupe_key` unique constraint로 idempotency까지 schema에서
   보장한다(`V20__kafka_notification_pipeline.sql:20`).
6. **쿠키/세션 위협 모델이 명시적**. raw token은 hash로만 저장(`auth_sessions.session_token_hash`),
   `HttpOnly` + `SameSite=Lax` + production `Secure`, BFF secret은 `MessageDigest.isEqual`로
   constant-time 비교, IP는 `RateLimitFilter`에서 hash 후 사용. 보안 조치가 production
   주석이 아니라 코드와 테스트에 박혀 있다.
7. **Frontend route-first 경계**. `front/src/app -> src/pages -> features -> shared`
   방향이 ESLint/boundary 테스트로 enforce되고, `feature/<name>/{api,model,route,ui}`
   4-layer split이 표준이다. Loader/Action/Error/HydrateFallback이 라우트 단위로
   대응되어 React Router v7 best practice에 맞춰져 있다.

---

## 영역별 개선방향

### 1. 아키텍처 & 설계 — UseCase 인터페이스 디자인과 패키지 일관성

#### 1.1 UseCase 다중 구현이 ISP를 깨고 있음

`HostSessionCommandService`(`server/.../session/application/service/HostSessionCommandService.kt:27-36`)는
한 클래스에서 5개 UseCase를 동시에 구현한다.

```kotlin
class HostSessionCommandService(
    private val port: HostSessionWritePort,
    private val cacheInvalidation: ReadCacheInvalidationPort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
) : ManageHostSessionUseCase,        // create/update/updateVisibility/open/close/publish/delete
    ConfirmAttendanceUseCase,        // attendance write
    UpsertPublicationUseCase,        // publication upsert
    ListUpcomingSessionsUseCase,     // upcoming list (멤버 read)
    GetHostDashboardUseCase {        // host dashboard read
```

문제는 SRP 위반보다 **인터페이스 이름이 책임을 정직하게 표현하지 못하는 점**이다.
`ManageHostSessionUseCase`는 "세션 lifecycle"과 "draft mutation"을 동시에 안고,
controller가 어떤 use-case에 의존하는지 봐도 transaction boundary, 트리거할 cache
invalidation, 발행할 notification event가 한 번에 들어오지 않는다. v1 TASK-025가
3-service split을 제안하지만 다음 두 가지가 함께 가지 않으면 실효가 떨어진다.

- **인터페이스를 함께 분할**한다. `ManageHostSessionUseCase` →
  `HostSessionLifecycleUseCase`(open/close/publish/delete) +
  `HostSessionDraftUseCase`(create/update/updateVisibility). controller가 둘을 받게
  하면 read/write가 같은 type을 참조하는 게 사라진다.
- **UseCase 단위 ports**. 한 service가 5 UseCase를 구현하기 때문에 5개의 port out도
  대부분 같은 `HostSessionWritePort` 한 개로 해결되는데, 이는 outbound port가 사실상
  레거시 repository 인터페이스를 흉내 내고 있다는 뜻이다. **각 UseCase가 필요한
  port만 명시**하면(예: lifecycle은 `HostSessionStatePort` + `RecordNotificationEventUseCase`
  + `ReadCacheInvalidationPort`) trait override가 가능해지고 단위 테스트가 짧아진다.

#### 1.2 패키지 path가 일관되지 않음

`auth` 모듈만 봐도 application service가 두 위치에 흩어져 있다.

- `auth/application/InvitationService.kt`, `auth/application/MemberLifecycleService.kt`,
  `auth/application/GoogleLoginService.kt` (top-level `application/` 직속)
- `auth/application/service/MemberProfileService.kt`,
  `auth/application/service/ResolveCurrentMemberService.kt` (`application/service/` 하위)

다른 feature는 모두 `application/service/` 하위로 정렬돼 있어서 이는 명백한 잔재다.
`docs/development/architecture.md:128-136` 표는 `auth.application` / `auth.application.service`
모두 service 위치라고 명시하지만, 실제로는 한 모듈만 두 패키지에 service가 분포한
형태다. **`auth/application/` 직속 service 4개를 `auth/application/service/`로 이동**하는
PR로 정리하면 ArchUnit 룰에서 "service는 `application.service`에만 있다"는 boundary를
추가할 수 있다.

#### 1.3 `@Transactional`이 adapter 레벨에 있음

`grep -rn "@Transactional"` 결과 54개 중 22개가 `adapter/out/persistence/Jdbc*Adapter.kt`에 있다.
대표적으로 `JdbcNotificationDeliveryAdapter`(`server/.../JdbcNotificationDeliveryAdapter.kt:35-53`)는 5개의
`@Transactional` write 메서드를 가진다.

```kotlin
@Transactional
override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> = ...
@Transactional
override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = ...
```

문제는 두 가지다.

1. 트랜잭션 경계가 **outbound port 인터페이스 구현 단위**가 되어, 같은 application
   service가 두 port write를 호출할 때 각각 별도 tx로 commit된다 — 의도가 그렇다면
   괜찮지만, application service 메서드 안에서 두 mutation이 **하나의 atomic
   boundary**여야 한다면 outer service의 `@Transactional`이 propagation REQUIRED로
   이 둘을 묶는 게 맞다. 현재는 outer service에 `@Transactional`이 있으면 inner는
   no-op 처리되지만, outer가 없는 경로에서 어느 쪽으로 동작할지 코드만 봐서는
   추적이 어렵다.
2. `@Transactional` annotation이 application port out 인터페이스에는 없고 adapter
   구현에만 있다. application 레이어가 transactional 의도를 알 수 없으므로 **port가
   sync인지 async인지, 호출자가 트랜잭션을 가져야 하는지** 명세가 코드에 없다.

권장: **application service에만 `@Transactional`을 두고, adapter에서는 제거**한다.
adapter가 굳이 자체 tx를 가져야 하는 경우는 service 호출 경로 밖에서 직접 호출되는
scheduler/Kafka listener인데, 그 경우엔 listener/scheduler가 tx 경계의 owner가 되는
게 맞다. 이행 PR은 feature 단위로 끊고, `MySqlQueryPlanTest` 회귀가 없는지로 검증할
수 있다.

#### 1.4 트랜잭션 isolation 의도 문서화 부재 [v1 인지됨, 보강]

`@Transactional(isolation = Isolation.READ_COMMITTED)` 명시는 `GoogleLoginService` 단
한 곳뿐이다(grep `isolation` → 단 2 hit). v1 TASK-027이 명시 추가를 제안했지만, 더
유익한 것은 **isolation이 다른 service에 어떤 영향을 주는지의 결정 표**를
`docs/development/technical-decisions.md`에 한 번 정리하는 것이다. MySQL InnoDB
REPEATABLE READ + gap lock의 phantom-free 특성, 그리고 invitation accept처럼
membership read + write가 이어지는 구간에서 어떤 read view를 원하는지가
1문단으로 정리돼야 향후 PR 리뷰가 빨라진다.

#### 1.5 우선순위: 중간 (P1)

---

### 2. 보안 — Defense in depth가 다음 단계에서 부족해지는 지점들

#### 2.1 BFF Origin allowlist의 wildcard 부재가 곧 부담이 됨

`SecurityConfig`의 `READMATES_ALLOWED_ORIGINS`는 명시 enumeration만 허용한다
(`docs/development/architecture.md:168` "wildcard suffix로 넓게 열지 않는다"). 멀티 클럽
플랫폼을 운영하면서 N개의 active club_domain을 지원할 때 origin allowlist가 N개로
선형 증가한다. **`club_domains` 테이블을 읽어 allowlist를 동적으로 빌드**하는
`DynamicAllowedOriginsResolver`가 있어야 운영자가 .env를 갱신할 필요 없이 새 alias가
allowlist에 들어간다. 현재는 `READMATES_ALLOWED_ORIGINS`가 정적이라, 새 클럽 alias가
ACTIVE가 됐을 때 backend env 갱신 + 재시작이 필요하다. 이 점은 `docs/deploy/multi-club-domains.md`
에도 명시되어 있을 가능성이 높다(미확인).

권장 인터페이스:

```kotlin
interface AllowedOriginPort {
    fun isAllowed(origin: String): Boolean
}
class StaticAndClubDomainAllowedOriginAdapter(
    private val staticOrigins: Set<String>,
    private val clubDomainPort: ActiveClubDomainPort,
) : AllowedOriginPort {
    override fun isAllowed(origin: String): Boolean =
        origin in staticOrigins || clubDomainPort.isActiveOrigin(origin)
}
```

#### 2.2 `BffSecretFilter`의 secret rotation 윈도우 [v1 TASK-071]

현재 `READMATES_BFF_SECRET`은 단일 값이다. v1 plan TASK-071이 multi-secret을 제안하지만,
한 가지 추가 고려: **rotation cutoff을 추적하는 audit log**가 없으면 secondary secret이
실제로 사용되었는지를 확인할 길이 없다. `notification_test_mail_audit`처럼
`bff_secret_rotation_audit(secret_alias, used_at, ip_hash)` table을 두면 secondary가
충분히 propagate되었는지 확인하고 primary를 안전하게 쓰레기통에 보낼 수 있다.

#### 2.3 BFF가 Spring upstream의 `Set-Cookie` host scope를 검증하지 않음

`front/functions/api/bff/[[path]].ts:165-168`에서 `copyUpstreamHeaders(upstream.headers)`로
upstream Set-Cookie를 그대로 forward한다. Spring이 의도한 `cookie domain`이 BFF의
host와 다르면 브라우저는 set 요청을 무시하지만, **악성 upstream이 host를 잘못 설정해
보내면 무성격 cookie**가 생길 수 있다(현실적으로 readmates 운영 환경에서는 self-trust
이므로 위협이 낮음). Defense in depth 차원에서 `_shared/proxy.ts`의 `copyUpstreamHeaders`
가 `Set-Cookie`의 `Domain` attribute를 strip해 BFF host scope로만 set 되도록
재작성하는 옵션이 있다.

#### 2.4 RateLimit의 sensitive flag fallback 정책 [v1 인지됨]

`RateLimitFilter`는 `sensitive=true` 요청에 대해 Redis 장애 시 어떻게 동작할지를
`readmates.rate-limit.fail-closed-sensitive` flag(default=false)에 의존한다. 운영 정책 표가
한 곳에 정리돼 있지 않다. application.yml에 같은 라인으로:

```yaml
readmates:
  rate-limit:
    enabled: false
    # invitation accept, feedback upload는 sensitive=true.
    # Redis 장애 시 sensitive 요청 정책: false → fail-open(허용), true → 503 반환.
    # 권장: production은 true, dev는 false.
    fail-closed-sensitive: false
```

이 1주석이 readme보다 중요하다.

#### 2.5 IP hash의 salt 회전 부재

`RateLimitFilter`가 IP를 hash 처리하지만, hash salt 자체가 rotate되지 않는다.
1년 단위로 rate-limit key의 IP hash space는 `H(ip || salt)`인데, salt가 정적이면
**같은 IP를 가진 동일 사용자**의 요청 패턴 분석 가능성이 누적된다. salt를 매주
rotate(`ip_hash_salt_v{ISO_WEEK}`)하면 cross-week linking이 깨진다. Trade-off는 token
bucket이 주 경계에서 reset된다는 점이지만, rate limit은 단기 정책이므로 무방하다.

#### 2.6 우선순위: 중간 (P1) — 2.1 (dynamic allowed origins)는 멀티 클럽 운영 시 빠르게 현실화됨

---

### 3. 성능 & 확장성 — Query budget의 다음 lens

#### 3.1 Prometheus scrape마다 DB 쿼리가 발생

`ReadmatesOperationalMetrics.kt:71-77`은 `Gauge.builder("readmates.notifications.outbox.backlog") { port.deliveryBacklog().count(status) }`로
4개 status에 대해 Gauge를 등록하는데, **각 Gauge는 scrape마다 콜백을 실행**한다.
즉 Prometheus가 15초마다 scrape하면 **scrape당 4 × `select status, count(*) ... group by status`**
쿼리(adapter 내부에서 `deliveryBacklog()`는 1쿼리)가 발생한다. 정확히는 backlog
계산이 `count_per_status` 1 query로 합쳐져 있으므로 scrape당 4 callback × 1 query =
**한 scrape마다 4번의 동일 쿼리** 실행이다.

권장: `ScheduledExecutorService` 또는 Spring `@Scheduled`로 1분 단위 backlog snapshot을
in-memory에 캐싱하고 Gauge는 cached value를 반환하게 한다.

```kotlin
@Component
class CachedNotificationBacklogProvider(
    private val port: NotificationDeliveryPort,
) {
    private val cached = AtomicReference(NotificationDeliveryBacklog(0, 0, 0, 0))

    @Scheduled(fixedDelay = 60_000)
    fun refresh() { cached.set(port.deliveryBacklog()) }

    fun snapshot() = cached.get()
}
```

이러면 scrape는 메모리 read 1회로 끝난다.

#### 3.2 N+1 회피의 가독성 저하 [v1 TASK-022a 보강]

`JdbcNotesFeedAdapter.loadNoteSessions`(`server/.../JdbcNotesFeedAdapter.kt:27-106`)는
페이지당 4개 correlated subquery로 question/one-liner/long_review/highlight count를
계산한다. v1 plan은 LEFT JOIN + GROUP BY 재작성을 제안한다. 추가 관찰:

- 4 subquery 모두 `participation_status = 'ACTIVE'` + `visibility = 'PUBLIC'` 같은
  공통 술어가 있다. 별도 **summary 뷰**(`session_note_counts_v`)를 만들어 application은
  view를 join만 하면 SQL shape가 단순해진다.
- 다만 view를 두면 cache invalidation이 view 내부에 묶이므로 **MySQL materialized view
  대신 stored summary table**(write side에서 trigger로 갱신)이 한 단계 보수적이다.
  read-heavy 통계는 source-of-truth와 분리하는 게 자연스럽다.

#### 3.3 `select *`의 schema drift 위험 [v1 TASK-020 보강]

`JdbcFeedbackDocumentStoreAdapter`의 outer `select *`는 inner subquery의 8개 column을
explicit list로 갖고 있어서 inner 변경 시 row mapper가 즉시 깨지긴 한다. 그러나
**document table에 PII column(예: 향후 `signed_by_email`)을 추가**하면 outer
`select *` 경로로 row mapper가 무지각으로 노출시킬 수 있다(현실적으로는 lazy
mapping이라 read 시 ignore되지만, surprising). column projection 명시는 보수적이고,
v1 TASK-020을 그대로 진행하는 것을 권장한다.

#### 3.4 `archive detail` query budget 14가 큼

`ServerQueryBudgetTest.kt:71` "archive detail currently hydrates several independent
detail sections without batching" 주석이 budget이 14라는 사실을 정직하게 인정한다.
14개 prepareStatement 중 review section, feedback section, history section, attendance
section이 독립 쿼리로 가져온다는 의미다. 이는 application-level batch read의 좋은
후보다 — 각 detail section의 응답 type을 `ArchiveDetailFragment`(union)로 두고
**한 번의 컨트롤러 호출에서 4개 query만 fetch**하는 방향으로 단순화할 수 있다.
Frontend는 이미 archive route loader를 통해 single fetch이므로, server 변경 효과가
즉시 latency 감소로 나타난다(MySQL round-trip 14 → 4).

#### 3.5 Public cache가 Redis-옵션, default off

`docs/development/architecture.md:174` "Redis는 선택 계층이며 기본 설정에서는 꺼져 있다."
public 사이트는 cache 없이 매번 MySQL hit이다. 운영 cost가 작은 동안은 OK이지만,
포트폴리오로 공개되어 inbound traffic이 늘어나면 **public-only cache(Cloudflare cache
header)**가 더 합리적이다. Spring `/api/public/**` 응답에 `Cache-Control:
public, s-maxage=120, stale-while-revalidate=600`을 붙이면 Cloudflare CDN이 그대로
캐싱한다(Pages Functions가 `Cache-Control`을 forward 하는지 확인 필요). Redis 활성화
없이 cost 0으로 large-multiplier 효과.

#### 3.6 우선순위: 높음 (P0~P1) — 3.1 backlog gauge는 production 부하 즉시 감소; 3.5는 무료 quick win

---

### 4. 데이터 모델 & 도메인 — 다음 1년의 진화

#### 4.1 Membership status enum이 V11 추가, V18 추가, V21 추가로 누적되었다

`memberships.status`는 V1 baseline(`INVITED, ACTIVE, INACTIVE`) →
V11(`VIEWER` 추가) → V?(`SUSPENDED, LEFT` 추가) 순으로 늘어났는데 명확한 finite state
machine은 코드에 명시돼 있지 않다. `MembershipStatus.kt`(`auth/domain/MembershipStatus.kt`)
enum에 `STATUS_TRANSITIONS: Map<From, Set<To>>` 같은 명시적 transition table이 있으면
1) `MemberLifecycleService`의 mutation 로직이 단순해지고 2) 새 상태 추가 시 PR diff에
허용된 transition만 명시적으로 보인다.

```kotlin
enum class MembershipStatus {
    INVITED, ACTIVE, VIEWER, SUSPENDED, LEFT, INACTIVE;

    companion object {
        val transitions: Map<MembershipStatus, Set<MembershipStatus>> = mapOf(
            INVITED to setOf(ACTIVE, VIEWER, INACTIVE),
            VIEWER to setOf(ACTIVE, INACTIVE, LEFT),
            ACTIVE to setOf(SUSPENDED, LEFT, INACTIVE),
            SUSPENDED to setOf(ACTIVE, INACTIVE, LEFT),
            // LEFT, INACTIVE는 terminal
        )
    }

    fun canTransitionTo(next: MembershipStatus): Boolean =
        next in (transitions[this] ?: emptySet())
}
```

#### 4.2 `sessions.state` 4개와 `sessions.visibility` 3개 사이의 invariant

`docs/development/architecture.md:213-216`은 state × visibility 매트릭스의 의도를
설명하지만, **PUBLISHED + HOST_ONLY**, **DRAFT + PUBLIC** 같은 위험한 조합은 application
가드만으로 막힌다. 즉 schema에는 invariant이 없다. 권장:

```sql
alter table sessions
  add constraint sessions_published_visibility_check
  check (state != 'PUBLISHED' or visibility in ('MEMBER', 'PUBLIC'));
```

PUBLISHED + HOST_ONLY가 schema에서 reject되면 publish 경로의 application 가드 회귀가
잡힌다. DRAFT + PUBLIC을 허용할지(미공개 책 정보를 PUBLIC tag로 흘려보내지 않게)는
제품 결정이지만, V14/V15의 visibility 도입 의도를 보면 DRAFT는 보통 HOST_ONLY/MEMBER만
유효하다. 동일 패턴으로 check constraint 추가 가능.

#### 4.3 `users` table의 `password_hash`, `password_set_at`이 dead column

`V1__readmates_mysql_baseline.sql:18-19`에 `password_hash`, `password_set_at`이 있고
`auth_provider check ('PASSWORD', 'GOOGLE')`이지만, 운영은 Google OAuth만 사용하고
password endpoint는 `410 Gone`이다. **dead column 정리 PR**이 필요하다. 단순 drop
대신 V23 migration에서:

1. `password_hash` → `legacy_password_hash`(deprecated naming) rename
2. 다음 release tag에서 drop

2-step drop으로 해야 하는 이유는 production에 두 버전 backend image가 동시에 떠
있는 짧은 transition window가 존재할 수 있기 때문(deploy-server.yml은 single replace
배포지만, 미래 multi-instance 시 보호).

#### 4.4 `clubs.status` enum이 `SETUP_REQUIRED` 시작 상태를 가진다

V21이 `clubs.status check ('SETUP_REQUIRED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')`를
도입했지만 이 상태가 어떻게 ACTIVE로 전이되는지의 application 코드가 분산돼 있다.
`PlatformAdminController`/`InvitationService`가 club 생성 시 SETUP_REQUIRED로 만들고
첫 host가 들어오면 ACTIVE로 옮긴다(추정). `ClubLifecycleService`(없음)를 만들어
**club 상태 전이도 hexagonal slice의 application service로 응축**하면, 향후
CLUB_SUSPENDED 같은 운영 액션 추가가 용이하다.

#### 4.5 `support_access_grants`가 멀티 클럽 platform admin 모델의 핵심인데 표면화 안 됨

V21 `support_access_grants` table은 platform admin이 특정 club의 host 도구에 한시적
접근을 받기 위한 design인데, application 코드에서 이 table을 read/write하는 곳이
거의 없다(현재 grep 미수행이지만 platform admin route가 active한지 확인 필요).
운영 procedure(`docs/deploy/oci-backend.md`?)에 emergency support flow가 명시돼야
"platform admin이 특정 클럽 호스트에 잠시 들어가는 길"이 안전하게 운영된다.

#### 4.6 우선순위: 중간 (P1) — 4.2 schema invariant는 1줄 PR, 즉시 진행 가능

---

### 5. 관측성 & 운영 — trace, log, metric의 격차

#### 5.1 traceId가 client에 노출되지 않음 [v1 TASK-031 인지됨, 확장]

v1 plan TASK-031이 `ApiErrorResponse.traceId`를 제안한다. 추가로:

- **400/404 정상 응답**에도 `traceId` 또는 `requestId`가 있어야 사용자 신고 시 server
  log에서 5xx 외의 흐름도 추적할 수 있다. `ApiErrorResponse`만이 아니라 **모든 응답
  envelope**에 `X-Readmates-Request-Id` response header를 일관 부여한다.
- Spring은 `MDC`로 traceId를 잡고 logback pattern에서 `%X{traceId}`로 찍는다. Micrometer
  Tracing이 이미 있다면 hand-off가 그쪽으로 자연스럽다(`server/build.gradle.kts`에
  `micrometer-registry-prometheus`만 있고 tracing은 없음 — `micrometer-tracing` +
  `micrometer-tracing-bridge-otel` 추가 검토).

#### 5.2 Notification side-effect의 metric label 카디널리티

`ReadmatesOperationalMetrics.sent(eventType)`은 `eventType.name`을 tag로 둔다.
`NotificationEventType` enum이 4개라 카디널리티는 안전. 향후 channel(`EMAIL`, `IN_APP`,
`WEB_PUSH`?)이나 club_id를 tag로 추가하려는 유혹이 있을 텐데, **club_id는 절대 tag로
넣지 않는다**(클럽 수가 늘면 metric 수가 폭발). 대신 별도 audit log/aggregate table.

이 정책은 코드 주석으로 명시:

```kotlin
// metric tag policy: enum(low cardinality) only.
// club_id, recipient_email, event_id는 tag로 사용 금지.
fun sent(eventType: NotificationEventType) { ... }
```

#### 5.3 `internal/health`와 `actuator/health`의 분리

`application.yml`은 `management.server.port: 8081`(internal), main 8080에 `/internal/health`
가 있다. 운영 firewall에서 8081을 막는 정책은 [v1 인지됨]. 추가로:

- **`/internal/health`가 readiness인지 liveness인지 코드만 봐서는 모호**하다. Kubernetes/
  ECS-style이 아니라 single-VM compose deploy이므로 빈도가 낮지만, 한 줄 주석:
  ```kotlin
  // 8080 /internal/health: liveness (process up)
  // 8081 /actuator/health: readiness (DB/Redis/Kafka)
  ```
- Caddyfile/`readmates-stack.service`에서 어느 포트를 health로 쓰는지의 계약을 한 곳에
  적어둔다(`docs/deploy/oci-backend.md`).

#### 5.4 Kafka relay/consumer가 main process와 동거

[v1 TASK-075 ADR 인지됨]. 추가 관찰: `ReadmatesApplication.kt` 단일 모듈에서 web,
scheduler, Kafka listener가 함께 boot된다. 이는 단일 instance가 죽으면 web과 notification
relay가 동시 정지한다는 의미. 운영 시점에 다음 두 가지 중 하나를 선택해야 한다.

- **단일 instance 유지**: `notification.worker.enabled=false`로 web replica를 늘리고,
  cron/relay는 별도 instance 1개에서만 켠다. compose/systemd가 두 변형 image를 동일 jar로
  돌릴 수 있게 `--enable-relay` flag를 추가.
- **모듈 분리**: Gradle multi-module로 `server-relay`(spring-kafka + scheduler만), `server-app`
  (web + scheduler 외) 둘로 split.

ADR을 우선 작성하고 결정.

#### 5.5 우선순위: 높음 (P1) — 5.1 traceId, 5.2 metric tag policy는 production 진화 비용 절감 직접 영향

---

### 6. 테스트 전략 — 가드레일은 좋고, contract test가 다음

#### 6.1 Contract test가 frontend fixture 비교에 그침

`front/tests/unit/api-contract-fixtures.test.ts`는 frontend 측 fixture가 일정 shape인지
검증한다. 그러나 **server `MockMvc` 응답이 그 fixture와 일치한다는 보장**은 없다.
v1 TASK-070의 OpenAPI emission이 정답이지만 1주 plan이 아니다. 더 가벼운 중간 단계:

```kotlin
// server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt
@SpringBootTest
class FrontendFixtureContractTest {
    @Test
    fun `current session response matches frontend fixture shape`() {
        val response = mockMvc.perform(get("/api/sessions/current")...).andReturn().response
        val actualKeys = JsonPath.read<Map<String, Any>>(response.contentAsString, "$").keys
        val expectedKeys = readFrontendFixture("current-session-empty.json").keys
        assertThat(actualKeys).isEqualTo(expectedKeys)
    }
}
```

JSON path 기반 key set 비교만으로도 80% 커버. 서버에 `front/tests/unit/__fixtures__`를
복사하지 말고, **Gradle의 `testFixtures` source set**으로 frontend fixture를 server test
classpath에 노출하면 single source of truth가 유지된다. 이행 PR은 v1 TASK-070보다
훨씬 작다.

#### 6.2 e2e가 Chromium-only, sequential, single shard [v1 TASK-072 인지됨]

`playwright.config.ts:38-39` `fullyParallel: false`, `workers: 1`. 9 spec이 sequential이라
wall time이 길다. v1 TASK-072가 multi-project + sharding을 제안. 추가 관찰: webServer
2개(spring boot + vite)가 매번 fresh start된다(`reuseExistingServer: false`). PR마다
runner cost가 의외로 큼. CI cache(JDK toolchain, gradle wrapper, vite cache)를 명시적으로
warm하고, e2e DB schema는 fingerprint match면 reuse하는 룰을 `readmates-e2e-config.ts`
가 이미 갖고 있는지 확인 필요.

#### 6.3 Adapter unit test의 deterministic test data 빌더 부재

`@Sql` raw insert가 `ServerQueryBudgetTest.kt:140-162`처럼 길다. 동일한 fixture가
여러 테스트에 반복되면 DRY 위반이고, 운영 schema 변경 시 한 줄씩 fix해야 한다.
**`TestDataBuilders` Kotlin DSL**:

```kotlin
fun openSession(block: SessionBuilder.() -> Unit): UUID {
    val builder = SessionBuilder().apply(block)
    jdbcTemplate.update(builder.toInsertSql(), *builder.toArgs())
    return builder.id
}
// usage
openSession {
    clubId = clubReadingSai
    state = "OPEN"
    bookTitle = "삭제 예산 테스트 책"
    sessionDate = LocalDate.parse("2026-05-20")
}
```

이행 PR은 점진적; 한 spec씩.

#### 6.4 frontend test 파일이 28k LOC, source가 28.4k LOC

거의 1:1 비율. `host-dashboard.test.tsx`(1346), `host-session-editor.test.tsx`(1290) 등
1000+ LOC test가 5개. 이 자체는 좋은 신호이지만 **single test file이 1000 LOC**라는
건 setup이 inline으로 반복된다는 뜻. `front/tests/unit/__shared__/*-render-helpers.ts`로
render shell + provider stack을 묶어 test당 100~200 LOC로 줄일 수 있다.

#### 6.5 우선순위: 중간 (P1) — 6.1 contract bridge가 가장 큰 ROI

---

### 7. 프론트엔드 — 데이터 페치/캐싱과 단일 청크

#### 7.1 단일 청크 441 KB + vendor 277 KB = 약 720 KB JS, lazy 분할 0개

`grep -c "lazy("` = 0(`router.tsx` + `main.tsx`). `dist/assets/index-*.js`는 441 KB.
모든 라우트(public landing + member app + host app + platform admin)가 단일 chunk에
들어 있다. Public landing 진입자가 host editor JS를 다운로드하는 셈이다. 라우트 분할:

```tsx
const ArchiveRoutePage = lazy(() => import("@/src/pages/archive"));
const HostSessionEditor = lazy(() => import("@/src/app/host-route-elements"));
// loader는 dynamic import + named export로 hydrate
```

React Router v7의 `lazy()` 라우트 옵션(별도 lazy import 함수, loader/action까지 함께
lazy)이 가장 깔끔하다.

```ts
{
  path: "host/sessions/:sessionId/edit",
  lazy: async () => {
    const m = await import("@/features/host/route/host-session-editor-route");
    return { Component: m.EditHostSessionRouteElement, loader: m.hostSessionEditorLoader };
  },
},
```

기대 효과: public landing 진입 청크가 ~150-200KB로 줄어 LCP가 모바일에서 명확히 개선.

#### 7.2 Loader 결과를 React Router 외부에서 다시 fetch하는 패턴 부재 검증 필요

React Router v7의 `loader` + `useLoaderData`는 navigation마다 다시 호출된다. 한
세션 상세를 보고 archive로 돌아왔다 다시 같은 세션을 보면 server에 다시 query.
**route-level cache**가 없으므로 동일 fetch가 반복된다. 작은 quick win:

- `revalidate: false`로 `/api/me` profile 같은 anti-revalidation 케이스를 표시
  (이미 `notesFeedShouldRevalidate`가 있다 → 패턴 확산)
- 또는 React Router `staleTime` 옵션이 v7에 없으면, loader에서 `caches`(Cache API)를
  사용해 short TTL로 stale-while-revalidate

다만 ReadMates 규모에선 over-engineering이 될 수 있으므로, **Lighthouse + Chrome
DevTools profile로 실제 visit pattern**을 측정하고 결정. 안 해도 사용자 체감 큰
차이 없을 수 있음.

#### 7.3 Form state가 36 useState, useCallback 0 [host-session-editor.tsx]

`host-session-editor.tsx`가 36 useState + 0 useCallback/useMemo로 구성됨. 부모 props
변경 시 모든 자식 컴포넌트가 리렌더된다. v1 TASK-042가 form/effects split을 제안하지만
splitting만으로는 리렌더 비용이 줄지 않는다. 다음 step:

- **`useReducer`로 form state 단일화**. 36 setState → 1 dispatch.
- **`React.memo` + `useCallback`**으로 panel(`AttendancePanel`, `BasicSessionPanel`,
  `PublicationPanel`, `DocumentStatePanel`) 단위로 prop equality 분리.

자료: `front/features/host/ui/host-session-editor.tsx:147-180+` form state 라인.

#### 7.4 `JsonResponse<T>` 패턴이 type-safety에 유익하지만 ad-hoc

[v1 TASK-048 인지됨]. 추가 관찰: `parseReadmatesResponse`에서 zod/valibot 같은 runtime
validator가 없다. 즉 server가 contract 외 field를 보내거나 type이 달라도 frontend는
런타임 오류로 발견한다. **OpenAPI codegen 도입(v1 TASK-070)**이 정공법이지만 그 전
중간 단계로 host-side critical contract(`HostSessionDetailResponse`,
`HostNotificationDelivery`)에 zod schema 한정 적용하면 dev mode에서 pre-prod에 잡힌다.
`zod` 추가 의존성 비용이 8KB이므로 dev-only로 두면 production bundle엔 영향 없음.

#### 7.5 CSS 4018 LOC 통합 [v1 TASK-046, 047 인지됨]

`globals.css`(1620) + `mobile.css`(1485) + `tokens.css`(913). v1 plan의 page-section
split은 mechanical refactor이고 정답이다. 부가 의견:

- **`mobile.css` 분리는 desktop/mobile dual-rendering 전략과 결합**되어야 한다. 컴포넌트가
  `archive-desktop.tsx`/`archive-mobile.tsx`로 split되면 CSS도 동일 폴더에 짝으로 두는
  쪽이 cohesion 측면에서 better. CSS Module 도입이 큰 일이라면 우선은 컴포넌트 옆에
  같은 이름 `.module.css` 파일로 두는 것만 해도 충분.
- `tokens.css`(913 LOC)는 design token이 풍부하다는 뜻이지만, **사용되지 않는 token을
  prune**하는 dead-token check가 ESLint stylelint plugin으로 가능하다. 1년 운영 후
  설계 token이 늘어나면 dead가 발생하기 시작한다.

#### 7.6 우선순위: 중간 (P1) — 7.1 lazy split은 사용자 체감 1순위

---

### 8. 제품 기능 — 멀티 클럽 + 알림의 다음 단계

#### 8.1 멤버 알림함의 read state UX

`member_notifications.read_at` schema가 단일 datetime — bulk read 액션이 모든 row를
지금 timestamp로 갱신한다. 이는 향후 "이 알림은 archived가 아니라 dismiss했음" 구분이
필요해질 때 enum 추가가 필요하다. V20에서 enum이 아닌 nullable datetime으로 둔 것은
보수적 선택이지만, **`archived_at` 같은 secondary state가 필요할지** 운영 결정.
지금 결정 안 해도 되지만 schema는 그대로 두고 application 측에 `NotificationLifecycle`
enum을 두는 정도가 안전.

#### 8.2 알림 채널 확장 시 `notification_deliveries.channel`이 막힌다

V20 `notification_deliveries.channel check ('EMAIL', 'IN_APP')`. Web Push, Slack,
KakaoTalk 추가 시 check constraint 변경이 필요. **enum 확장은 V23 migration으로
싸게**. 다만 application 측은 channel별 delivery adapter가 1:1이어야 하므로
`MailDeliveryPort`만 있는 현재 port 그래프가 limit이다. 새 채널 도입 시 port 추가가
선행돼야 한다. 빨리 시도하지 말 것 — 첫 채널 확장 PR이 나올 때 같이 design.

#### 8.3 `feedbackDocumentPdfDownloadsEnabled` flag가 false로 묶여있음

`docs/development/architecture.md:300`에 따르면 PDF download flag는 false. 이 기능은
이미 print route + helper가 만들어져 있고 flag만 false다. 운영 결정으로 disable됐다는
의미인데, **flag가 왜 false인지의 결정 기록이 부족**하다. 운영 회복(원인 → 결정 →
재활성화 조건)을 `docs/development/feature-flags.md`(없으면 신설)에 1단락 정리.

#### 8.4 Multi-club platform UX의 first-time setup이 manual

V21 club_domains/platform_admins/audit_events 도입으로 멀티 클럽 인프라가 schema에는
있지만, **UI상 클럽 생성 → 호스트 초대 → 첫 세션 → 도메인 alias activation까지의
end-to-end 흐름**이 한 화면에서 진행되지 않는 것으로 보인다(`PlatformAdminRoute`만
있음). "클럽 셋업 wizard"(5분 안에 club 운영 시작)는 portfolio 방문자가 즉시 가치를
체험하게 하는 PR로서 매우 효과적이다.

#### 8.5 한국어/영어 i18n 부재가 곧 portfolio 진입 장벽이 됨

`globals.css`/`mobile.css` 안의 한국어 string, server `defaultApiErrorMessage()`의 한국어
copy 모두 hard-coded. 현재 audience가 한국어 사용자 위주라면 적절하지만, 영어 i18n
1단계만 추가해도 GitHub Search/Show HN 진입 시 reach가 올라간다. 큰 일이므로 우선순위
낮음(P3).

#### 8.6 우선순위: 낮음~중간 (P2~P3)

---

### 9. 개발자 경험 (DX) — agent-friendly 환경의 현실 격차

본 항목은 v1과 겹치므로 새 발견만.

#### 9.1 `compose.yml` MySQL은 host-bind, Redis/Kafka는 default 인증 없음 [v1 인지됨]

추가 관찰: 로컬 MySQL이 운영 dump를 import한 적 있다면 `bind-address`가 0.0.0.0이고
host firewall에 의존한다. **`docker-compose.override.yml.example`을 두어 production
secret이 들어간 경우의 안전 default**(127.0.0.1 bind, password 강제)를 한 파일로
제공하는 게 좋다.

#### 9.2 `.env.example` placeholder가 실제 secret과 같은 길이/형식이 아님

placeholder가 `<google-oauth-client-secret>` 같은 angle bracket이다. 실제 secret과
**동일한 길이/문자집합 패턴**으로 만들면 typing test (e.g., `secrets.token_urlsafe(32)`)
가 더 정확해진다. 다만 secret leak 방지엔 영향 없으므로 priority는 낮음.

#### 9.3 LLM agent용 작업 가이드(AGENTS.md)와 `docs/agents/*`가 풍부

이미 매우 잘 정리됨. AGENTS.md는 agent가 PR 작성 시 어떤 검증을 통과해야 하는지를
명시한다. 다음 단계: **agent가 임의 task를 수행할 때의 entrypoint 명령**을 root
`Justfile`(v1 TASK-060)에 묶고, 그 명령이 "agent 자가 검증" 수준에서 실패하면 PR
작성 자체를 막는 hook(claude code hook 또는 git pre-commit) 추가.

#### 9.4 우선순위: 낮음 (P2)

---

## 우선순위 로드맵

| 우선순위 | 항목 | 영역 | 난이도 | 임팩트 | 이유 |
|---------|------|------|--------|--------|------|
| P0 | 보안 history scrub 또는 fresh public repo (v1 TASK-001) | 보안 | M | High | 공개 차단 해소가 모든 portfolio 가치의 전제 |
| P0 | Backlog Gauge → cached snapshot (3.1) | 관측성 | S | High | Prometheus scrape마다 DB 4쿼리 즉시 감소 |
| P1 | dynamic allowed origins resolver (2.1) | 보안/멀티클럽 | M | High | 새 클럽 alias 활성화 시 backend 재시작 불필요 |
| P1 | UseCase 인터페이스 + service split (1.1) | 아키텍처 | M | Medium | 향후 controller가 lifecycle/draft/read 의존 명시 |
| P1 | `@Transactional`을 application service로 모음 (1.3) | 아키텍처 | M | Medium | 트랜잭션 의도가 코드에서 즉시 보임 |
| P1 | `ApiErrorResponse.traceId` + `X-Readmates-Request-Id` (5.1) | 관측성 | S | Medium | 사용자 신고 → log 검색이 1단계로 |
| P1 | sessions invariant check (4.2) | 데이터모델 | S | Medium | 1줄 SQL, application 회귀 즉시 감지 |
| P1 | 라우트 lazy 분할 (7.1) | 프론트엔드 | M | High | 단일 청크 441KB → 200KB 추정, LCP 개선 |
| P1 | public API에 Cache-Control + Cloudflare CDN (3.5) | 성능 | S | High | Redis 활성화 없이 무료 multiplier |
| P1 | `auth/application` 직속 service를 `application/service`로 이동 (1.2) | 아키텍처 | S | Low | 일관성, ArchUnit 룰 추가 가능 |
| P2 | metric tag policy 코드 주석 + ADR (5.2) | 관측성 | S | Medium | club_id tag 폭발 사전 방지 |
| P2 | host-session-editor useReducer + memo (7.3) | 프론트 perf | M | Medium | host UI 리렌더 비용 감소 |
| P2 | server-side contract bridge test (6.1) | 테스트 | M | Medium | OpenAPI codegen 가기 전 ROI 큰 중간 단계 |
| P2 | password_hash dead column 정리 (4.3) | 데이터모델 | S | Low | tech debt |
| P2 | members status FSM 명시 (4.1) | 데이터모델 | S | Low | 향후 상태 추가 PR diff 명료 |
| P2 | BFF rotation audit table (2.2) | 보안 | M | Low | 운영 procedure 명시 |
| P2 | IP hash salt 회전 (2.5) | 보안 | S | Low | tracking surface 감소 |
| P3 | Web Push/Slack/Kakao 채널 확장 design (8.2) | 제품 | L | Medium | 첫 채널 확장 PR과 동시 |
| P3 | 클럽 셋업 wizard (8.4) | 제품 | L | High | portfolio first-impression 극대화 |
| P3 | i18n 영어 1단계 (8.5) | 제품 | L | Medium | reach 확장 |
| P3 | server multi-module split (v1 TASK-074) | 아키텍처 | XL | Medium | 5에서 결정 후 |

---

## 빠른 승리 (Quick Wins) — 1~2일 안에 머지 가능

### QW-1: Backlog Gauge 캐싱 (P0, 30분)

`server/.../ReadmatesOperationalMetrics.kt`의 Gauge 콜백이 매 scrape 호출되어
DB hit. 1분 fixedDelay 캐시로 변경.

```kotlin
@Component
class CachedNotificationBacklog(private val port: NotificationDeliveryPort) {
    private val cached = AtomicReference(NotificationDeliveryBacklog(0, 0, 0, 0))
    @Scheduled(fixedDelay = 60_000) fun refresh() { cached.set(port.deliveryBacklog()) }
    fun snapshot(): NotificationDeliveryBacklog = cached.get()
}
// Gauge.builder("...") { backlog.snapshot().count(status).toDouble() }
```

검증: `MeterRegistry.find("readmates.notifications.outbox.backlog").gauges()`
값이 동일하게 노출되고, `ServerQueryBudgetTest`/Prometheus scrape DB query 카운트가
줄었는지 확인.

### QW-2: Public API에 Cache-Control 헤더 (P1, 1시간)

`server/.../shared/adapter/in/web/HealthController.kt` 또는 public controller에
`@RequestMapping`별로 응답 추가:

```kotlin
@GetMapping("/api/public/clubs/{slug}")
fun getPublicClub(...): ResponseEntity<PublicClubResponse> =
    ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(Duration.ofMinutes(2)).cachePublic().sMaxAge(Duration.ofMinutes(2)))
        .body(...)
```

Pages Functions BFF가 `Cache-Control` response header를 그대로 forward하는지
`copyUpstreamHeaders` 동작 확인 필요. 대부분의 standard header는 strip되지 않음.
검증: Cloudflare cache hit ratio in dashboard.

### QW-3: `sessions` invariant check constraint (P1, 30분)

V23 migration:

```sql
alter table sessions
  add constraint sessions_published_visibility_check
    check (state != 'PUBLISHED' or visibility in ('MEMBER', 'PUBLIC'));
alter table sessions
  add constraint sessions_draft_visibility_check
    check (state != 'DRAFT' or visibility != 'PUBLIC');
```

application code를 신뢰하지만 DB invariant 한 줄로 회귀 보호. Drop 시점은 향후 이
정책이 변경되면 그때.

### QW-4: BFF Set-Cookie domain strip (P1, 1시간)

`front/functions/_shared/proxy.ts`의 `copyUpstreamHeaders`가 `Set-Cookie` header를
copy할 때 `Domain=...` 부분을 제거.

```ts
function stripCookieDomain(rawSetCookie: string): string {
    return rawSetCookie.replace(/;\s*Domain=[^;]+/i, "");
}
```

검증: `front/tests/unit/cloudflare-bff.test.ts`에 case 추가 — upstream이
`Set-Cookie: foo=bar; Domain=upstream.example.com`을 보내면 BFF가 forward한 cookie에
Domain이 없어야.

### QW-5: `hasRole`/CSRF 매처 RoleHierarchy 도입 (P2, 1시간)

`SecurityConfig`에 `RoleHierarchy` bean 도입:

```kotlin
@Bean
fun roleHierarchy(): RoleHierarchy = RoleHierarchyImpl().apply {
    setHierarchy("""
        ROLE_PLATFORM_ADMIN > ROLE_HOST
        ROLE_HOST > ROLE_MEMBER
        ROLE_MEMBER > ROLE_VIEWER
    """.trimIndent())
}
```

이러면 `.hasRole("MEMBER")` 한 줄이 HOST/PLATFORM_ADMIN까지 cover한다.
`SecurityConfig.kt:106-119`의 `hasAnyRole("HOST", "MEMBER", "VIEWER")`가
`hasRole("VIEWER")`로 단순화. `MemberAuthoritiesFilter`/`PlatformAdminAuthoritiesFilter`가
이미 ROLE_*을 부여하므로 호환. 단, **시각적 단순화 + 향후 role 추가 시 매트릭스가
한 곳에 정렬**되는 효과.

### QW-6: traceId MDC + response header (P1, 2시간)

```kotlin
@Component
class RequestIdFilter : OncePerRequestFilter() {
    override fun doFilterInternal(req: HttpServletRequest, res: HttpServletResponse, chain: FilterChain) {
        val id = req.getHeader("X-Readmates-Request-Id") ?: UUID.randomUUID().toString().take(12)
        MDC.put("requestId", id)
        res.setHeader("X-Readmates-Request-Id", id)
        try { chain.doFilter(req, res) } finally { MDC.remove("requestId") }
    }
}
// logback pattern: ... [%X{requestId}] ...
```

`ApiErrorResponse`에 `traceId` 필드 추가는 v1 TASK-031 그대로. frontend `client.ts`는
response header 또는 body field 둘 다 surfacing.

---

## 중장기 과제 (1~3개월)

### Phase A: 도메인 모델·아키텍처 정리 (1개월)

- UseCase 인터페이스 분할(1.1) + service split(v1 TASK-025)
- `@Transactional` 위치 통일 — adapter에서 application service로(1.3)
- `auth/application` → `auth/application/service` 일관화(1.2)
- ArchUnit 룰에 "service는 `application.service`만, adapter에는 @Transactional 금지"
  추가
- members status / sessions state FSM 명시(4.1, 4.2)
- ADR 4개 작성: dynamic origin resolver, multi-secret rotation, multi-module gradle,
  notification worker process

### Phase B: 관측성·신뢰성 (1개월, A와 병행)

- traceId 전체 응답으로 확장(5.1)
- micrometer-tracing + OTel bridge 도입 검토
- backlog gauge 캐싱(QW-1)
- Prometheus dashboard JSON commit(`docs/deploy/prometheus-dashboards/notification.json`)
- club_domain dynamic allowed origins resolver(2.1)
- BFF multi-secret rotation + audit table(v1 TASK-071, 2.2)

### Phase C: 사용자 체감 성능·UX (1개월)

- 라우트 lazy split(7.1) — 단일 청크 441KB 분할
- public API Cache-Control + CDN(3.5)
- archive detail query batching(3.4) — 14 → 4 prepareStatement
- host-session-editor useReducer + memo(7.3)
- frontend zod runtime validator(7.4) — host-side critical contract만

### Phase D: 멀티 클럽 운영 가시화 (선택, 1~2개월)

- 클럽 셋업 wizard(8.4)
- support_access_grants 활용 emergency-access flow + audit UI
- club_audit_events / platform_audit_events surfacing(현재 schema는 있지만 UI 미흡)
- 알림 새 채널(Web Push 1순위) — outbox 패턴은 이미 있으므로 channel + adapter만 추가

### Phase E: Contract 자동화 (1개월, A 완료 후)

- OpenAPI emission(v1 TASK-070) — `springdoc-openapi`
- 프런트 codegen(`openapi-typescript`)
- frontend zod schema는 codegen output에서 derive
- contract drift CI gate

---

## 부록: 본 문서가 새로 분석한 코드 위치

- `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt:68-78`
  Gauge 콜백 → scrape 시 DB 쿼리 발생 (3.1)
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapter.kt:35-53`
  adapter 레벨 `@Transactional` 22개 사례 중 대표 (1.3)
- `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt:27-36`
  5 UseCase 다중 구현 (1.1)
- `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
  `application/` 직속 service 위치 일관성 부재 (1.2)
- `server/src/main/resources/db/mysql/migration/V20__kafka_notification_pipeline.sql:50-86`
  composite FK 좋은 사례 (강점)
- `server/src/main/resources/db/mysql/migration/V21__multi_club_platform.sql:1-90`
  `clubs.status`, `support_access_grants` 등 멀티 클럽 schema 진화 (4.4, 4.5)
- `server/src/main/resources/db/mysql/migration/V1__readmates_mysql_baseline.sql:18-19`
  dead column `password_hash`, `password_set_at` (4.3)
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt:106-119`
  hasAnyRole 반복, RoleHierarchy 미적용 (QW-5)
- `front/functions/api/bff/[[path]].ts:165-168`, `front/functions/_shared/proxy.ts`
  upstream Set-Cookie domain strip 부재 (2.3, QW-4)
- `front/src/app/router.tsx`, `front/vite.config.ts`, `front/dist/assets/index-*.js`(441KB)
  라우트 lazy 분할 0개 (7.1)
- `front/playwright.config.ts:38-39` `fullyParallel:false, workers:1` e2e sequential
  (6.2)
- `front/features/host/ui/host-session-editor.tsx` 36 useState + 0 useCallback (7.3)
- `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt:71`
  archive detail budget 14 (3.4)
- `server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt`
  traceId 필드 부재 (5.1)

---

## v1과의 cross-reference 요약

본 v2가 새로 제기한 항목:

1. UseCase 인터페이스 분할 (v1은 service split만)
2. `@Transactional` adapter→service 이동 (v1은 isolation 명시만)
3. dynamic allowed origins resolver
4. backlog gauge 캐싱
5. archive detail query batching (v1은 N+1 회피만)
6. public API Cache-Control + Cloudflare CDN
7. sessions invariant check constraint
8. members status / sessions state FSM
9. password_hash dead column 정리
10. server contract bridge test (v1 TASK-070 OpenAPI 보강)
11. host-session-editor useReducer + memo (v1은 split만)
12. RoleHierarchy 도입
13. Set-Cookie domain strip
14. metric tag policy 코드 주석
15. IP hash salt 회전
16. BFF rotation audit table
17. zod runtime validator (frontend)
18. 클럽 셋업 wizard
19. 알림 채널 확장 design (web push 등)
20. 영어 i18n 1단계

v1이 이미 인지하고 plan 안에 있는 항목(거대 파일 분해, history scrub, CSS split,
typed-response helper, lazy loading 자체, OpenAPI codegen, Justfile, OSV scanner,
SBOM, multi-secret rotation 등)은 본 문서에서 [v1 인지됨] 또는 [v1 TASK-XXX 인지됨]
태그로 cross-reference만 했습니다. v1과 v2를 합치면 다음 6~12개월 동안 한 명이 부담
없이 돌릴 수 있는 backlog로 충분합니다.

**다음 단계 권장**: 본 문서 P0 2개(history scrub, backlog gauge 캐싱)와 Quick Wins
6개를 우선 1주 안에 처리하고, 그 결과로 v1 plan 36 task의 우선순위를 1번 더
조정하는 retrospective PR을 만드는 것입니다.
