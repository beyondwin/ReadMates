# ReadMates Redis Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Redis-backed rate limiting, auth session hot-path caching, and public/notes read-through caching while keeping MySQL as the source of truth and Redis optional by default.

**Architecture:** Redis is introduced behind outbound ports and no-op fallbacks, so controllers and application services keep the existing clean architecture boundaries. Each feature has its own flag; Redis failures fall back to the current MySQL behavior except rate-limit sensitive paths when explicitly configured fail-closed. Cache invalidation is broad and service-level in the first implementation to favor correctness over key-level optimization.

**Tech Stack:** Kotlin 2.2, Spring Boot 4.0, Spring Security, Spring Data Redis/Lettuce, Micrometer/Actuator, MySQL, Testcontainers `GenericContainer`, JUnit 5, Cloudflare Pages Functions BFF.

---

## Scope Check

The spec covers three Redis-backed behaviors: rate limit, auth session cache, and public/notes read cache. They are implemented in one project because they share Redis configuration, metrics, no-op fallback, and rollout flags. Each behavior remains separately testable and separately switchable with properties.

Do not convert ReadMates to Spring Session Redis. Do not make Redis the source of truth for auth sessions, invitations, feedback documents, memberships, or publication state.

The worktree currently has unrelated changes (`compose.yml` modified and an untracked public mobile navigation plan). Before editing `compose.yml`, inspect the existing diff and preserve those changes.

## File Structure

Create or modify these files.

### Build and Configuration

- Modify `server/build.gradle.kts`
  - Add Spring Data Redis dependency.
  - Keep existing Testcontainers core dependency; Redis integration tests use `GenericContainer`.
- Modify `server/src/main/resources/application.yml`
  - Add `spring.data.redis.url`, Redis health flag, and `readmates.redis.*` feature flags.
- Modify `server/src/main/resources/application-dev.yml`
  - Keep Redis disabled by default.
- Modify `compose.yml`
  - Add a local `redis` service while preserving existing MySQL edits.
- Create `server/src/main/kotlin/com/readmates/shared/cache/RedisCacheProperties.kt`
  - Central `@ConfigurationProperties` classes.
- Create `server/src/main/kotlin/com/readmates/shared/cache/CacheJsonCodec.kt`
  - Jackson wrapper for typed JSON cache values.
- Create `server/src/main/kotlin/com/readmates/shared/cache/RedisCacheMetrics.kt`
  - Small metric helper.

### Rate Limit

- Create `server/src/main/kotlin/com/readmates/auth/application/port/out/RateLimitPort.kt`
  - Outbound port and in-memory test implementation.
- Create `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapter.kt`
  - Redis `INCR` + `EXPIRE` adapter.
- Create `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/NoopRateLimitAdapter.kt`
  - Allows all requests when Redis/rate limit is disabled.
- Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt`
  - Servlet filter that maps request path to rate-limit policies.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
  - Register `RateLimitFilter` after `SessionCookieAuthenticationFilter`.
- Test `server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt`
- Test `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterTest.kt`

### Auth Session Cache

- Create `server/src/main/kotlin/com/readmates/auth/application/port/out/AuthSessionCachePort.kt`
  - Session cache port and in-memory test implementation.
- Create `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapter.kt`
  - Redis JSON cache adapter.
- Create `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/NoopAuthSessionCacheAdapter.kt`
  - Miss-only fallback adapter.
- Modify `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt`
  - Check cache before MySQL, throttle `last_seen_at`, evict on revoke.
- Modify `server/src/test/kotlin/com/readmates/auth/application/AuthSessionServiceTest.kt`
  - Cover hit, miss, touch throttle, logout eviction, revoke-all eviction.
- Test `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapterTest.kt`

### Public and Notes Read Cache

- Create `server/src/main/kotlin/com/readmates/publication/application/port/out/PublicReadCachePort.kt`
- Create `server/src/main/kotlin/com/readmates/publication/adapter/out/redis/RedisPublicReadCacheAdapter.kt`
- Create `server/src/main/kotlin/com/readmates/publication/adapter/out/redis/NoopPublicReadCacheAdapter.kt`
- Modify `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
  - Add read-through cache around `loadClub()` and `loadSession()`.
- Create `server/src/main/kotlin/com/readmates/note/application/port/out/NotesReadCachePort.kt`
- Create `server/src/main/kotlin/com/readmates/note/adapter/out/redis/RedisNotesReadCacheAdapter.kt`
- Create `server/src/main/kotlin/com/readmates/note/adapter/out/redis/NoopNotesReadCacheAdapter.kt`
- Modify `server/src/main/kotlin/com/readmates/note/application/service/NotesFeedService.kt`
  - Add read-through cache around feed/session list reads.
- Test `server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt`
- Test `server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt`
- Test Redis adapters under `server/src/test/kotlin/com/readmates/publication/adapter/out/redis/` and `server/src/test/kotlin/com/readmates/note/adapter/out/redis/`

### Cache Invalidation

- Create `server/src/main/kotlin/com/readmates/shared/cache/ReadCacheInvalidationPort.kt`
  - Broad invalidation API for public and notes caches.
- Create `server/src/main/kotlin/com/readmates/shared/cache/NoopReadCacheInvalidationAdapter.kt`
- Create `server/src/main/kotlin/com/readmates/shared/cache/RedisReadCacheInvalidationAdapter.kt`
- Modify these services to evict after successful mutations:
  - `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
  - `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`
- Extend tests:
  - `server/src/test/kotlin/com/readmates/session/application/service/HostSessionCommandServiceTest.kt`
  - `server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt`
  - Create or extend member lifecycle/profile service tests for eviction calls.

### Shared Redis Test Support

- Create `server/src/test/kotlin/com/readmates/support/RedisTestContainer.kt`
  - Shared `GenericContainer` wrapper and dynamic property registration.

## Task 1: Redis Foundation and Disabled-by-Default Properties

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/main/resources/application-dev.yml`
- Modify: `compose.yml`
- Create: `server/src/main/kotlin/com/readmates/shared/cache/RedisCacheProperties.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/cache/CacheJsonCodec.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/cache/RedisCacheMetrics.kt`
- Create test: `server/src/test/kotlin/com/readmates/shared/cache/CacheJsonCodecTest.kt`

- [x] **Step 1: Write the JSON codec test**

Create `server/src/test/kotlin/com/readmates/shared/cache/CacheJsonCodecTest.kt`:

```kotlin
package com.readmates.shared.cache

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CacheJsonCodecTest {
    private val codec = CacheJsonCodec(jacksonObjectMapper().findAndRegisterModules())

    @Test
    fun `round trips typed cache value`() {
        val encoded = codec.encode(SampleCacheValue(schemaVersion = 1, name = "reading-sai"))

        val decoded = codec.decode(encoded, SampleCacheValue::class.java)

        assertEquals(SampleCacheValue(schemaVersion = 1, name = "reading-sai"), decoded)
    }

    @Test
    fun `returns null for invalid json`() {
        val decoded = codec.decode("{", SampleCacheValue::class.java)

        assertEquals(null, decoded)
    }

    data class SampleCacheValue(
        val schemaVersion: Int,
        val name: String,
    )
}
```

