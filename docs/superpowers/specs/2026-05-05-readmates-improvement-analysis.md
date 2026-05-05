# ReadMates 코드베이스 심층 분석 — 개선점 제안

> 분석일: 2026-05-05
> 분석 모델: Claude Opus
> 코드베이스 버전: v1.4.2 (커밋 834fdb5)
> 대상: Kotlin/Spring Boot 352파일 + TypeScript/React 291파일

---

## 요약

22개의 구체적 개선점을 발견했습니다. 우선순위별로 분류하면:

| 우선순위 | 항목 수 | 핵심 내용 |
|---------|--------|---------|
| 높음 | 5개 | 기능 정확성·운영 가시성·버전 일치성에 즉시 영향 |
| 중간 | 12개 | 성능, 아키텍처 일관성, 유지보수성 |
| 낮음 | 5개 | 코드 위생, DX 개선 |

---

## 1. 높음 — 즉시 검토 필요

---

### 1-1. `@ConditionalOnProperty` 중복 사용 — Spring이 하나를 무시할 수 있음

**현재 상태**
아래 7개 파일에서 `@ConditionalOnProperty`가 한 클래스/함수에 두 번 중첩되어 있습니다.

- `notification/adapter/in/kafka/NotificationEventKafkaListener.kt:10-11`
- `notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt:18-19`
- `notification/adapter/out/kafka/NotificationKafkaConfiguration.kt:38-39`
- `notification/application/service/NotificationRelayService.kt:17-18`
- `notification/adapter/in/scheduler/NotificationEventRelayScheduler.kt:12-13, 26-27`

**문제점**
`@ConditionalOnProperty`는 `@Repeatable` 어노테이션이 아닙니다. JVM/Spring 어노테이션 처리 순서에 따라 **첫 번째 또는 두 번째 어노테이션만 적용**될 수 있습니다. `readmates.notifications.enabled=true`이지만 `kafka.enabled=false`인 환경에서 Kafka 빈이 의도치 않게 등록되거나, 반대 경우에 알림이 비활성화될 수 있습니다. 빌드 테스트는 통과하지만 운영 환경에서 토글이 신뢰 불가능해집니다.

**개선 방안**

```kotlin
// 현재 (위험)
@ConditionalOnProperty("readmates.notifications.enabled", havingValue = "true")
@ConditionalOnProperty("readmates.notifications.kafka.enabled", havingValue = "true")

// 개선: SpEL 단일 조건으로 합산
@ConditionalOnExpression(
    "\${readmates.notifications.enabled:false} and \${readmates.notifications.kafka.enabled:false}"
)
```

**예상 효과**: Kafka pipeline 활성화 조건이 단일 진실 소스가 되어 운영 환경 토글이 신뢰 가능해집니다.

---

### 1-2. Flyway migration 디렉토리 두 곳 공존 — 신규 마이그레이션이 production에 적용 안 될 위험

**현재 상태**

- `server/src/main/resources/db/migration/` — V1~V12 (12개 파일)
- `server/src/main/resources/db/mysql/migration/` — V1~V22 (23개 파일)

`application.yml:20`은 `db/mysql/migration`만 사용합니다. `db/migration/`은 사실상 dead code입니다.

**문제점**
신규 contributor(또는 6개월 후의 자신)가 `db/migration/V12__multi_club_platform.sql`을 보고 그 패턴을 따라 `V13__*.sql`을 `db/migration/`에 추가하면, Flyway가 적용하지 않습니다. 에러도 없이 무시됩니다. 이미 `v1.4.x` 기간에 version skew 사고가 발생한 바 있습니다(`docs/deploy/2026-04-25-production-version-skew-report.md`).

**개선 방안**

1. `server/src/main/resources/db/migration/`을 git에서 삭제
2. `application.yml`의 Flyway locations를 명시적 단일 경로로 고정
3. `docs/development/local-setup.md`에 migration 추가 위치 명시

**예상 효과**: 마이그레이션 실수 방지, 저장소 위생 향상.

---

### 1-3. 서버 Docker 이미지를 CI가 빌드·게시하지 않음 — version skew 재발 가능성

**현재 상태**
`.github/workflows/ci.yml`은 `gradlew test`만 실행하고, `deploy-front.yml`은 Cloudflare Pages만 배포합니다. 서버 이미지는 OCI VM에서 수동으로 빌드(`deploy/oci/03-deploy.sh`)되는 구조입니다.

