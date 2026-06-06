# 서버 outbound 회복탄력성(Resilience4j) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReadMates 서버의 outbound adapter(외부 HTTP / Redis)에 Resilience4j CircuitBreaker를 **adapter.out 안에서만** 적용해, 기존 fail-open 정책을 유지하면서 회로 상태 전이를 Micrometer + `/admin/health` 카드로 관측 가능하게 만든다.

**Architecture:** 구조 변경 없음. hexagonal 경계 유지 — CircuitBreaker 타입(`io.github.resilience4j..`)은 `shared.adapter.out.resilience`와 각 feature의 `adapter.out`에만 등장하고, application/domain/web은 절대 의존하지 않는다(ArchUnit으로 강제). 공용 `OutboundCircuitBreakers` 컴포넌트가 CircuitBreaker 생성·메트릭 바인딩·short-circuit fallback을 캡슐화하고, 각 outbound adapter는 이 컴포넌트를 통해 외부 호출을 감싼다. CircuitBreaker가 열리면 기존 fail-open 결과를 그대로 반환한다(가용성 우선).

**Tech Stack:** Kotlin, Spring Boot 3, Resilience4j 2.2.0 (core `resilience4j-circuitbreaker` + `resilience4j-micrometer`, **starter/annotation 미사용** — 프로그램matic CircuitBreaker로 경계 통제와 단위 테스트 용이성 확보), Micrometer, JUnit5 + AssertJ.

**강의 매핑:** Resilience4j CircuitBreaker(331673), 로그 관리(335763) — 외부 의존 실패 격리, 상태 전이 관측, fail-open/fail-closed 정책 명문화.

---

## 사전 사실 (실측, 2026-06-06)

- `resilience4j` 의존/타입은 현재 **0건**(`grep -r resilience4j server/` → 없음). 신규 도입.
- build.gradle.kts 의존 블록: `server/build.gradle.kts:47-79`. actuator(`:48`), micrometer-prometheus(`:71`) 이미 존재. resilience4j는 Spring Boot BOM이 관리하지 않으므로 **명시적 버전** 필요.
- 대상 outbound adapter:
  - `server/src/main/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateChecker.kt` — 외부 도메인에 HTTPS GET. 현재 `try/catch(Exception) → failed("DOMAIN_CHECK_UNREACHABLE")` fail-open.
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapter.kt` — Redis INCR Lua script. `runCatching{}.getOrElse{}` fail-open(비민감 allow, 민감+failClosedSensitive deny).
  - 기타 redis adapter(`publication/note/shared.adapter.out.redis`)도 동일 패턴 — Task 6 recipe.
- 메트릭 helper: `com.readmates.shared.cache.RedisCacheMetrics` — `ObjectProvider<MeterRegistry>` 기반 null-safe counter. `meterRegistryProvider.ifAvailable ?: return`.
- health 카드 패턴: `com.readmates.admin.health.application.service.HealthCardProvider` 인터페이스 + `providers/RedisHealthCardProvider.kt`. `HealthCard(id, title, status, metric, thresholds, lastCheckedAt, source, drill, reason)`. `HealthCardStatus ∈ {OK, WARN, CRIT, UNKNOWN}`, `HealthCardSource.IN_PROCESS`, `HealthCardMetric(value, unit, label)`, `HealthCardThresholds(warn, crit)`.
- ArchUnit: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` `@Tag("architecture")`. `migratedApplicationPackages = com.readmates.<feat>.application..`. `adapter.out`는 Spring/Redis 의존 허용. application은 web/http/security/jdbc/redis 의존 금지. → 신규 규칙 추가 지점은 이 파일.
- 테스트 컨벤션: 동일 패키지 co-locate, JUnit5 `@Test`, AssertJ `assertThat`, 백틱 테스트명, `@Tag` 미부착=unit 레인. `SimpleMeterRegistry`로 counter 검증(예: `RedisHealthCardProviderTest`, `RedisRateLimitAdapterTest`의 `failingRedisTemplate()`).
- 실행: 단위 `./server/gradlew -p server unitTest`, 경계 `./server/gradlew -p server architectureTest`, 전체 게이트 `./server/gradlew -p server check`.

## File Structure

- 신규 공용 회복탄력성 인프라(adapter.out 계층, application 의존 금지):
  - `server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundResilienceProperties.kt` — `@ConfigurationProperties` + `@EnableConfigurationProperties` 설정.
  - `server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakers.kt` — `CircuitBreakerRegistry` 캡슐화, 메트릭 바인딩, `execute(name, fallback, block)` short-circuit 처리, `states()` 조회.