- [x] **Step 2: Run the codec test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.shared.cache.CacheJsonCodecTest
```

Expected: FAIL because `CacheJsonCodec` does not exist.

- [x] **Step 3: Add the Redis dependency**

Modify `server/build.gradle.kts` dependencies:

```kotlin
implementation("org.springframework.boot:spring-boot-starter-data-redis")
```

Keep the existing `org.testcontainers:testcontainers-mysql:2.0.2` dependency. Redis tests will use `org.testcontainers.containers.GenericContainer` from the existing Testcontainers core dependency.

- [x] **Step 4: Add Redis and feature properties**

Modify `server/src/main/resources/application.yml`:

```yaml
spring:
  application:
    name: readmates-server
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:mysql://localhost:3306/readmates?serverTimezone=UTC}
    username: ${SPRING_DATASOURCE_USERNAME:readmates}
    password: ${SPRING_DATASOURCE_PASSWORD:readmates}
    hikari:
      connection-init-sql: set time_zone = '+00:00'
  data:
    redis:
      url: ${READMATES_REDIS_URL:redis://localhost:6379}
      timeout: ${READMATES_REDIS_COMMAND_TIMEOUT:250ms}
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: true
    locations: ${READMATES_FLYWAY_LOCATIONS:classpath:db/mysql/migration}

management:
  endpoints:
    web:
      exposure:
        include: health,info
  health:
    redis:
      enabled: ${READMATES_REDIS_ENABLED:false}

readmates:
  app-base-url: ${READMATES_APP_BASE_URL:http://localhost:3000}
  bff-secret-required: ${READMATES_BFF_SECRET_REQUIRED:true}
  redis:
    enabled: ${READMATES_REDIS_ENABLED:false}
  rate-limit:
    enabled: ${READMATES_RATE_LIMIT_ENABLED:false}
    fail-closed-sensitive: ${READMATES_RATE_LIMIT_FAIL_CLOSED_SENSITIVE:false}
  auth-session-cache:
    enabled: ${READMATES_AUTH_SESSION_CACHE_ENABLED:false}
    session-ttl: ${READMATES_AUTH_SESSION_CACHE_TTL:10m}
    touch-throttle-ttl: ${READMATES_AUTH_SESSION_TOUCH_THROTTLE_TTL:5m}
  public-cache:
    enabled: ${READMATES_PUBLIC_CACHE_ENABLED:false}
    club-ttl: ${READMATES_PUBLIC_CLUB_CACHE_TTL:15m}
    session-ttl: ${READMATES_PUBLIC_SESSION_CACHE_TTL:15m}
  notes-cache:
    enabled: ${READMATES_NOTES_CACHE_ENABLED:false}
    feed-ttl: ${READMATES_NOTES_FEED_CACHE_TTL:3m}
```

Modify `server/src/main/resources/application-dev.yml` so Redis remains disabled:

```yaml
spring:
  flyway:
    locations: classpath:db/mysql/migration,classpath:db/mysql/dev

readmates:
  bff-secret-required: false
  redis:
    enabled: false
  rate-limit:
    enabled: false
  auth-session-cache:
    enabled: false
  public-cache:
    enabled: false
  notes-cache:
    enabled: false
  dev:
    login-enabled: true
    google-oauth-auto-member-enabled: false
```

- [x] **Step 5: Add local Redis to compose**

Before editing, run:

```bash
git diff -- compose.yml
```

Preserve any existing user edits. Add this service beside `mysql`:

```yaml
  redis:
    image: redis:7.4-alpine
    container_name: readmates-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 5s
```

Do not add a Redis volume; local Redis is cache-only.

- [x] **Step 6: Create properties and codec**

Create `server/src/main/kotlin/com/readmates/shared/cache/RedisCacheProperties.kt`:

```kotlin
package com.readmates.shared.cache

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.time.Duration

@Configuration
@EnableConfigurationProperties(
    RedisFeatureProperties::class,
    RateLimitProperties::class,
    AuthSessionCacheProperties::class,
    PublicCacheProperties::class,
    NotesCacheProperties::class,
)
class RedisCachePropertiesConfiguration

@ConfigurationProperties(prefix = "readmates.redis")
data class RedisFeatureProperties(
    val enabled: Boolean = false,
)

@ConfigurationProperties(prefix = "readmates.rate-limit")
data class RateLimitProperties(
    val enabled: Boolean = false,
    val failClosedSensitive: Boolean = false,
)

@ConfigurationProperties(prefix = "readmates.auth-session-cache")
data class AuthSessionCacheProperties(
    val enabled: Boolean = false,
    val sessionTtl: Duration = Duration.ofMinutes(10),
    val touchThrottleTtl: Duration = Duration.ofMinutes(5),
)

@ConfigurationProperties(prefix = "readmates.public-cache")
data class PublicCacheProperties(
    val enabled: Boolean = false,
    val clubTtl: Duration = Duration.ofMinutes(15),
    val sessionTtl: Duration = Duration.ofMinutes(15),
)

@ConfigurationProperties(prefix = "readmates.notes-cache")
data class NotesCacheProperties(
    val enabled: Boolean = false,
    val feedTtl: Duration = Duration.ofMinutes(3),
)
```

Create `server/src/main/kotlin/com/readmates/shared/cache/CacheJsonCodec.kt`:

```kotlin
package com.readmates.shared.cache

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

@Component
class CacheJsonCodec(
    private val objectMapper: ObjectMapper,
) {
    fun encode(value: Any): String =
        objectMapper.writeValueAsString(value)

    fun <T : Any> decode(raw: String, type: Class<T>): T? =
        runCatching { objectMapper.readValue(raw, type) }.getOrNull()
}
```

Create `server/src/main/kotlin/com/readmates/shared/cache/RedisCacheMetrics.kt`:

```kotlin
package com.readmates.shared.cache

import io.micrometer.core.instrument.MeterRegistry
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component

@Component
class RedisCacheMetrics(
    private val meterRegistryProvider: ObjectProvider<MeterRegistry>,
) {
    fun increment(name: String, vararg tags: String) {
        val registry = meterRegistryProvider.ifAvailable ?: return
        registry.counter(name, *tags).increment()
    }
}
```

- [x] **Step 7: Run the codec test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.shared.cache.CacheJsonCodecTest
```

Expected: PASS.

- [x] **Step 8: Run context-adjacent server tests with Redis disabled**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.shared.adapter.in.web.HealthControllerTest
```

Expected: PASS without a Redis container running.

- [x] **Step 9: Commit foundation**

```bash
git add server/build.gradle.kts server/src/main/resources/application.yml server/src/main/resources/application-dev.yml compose.yml server/src/main/kotlin/com/readmates/shared/cache server/src/test/kotlin/com/readmates/shared/cache/CacheJsonCodecTest.kt
git commit -m "feat: add optional redis foundation"
```

## Task 2: Redis Test Support

**Files:**
- Create: `server/src/test/kotlin/com/readmates/support/RedisTestContainer.kt`
- Test support used by Redis adapter tests in later tasks.

- [x] **Step 1: Create Redis test container helper**

Create `server/src/test/kotlin/com/readmates/support/RedisTestContainer.kt`:

```kotlin
package com.readmates.support

import org.springframework.test.context.DynamicPropertyRegistry
import org.testcontainers.containers.GenericContainer
import org.testcontainers.utility.DockerImageName

object RedisTestContainer {
    private val container = GenericContainer(DockerImageName.parse("redis:7.4-alpine")).apply {
        withExposedPorts(6379)
        start()
    }

    fun registerRedisProperties(registry: DynamicPropertyRegistry) {
        registry.add("readmates.redis.enabled") { "true" }
        registry.add("spring.data.redis.url") {
            "redis://${container.host}:${container.getMappedPort(6379)}"
        }
        registry.add("management.health.redis.enabled") { "true" }
    }
}
```

- [x] **Step 2: Compile test support**

Run:

```bash
./server/gradlew -p server testClasses
```

Expected: PASS.

- [x] **Step 3: Commit Redis test support**

```bash
git add server/src/test/kotlin/com/readmates/support/RedisTestContainer.kt
git commit -m "test: add redis test container support"
```

## Task 3: Rate Limit Port, Redis Adapter, and Security Filter

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/RateLimitPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/NoopRateLimitAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt`

- [x] **Step 1: Write Redis adapter tests**

Create `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterTest.kt`:

```kotlin
package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.support.RedisTestContainer
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.time.Duration

@SpringBootTest(
    properties = [
        "readmates.redis.enabled=true",
        "readmates.rate-limit.enabled=true",
    ],
)
class RedisRateLimitAdapterTest(
    @param:Autowired private val adapter: RedisRateLimitAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
) {
    @Test
    fun `allows requests until limit and denies after limit`() {
        redisTemplate.delete("rl:test:limit")

        val check = RateLimitCheck(
            key = "rl:test:limit",
            limit = 2,
            window = Duration.ofMinutes(1),
            sensitive = false,
        )

        assertTrue(adapter.check(check).allowed)
        assertTrue(adapter.check(check).allowed)
        assertFalse(adapter.check(check).allowed)
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun redisProperties(registry: DynamicPropertyRegistry) {
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}
```

- [x] **Step 2: Write rate limit filter tests**

Create `server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitDecision
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.cache.RateLimitProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class RateLimitFilterTest {
    @Test
    fun `does not rate limit when disabled`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter = RateLimitFilter(port, RateLimitProperties(enabled = false))
        val request = MockHttpServletRequest("GET", "/api/invitations/raw-token")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
        assertEquals(emptyList<RateLimitCheck>(), port.checks)
    }

    @Test
    fun `returns 429 when invitation preview is denied`() {
        val port = RecordingRateLimitPort(RateLimitDecision.denied(retryAfterSeconds = 60))
        val filter = RateLimitFilter(port, RateLimitProperties(enabled = true))
        val request = MockHttpServletRequest("GET", "/api/invitations/raw-token")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(429, response.status)
        assertEquals("60", response.getHeader("Retry-After"))
        assertTrue(port.checks.single().key.startsWith("rl:ip:"))
        assertTrue(port.checks.single().key.contains(":invite-preview:"))
    }

    private class RecordingRateLimitPort(
        private val decision: RateLimitDecision,
    ) : RateLimitPort {
        val checks = mutableListOf<RateLimitCheck>()

        override fun check(check: RateLimitCheck): RateLimitDecision {
            checks += check
            return decision
        }
    }
}
```

- [x] **Step 3: Run rate limit tests to verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.adapter.out.redis.RedisRateLimitAdapterTest --tests com.readmates.auth.infrastructure.security.RateLimitFilterTest
```

Expected: FAIL because the port, adapter, and filter do not exist.

- [x] **Step 4: Create the rate limit port**

Create `server/src/main/kotlin/com/readmates/auth/application/port/out/RateLimitPort.kt`:

```kotlin
package com.readmates.auth.application.port.out

import java.time.Duration

data class RateLimitCheck(
    val key: String,
    val limit: Long,
    val window: Duration,
    val sensitive: Boolean,
)

data class RateLimitDecision(
    val allowed: Boolean,
    val retryAfterSeconds: Long? = null,
    val fallback: Boolean = false,
) {
    companion object {
        fun allowed(fallback: Boolean = false) = RateLimitDecision(allowed = true, fallback = fallback)
        fun denied(retryAfterSeconds: Long?) = RateLimitDecision(allowed = false, retryAfterSeconds = retryAfterSeconds)
    }
}

interface RateLimitPort {
    fun check(check: RateLimitCheck): RateLimitDecision

    class InMemoryForTest : RateLimitPort {
        val checks = mutableListOf<RateLimitCheck>()
        var decision: RateLimitDecision = RateLimitDecision.allowed()

        override fun check(check: RateLimitCheck): RateLimitDecision {
            checks += check
            return decision
        }
    }
}
```

- [x] **Step 5: Add Redis and no-op adapters**

Create `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapter.kt`:

```kotlin
package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitDecision
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.rate-limit", name = ["enabled"], havingValue = "true")
class RedisRateLimitAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val properties: RateLimitProperties,
    private val metrics: RedisCacheMetrics,
) : RateLimitPort {
    override fun check(check: RateLimitCheck): RateLimitDecision =
        runCatching {
            val count = redisTemplate.opsForValue().increment(check.key) ?: 1L
            if (count == 1L) {
                redisTemplate.expire(check.key, check.window)
            }
            if (count <= check.limit) {
                metrics.increment("readmates.rate_limit.allowed", "sensitive", check.sensitive.toString())
                RateLimitDecision.allowed()
            } else {
                metrics.increment("readmates.rate_limit.denied", "sensitive", check.sensitive.toString())
                RateLimitDecision.denied(check.window.seconds)
            }
        }.getOrElse {
            metrics.increment("readmates.redis.fallbacks", "feature", "rate-limit")
            if (check.sensitive && properties.failClosedSensitive) {
                RateLimitDecision.denied(check.window.seconds)
            } else {
                RateLimitDecision.allowed(fallback = true)
            }
        }
}
```

Create `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/NoopRateLimitAdapter.kt`:

```kotlin
package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitDecision
import com.readmates.auth.application.port.out.RateLimitPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.rate-limit", name = ["enabled"], havingValue = "false", matchIfMissing = true)
class NoopRateLimitAdapter : RateLimitPort {
    override fun check(check: RateLimitCheck): RateLimitDecision =
        RateLimitDecision.allowed()
}
```

- [x] **Step 6: Add the security filter**

Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.security.emailOrNull
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.security.MessageDigest
import java.time.Duration
import java.util.HexFormat

@Component
class RateLimitFilter(
    private val rateLimitPort: RateLimitPort,
    private val properties: RateLimitProperties,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val check = if (properties.enabled) request.toRateLimitCheck() else null
        if (check != null) {
            val decision = rateLimitPort.check(check)
            if (!decision.allowed) {
                decision.retryAfterSeconds?.let { response.setHeader("Retry-After", it.toString()) }
                response.status = HttpServletResponse.SC_TOO_MANY_REQUESTS
                response.contentType = "application/json"
                response.writer.write("""{"code":"RATE_LIMITED","message":"Too many requests"}""")
                return
            }
        }

        filterChain.doFilter(request, response)
    }

    private fun HttpServletRequest.toRateLimitCheck(): RateLimitCheck? {
        val path = requestURI
        val ipHash = stableHash(remoteAddr ?: getHeader("CF-Connecting-IP") ?: "unknown")
        return when {
            method == "GET" && path.startsWith("/oauth2/authorization/") ->
                RateLimitCheck("rl:ip:$ipHash:oauth-start", 20, Duration.ofMinutes(1), sensitive = false)
            method == "GET" && path.startsWith("/login/oauth2/code/") ->
                RateLimitCheck("rl:ip:$ipHash:oauth-callback", 30, Duration.ofMinutes(1), sensitive = false)
            method == "GET" && INVITATION_PREVIEW.matches(path) -> {
                val token = INVITATION_PREVIEW.matchEntire(path)!!.groupValues[1]
                RateLimitCheck("rl:ip:$ipHash:invite-preview:${stableHash(token).take(12)}", 30, Duration.ofMinutes(10), sensitive = false)
            }
            method == "POST" && INVITATION_ACCEPT.matches(path) -> {
                val token = INVITATION_ACCEPT.matchEntire(path)!!.groupValues[1]
                RateLimitCheck("rl:ip:$ipHash:invite-accept:${stableHash(token).take(12)}", 10, Duration.ofMinutes(10), sensitive = true)
            }
            method in MUTATING_METHODS && path.startsWith("/api/host/") -> {
                val subject = SecurityContextHolder.getContext().authentication.emailOrNull()?.let(::stableHash) ?: ipHash
                val feedbackUpload = FEEDBACK_UPLOAD.matches(path)
                RateLimitCheck(
                    key = if (feedbackUpload) "rl:user:$subject:feedback-upload" else "rl:user:$subject:host-mutation",
                    limit = if (feedbackUpload) 10 else 60,
                    window = if (feedbackUpload) Duration.ofMinutes(10) else Duration.ofMinutes(1),
                    sensitive = feedbackUpload,
                )
            }
            else -> null
        }
    }

    private fun stableHash(value: String): String =
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)))

    private companion object {
        val MUTATING_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")
        val INVITATION_PREVIEW = Regex("^/api/invitations/([^/]+)$")
        val INVITATION_ACCEPT = Regex("^/api/invitations/([^/]+)/accept$")
        val FEEDBACK_UPLOAD = Regex("^/api/host/sessions/[^/]+/feedback-document$")
    }
}
```

- [x] **Step 7: Register the filter**

Modify `SecurityConfig` constructor and filter chain:

```kotlin
class SecurityConfig(
    private val bffSecretFilter: BffSecretFilter,
    private val sessionCookieAuthenticationFilter: SessionCookieAuthenticationFilter,
    private val rateLimitFilter: RateLimitFilter,
    private val memberAuthoritiesFilter: MemberAuthoritiesFilter,
    private val oAuthInviteTokenCaptureFilter: OAuthInviteTokenCaptureFilter,
    private val googleOidcUserService: GoogleOidcUserService,
    private val readmatesOAuthSuccessHandler: ReadmatesOAuthSuccessHandler,
    private val clientRegistrationRepository: ObjectProvider<ClientRegistrationRepository>,
)
```

Add after `sessionCookieAuthenticationFilter`:

```kotlin
.addFilterAfter(rateLimitFilter, SessionCookieAuthenticationFilter::class.java)
```

- [x] **Step 8: Run rate limit tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.adapter.out.redis.RedisRateLimitAdapterTest --tests com.readmates.auth.infrastructure.security.RateLimitFilterTest
```

Expected: PASS.

- [x] **Step 9: Run security smoke tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.infrastructure.security.BffSecretFilterUnitTest --tests com.readmates.auth.api.ViewerSecurityTest
```

Expected: PASS.

- [x] **Step 10: Commit rate limit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/port/out/RateLimitPort.kt server/src/main/kotlin/com/readmates/auth/adapter/out/redis server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisRateLimitAdapterTest.kt server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt
git commit -m "feat: add redis-backed rate limiting"
```

## Task 4: Auth Session Hot-Path Cache

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/AuthSessionCachePort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/redis/NoopAuthSessionCacheAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/AuthSessionServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapterTest.kt`

- [x] **Step 1: Add AuthSessionService cache tests**

Final correctness update: Redis may accelerate reconstruction only after MySQL confirms the token hash is still valid; add regression coverage that a revoked MySQL session is rejected even when Redis still has a snapshot.

Append these tests and helper to `AuthSessionServiceTest`:

```kotlin
@Test
fun `uses cached session only after repository validity check`() {
    val repository = CountingAuthSessionStore()
    val cache = AuthSessionCachePort.InMemoryForTest()
    val service = AuthSessionService(repository, cache)
    val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")
    repository.findCount = 0

    val session = service.findValidSession(issued.rawToken)

    assertEquals(issued.storedTokenHash, session?.sessionTokenHash)
    assertNull(session?.userAgent)
    assertNull(session?.ipHash)
    assertEquals(1, repository.findCount)
}

@Test
fun `rejects revoked repository session even when cache still has snapshot`() {
    val repository = CountingAuthSessionStore()
    val cache = AuthSessionCachePort.InMemoryForTest()
    val service = AuthSessionService(repository, cache)
    val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")

    repository.revokeByTokenHash(issued.storedTokenHash)

    assertNotNull(cache.find(issued.storedTokenHash))
    assertNull(service.findValidSession(issued.rawToken))
    assertEquals(1, repository.findCount)
}

@Test
fun `throttles last seen touch while throttle key exists`() {
    val repository = CountingAuthSessionStore()
    val cache = AuthSessionCachePort.InMemoryForTest()
    val service = AuthSessionService(repository, cache)
    val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")

    service.findValidSession(issued.rawToken)
    service.findValidSession(issued.rawToken)

    assertEquals(1, repository.touchCount)
}

private class CountingAuthSessionStore : AuthSessionStorePort.InMemoryForTest() {
    var findCount = 0
    var touchCount = 0

    override fun findValidByTokenHash(tokenHash: String): StoredAuthSession? {
        findCount += 1
        return super.findValidByTokenHash(tokenHash)
    }

    override fun touchByTokenHash(tokenHash: String) {
        touchCount += 1
        super.touchByTokenHash(tokenHash)
    }
}
```

If `AuthSessionStorePort.InMemoryForTest` is not open for inheritance, replace it with a local implementation that delegates to a mutable map.

- [x] **Step 2: Run AuthSessionService tests to verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.application.AuthSessionServiceTest
```

Expected: FAIL because `AuthSessionCachePort` and the new constructor do not exist.

- [x] **Step 3: Create auth session cache port**

Create `server/src/main/kotlin/com/readmates/auth/application/port/out/AuthSessionCachePort.kt`:

```kotlin
package com.readmates.auth.application.port.out

import com.readmates.auth.application.model.StoredAuthSession
import java.time.Duration
import java.time.OffsetDateTime

interface AuthSessionCachePort {
    fun find(tokenHash: String): StoredAuthSession?
    fun store(tokenHash: String, session: StoredAuthSession, ttl: Duration)
    fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration)
    fun shouldTouch(tokenHash: String, ttl: Duration): Boolean
    fun evict(tokenHash: String)
    fun evictAllForUser(userId: String)

    class Noop : AuthSessionCachePort {
        override fun find(tokenHash: String): StoredAuthSession? = null
        override fun store(tokenHash: String, session: StoredAuthSession, ttl: Duration) = Unit
        override fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration) = Unit
        override fun shouldTouch(tokenHash: String, ttl: Duration): Boolean = true
        override fun evict(tokenHash: String) = Unit
        override fun evictAllForUser(userId: String) = Unit
    }

    class InMemoryForTest : AuthSessionCachePort {
        private val sessions = mutableMapOf<String, StoredAuthSession>()
        private val touchKeys = mutableSetOf<String>()
        private val userSessions = mutableMapOf<String, MutableSet<String>>()

        override fun find(tokenHash: String): StoredAuthSession? = sessions[tokenHash]
        override fun store(tokenHash: String, session: StoredAuthSession, ttl: Duration) {
            sessions[tokenHash] = session
        }
        override fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration) {
            userSessions.getOrPut(userId) { mutableSetOf() } += tokenHash
        }
        override fun shouldTouch(tokenHash: String, ttl: Duration): Boolean = touchKeys.add(tokenHash)
        override fun evict(tokenHash: String) {
            sessions.remove(tokenHash)
            touchKeys.remove(tokenHash)
        }
        override fun evictAllForUser(userId: String) {
            userSessions.remove(userId)?.forEach(::evict)
        }
    }
}
```

- [x] **Step 4: Modify AuthSessionService**

Update constructor and methods in `AuthSessionService`:

```kotlin
class AuthSessionService(
    private val authSessionStore: AuthSessionStorePort,
    private val authSessionCache: AuthSessionCachePort = AuthSessionCachePort.Noop(),
    private val cacheProperties: AuthSessionCacheProperties = AuthSessionCacheProperties(),
    @param:Value("\${readmates.auth.session-cookie-secure:true}")
    private val secureCookie: Boolean = false,
) : LogoutAuthSessionUseCase {
```

In `issueSession`, store the generated `StoredAuthSession` in a local variable and warm the cache:

```kotlin
val storedSession = StoredAuthSession(
    id = UUID.randomUUID().toString(),
    userId = UUID.fromString(userId).toString(),
    sessionTokenHash = tokenHash,
    createdAt = now,
    lastSeenAt = now,
    expiresAt = expiresAt,
    userAgent = userAgent?.take(MAX_USER_AGENT_LENGTH),
    ipHash = ipAddress?.trim()?.takeIf { it.isNotEmpty() }?.let(::hashToken),
)
authSessionStore.create(storedSession)
authSessionCache.store(tokenHash, storedSession, cacheTtlFor(storedSession.expiresAt, now))
authSessionCache.rememberUserSession(storedSession.userId, tokenHash, cacheTtlFor(storedSession.expiresAt, now))
```

Replace `findValidSession`:

```kotlin
fun findValidSession(rawToken: String): StoredAuthSession? {
    val tokenHash = hashToken(rawToken)
    val now = OffsetDateTime.now(ZoneOffset.UTC)
    val cached = authSessionCache.find(tokenHash)
        ?.takeIf { it.expiresAt.isAfter(now) }
    val sourceOfTruth = authSessionStore.findValidByTokenHash(tokenHash)
        ?.takeIf { !it.revoked && it.expiresAt.isAfter(now) }
        ?: return null
    val session = cached
        ?.takeIf { it.sessionId == sourceOfTruth.id && it.userId == sourceOfTruth.userId && it.expiresAt == sourceOfTruth.expiresAt }
        ?.toStoredAuthSession(tokenHash, now)
        ?: sourceOfTruth.also {
            authSessionCache.store(tokenHash, AuthSessionCacheSnapshot(it.id, it.userId, it.expiresAt), cacheTtlFor(it.expiresAt, now))
            authSessionCache.rememberUserSession(it.userId, tokenHash, cacheTtlFor(it.expiresAt, now))
        }

    if (authSessionCache.shouldTouch(tokenHash, cacheProperties.touchThrottleTtl)) {
        authSessionStore.touchByTokenHash(tokenHash)
    }
    return session
}
```

Update revoke methods:

```kotlin
fun revokeSession(rawToken: String) {
    val tokenHash = hashToken(rawToken)
    authSessionStore.revokeByTokenHash(tokenHash)
    authSessionCache.evict(tokenHash)
}

fun revokeAllForUser(userId: String) {
    val normalizedUserId = UUID.fromString(userId).toString()
    authSessionStore.revokeAllForUser(normalizedUserId)
    authSessionCache.evictAllForUser(normalizedUserId)
}
```

Add helper:

```kotlin
private fun cacheTtlFor(expiresAt: OffsetDateTime, now: OffsetDateTime): Duration {
    val remaining = Duration.between(now, expiresAt)
    if (remaining <= Duration.ZERO) {
        return Duration.ZERO
    }
    return minOf(cacheProperties.sessionTtl, remaining)
}
```

- [x] **Step 5: Create Redis/no-op auth cache adapters**

Create `NoopAuthSessionCacheAdapter` conditional on `readmates.auth-session-cache.enabled=false`.

Create `RedisAuthSessionCacheAdapter` conditional on `readmates.auth-session-cache.enabled=true`. Store JSON with this value shape:

```kotlin
private data class CachedAuthSession(
    val schemaVersion: Int = 0,
    val sessionId: String = "",
    val userId: String = "",
    val expiresAt: String = "",
)
```

The earlier full-session value shape is superseded by the minimal spec-compliant snapshot above. Do not cache `sessionTokenHash`, `createdAt`, `lastSeenAt`, `userAgent`, `ipHash`, or revocation state in Redis; MySQL remains the source of truth for validity.

The adapter must:

```kotlin
override fun find(tokenHash: String): AuthSessionCacheSnapshot? {
    val raw = redisTemplate.opsForValue().get(sessionKey(tokenHash)) ?: return null
    val cached = codec.decode(raw, CachedAuthSession::class.java) ?: run {
        redisTemplate.delete(sessionKey(tokenHash))
        metrics.increment("readmates.redis.fallbacks", "feature", "auth-session-decode")
        return null
    }
    return AuthSessionCacheSnapshot(
        sessionId = cached.sessionId,
        userId = cached.userId,
        expiresAt = OffsetDateTime.parse(cached.expiresAt),
    )
}
```

Use `opsForSet()` for `auth:user-sessions:{userId}` and `opsForValue().setIfAbsent(touchKey, "1", ttl)` for touch throttle.

- [x] **Step 6: Write Redis auth cache adapter test**

Create `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapterTest.kt`:

```kotlin
package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.out.AuthSessionCacheSnapshot
import com.readmates.support.RedisTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneOffset

@SpringBootTest(
    properties = [
        "readmates.redis.enabled=true",
        "readmates.auth-session-cache.enabled=true",
    ],
)
class RedisAuthSessionCacheAdapterTest(
    @param:Autowired private val adapter: RedisAuthSessionCacheAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
) {
    @Test
    fun `stores and loads session snapshot`() {
        val session = storedSession("session-token-hash-1", "00000000-0000-0000-0000-000000000101")
        val snapshot = snapshot(session)

        adapter.store(session.sessionTokenHash, snapshot, Duration.ofMinutes(10))

        assertEquals(snapshot, adapter.find(session.sessionTokenHash))
    }

    @Test
    fun `touch throttle returns true once and false while key exists`() {
        val tokenHash = "session-token-hash-2"

        assertTrue(adapter.shouldTouch(tokenHash, Duration.ofMinutes(5)))
        assertFalse(adapter.shouldTouch(tokenHash, Duration.ofMinutes(5)))
    }

    @Test
    fun `evicts all cached sessions for user`() {
        val userId = "00000000-0000-0000-0000-000000000101"
        val session = storedSession("session-token-hash-3", userId)
        adapter.store(session.sessionTokenHash, snapshot(session), Duration.ofMinutes(10))
        adapter.rememberUserSession(userId, session.sessionTokenHash, Duration.ofMinutes(10))

        adapter.evictAllForUser(userId)

        assertNull(adapter.find(session.sessionTokenHash))
    }

    private fun storedSession(tokenHash: String, userId: String) =
        StoredAuthSession(
            id = "00000000-0000-0000-0000-000000000301",
            userId = userId,
            sessionTokenHash = tokenHash,
            createdAt = OffsetDateTime.of(2026, 4, 28, 0, 0, 0, 0, ZoneOffset.UTC),
            lastSeenAt = OffsetDateTime.of(2026, 4, 28, 0, 0, 0, 0, ZoneOffset.UTC),
            expiresAt = OffsetDateTime.of(2026, 5, 12, 0, 0, 0, 0, ZoneOffset.UTC),
            userAgent = "agent",
            ipHash = "ip-hash",
        )

    private fun snapshot(session: StoredAuthSession) =
        AuthSessionCacheSnapshot(
            sessionId = session.id,
            userId = session.userId,
            expiresAt = session.expiresAt,
        )

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun redisProperties(registry: DynamicPropertyRegistry) {
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}
```

The three tests are:

```kotlin
@Test
fun `stores and loads session snapshot`()

@Test
fun `touch throttle returns true once and false while key exists`()

@Test
fun `evicts all cached sessions for user`()
```

Use `RedisTestContainer.registerRedisProperties(registry)` and set:

```kotlin
"readmates.auth-session-cache.enabled=true"
```

- [x] **Step 7: Run auth cache tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.application.AuthSessionServiceTest --tests com.readmates.auth.adapter.out.redis.RedisAuthSessionCacheAdapterTest
```

Expected: PASS.

- [x] **Step 8: Run auth API smoke tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest --tests com.readmates.auth.api.AuthMeControllerTest
```

Expected: PASS.

- [x] **Step 9: Commit auth session cache**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt server/src/main/kotlin/com/readmates/auth/application/port/out/AuthSessionCachePort.kt server/src/main/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapter.kt server/src/main/kotlin/com/readmates/auth/adapter/out/redis/NoopAuthSessionCacheAdapter.kt server/src/test/kotlin/com/readmates/auth/application/AuthSessionServiceTest.kt server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapterTest.kt
git commit -m "feat: cache auth session lookups in redis"
```

## Task 5: Public Read-Through Cache

**Files:**
- Create: `server/src/main/kotlin/com/readmates/publication/application/port/out/PublicReadCachePort.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/out/redis/RedisPublicReadCacheAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/out/redis/NoopPublicReadCacheAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
- Test: `server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt`

- [ ] **Step 1: Write service cache tests**

Create `PublicQueryServiceCacheTest.kt`:

```kotlin
package com.readmates.publication.application.service

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.publication.application.port.out.PublicReadCachePort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class PublicQueryServiceCacheTest {
    @Test
    fun `returns cached public club without loading port`() {
        val cache = PublicReadCachePort.InMemoryForTest(club = publicClub())
        val loader = RecordingPublicLoader()
        val service = PublicQueryService(loader, cache)

        val result = service.getClub()

        assertEquals("ReadMates", result?.clubName)
        assertEquals(0, loader.clubLoads)
    }

    @Test
    fun `loads and stores public session on cache miss`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val loader = RecordingPublicLoader()
        val service = PublicQueryService(loader, cache)
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        service.getSession(sessionId)
        service.getSession(sessionId)

        assertEquals(1, loader.sessionLoads)
    }

    private class RecordingPublicLoader : LoadPublishedPublicDataPort {
        var clubLoads = 0
        var sessionLoads = 0

        override fun loadClub(): PublicClubResult = publicClub().also { clubLoads += 1 }
        override fun loadSession(sessionId: UUID): PublicSessionDetailResult = publicSession(sessionId).also { sessionLoads += 1 }
    }

    companion object {
        fun publicClub() = PublicClubResult(
            clubName = "ReadMates",
            tagline = "읽고 대화하는 모임",
            about = "소개",
            stats = PublicClubStatsResult(sessions = 1, books = 1, members = 3),
            recentSessions = emptyList(),
        )

        fun publicSession(sessionId: UUID) = PublicSessionDetailResult(
            sessionId = sessionId.toString(),
            sessionNumber = 1,
            bookTitle = "책",
            bookAuthor = "저자",
            bookImageUrl = null,
            date = "2026-04-28",
            summary = "요약",
            highlights = emptyList(),
            oneLiners = emptyList(),
        )
    }
}
```

- [ ] **Step 2: Run public cache test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.publication.application.service.PublicQueryServiceCacheTest
```

Expected: FAIL because `PublicReadCachePort` and new constructor do not exist.

- [ ] **Step 3: Create public cache port**

Create `PublicReadCachePort.kt`:

```kotlin
package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface PublicReadCachePort {
    fun getClub(): PublicClubResult?
    fun putClub(result: PublicClubResult)
    fun getSession(sessionId: UUID): PublicSessionDetailResult?
    fun putSession(sessionId: UUID, result: PublicSessionDetailResult)

    class Noop : PublicReadCachePort {
        override fun getClub(): PublicClubResult? = null
        override fun putClub(result: PublicClubResult) = Unit
        override fun getSession(sessionId: UUID): PublicSessionDetailResult? = null
        override fun putSession(sessionId: UUID, result: PublicSessionDetailResult) = Unit
    }

    class InMemoryForTest(
        private var club: PublicClubResult? = null,
    ) : PublicReadCachePort {
        private val sessions = mutableMapOf<UUID, PublicSessionDetailResult>()
        override fun getClub(): PublicClubResult? = club
        override fun putClub(result: PublicClubResult) {
            club = result
        }
        override fun getSession(sessionId: UUID): PublicSessionDetailResult? = sessions[sessionId]
        override fun putSession(sessionId: UUID, result: PublicSessionDetailResult) {
            sessions[sessionId] = result
        }
    }
}
```

- [ ] **Step 4: Modify PublicQueryService**

Change constructor and methods:

```kotlin
@Service
class PublicQueryService(
    private val loadPublishedPublicDataPort: LoadPublishedPublicDataPort,
    private val cache: PublicReadCachePort = PublicReadCachePort.Noop(),
) : GetPublicClubUseCase, GetPublicSessionUseCase {
    override fun getClub() =
        cache.getClub() ?: loadPublishedPublicDataPort.loadClub()?.also(cache::putClub)

    override fun getSession(sessionId: UUID) =
        cache.getSession(sessionId) ?: loadPublishedPublicDataPort.loadSession(sessionId)?.also {
            cache.putSession(sessionId, it)
        }
}
```

- [ ] **Step 5: Create Redis/no-op public cache adapters**

Create Redis adapter with keys:

```kotlin
private const val CLUB_KEY = "public:club:v1"
private fun sessionKey(sessionId: UUID) = "public:session:$sessionId:v1"
```

Use `PublicCacheProperties.clubTtl` and `sessionTtl`, `CacheJsonCodec`, and `RedisCacheMetrics`.

On decode failure, delete the key and return null:

```kotlin
val decoded = codec.decode(raw, PublicClubResult::class.java)
if (decoded == null) {
    redisTemplate.delete(CLUB_KEY)
    metrics.increment("readmates.redis.fallbacks", "feature", "public-cache-decode")
}
return decoded
```

No-op adapter returns misses and is conditional on `readmates.public-cache.enabled=false`.

- [ ] **Step 6: Run public cache service tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.publication.application.service.PublicQueryServiceCacheTest
```

Expected: PASS.

- [ ] **Step 7: Run public API tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.publication.api.PublicControllerDbTest --tests com.readmates.publication.api.PublicControllerTest
```

Expected: PASS.

- [ ] **Step 8: Commit public cache**

```bash
git add server/src/main/kotlin/com/readmates/publication/application/port/out/PublicReadCachePort.kt server/src/main/kotlin/com/readmates/publication/adapter/out/redis server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt
git commit -m "feat: cache public read models in redis"
```

## Task 6: Notes Read-Through Cache

**Files:**
- Create: `server/src/main/kotlin/com/readmates/note/application/port/out/NotesReadCachePort.kt`
- Create: `server/src/main/kotlin/com/readmates/note/adapter/out/redis/RedisNotesReadCacheAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/note/adapter/out/redis/NoopNotesReadCacheAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/application/service/NotesFeedService.kt`
- Test: `server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt`

- [ ] **Step 1: Write notes cache service tests**

Create `NotesFeedServiceCacheTest.kt`:

```kotlin
package com.readmates.note.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.note.application.port.out.LoadNotesFeedPort
import com.readmates.note.application.port.out.NotesReadCachePort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class NotesFeedServiceCacheTest {
    private val member = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        email = "member@example.com",
        displayName = "멤버",
        accountName = "Member",
        role = MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    @Test
    fun `returns cached club feed without loading port`() {
        val cache = NotesReadCachePort.InMemoryForTest(feed = listOf(feedItem()))
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)

        val result = service.getNotesFeed(member, null)

        assertEquals(1, result.size)
        assertEquals(0, loader.feedLoads)
    }

    @Test
    fun `loads and stores session feed on cache miss`() {
        val cache = NotesReadCachePort.InMemoryForTest()
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)
        val sessionId = "00000000-0000-0000-0000-000000000301"

        service.getNotesFeed(member, sessionId)
        service.getNotesFeed(member, sessionId)

        assertEquals(1, loader.sessionFeedLoads)
    }

    private class RecordingNotesLoader : LoadNotesFeedPort {
        var feedLoads = 0
        var sessionFeedLoads = 0
        var sessionsLoads = 0

        override fun loadNoteSessions(clubId: UUID): List<NoteSessionResult> =
            listOf(noteSession()).also { sessionsLoads += 1 }

        override fun loadNotesFeed(clubId: UUID): List<NoteFeedResult> =
            listOf(feedItem()).also { feedLoads += 1 }

        override fun loadNotesFeedForSession(clubId: UUID, sessionId: UUID): List<NoteFeedResult> =
            listOf(feedItem()).also { sessionFeedLoads += 1 }
    }

    companion object {
        fun feedItem() = NoteFeedResult(
            sessionId = "00000000-0000-0000-0000-000000000301",
            sessionNumber = 1,
            bookTitle = "책",
            date = "2026-04-28",
            authorName = "멤버",
            authorShortName = "멤버",
            kind = "QUESTION",
            text = "질문",
        )

        fun noteSession() = NoteSessionResult(
            sessionId = "00000000-0000-0000-0000-000000000301",
            sessionNumber = 1,
            bookTitle = "책",
            date = "2026-04-28",
            questionCount = 1,
            oneLinerCount = 0,
            longReviewCount = 0,
            highlightCount = 0,
            totalCount = 1,
        )
    }
}
```

- [ ] **Step 2: Run notes cache tests to verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.note.application.service.NotesFeedServiceCacheTest
```

Expected: FAIL because `NotesReadCachePort` and constructor overload do not exist.

- [ ] **Step 3: Create notes cache port**

Create `NotesReadCachePort.kt`:

```kotlin
package com.readmates.note.application.port.out

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import java.util.UUID

interface NotesReadCachePort {
    fun getFeed(clubId: UUID): List<NoteFeedResult>?
    fun putFeed(clubId: UUID, result: List<NoteFeedResult>)
    fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>?
    fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>)
    fun getSessions(clubId: UUID): List<NoteSessionResult>?
    fun putSessions(clubId: UUID, result: List<NoteSessionResult>)

    class Noop : NotesReadCachePort {
        override fun getFeed(clubId: UUID): List<NoteFeedResult>? = null
        override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) = Unit
        override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? = null
        override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) = Unit
        override fun getSessions(clubId: UUID): List<NoteSessionResult>? = null
        override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) = Unit
    }

    class InMemoryForTest(
        private var feed: List<NoteFeedResult>? = null,
    ) : NotesReadCachePort {
        private val sessionFeeds = mutableMapOf<Pair<UUID, UUID>, List<NoteFeedResult>>()
        private val sessions = mutableMapOf<UUID, List<NoteSessionResult>>()
        override fun getFeed(clubId: UUID): List<NoteFeedResult>? = feed
        override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) {
            feed = result
        }
        override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? = sessionFeeds[clubId to sessionId]
        override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) {
            sessionFeeds[clubId to sessionId] = result
        }
        override fun getSessions(clubId: UUID): List<NoteSessionResult>? = sessions[clubId]
        override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) {
            sessions[clubId] = result
        }
    }
}
```

- [ ] **Step 4: Modify NotesFeedService**

Change constructor and read paths:

```kotlin
class NotesFeedService(
    private val loadNotesFeedPort: LoadNotesFeedPort,
    private val cache: NotesReadCachePort = NotesReadCachePort.Noop(),
) : GetNotesFeedUseCase, ListNoteSessionsUseCase {
    override fun getNotesFeed(member: CurrentMember, sessionId: String?): List<NoteFeedResult> {
        if (sessionId != null) {
            val parsedSessionId = parseSessionIdOrNull(sessionId) ?: return emptyList()
            return cache.getSessionFeed(member.clubId, parsedSessionId)
                ?: loadNotesFeedPort.loadNotesFeedForSession(member.clubId, parsedSessionId).also {
                    cache.putSessionFeed(member.clubId, parsedSessionId, it)
                }
        }

        return cache.getFeed(member.clubId)
            ?: loadNotesFeedPort.loadNotesFeed(member.clubId).also {
                cache.putFeed(member.clubId, it)
            }
    }

    override fun listNoteSessions(member: CurrentMember) =
        cache.getSessions(member.clubId)
            ?: loadNotesFeedPort.loadNoteSessions(member.clubId).also {
                cache.putSessions(member.clubId, it)
            }
}
```

- [ ] **Step 5: Create Redis/no-op notes cache adapters**

Use keys:

```kotlin
private fun feedKey(clubId: UUID) = "notes:club:$clubId:feed:v1"
private fun sessionFeedKey(clubId: UUID, sessionId: UUID) = "notes:club:$clubId:session:$sessionId:feed:v1"
private fun sessionsKey(clubId: UUID) = "notes:club:$clubId:sessions:v1"
```

Because Kotlin/Jackson generic list decoding needs type references, use object mapper directly in this adapter:

```kotlin
private val feedListType = objectMapper.typeFactory.constructCollectionType(List::class.java, NoteFeedResult::class.java)
private val sessionListType = objectMapper.typeFactory.constructCollectionType(List::class.java, NoteSessionResult::class.java)
```

On decode failure, delete the key and return null.

- [ ] **Step 6: Run notes service cache tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.note.application.service.NotesFeedServiceCacheTest
```