**문제점**
어떤 git commit에서 실행 중인 서버인지 보장할 수 없습니다. `docs/deploy/2026-04-25-production-version-skew-report.md`에 이미 이 문제의 사고가 기록되어 있습니다.

**개선 방안**

```yaml
# .github/workflows/deploy-server.yml (신규)
on:
  push:
    tags: ["v*"]
jobs:
  build-and-push:
    steps:
      - uses: docker/build-push-action@v5
        with:
          context: server
          tags: ghcr.io/${{ github.repository }}/readmates-server:${{ github.ref_name }}
          push: true
```

OCI compose는 `readmates-server:v1.4.2`처럼 git tag와 정확히 일치하는 이미지를 pull합니다.

**예상 효과**: 서버 버전이 git tag와 1:1 대응, 롤백이 tag 지정만으로 가능.

---

### 1-4. 서버 250개 Kotlin 파일 중 SLF4J 로거 사용이 단 2곳

**현재 상태**
`grep -rn "import org.slf4j" server/src/main/kotlin` 결과: `JdbcHostInvitationStoreAdapter.kt`, `LoggingMailDeliveryAdapter.kt` 2개뿐.

운영상 중요한 이벤트들이 로그로 남지 않습니다:

- 세션 OPEN/CLOSE/PUBLISH 전환
- Kafka send 실패
- Redis fallback 발동
- 초대 수락/거절
- BFF secret 검증 실패 (401/403)
- 알림 delivery 실패/dead

**문제점**
사고 발생 시 Prometheus metric 카운트만 보이고, 어떤 사용자의 어떤 요청이 원인인지 추적 불가합니다.

**개선 방안**
최소 다음 위치에 `INFO`/`WARN` 로거 추가:

```kotlin
// NotificationRelayService.kt
logger.info("Relay published eventId={} to Kafka", event.id)
logger.warn("Relay failed eventId={} attempt={}", event.id, attempt, ex)

// HostSessionWriteOperations.kt
logger.info("Session state transition sessionId={} {} -> {}", id, from, to)

// BffSecretFilter.kt
logger.warn("BFF secret mismatch from ip={}", clientIp)
```

**예상 효과**: 사고 조사 시간 단축. 사용자 보고 버그를 로그만으로 재현 가능.

---

### 1-5. HostDashboard(1805줄) / MyPage(1369줄) / HostMembers(1339줄) 컴포넌트 미분리

**현재 상태**
CHANGELOG v1.4.2에 "후속 계획서 3개 추가"로 분리 예정이 이미 명시되어 있습니다.

- `features/host/ui/host-dashboard.tsx` — 1805줄, `useState` 6개+, 데스크톱/모바일 두 레이아웃, SVG 인라인, 헬퍼 다수
- `features/archive/ui/my-page.tsx` — 1369줄
- `features/host/ui/host-members.tsx` — 1339줄

**문제점**
- hot reload 시 전체 파일 재컴파일
- PR diff 가독성 저하 (전체 파일이 변경된 것처럼 보임)
- 단위 테스트가 연관 없는 섹션까지 셋업해야 함
- `host-dashboard.test.tsx`도 1346줄로 동반 비대화

**개선 방안**
이미 작성된 계획서대로 진행합니다:

```
features/host/ui/
  host-dashboard/
    dashboard-summary.tsx        # 클럽 통계 요약
    dashboard-upcoming.tsx       # 예정 세션 섹션
    dashboard-checklist.tsx      # 호스트 체크리스트
    dashboard-quick-actions.tsx  # 빠른 실행 버튼
    dashboard-icons.tsx          # 인라인 SVG 모음
    index.tsx                    # 기존 host-dashboard.tsx → 조합만
```

**예상 효과**: PR diff 명확화, 테스트 격리, 향후 디자인 변경 비용 감소.

---

## 2. 중간 — 다음 스프린트 내 계획 권장

---

### 2-1. 미사용 JPA 의존성 — Spring Boot 부팅 시간·이미지 크기 낭비

**현재 상태**
`server/build.gradle.kts:4`에 `kotlin("plugin.jpa")`, `:25`에 `spring-boot-starter-data-jpa`가 있습니다. 그러나 `@Entity`, `JpaRepository`, `EntityManager`를 사용하는 파일은 0개입니다. 모든 persistence는 `JdbcTemplate` 기반(JDBC 어댑터 25개)입니다.