- 신규 health 카드: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProvider.kt`.
- 수정 대상: `server/build.gradle.kts`, `HttpClubDomainActualStateChecker.kt`, `RedisRateLimitAdapter.kt`, `ServerArchitectureBoundaryTest.kt`.
- 한 테스트 파일 = 한 main 파일의 동작. CircuitBreaker config의 thresholds는 properties로 주입(테스트에서 낮은 값으로 회로 빠르게 개방).

> **경계 불변식(전 Task 공통):** `io.github.resilience4j..` import는 `*.adapter.out..` 패키지 안에서만 허용한다. application/domain/web/persistence 파일에 추가하면 Task 7의 ArchUnit 테스트가 실패한다.

---

## Task 1: Resilience4j 의존성 추가

**Files:**
- Modify: `server/build.gradle.kts` (dependencies 블록, 현재 `:71` `micrometer-registry-prometheus` 직후)

- [ ] **Step 1: 의존성 추가**

`server/build.gradle.kts`의 `runtimeOnly("io.micrometer:micrometer-registry-prometheus")` 줄 **다음**에 추가:

```kotlin
    // Resilience4j CircuitBreaker for outbound adapters (resilience plan task 1).
    // Core + micrometer only; the Spring Boot starter/annotations are intentionally
    // unused so circuit-breaker types stay confined to adapter.out (ArchUnit task 7).
    implementation("io.github.resilience4j:resilience4j-circuitbreaker:2.2.0")
    implementation("io.github.resilience4j:resilience4j-micrometer:2.2.0")
```

- [ ] **Step 2: 의존성 해소 확인**

Run: `./server/gradlew -p server dependencies --configuration runtimeClasspath -q | grep -i resilience4j`
Expected: `io.github.resilience4j:resilience4j-circuitbreaker:2.2.0`, `resilience4j-core`, `resilience4j-micrometer` 가 트리에 표시.

- [ ] **Step 3: 컴파일 확인**

Run: `./server/gradlew -p server compileKotlin -q`
Expected: BUILD SUCCESSFUL (새 import는 아직 없음 — 의존성만 해소).

- [ ] **Step 4: 커밋**

```bash
git add server/build.gradle.kts
git commit -m "build(server): add resilience4j circuitbreaker + micrometer deps"
```

---

## Task 2: OutboundResilienceProperties 설정

대상: CircuitBreaker 동작 파라미터를 `readmates.resilience` prefix로 외부화. 기본값은 보수적(가용성 우선).

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundResilienceProperties.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adapter/out/resilience/OutboundResiliencePropertiesTest.kt`

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/kotlin/com/readmates/shared/adapter/out/resilience/OutboundResiliencePropertiesTest.kt`:

```kotlin
package com.readmates.shared.adapter.out.resilience

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration

class OutboundResiliencePropertiesTest {
    @Test
    fun `defaults favor availability with a conservative open window`() {
        val props = OutboundResilienceProperties()

        assertThat(props.enabled).isTrue()
        assertThat(props.failureRateThreshold).isEqualTo(50f)
        assertThat(props.slidingWindowSize).isEqualTo(20)
        assertThat(props.minimumNumberOfCalls).isEqualTo(10)
        assertThat(props.permittedCallsInHalfOpenState).isEqualTo(3)
        assertThat(props.waitDurationInOpenState).isEqualTo(Duration.ofSeconds(30))
    }