Expected: PASS.

- [ ] **Step 7: Run notes API tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.note.api.QuestionControllerTest --tests com.readmates.note.api.ReviewControllerTest --tests com.readmates.note.api.CheckinControllerTest
```

Expected: PASS.

- [ ] **Step 8: Commit notes cache**

```bash
git add server/src/main/kotlin/com/readmates/note/application/port/out/NotesReadCachePort.kt server/src/main/kotlin/com/readmates/note/adapter/out/redis server/src/main/kotlin/com/readmates/note/application/service/NotesFeedService.kt server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt
git commit -m "feat: cache notes feed read models in redis"
```

## Task 7: Broad Cache Invalidation After Mutations

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/cache/ReadCacheInvalidationPort.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/cache/NoopReadCacheInvalidationAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/cache/RedisReadCacheInvalidationAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`
- Extend tests listed in file structure.

- [ ] **Step 1: Write service invalidation tests**

In `HostSessionCommandServiceTest`, add a fake invalidator:

```kotlin
private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
    val clubs = mutableListOf<UUID>()
    override fun evictClubContent(clubId: UUID) {
        clubs += clubId
    }
}
```

Add tests:

```kotlin
@Test
fun `evicts club content after publication update`() {
    val port = RecordingHostSessionWritePort()
    val invalidation = RecordingReadCacheInvalidationPort()
    val service = HostSessionCommandService(port, invalidation)
    val command = UpsertPublicationCommand(
        host = host,
        sessionId = sessionId,
        publicSummary = "요약",
        visibility = SessionRecordVisibility.PUBLIC,
    )

    service.upsertPublication(command)

    assertEquals(listOf(host.clubId), invalidation.clubs)
}
```