`application.yml:14-17`에 `spring.jpa.hibernate.ddl-auto: validate`가 설정되어 있어 매 부팅 시 Hibernate가 메타데이터 검증을 시도합니다.

**개선 방안**

```kotlin
// build.gradle.kts
// 제거
kotlin("plugin.jpa")
implementation("org.springframework.boot:spring-boot-starter-data-jpa")

// 추가 (이미 있다면 유지)
implementation("org.springframework.boot:spring-boot-starter-jdbc")
```

`application.yml`에서 `spring.jpa.*` 블록도 제거합니다.

**예상 효과**: 부팅 시간 약 1~2초 단축, Docker 이미지 약 10~15 MB 감소.

---

### 2-2. Notes feed 상관 서브쿼리 N+1 패턴

**현재 상태**
`note/adapter/out/persistence/JdbcNotesFeedAdapter.kt:36-96`의 `loadNoteSessions`가 세션 행마다 4개의 상관 서브쿼리를 실행합니다:

```sql
(SELECT COUNT(*) FROM questions WHERE session_id = s.id AND ...)
(SELECT COUNT(*) FROM one_line_reviews WHERE session_id = s.id AND ...)
(SELECT COUNT(*) FROM long_reviews WHERE session_id = s.id AND ...)
(SELECT COUNT(*) FROM highlights WHERE session_id = s.id AND ...)
```

각 서브쿼리는 다시 `session_participants`에 대한 EXISTS 서브쿼리를 포함합니다. 페이지 50건이면 200+ 서브쿼리 plan이 생성됩니다.

**개선 방안**

```sql
-- 상관 서브쿼리 → GROUP BY 단일 패스로 변경
LEFT JOIN (
  SELECT session_id, COUNT(*) as question_count
  FROM questions q
  JOIN session_participants sp ON sp.session_id = q.session_id
  WHERE sp.club_id = :clubId
  GROUP BY session_id
) qc ON qc.session_id = s.id
```

또는 Redis notes-cache가 이미 있으므로, 페이지 응답 자체를 캐싱하는 것이 더 단순합니다.

**예상 효과**: notes 피드 응답 시간 50% 이상 단축, MySQL CPU 감소.

---

### 2-3. `AuthenticatedMemberResolver`가 application 계층에서 Spring Security에 직접 의존

**현재 상태**
`auth/application/AuthenticatedMemberResolver.kt:10`:

```kotlin
import org.springframework.security.core.Authentication
```

클래스 시그니처가 `Authentication?`을 직접 받습니다.

`ServerArchitectureBoundaryTest.kt`는 application이 `org.springframework.web`, `jdbc`, `dao`, `redis`에 의존 못 하게 하지만 `org.springframework.security`는 누락되어 있어 이 위반이 테스트를 통과합니다.

**개선 방안**

1. 시그니처를 이미 존재하는 `CurrentMember` 도메인 타입으로 변경
2. Spring Security ↔ 도메인 타입 변환은 `adapter/in/security`에서만 수행
3. ArchUnit 룰에 `org.springframework.security..` 금지 prefix 추가

```kotlin
// ServerArchitectureBoundaryTest.kt 추가
.should().onlyDependOnClassesThat()
    .resideOutsideOfPackage("org.springframework.security..")
```

**예상 효과**: application service를 Spring Security 없이 순수 단위 테스트 가능.

---

### 2-4. `JdbcTemplate ObjectProvider` 패턴 — 장애를 200으로 가림

**현재 상태**
25개 JDBC 어댑터 파일에서 `jdbcTemplateProvider.ifAvailable ?: return null`(또는 `return emptyList()`). 예:

- `JdbcNotesFeedAdapter.kt:26, 138, 312`
- `JdbcArchiveQueryAdapter.kt:28`
- (외 22개 어댑터)

**문제점**
DataSource가 부재한 시나리오는 정상 운영이 아닙니다. `ifAvailable`이 `null`을 반환하면 application service가 빈 결과를 받아 정상 200으로 응답합니다. 사용자에게 "데이터가 없음"으로 잘못 보이고, 실제 장애는 숨겨집니다.

**개선 방안**