    @Test
    fun `custom values are retained`() {
        val props =
            OutboundResilienceProperties(
                enabled = false,
                failureRateThreshold = 80f,
                slidingWindowSize = 4,
                minimumNumberOfCalls = 2,
                permittedCallsInHalfOpenState = 1,
                waitDurationInOpenState = Duration.ofMillis(50),
            )

        assertThat(props.enabled).isFalse()
        assertThat(props.minimumNumberOfCalls).isEqualTo(2)
        assertThat(props.waitDurationInOpenState).isEqualTo(Duration.ofMillis(50))
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adapter.out.resilience.OutboundResiliencePropertiesTest`
Expected: FAIL — `OutboundResilienceProperties` 미정의(compile error).

- [ ] **Step 3: 최소 구현**

`server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundResilienceProperties.kt`:

```kotlin
package com.readmates.shared.adapter.out.resilience

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.time.Duration

@Configuration
@EnableConfigurationProperties(OutboundResilienceProperties::class)
class OutboundResilienceConfiguration

@ConfigurationProperties(prefix = "readmates.resilience")
data class OutboundResilienceProperties(
    val enabled: Boolean = true,
    val failureRateThreshold: Float = 50f,
    val slidingWindowSize: Int = 20,
    val minimumNumberOfCalls: Int = 10,
    val permittedCallsInHalfOpenState: Int = 3,
    val waitDurationInOpenState: Duration = Duration.ofSeconds(30),
)
```

- [ ] **Step 4: 통과 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adapter.out.resilience.OutboundResiliencePropertiesTest`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundResilienceProperties.kt \
  server/src/test/kotlin/com/readmates/shared/adapter/out/resilience/OutboundResiliencePropertiesTest.kt
git commit -m "feat(server): add outbound resilience properties"
```

---

## Task 3: OutboundCircuitBreakers 인프라

대상: CircuitBreaker 생성·재사용, 상태 전이 메트릭(`readmates.resilience.state_transition`), short-circuit 메트릭(`readmates.resilience.short_circuited`), fail-open `execute()` 헬퍼. MeterRegistry는 `ObjectProvider`로 null-safe(테스트/메트릭 비활성 환경 대비, `RedisCacheMetrics`와 동일 패턴).

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakers.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakersTest.kt`

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakersTest.kt`:

```kotlin
package com.readmates.shared.adapter.out.resilience

import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import java.time.Duration

class OutboundCircuitBreakersTest {
    private fun breakers(registry: MeterRegistry): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    failureRateThreshold = 50f,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider = registryProvider(registry),
        )

    @Test
    fun `successful block returns its value and keeps circuit closed`() {
        val cb = breakers(SimpleMeterRegistry())

        val result = cb.execute("svc", fallback = { "fallback" }) { "ok" }

        assertThat(result).isEqualTo("ok")
        assertThat(cb.states()["svc"]).isEqualTo(CircuitBreaker.State.CLOSED)
    }

    @Test
    fun `repeated failures open the circuit then short-circuit to fallback`() {
        val registry = SimpleMeterRegistry()
        val cb = breakers(registry)
        var blockInvocations = 0

        // 2 failing calls (= minimumNumberOfCalls) trip the breaker open.
        repeat(2) {
            cb.execute("svc", fallback = { "fallback" }) {
                blockInvocations++
                throw IllegalStateException("boom")
            }
        }
        assertThat(cb.states()["svc"]).isEqualTo(CircuitBreaker.State.OPEN)

        // Next call must short-circuit: block NOT invoked, fallback returned.
        val result = cb.execute("svc", fallback = { "fallback" }) {
            blockInvocations++
            "should-not-run"
        }

        assertThat(result).isEqualTo("fallback")
        assertThat(blockInvocations).isEqualTo(2)
        assertThat(registry.counter("readmates.resilience.short_circuited", "name", "svc").count()).isEqualTo(1.0)
    }

    @Test
    fun `state transitions are recorded as a metric`() {
        val registry = SimpleMeterRegistry()
        val cb = breakers(registry)

        repeat(2) {
            cb.execute("svc", fallback = { "fallback" }) { throw IllegalStateException("boom") }
        }

        val toOpen =
            registry
                .find("readmates.resilience.state_transition")
                .tag("name", "svc")
                .tag("to", "OPEN")
                .counter()
        assertThat(toOpen).isNotNull
        assertThat(toOpen!!.count()).isEqualTo(1.0)
    }

    private fun registryProvider(registry: MeterRegistry): ObjectProvider<MeterRegistry> =
        object : ObjectProvider<MeterRegistry> {
            override fun getObject() = registry

            override fun getObject(vararg args: Any?) = registry

            override fun getIfAvailable() = registry

            override fun getIfUnique() = registry
        }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakersTest`
Expected: FAIL — `OutboundCircuitBreakers` 미정의.

- [ ] **Step 3: 구현**

`server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakers.kt`:

```kotlin
package com.readmates.shared.adapter.out.resilience

import io.github.resilience4j.circuitbreaker.CallNotPermittedException
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component

/**
 * Programmatic CircuitBreaker facade for outbound adapters. Keeping resilience4j
 * usage here (and inside `*.adapter.out`) preserves the hexagonal boundary —
 * application/domain code never sees a circuit-breaker type.
 *
 * fail-open contract: when the breaker is OPEN, [execute] does NOT invoke the
 * block and returns the caller-supplied fallback. The caller decides what the
 * fallback means (allow vs. degraded result).
 */
@Component
class OutboundCircuitBreakers(
    private val properties: OutboundResilienceProperties,
    private val meterRegistryProvider: ObjectProvider<MeterRegistry>,
) {
    private val registry: CircuitBreakerRegistry = buildRegistry()

    init {
        // Attach the state-transition metric listener exactly once per breaker,
        // at creation time, to avoid duplicate listeners on repeated lookups.
        registry.eventPublisher.onEntryAdded { entryEvent ->
            val breaker = entryEvent.addedEntry
            breaker.eventPublisher.onStateTransition { event ->
                meterRegistryProvider.ifAvailable
                    ?.counter(
                        "readmates.resilience.state_transition",
                        "name", breaker.name,
                        "from", event.stateTransition.fromState.name,
                        "to", event.stateTransition.toState.name,
                    )?.increment()
            }
        }
    }

    fun <T> execute(
        name: String,
        fallback: (Throwable) -> T,
        block: () -> T,
    ): T {
        if (!properties.enabled) {
            return runCatching(block).getOrElse(fallback)
        }
        val breaker = registry.circuitBreaker(name)
        return try {
            breaker.executeCallable { block() }
        } catch (ex: CallNotPermittedException) {
            meterRegistryProvider.ifAvailable
                ?.counter("readmates.resilience.short_circuited", "name", name)
                ?.increment()
            fallback(ex)
        } catch (ex: Exception) {
            fallback(ex)
        }
    }

    fun states(): Map<String, CircuitBreaker.State> =
        registry.allCircuitBreakers.associate { breaker -> breaker.name to breaker.state }

    private fun buildRegistry(): CircuitBreakerRegistry =
        CircuitBreakerRegistry.of(
            CircuitBreakerConfig
                .custom()
                .failureRateThreshold(properties.failureRateThreshold)
                .slidingWindowSize(properties.slidingWindowSize)
                .minimumNumberOfCalls(properties.minimumNumberOfCalls)
                .permittedNumberOfCallsInHalfOpenState(properties.permittedCallsInHalfOpenState)
                .waitDurationInOpenState(properties.waitDurationInOpenState)
                .automaticTransitionFromOpenToHalfOpenEnabled(true)
                .build(),
        )
}
```

- [ ] **Step 4: 통과 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakersTest`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakers.kt \
  server/src/test/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakersTest.kt
git commit -m "feat(server): add outbound circuit breaker facade with metrics"
```

---

## Task 4: 클럽 도메인 체크 HTTP adapter에 CircuitBreaker 적용

대상 `HttpClubDomainActualStateChecker.check()` — 외부 호스트 HTTPS GET. 반복 실패 시 회로를 열어 추가 외부 호출을 차단(short-circuit)하고 `DOMAIN_CHECK_CIRCUIT_OPEN`을 반환한다. 단발 네트워크 실패는 기존대로 `DOMAIN_CHECK_UNREACHABLE`.

**Files:**
- Read first: `server/src/main/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateChecker.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateChecker.kt`
- Create: `server/src/test/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateCheckerCircuitBreakerTest.kt`

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateCheckerCircuitBreakerTest.kt`:

```kotlin
package com.readmates.club.adapter.out.http

import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import java.net.InetAddress
import java.time.Duration

class HttpClubDomainActualStateCheckerCircuitBreakerTest {
    @Test
    fun `opens circuit after repeated fetch failures and short-circuits with circuit-open error`() {
        var fetchCalls = 0
        val checker =
            HttpClubDomainActualStateChecker(
                timeout = Duration.ofSeconds(1),
                addressResolver = { arrayOf(InetAddress.getByName("93.184.216.34")) },
                markerFetcher = {
                    fetchCalls++
                    throw RuntimeException("connection refused")
                },
                circuitBreakers = breakers(),
            )

        // minimumNumberOfCalls = 2 → first two attempts fetch and fail (UNREACHABLE).
        val first = checker.check("club.example.com")
        val second = checker.check("club.example.com")
        assertThat(first.status).isEqualTo(ClubDomainStatus.FAILED)
        assertThat(first.errorCode).isEqualTo("DOMAIN_CHECK_UNREACHABLE")
        assertThat(second.errorCode).isEqualTo("DOMAIN_CHECK_UNREACHABLE")

        // Third attempt must be short-circuited: fetch NOT called, circuit-open error.
        val third = checker.check("club.example.com")
        assertThat(third.status).isEqualTo(ClubDomainStatus.FAILED)
        assertThat(third.errorCode).isEqualTo("DOMAIN_CHECK_CIRCUIT_OPEN")
        assertThat(fetchCalls).isEqualTo(2)
    }

    @Test
    fun `successful fetch keeps returning the real result`() {
        val checker =
            HttpClubDomainActualStateChecker(
                timeout = Duration.ofSeconds(1),
                addressResolver = { arrayOf(InetAddress.getByName("93.184.216.34")) },
                markerFetcher = {
                    MarkerHttpResult(
                        statusCode = 200,
                        body = """{"service":"readmates","surface":"cloudflare-pages","version":1}""",
                    )
                },
                circuitBreakers = breakers(),
            )

        val result = checker.check("club.example.com")

        assertThat(result.status).isEqualTo(ClubDomainStatus.ACTIVE)
        assertThat(result.errorCode).isNull()
    }

    private fun breakers(): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    failureRateThreshold = 50f,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider = noopProvider(),
        )

    private fun noopProvider(): ObjectProvider<MeterRegistry> =
        object : ObjectProvider<MeterRegistry> {
            private val registry = SimpleMeterRegistry()

            override fun getObject() = registry

            override fun getObject(vararg args: Any?) = registry

            override fun getIfAvailable() = registry

            override fun getIfUnique() = registry
        }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.club.adapter.out.http.HttpClubDomainActualStateCheckerCircuitBreakerTest`
Expected: FAIL — `circuitBreakers` 파라미터 미존재(compile error).

- [ ] **Step 3: 구현 — adapter에 CircuitBreaker 주입 + 적용**

`HttpClubDomainActualStateChecker.kt`를 아래와 같이 수정한다.

(a) import 추가(파일 상단 import 블록):

```kotlin
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
```

(b) 생성자에 의존성 추가 — 기존 primary/internal 생성자를 아래로 교체:

```kotlin
@Component
class HttpClubDomainActualStateChecker
    @Autowired
    constructor(
        @param:Value("\${readmates.club-domain-check.timeout:5s}")
        private val timeout: Duration,
        private val circuitBreakers: OutboundCircuitBreakers,
    ) : CheckClubDomainActualStatePort {
        private val objectMapper = JsonMapper.builder().build()
        private val client: HttpClient =
            HttpClient
                .newBuilder()
                .connectTimeout(timeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build()
        private var addressResolver: (String) -> Array<InetAddress> = InetAddress::getAllByName
        private var markerFetcher: (URI) -> MarkerHttpResult = ::fetchMarker

        internal constructor(
            timeout: Duration,
            addressResolver: (String) -> Array<InetAddress>,
            markerFetcher: (URI) -> MarkerHttpResult,
            circuitBreakers: OutboundCircuitBreakers,
        ) : this(timeout, circuitBreakers) {
            this.addressResolver = addressResolver
            this.markerFetcher = markerFetcher
        }
```

(c) `check()` 안의 marker fetch 블록(현재 `val marker = try { markerFetcher(uri) } catch (_: Exception) { return failed("DOMAIN_CHECK_UNREACHABLE") }`)을 아래로 교체:

```kotlin
            val marker =
                when (val outcome = fetchMarkerResilient(uri)) {
                    is MarkerOutcome.Ok -> outcome.result
                    MarkerOutcome.CircuitOpen -> return failed("DOMAIN_CHECK_CIRCUIT_OPEN")
                    MarkerOutcome.Failed -> return failed("DOMAIN_CHECK_UNREACHABLE")
                }
```

(d) private 헬퍼와 sealed outcome을 클래스 본문에 추가(예: `fetchMarker` 정의 위):

```kotlin
        private sealed interface MarkerOutcome {
            data class Ok(val result: MarkerHttpResult) : MarkerOutcome

            data object CircuitOpen : MarkerOutcome

            data object Failed : MarkerOutcome
        }

        private fun fetchMarkerResilient(uri: URI): MarkerOutcome =
            circuitBreakers.execute(
                name = CIRCUIT_BREAKER_NAME,
                fallback = { error ->
                    if (error is io.github.resilience4j.circuitbreaker.CallNotPermittedException) {
                        MarkerOutcome.CircuitOpen
                    } else {
                        MarkerOutcome.Failed
                    }
                },
            ) {
                MarkerOutcome.Ok(markerFetcher(uri))
            }
```

(e) `companion object`에 상수 추가:

```kotlin
            const val CIRCUIT_BREAKER_NAME = "club-domain-check"
```

- [ ] **Step 4: 통과 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.club.adapter.out.http.HttpClubDomainActualStateCheckerCircuitBreakerTest`
Expected: PASS (2 tests)

- [ ] **Step 5: 기존 호출자/테스트 회귀 확인**

Run: `./server/gradlew -p server unitTest --tests 'com.readmates.club.*'`
Expected: PASS — 기존 도메인 체크 관련 테스트가 새 생성자 시그니처로 깨지지 않음. (깨지면 해당 테스트의 `HttpClubDomainActualStateChecker(...)` 호출에 `circuitBreakers = ...` 인자를 추가.)

- [ ] **Step 6: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateChecker.kt \
  server/src/test/kotlin/com/readmates/club/adapter/out/http/HttpClubDomainActualStateCheckerCircuitBreakerTest.kt
git commit -m "feat(server): wrap club domain check with outbound circuit breaker"
```

---

## Task 5: Redis rate-limit adapter에 CircuitBreaker 적용

대상 `RedisRateLimitAdapter.check()` — Redis 장애가 지속되면 회로를 열어 Redis를 더 두드리지 않고 즉시 fail-open(비민감 allow). 기존 fail-open/fail-closed 의미와 메트릭은 유지한다.

**Files:**
- Read first: `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterCircuitBreakerTest.kt`

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterCircuitBreakerTest.kt`:

```kotlin
package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.cache.RedisCacheMetrics
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration

class RedisRateLimitAdapterCircuitBreakerTest {
    @Test
    fun `opens circuit after redis failures and short-circuits to fail-open without calling redis`() {
        val registry = SimpleMeterRegistry()
        val template = CountingFailingTemplate()
        val adapter =
            RedisRateLimitAdapter(
                redisTemplate = template,
                properties = RateLimitProperties(enabled = true),
                metrics = RedisCacheMetrics(provider(registry)),
                circuitBreakers = breakers(registry),
            )
        val check = RateLimitCheck(key = "rl:cb", limit = 1, window = Duration.ofMinutes(1), sensitive = false)

        // 2 failing calls trip the breaker (minimumNumberOfCalls = 2), both fail-open allow.
        assertThat(adapter.check(check).allowed).isTrue()
        assertThat(adapter.check(check).allowed).isTrue()

        val afterOpen = adapter.check(check)

        assertThat(afterOpen.allowed).isTrue()
        assertThat(afterOpen.fallback).isTrue()
        // Redis was hit only twice; the third call was short-circuited.
        assertThat(template.executeCalls).isEqualTo(2)
        assertThat(registry.counter("readmates.resilience.short_circuited", "name", "redis-rate-limit").count())
            .isEqualTo(1.0)
    }

    private class CountingFailingTemplate : StringRedisTemplate() {
        var executeCalls = 0

        override fun <T : Any?> execute(
            action: org.springframework.data.redis.core.script.RedisScript<T>,
            keys: MutableList<String>,
            vararg args: Any?,
        ): T {
            executeCalls++
            throw IllegalStateException("redis down")
        }
    }

    private fun breakers(registry: MeterRegistry): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    failureRateThreshold = 50f,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider = provider(registry),
        )

    private fun provider(registry: MeterRegistry): ObjectProvider<MeterRegistry> =
        object : ObjectProvider<MeterRegistry> {
            override fun getObject() = registry

            override fun getObject(vararg args: Any?) = registry

            override fun getIfAvailable() = registry

            override fun getIfUnique() = registry
        }
}
```

> 주의: `StringRedisTemplate.execute(RedisScript, List, vararg)` 시그니처는 Spring Data Redis 버전에 따라 override 형태가 다를 수 있다. Step 1 실행 시 compile 에러가 나면 실제 시그니처를 IDE/소스로 확인해 맞춘다(동작 의도: script execute가 항상 throw). 핵심은 회로 개방 후 `executeCalls`가 더 증가하지 않는 것.

- [ ] **Step 2: 실패 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.adapter.out.redis.RedisRateLimitAdapterCircuitBreakerTest`
Expected: FAIL — `circuitBreakers` 파라미터 미존재.

- [ ] **Step 3: 구현 — adapter 수정**

`RedisRateLimitAdapter.kt`:

(a) import 추가:

```kotlin
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
```

(b) 생성자에 `circuitBreakers` 추가:

```kotlin
class RedisRateLimitAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val properties: RateLimitProperties,
    private val metrics: RedisCacheMetrics,
    private val circuitBreakers: OutboundCircuitBreakers,
) : RateLimitPort {
```

(c) `check()` 본문을 CircuitBreaker로 감싼다. 기존 `runCatching{}.getOrElse{}`의 fail-open 로직을 fallback으로 이동:

```kotlin
    override fun check(check: RateLimitCheck): RateLimitDecision =
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = { failOpen(check) },
        ) {
            val ttlMillis = maxOf(check.window.toMillis(), 1L)
            val count = redisTemplate.execute(INCREMENT_WITH_TTL_SCRIPT, listOf(check.key), ttlMillis.toString()) ?: 1L

            if (count <= check.limit) {
                metrics.increment("readmates.rate_limit.allowed", "sensitive", check.sensitive.toString())
                RateLimitDecision.allowed()
            } else {
                metrics.increment("readmates.rate_limit.denied", "sensitive", check.sensitive.toString())
                RateLimitDecision.denied(check.window.seconds)
            }
        }

    private fun failOpen(check: RateLimitCheck): RateLimitDecision {
        metrics.increment("readmates.redis.fallbacks", "feature", "rate-limit")
        metrics.increment("readmates.redis.operation.errors", "feature", "rate-limit", "operation", "check")
        return if (check.sensitive && properties.failClosedSensitive) {
            RateLimitDecision.denied(check.window.seconds)
        } else {
            RateLimitDecision.allowed(fallback = true)
        }
    }
```

(d) `companion object`에 상수 추가:

```kotlin
    private companion object {
        const val CIRCUIT_BREAKER_NAME = "redis-rate-limit"

        val INCREMENT_WITH_TTL_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                local count = redis.call('INCR', KEYS[1])
                if count == 1 then
                  redis.call('PEXPIRE', KEYS[1], ARGV[1])
                end
                return count
                """.trimIndent(),
                Long::class.java,
            )
    }
```

- [ ] **Step 4: 통과 확인 + 기존 rate-limit 테스트 회귀**

Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.adapter.out.redis.RedisRateLimitAdapterCircuitBreakerTest`
Expected: PASS

> 기존 `RedisRateLimitAdapterTest`(`@Tag("integration")`)는 unitTest 레인에 없지만, 그 안의 mocked 단위 케이스(예: `increments counter through redis script`, `fails open ...`)가 `RedisRateLimitAdapter(...)` 생성자를 직접 호출한다. 새 `circuitBreakers` 인자를 추가해야 컴파일된다. 해당 테스트 파일의 모든 `RedisRateLimitAdapter(` 호출에 `circuitBreakers = OutboundCircuitBreakers(OutboundResilienceProperties(), <noop meter provider>)` 인자를 추가한다.

Run: `./server/gradlew -p server compileTestKotlin -q`
Expected: BUILD SUCCESSFUL (테스트 컴파일 통과).

- [ ] **Step 5: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapter.kt \
  server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterCircuitBreakerTest.kt \
  server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterTest.kt
git commit -m "feat(server): wrap redis rate-limit adapter with outbound circuit breaker"
```

---

## Task 6: 나머지 redis read-cache adapter 적용 (recipe)

대상: `RedisPublicReadCacheAdapter`, `RedisNotesReadCacheAdapter`, `RedisReadCacheInvalidationAdapter`. 각각 read/write Redis 호출을 `circuitBreakers.execute(name, fallback)`로 감싼다. fallback은 **기존 fail-open 결과**(read는 `null` = cache miss, invalidation/write는 no-op + 메트릭)를 그대로 반환한다.

각 adapter마다 Task 5와 동일한 사이클을 반복하되 아래 기준 적용:

- [ ] **A. main 파일 Read** — 현재 `runCatching{}.getOrElse{}`/`.onFailure{}` fail-open 지점을 식별.
- [ ] **B. 생성자에 `circuitBreakers: OutboundCircuitBreakers` 주입**, import 추가.
- [ ] **C. 실패 테스트 작성** — 회로 개방 후 Redis 호출이 더 일어나지 않고(`executeCalls`/mock 호출 횟수 고정) fail-open 결과(read=null)가 유지됨을 검증. CircuitBreaker name은 adapter별 고유(`redis-public-cache`, `redis-notes-cache`, `redis-cache-invalidation`).
- [ ] **D. 구현** — read/write 호출을 `execute()`로 감싸고 fallback에 기존 메트릭+fallback 값 이동.
- [ ] **E. 회귀** — 기존 해당 adapter 테스트의 직접 생성자 호출에 `circuitBreakers` 인자 추가. `./server/gradlew -p server compileTestKotlin -q` 통과.
- [ ] **F. 커밋** — `feat(server): wrap <adapter> with outbound circuit breaker`.

> CircuitBreaker name 규칙: `redis-<feature>` / `<external>-<purpose>`. 이름이 Task 7 health 카드와 메트릭 라벨에 그대로 노출되므로 public-safe(멤버 데이터/시크릿 미포함)해야 한다.

> 범위 판단: 한 adapter가 이미 short-lived `runCatching`으로 충분히 격리되고 외부 장애 전파 위험이 낮다면(예: 단일 key delete) 회로 적용을 건너뛰고 그 이유를 커밋 메시지에 남긴다. coverage·숫자가 아니라 장애 격리 가치 기준.

---

## Task 7: ArchUnit 경계 가드 + health 카드 + 문서

resilience4j 타입이 application으로 새지 않도록 경계 테스트를 추가하고, 회로 상태를 `/admin/health`에 노출한다.

**Files:**
- Read first: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Read first: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProvider.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProviderTest.kt`
- Modify: `docs/development/architecture.md` (서버 내부 구조 — outbound resilience 한 단락), `CHANGELOG.md` (Unreleased)

- [ ] **Step 1: ArchUnit 경계 테스트 추가(실패 먼저)**

`ServerArchitectureBoundaryTest`에 테스트 추가(클래스 본문, 다른 `@Test` 옆):

```kotlin
    @Test
    fun `application packages do not depend on resilience4j types`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedApplicationPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("io.github.resilience4j..")
            .check(importedClasses)
    }
```

Run: `./server/gradlew -p server architectureTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest`
Expected: PASS — 현재 application은 resilience4j를 안 쓰므로 즉시 green(경계가 지켜지고 있음을 고정하는 가드). 만약 FAIL이면 application 어딘가에 resilience4j import가 샌 것이므로 adapter.out으로 옮긴다.

- [ ] **Step 2: health 카드 실패 테스트 작성**

`OutboundResilienceHealthCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

class OutboundResilienceHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-06-06T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK when no circuit is open`() {
        val breakers = breakers()
        breakers.execute("svc", fallback = { "f" }) { "ok" }

        val card = OutboundResilienceHealthCardProvider(breakers, clock).compute()

        assertThat(card.id).isEqualTo("outbound-resilience")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
    }

    @Test
    fun `status is CRIT when a circuit is open`() {
        val breakers = breakers()
        repeat(2) { breakers.execute("svc", fallback = { "f" }) { throw IllegalStateException("boom") } }

        val card = OutboundResilienceHealthCardProvider(breakers, clock).compute()

        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
        assertThat(card.metric?.value).isEqualTo(1.0)
    }

    private fun breakers(): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider = noop(),
        )

    private fun noop(): ObjectProvider<MeterRegistry> =
        object : ObjectProvider<MeterRegistry> {
            private val registry = SimpleMeterRegistry()

            override fun getObject() = registry

            override fun getObject(vararg args: Any?) = registry

            override fun getIfAvailable() = registry

            override fun getIfUnique() = registry
        }
}
```

Run: `./server/gradlew -p server unitTest --tests com.readmates.admin.health.application.service.providers.OutboundResilienceHealthCardProviderTest`
Expected: FAIL — provider 미정의.

- [ ] **Step 3: health 카드 구현**

`OutboundResilienceHealthCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.service.HealthCardProvider
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class OutboundResilienceHealthCardProvider(
    private val circuitBreakers: OutboundCircuitBreakers,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "outbound-resilience"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val states = circuitBreakers.states()
        val openCount =
            states.values.count { state ->
                state == CircuitBreaker.State.OPEN || state == CircuitBreaker.State.FORCED_OPEN
            }
        val status =
            when {
                openCount >= CRIT_THRESHOLD.toInt() -> HealthCardStatus.CRIT
                openCount >= WARN_THRESHOLD.toInt() -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "Outbound resilience",
            status = status,
            metric = HealthCardMetric(value = openCount.toDouble(), unit = "open circuits", label = "current"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )
    }

    private companion object {
        private const val WARN_THRESHOLD = 1.0
        private const val CRIT_THRESHOLD = 1.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
    }
}
```

> 위 카드는 회로가 하나라도 열리면 CRIT(임계 1.0). 운영 의도상 WARN/CRIT를 분리하고 싶으면 임계를 조정하되, "회로 개방 = 즉시 가시화"가 목표다.

Run: `./server/gradlew -p server unitTest --tests com.readmates.admin.health.application.service.providers.OutboundResilienceHealthCardProviderTest`
Expected: PASS (2 tests)

- [ ] **Step 4: 문서 갱신**

`docs/development/architecture.md`의 "서버 내부 구조"(outbound adapter 설명 부근)에 한 단락 추가:

```markdown
Outbound adapter(외부 HTTP/Redis)는 `shared.adapter.out.resilience.OutboundCircuitBreakers`를 통해 Resilience4j CircuitBreaker로 감싼다. CircuitBreaker 타입은 `adapter.out` 안에만 존재하며(application/domain 의존 금지, ArchUnit `application packages do not depend on resilience4j types`로 강제), 회로가 열리면 기존 fail-open 결과를 반환한다. 상태 전이는 `readmates.resilience.state_transition` / `readmates.resilience.short_circuited` Micrometer 카운터와 `/admin/health`의 `outbound-resilience` 카드로 관측한다.
```

`CHANGELOG.md`의 `## [Unreleased]` 아래 적절한 섹션(Added)에 추가:

```markdown
- Outbound adapter(외부 HTTP/Redis)에 Resilience4j CircuitBreaker 적용. fail-open 정책 유지, 회로 상태를 Micrometer 카운터와 `/admin/health` `outbound-resilience` 카드로 관측 가능.
```

- [ ] **Step 5: 경계 + 게이트 전체 확인**

Run: `./server/gradlew -p server check`
Expected: PASS — unitTest, architectureTest, detekt, ktlint, JaCoCo 게이트 전부 green.

- [ ] **Step 6: 커밋**

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt \
  server/src/main/kotlin/com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProvider.kt \
  server/src/test/kotlin/com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProviderTest.kt \
  docs/development/architecture.md CHANGELOG.md
git commit -m "feat(server): guard resilience boundary and surface circuit state in admin health"
```

---

## Self-Review (작성자 점검)

- **Spec 커버:** 로드맵 Phase F 요구 — (1) outbound port 뒤 adapter-local CB ✅(Task 4·5·6), (2) application은 CB 라이브러리 타입 의존 금지 ✅(Task 7 ArchUnit), (3) 기존 fail-open 유지 ✅(fallback이 기존 결과 반환), (4) actuator/Micrometer + `/admin/health` 관측 ✅(Task 3 메트릭 + Task 7 카드), (5) ArchUnit 경계 유지 ✅.
- **Placeholder 스캔:** 전 Task에 실제 Kotlin 코드·명령·기대출력 포함. Task 6만 recipe(반복 사이클)이며 의도적 — 각 adapter는 동작이 달라 main 파일 Read 후 동일 패턴 적용. Task 5/6은 기존 테스트 생성자 회귀를 명시적으로 처리.
- **타입 일관성:** `OutboundCircuitBreakers.execute(name, fallback, block)` 시그니처가 Task 3·4·5·7에서 동일. `OutboundResilienceProperties` 필드명 일관. CircuitBreaker name 규칙 일관(`club-domain-check`, `redis-rate-limit`, `redis-<feature>`). 메트릭 이름 `readmates.resilience.state_transition`/`short_circuited` 일관.
- **리스크:** `StringRedisTemplate.execute` override 시그니처(Task 5 fake)는 Spring Data Redis 버전 의존 — Step 1 compile 실패 시 실제 시그니처로 조정(테스트에 명시). resilience4j 2.2.0이 현재 Spring Boot/Kotlin 버전과 충돌하면 Task 1 Step 2에서 조기 발견.

## 검증 (완료 보고용)

```bash
./server/gradlew -p server unitTest         # 신규 단위 테스트 통과
./server/gradlew -p server architectureTest # resilience4j 경계 가드 포함
./server/gradlew -p server check            # detekt/ktlint/JaCoCo 게이트 포함 전체
```

완료 보고에는 실행한 명령, 적용한 adapter 목록과 CircuitBreaker name, 스킵한 adapter와 이유, 남은 리스크를 남긴다.