In `SessionMemberWriteServiceTest`, add:

```kotlin
@Test
fun `evicts club content after one line review save`() {
    val port = RecordingSessionParticipationWritePort()
    val invalidation = RecordingReadCacheInvalidationPort()
    val service = SessionMemberWriteService(port, invalidation)

    service.saveOneLineReview(SaveOneLineReviewCommand(member, "좋았어요"))

    assertEquals(listOf(member.clubId), invalidation.clubs)
}
```

- [ ] **Step 2: Run invalidation tests to verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.application.service.HostSessionCommandServiceTest --tests com.readmates.session.application.service.SessionMemberWriteServiceTest
```

Expected: FAIL because `ReadCacheInvalidationPort` and new constructors do not exist.

- [ ] **Step 3: Create invalidation port and adapters**

Create `ReadCacheInvalidationPort.kt`:

```kotlin
package com.readmates.shared.cache

import java.util.UUID

interface ReadCacheInvalidationPort {
    fun evictClubContent(clubId: UUID)

    class Noop : ReadCacheInvalidationPort {
        override fun evictClubContent(clubId: UUID) = Unit
    }
}
```

Create `NoopReadCacheInvalidationAdapter.kt` conditional on both `readmates.public-cache.enabled=false` and `readmates.notes-cache.enabled=false` is awkward with one bean. Use `@ConditionalOnProperty(prefix = "readmates.redis", name = ["enabled"], havingValue = "false", matchIfMissing = true)` and keep constructor defaults in services for tests.

Create `RedisReadCacheInvalidationAdapter.kt`:

```kotlin
package com.readmates.shared.cache

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates.redis", name = ["enabled"], havingValue = "true")
class RedisReadCacheInvalidationAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val metrics: RedisCacheMetrics,
) : ReadCacheInvalidationPort {
    override fun evictClubContent(clubId: UUID) {
        val keys = mutableSetOf("public:club:v1", "notes:club:$clubId:feed:v1", "notes:club:$clubId:sessions:v1")
        redisTemplate.keys("public:session:*:v1")?.let(keys::addAll)
        redisTemplate.keys("notes:club:$clubId:session:*:feed:v1")?.let(keys::addAll)
        if (keys.isNotEmpty()) {
            redisTemplate.delete(keys)
        }
        metrics.increment("readmates.public_cache.evicted", "scope", "club")
        metrics.increment("readmates.notes_cache.evicted", "scope", "club")
    }
}
```

Use broad `KEYS` only because this project has small cache cardinality. If production cache size grows, replace this adapter with tracked key sets.

- [ ] **Step 4: Evict after host session mutations**

Modify `HostSessionCommandService` constructor:

```kotlin
class HostSessionCommandService(
    private val port: HostSessionWritePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : ManageHostSessionUseCase,
    ConfirmAttendanceUseCase,
    UpsertPublicationUseCase,
    ListUpcomingSessionsUseCase,
    GetHostDashboardUseCase {
```

For mutating methods, call invalidation after successful port calls:

```kotlin
@Transactional
override fun updateVisibility(command: UpdateHostSessionVisibilityCommand) =
    port.updateVisibility(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun publish(command: HostSessionIdCommand) =
    port.publish(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun upsertPublication(command: UpsertPublicationCommand) =
    port.upsertPublication(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }
```

Use this complete mutating method shape:

```kotlin
@Transactional
override fun create(command: HostSessionCommand) =
    port.create(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun update(command: UpdateHostSessionCommand) =
    port.update(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun updateVisibility(command: UpdateHostSessionVisibilityCommand) =
    port.updateVisibility(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun open(command: HostSessionIdCommand) =
    port.open(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun close(command: HostSessionIdCommand) =
    port.close(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun publish(command: HostSessionIdCommand) =
    port.publish(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun delete(command: HostSessionIdCommand) =
    port.delete(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun confirmAttendance(command: ConfirmAttendanceCommand) =
    port.confirmAttendance(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }

@Transactional
override fun upsertPublication(command: UpsertPublicationCommand) =
    port.upsertPublication(command).also { cacheInvalidation.evictClubContent(command.host.clubId) }
```

- [ ] **Step 5: Evict after note/member/profile mutations**

Modify `SessionMemberWriteService` constructor:

```kotlin
class SessionMemberWriteService(
    private val writePort: SessionParticipationWritePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : UpdateRsvpUseCase,
    SaveCheckinUseCase,
    SaveQuestionUseCase,
    ReplaceQuestionsUseCase,
    SaveReviewUseCase {
```

Evict after `saveQuestion`, `replaceQuestions`, `saveOneLineReview`, and `saveLongReview`. Do not evict for `updateRsvp` or `saveCheckin` because notes/public caches do not read those values.

Use this method shape for note mutations:

```kotlin
@Transactional
override fun saveQuestion(command: SaveQuestionCommand) =
    writePort.saveQuestion(command).also { cacheInvalidation.evictClubContent(command.member.clubId) }

@Transactional
override fun replaceQuestions(command: ReplaceQuestionsCommand) =
    writePort.replaceQuestions(command).also { cacheInvalidation.evictClubContent(command.member.clubId) }

@Transactional
override fun saveOneLineReview(command: SaveOneLineReviewCommand) =
    writePort.saveOneLineReview(command).also { cacheInvalidation.evictClubContent(command.member.clubId) }

@Transactional
override fun saveLongReview(command: SaveLongReviewCommand) =
    writePort.saveLongReview(command).also { cacheInvalidation.evictClubContent(command.member.clubId) }
```

Modify `MemberLifecycleService` and `MemberProfileService` constructors with `ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop()`. Evict after successful membership status/profile changes because public/notes author names and left-member labels can change.

- [ ] **Step 6: Run invalidation tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.application.service.HostSessionCommandServiceTest --tests com.readmates.session.application.service.SessionMemberWriteServiceTest --tests com.readmates.auth.api.MemberLifecycleAuthTest --tests com.readmates.auth.api.MemberProfileControllerTest
```

Expected: PASS.

- [ ] **Step 7: Commit invalidation**

```bash
git add server/src/main/kotlin/com/readmates/shared/cache/ReadCacheInvalidationPort.kt server/src/main/kotlin/com/readmates/shared/cache/NoopReadCacheInvalidationAdapter.kt server/src/main/kotlin/com/readmates/shared/cache/RedisReadCacheInvalidationAdapter.kt server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt server/src/test/kotlin/com/readmates/session/application/service/HostSessionCommandServiceTest.kt server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt
git commit -m "feat: evict redis read caches after mutations"
```

## Task 8: Redis Integration Coverage and Architecture Guard

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Add missing Redis adapter tests from Tasks 5 and 6 if they were not added there.

- [ ] **Step 1: Update architecture test to allow redis adapters but keep application clean**

Modify the architecture test so application packages still do not depend on adapters:

```kotlin
noClasses()
    .that()
    .resideInAnyPackage(*migratedApplicationPackages)
    .should()
    .dependOnClassesThat()
    .resideInAnyPackage(
        "..adapter.in.web..",
        "..adapter.out.persistence..",
        "..adapter.out.redis..",
    )
    .check(importedClasses)
```

This makes Redis adapters follow the same direction as persistence adapters.

- [ ] **Step 2: Run architecture test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: PASS.

- [ ] **Step 3: Run Redis adapter tests**

Run:

```bash
./server/gradlew -p server test --tests '*Redis*AdapterTest'
```

Expected: PASS. If Gradle does not match wildcard class names in this shell, run each Redis adapter test class explicitly.

- [ ] **Step 4: Commit test guard updates**

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt server/src/test/kotlin/com/readmates/**/adapter/out/redis
git commit -m "test: cover redis adapters and boundaries"
```

## Task 9: Full Verification and Rollout Notes

**Files:**
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/deploy/README.md`

- [ ] **Step 1: Document local Redis usage**

In `docs/development/local-setup.md`, add a concise section:

```markdown
## Optional Redis

Redis is optional and disabled by default. The server continues to use MySQL as the source of truth for sessions, membership, publication, and notes data.

Start local dependencies:

```bash
docker compose up -d mysql redis
```

Enable Redis-backed features explicitly:

```bash
READMATES_REDIS_ENABLED=true \
READMATES_RATE_LIMIT_ENABLED=true \
READMATES_AUTH_SESSION_CACHE_ENABLED=true \
READMATES_PUBLIC_CACHE_ENABLED=true \
READMATES_NOTES_CACHE_ENABLED=true \
./server/gradlew -p server bootRun
```
```

- [ ] **Step 2: Document verification commands**

In `docs/development/test-guide.md`, add:

```markdown
## Redis-Backed Server Features

Redis features must pass with Redis disabled and with Redis enabled in targeted adapter tests.

```bash
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

Targeted Redis tests use Testcontainers and do not require a manually running Redis server.
```

- [ ] **Step 3: Document deployment flags**

In `docs/deploy/README.md`, add public-safe flag names only:

```markdown
## Redis Feature Flags

Redis is optional. Enable in this order after configuring a managed Redis URL in the runtime environment:

1. `READMATES_REDIS_ENABLED=true`
2. `READMATES_RATE_LIMIT_ENABLED=true`
3. `READMATES_AUTH_SESSION_CACHE_ENABLED=true`
4. `READMATES_PUBLIC_CACHE_ENABLED=true`
5. `READMATES_NOTES_CACHE_ENABLED=true`

Disable the affected feature flag to roll back a Redis-backed behavior without changing MySQL data.
```

- [ ] **Step 4: Run docs checks**

Run:

```bash
git diff --check -- docs/development/local-setup.md docs/development/test-guide.md docs/deploy/README.md
```

Expected: no output.

- [ ] **Step 5: Run full server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 6: Run E2E smoke**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

- [ ] **Step 7: Commit docs and final verification**

```bash
git add docs/development/local-setup.md docs/development/test-guide.md docs/deploy/README.md
git commit -m "docs: document redis feature rollout"
```

## Final Review Checklist

- [ ] Redis disabled by default.
- [ ] Server starts and tests pass without Redis running.
- [ ] No raw session token, invitation token, BFF secret, OAuth code, private feedback body, email, or display name is stored in Redis keys or metric labels.
- [ ] Rate limit returns `429` and does not leak internal key material.
- [ ] Auth session cache stores only session metadata and keeps MySQL as source of truth.
- [ ] `last_seen_at` is still updated, but throttled.
- [ ] Logout and revoke-all evict Redis cache best-effort after MySQL revoke.
- [ ] Public cache only contains public API read models.
- [ ] Notes cache only contains member-visible published notes feed models.
- [ ] Broad cache eviction runs after host/session/note/member/profile mutations.
- [ ] Architecture boundary test blocks application code from depending on Redis adapters.
- [ ] `./server/gradlew -p server clean test` passes.
- [ ] `pnpm --dir front test:e2e` passes.