```kotlin
// 현재 (위험)
class JdbcNotesFeedAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>
) {
    fun loadFeed(): List<...> {
        val jdbc = jdbcTemplateProvider.ifAvailable ?: return emptyList()
        ...
    }
}

// 개선: 직접 주입, 부재 시 부팅 실패
class JdbcNotesFeedAdapter(
    private val jdbc: JdbcTemplate
) {
    fun loadFeed(): List<...> { ... }
}
```

**예상 효과**: 장애 즉시 가시화, 매 호출마다의 `ObjectProvider` 룩업 오버헤드 제거.

---

### 2-5. Kafka Producer 설정 — idempotence/acks 명시 없음

**현재 상태**
`notification/adapter/out/kafka/NotificationKafkaConfiguration.kt:105-114`:

```kotlin
fun notificationProducerConfigs(): Map<String, Any> = mapOf(
    ProducerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers
    // acks, retries, idempotence 설정 없음
)
```

**문제점**
기본값에서는 idempotence가 비활성입니다. broker rebalance 시 메시지 중복 발행 가능. notification outbox의 `dedupe_key`로 consumer 측 멱등성은 있지만 producer 레벨 보호가 없습니다.

**개선 방안**

```kotlin
fun notificationProducerConfigs(): Map<String, Any> = mapOf(
    ProducerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
    ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG to true,
    ProducerConfig.ACKS_CONFIG to "all",
    ProducerConfig.RETRIES_CONFIG to Int.MAX_VALUE,
    ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION to 5,
    ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG to 120_000,
)
```

컨슈머 설정에도 `enable.auto.commit=false`, `isolation.level=read_committed` 명시를 추가합니다.

**예상 효과**: 중복 알림 발생 가능성 감소, 향후 Kafka 버전 업그레이드 시 동작 일관성.

---

### 2-6. `NotificationDeliveryProcessingService`와 `NotificationDispatchService` 로직 중복

**현재 상태**
두 서비스가 거의 동일한 로직을 각자 구현:

- `markFailure`, `requiredDeliveryField`, `retryDelayMinutes`, `staleDeliveryLeaseException`, `toStorageError` 시그니처가 양쪽에 중복
- `NotificationDeliveryProcessingService`: 스케줄러 기반, claim → process
- `NotificationDispatchService`: Kafka listener 기반, persistPlanned → dispatchEmail

**개선 방안**
공통 `NotificationDeliveryEngine`을 추출:

```kotlin
// 공통 엔진
class NotificationDeliveryEngine(
    private val port: NotificationDeliveryWritePort
) {
    fun markFailure(deliveryId: Long, error: String, attempt: Int) { ... }
    fun markSuccess(deliveryId: Long) { ... }
    fun retryDelayFor(attempt: Int): Duration { ... }
}

// 두 서비스는 claiming 전략만 갖고 엔진 재사용
class NotificationDeliveryProcessingService(
    private val engine: NotificationDeliveryEngine, ...
)
class NotificationDispatchService(
    private val engine: NotificationDeliveryEngine, ...
)
```

**예상 효과**: retry 정책 변경이 한 곳에서만 일어남, 회귀 위험 감소.

---

### 2-7. `JdbcNotesFeedAdapter.shortNameFor`에 dev seed 이름 하드코딩

**현재 상태**
`note/adapter/out/persistence/JdbcNotesFeedAdapter.kt:509-517`:

```kotlin
private fun shortNameFor(displayName: String): String = when (displayName) {
    "김호스트" -> "호스트"
    "안멤버1" -> "멤버1"
    "최멤버2" -> "멤버2"
    ...
}
```

**문제점**
Production persistence adapter 안에 dev seed 데이터의 한글 이름이 하드코딩되어 있습니다. `memberships.short_name` 컬럼이 V13 이후 존재하므로 이 함수는 dev seed에서만 효과가 있고, production에서는 무용지물입니다.

**개선 방안**
함수 전체 삭제. seed 데이터에서 처음부터 `short_name`을 채워 저장합니다. 프런트 표시 fallback은 이미 `front/shared/ui/readmates-display.ts`에 있습니다.

**예상 효과**: 어댑터에서 seed 결합 제거, production 코드 순수성 회복.

---

### 2-8. `features/auth/api/auth-api.ts`가 공통 `readmatesFetch` 우회

**현재 상태**
`features/auth/api/auth-api.ts`의 `submitDevLogin`, `fetchInvitationPreview`, `logout`이 `fetch("/api/bff/...")` 직접 호출.

`shared/api/client.ts`의 공통 클라이언트가 제공하는 기능을 받지 못합니다:
- 401 자동 redirect
- multi-club `clubSlug` 컨텍스트 자동 부착
- `cache: "no-store"` 등 일관 정책

**개선 방안**
`auth-api.ts`도 `readmatesFetchResponse`를 사용하도록 통일합니다. 직접 401 분기가 필요한 케이스는 status 코드를 호출자에서 처리합니다.

---

### 2-9. archive/publication 영역 통합 테스트 부족

**현재 상태**
서버 테스트 디렉토리 분포:

| 도메인 | 테스트 수 |
|-------|---------|
| auth | 32 |
| notification | 23 |
| session | 8 |
| note | 7 |
| archive | 5 |
| publication | 3 |
| feedback | 2 |

archive와 publication은 multi-club public 노출 영역인데 테스트가 각각 5/3개입니다. V12/V21 마이그레이션 이후 multi-club 격리 회귀 가능성 영역입니다.

**개선 방안**
- archive: multi-club 격리 통합 테스트 (`@SpringBootTest` + Testcontainers) 추가
- publication: `visibility` × `state` 매트릭스 테스트 (MEMBER vs PUBLIC, CLOSED vs PUBLISHED 4가지 조합) 추가

---

### 2-10. 서버 Dockerfile이 multi-stage 빌드 미사용 — 호스트 빌드 산출물에 의존

**현재 상태**
`server/Dockerfile`:

```dockerfile
FROM eclipse-temurin:21-jre-jammy
COPY build/libs/readmates-server-0.0.1-SNAPSHOT.jar /app/readmates-server.jar
```

`docker build`만으로 이미지를 만들 수 없습니다(사전 `gradle bootJar` 필요).

**개선 방안**

```dockerfile
FROM eclipse-temurin:21-jdk-jammy AS builder
WORKDIR /build
COPY . .
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-jammy
COPY --from=builder /build/build/libs/*.jar /app/readmates-server.jar
```

또는 Spring Boot layered jar로 의존성 레이어 캐싱을 활용합니다.

**예상 효과**: 재현 가능한 이미지, dev/CI 절차 단순화.

---

### 2-11. Vite 번들 — 라우트 lazy loading 미적용

**현재 상태**
`front/vite.config.ts:21-32`:

```ts
rolldownOptions: {
  output: {
    codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] }
  }
}
```

`react`, `react-dom`, `react-router`, 1805줄 host 화면, 1369줄 my-page가 모두 하나의 번들에 포함됩니다. 비-호스트 사용자도 host 코드를 모두 다운로드합니다.

**개선 방안**

```tsx
// router.tsx
const HostDashboard = lazy(() => import("@/src/pages/host-dashboard"))
const MyPage = lazy(() => import("@/src/pages/my-page"))
```

vendor 청크도 `react-vendor`(react/react-dom)와 `router-vendor`(react-router-dom)로 분리합니다.

**예상 효과**: 비-호스트 사용자 초기 페인트 지연 감소, 번들 크기 분산.

---

### 2-12. 에러 트래킹 — Sentry/외부 수신 없음

**현재 상태**
`application.yml:22-39`이 `prometheus`, `metrics`, `health`만 노출합니다. 5xx 응답의 stack trace가 어디에도 영구 저장되지 않습니다.

**문제점**
사고 발생 시 Prometheus에 카운트는 보이지만, 어떤 입력/스택이 원인인지 추적 불가합니다.

**개선 방안**
Sentry Spring Boot SDK (무료 플랜으로 충분) 추가:

```kotlin
// build.gradle.kts
implementation("io.sentry:sentry-spring-boot-starter-jakarta:7.x.x")
```

```yaml
# application.yml
sentry:
  dsn: ${READMATES_SENTRY_DSN:}
  traces-sample-rate: 0.1
```

**예상 효과**: 사고 MTTR 단축, 스택 트레이스 기반 버그 재현.

---

## 3. 낮음 — 기회가 될 때 정리

---

### 3-1. Vite 프로젝트에 `"use client"` 지시문 21개 파일

**현재 상태**
`host-session-editor.tsx:1`, `archive-page.tsx:1`, `book-cover.tsx:1`, `top-nav.tsx`, `login-card.tsx` 등 21개 파일이 `"use client"` 지시문을 갖고 있습니다. 이 프로젝트는 Vite + React Router이며 Next.js와 무관합니다.

**개선 방안**

```bash
grep -rl '"use client"' front/{features,shared,src} | xargs sed -i '' '1{/^"use client"/d;}'
```

---

### 3-2. 비밀번호 초기화 라우트 — dead code 여부 명시 필요

**현재 상태**
서버: `PasswordAuthController.kt:18-19` → 410 GONE
프런트: `router.tsx:260` `/reset-password/:token` 라우트 + `password-reset-card.tsx` 컴포넌트 잔존

**개선 방안**
historical URL 호환을 위한 의도적 안내 페이지라면 컴포넌트 상단에 주석 추가:

```tsx
// 비밀번호 로그인 종료 안내 페이지. 이메일에 남은 링크 대응용.
// 실제 기능 없음 — 제거 기준: /reset-password 링크 도달 횟수 0 확인 후.
```

완전히 불필요하다면 라우트/컴포넌트/CSRF matcher 모두 제거.

---

### 3-3. `vite.config.ts`와 `functions/api/bff/[[path]].ts`의 `clubSlug` 정규식 중복

**현재 상태**
두 파일에 `/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/`가 각자 정의되어 있습니다.

**문제점**
dev proxy는 invalid slug를 `400` 거부 없이 통과시키고, prod BFF는 거부합니다. 환경별 동작 차이가 발생합니다.

**개선 방안**

```ts
// front/shared/security/club-slug.ts
export const CLUB_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

// vite.config.ts, functions/[[path]].ts에서 import하여 사용
```

---

### 3-4. `compose.yml`에 Kafka(Redpanda) healthcheck 없음

**현재 상태**
`compose.yml:33-47`에 MySQL과 Redis는 healthcheck가 있지만, Redpanda는 없습니다.

**개선 방안**

```yaml
redpanda:
  healthcheck:
    test: ["CMD", "rpk", "cluster", "info"]
    interval: 10s
    timeout: 5s
    retries: 5

server:
  depends_on:
    redpanda:
      condition: service_healthy
```

---

### 3-5. CI `.github/workflows/**` CODEOWNERS 보호 미설정

**현재 상태**
`.github/CODEOWNERS`가 사실상 비어 있습니다(security report finding 3).

**개선 방안**

```
# .github/CODEOWNERS
.github/workflows/* @kws
```

GitHub branch protection에서 CODEOWNERS review 강제를 활성화합니다. 현재 단독 contributor이지만 공개 저장소 전환 전에 선제 적용을 권장합니다.

---

## 종합 실행 계획

### 즉시 (이번 주)

1. `@ConditionalOnProperty` 중복 → `@ConditionalOnExpression`으로 통합 (1-1)
2. `db/migration/` 삭제, 단일 Flyway 위치 확정 (1-2)
3. 서버 SLF4J 로깅 최소 5곳 추가 (1-4)

### 단기 (2~3주)

4. HostDashboard 컴포넌트 분리 (이미 계획서 존재) (1-5)
5. GitHub Actions 서버 이미지 빌드/push 워크플로우 추가 (1-3)
6. JPA 의존성 제거 (2-1)
7. `JdbcNotesFeedAdapter.shortNameFor` 삭제 (2-7)

### 중기 (1~2개월)

8. Notes feed N+1 쿼리 최적화 (2-2)
9. `AuthenticatedMemberResolver` ArchUnit 룰 + 경계 수정 (2-3)
10. `ObjectProvider<JdbcTemplate>` 패턴 정리 (2-4)
11. Kafka Producer idempotence 설정 추가 (2-5)
12. `NotificationDeliveryEngine` 추출 (2-6)
13. Sentry 연동 (2-12)

### 장기 / 기회될 때

14. Vite lazy loading + 번들 청크 분리 (2-11)
15. archive/publication 통합 테스트 보강 (2-9)
16. Dockerfile multi-stage 변환 (2-10)
17. 낮음 우선순위 위생 항목 (3-1 ~ 3-5)

---

*이 문서는 코드베이스 v1.4.2 기준으로 작성되었습니다. 각 개선 진행 시 해당 항목을 strikethrough 처리하거나 삭제하여 추적하세요.*
