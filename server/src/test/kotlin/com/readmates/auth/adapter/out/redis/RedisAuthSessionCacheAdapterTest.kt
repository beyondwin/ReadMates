package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.out.AuthSessionCacheSnapshot
import com.readmates.auth.application.port.out.AuthSessionCachePort
import com.readmates.shared.cache.CacheJsonCodec
import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.MySqlTestContainer
import com.readmates.support.RedisTestContainer
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.auth-session-cache.enabled=true",
    ],
)
class RedisAuthSessionCacheAdapterTest(
    @param:Autowired private val adapter: RedisAuthSessionCacheAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val meterRegistry: MeterRegistry,
) {
    private val contextRunner = ApplicationContextRunner()
        .withUserConfiguration(AuthSessionCacheAdapterBeanTestConfiguration::class.java)

    @Test
    fun `selects expected auth session cache adapter for redis and auth session cache flags`() {
        val cases = listOf(
            AuthSessionCacheAdapterCase(
                redisEnabled = true,
                authSessionCacheEnabled = true,
                expectedAdapter = RedisAuthSessionCacheAdapter::class.java,
            ),
            AuthSessionCacheAdapterCase(
                redisEnabled = true,
                authSessionCacheEnabled = false,
                expectedAdapter = NoopAuthSessionCacheAdapter::class.java,
            ),
            AuthSessionCacheAdapterCase(
                redisEnabled = false,
                authSessionCacheEnabled = true,
                expectedAdapter = NoopAuthSessionCacheAdapter::class.java,
            ),
            AuthSessionCacheAdapterCase(
                redisEnabled = false,
                authSessionCacheEnabled = false,
                expectedAdapter = NoopAuthSessionCacheAdapter::class.java,
            ),
        )

        cases.forEach { case ->
            contextRunner
                .withPropertyValues(
                    "readmates.redis.enabled=${case.redisEnabled}",
                    "readmates.auth-session-cache.enabled=${case.authSessionCacheEnabled}",
                ).run { context ->
                    assertThat(context)
                        .describedAs(
                            "redis=${case.redisEnabled}, auth-session-cache=${case.authSessionCacheEnabled}",
                        ).hasSingleBean(AuthSessionCachePort::class.java)
                    assertThat(context)
                        .describedAs(
                            "redis=${case.redisEnabled}, auth-session-cache=${case.authSessionCacheEnabled}",
                        ).hasSingleBean(case.expectedAdapter)
                }
        }
    }

    @Test
    fun `stores and loads session snapshot`() {
        val session = storedSession("session-token-hash-1", "00000000-0000-0000-0000-000000000101")
        val key = "auth:session:${session.sessionTokenHash}"
        redisTemplate.delete(key)
        val hitsBefore = counterValue("readmates.auth_session_cache.hit")

        val snapshot = snapshot(session)
        adapter.store(session.sessionTokenHash, snapshot, Duration.ofMinutes(10))

        val rawJson = redisTemplate.opsForValue().get(key)
        assertThat(rawJson).contains("schemaVersion", "sessionId", "userId", "expiresAt")
        assertThat(rawJson).doesNotContain(
            "sessionTokenHash",
            "userAgent",
            "ipHash",
            "agent",
            "ip-hash",
            session.sessionTokenHash,
        )
        assertEquals(snapshot, adapter.find(session.sessionTokenHash))
        assertEquals(hitsBefore + 1.0, counterValue("readmates.auth_session_cache.hit"))
    }

    @Test
    fun `missing session records cache miss metric`() {
        val tokenHash = "session-token-hash-missing"
        redisTemplate.delete("auth:session:$tokenHash")
        val missesBefore = counterValue("readmates.auth_session_cache.miss")

        assertNull(adapter.find(tokenHash))

        assertEquals(missesBefore + 1.0, counterValue("readmates.auth_session_cache.miss"))
    }

    @Test
    fun `touch throttle returns true once and false while key exists`() {
        val tokenHash = "session-token-hash-2"
        redisTemplate.delete("auth:last-seen-touch:$tokenHash")
        val skippedBefore = counterValue("readmates.auth_session_touch.skipped")

        assertTrue(adapter.shouldTouch(tokenHash, Duration.ofMinutes(5)))
        assertFalse(adapter.shouldTouch(tokenHash, Duration.ofMinutes(5)))
        assertEquals(skippedBefore + 1.0, counterValue("readmates.auth_session_touch.skipped"))
    }

    @Test
    fun `evicts all cached sessions for user`() {
        val userId = "00000000-0000-0000-0000-000000000101"
        val session = storedSession("session-token-hash-3", userId)
        adapter.store(session.sessionTokenHash, snapshot(session), Duration.ofMinutes(10))
        adapter.rememberUserSession(userId, session.sessionTokenHash, Duration.ofMinutes(10))
        val evictedBefore = counterValue("readmates.auth_session_cache.evicted", "scope", "user")

        adapter.evictAllForUser(userId)

        assertNull(adapter.find(session.sessionTokenHash))
        assertEquals(
            evictedBefore + 1.0,
            counterValue("readmates.auth_session_cache.evicted", "scope", "user"),
        )
    }

    @Test
    fun `remembering later shorter session does not shorten user session index ttl`() {
        val userId = "00000000-0000-0000-0000-000000000102"
        val first = storedSession("session-token-hash-index-long", userId)
        val second = storedSession("session-token-hash-index-short", userId)
        val userKey = "auth:user-sessions:$userId"
        redisTemplate.delete(
            listOf(
                userKey,
                "auth:session:${first.sessionTokenHash}",
                "auth:session:${second.sessionTokenHash}",
                "auth:last-seen-touch:${first.sessionTokenHash}",
                "auth:last-seen-touch:${second.sessionTokenHash}",
            ),
        )

        adapter.store(first.sessionTokenHash, snapshot(first), Duration.ofMinutes(10))
        adapter.rememberUserSession(userId, first.sessionTokenHash, Duration.ofMinutes(10))
        adapter.store(second.sessionTokenHash, snapshot(second), Duration.ofMinutes(10))
        adapter.rememberUserSession(userId, second.sessionTokenHash, Duration.ofSeconds(1))

        assertThat(redisTemplate.getExpire(userKey, TimeUnit.MILLISECONDS))
            .isGreaterThan(Duration.ofMinutes(9).toMillis())

        adapter.evictAllForUser(userId)

        assertNull(adapter.find(first.sessionTokenHash))
        assertNull(adapter.find(second.sessionTokenHash))
    }

    @Test
    fun `eviction failure records operation metrics without local cache bypass`() {
        val registry = SimpleMeterRegistry()
        val tokenHash = "session-token-hash-evict-failure"
        val session = storedSession(tokenHash, "00000000-0000-0000-0000-000000000103")
        val key = "auth:session:$tokenHash"
        redisTemplate.delete(key)
        val failingDeleteRedisTemplate = Mockito.spy(redisTemplate)
        Mockito.doThrow(IllegalStateException("redis unavailable"))
            .`when`(failingDeleteRedisTemplate)
            .delete(Mockito.anyCollection<String>())
        val adapter = RedisAuthSessionCacheAdapter(
            redisTemplate = failingDeleteRedisTemplate,
            codec = CacheJsonCodec(JsonMapper.builder().findAndAddModules().build()),
            metrics = metrics(registry),
        )
        val snapshot = snapshot(session)
        adapter.store(tokenHash, snapshot, Duration.ofMinutes(10))
        assertEquals(snapshot, adapter.find(tokenHash))

        adapter.evict(tokenHash)

        assertThat(redisTemplate.opsForValue().get(key)).isNotNull()
        assertEquals(snapshot, adapter.find(tokenHash))
        assertEquals(1.0, counterValue(registry, "readmates.redis.fallbacks", "feature", "auth-session"))
        assertEquals(
            1.0,
            counterValue(
                registry,
                "readmates.redis.operation.errors",
                "feature",
                "auth-session",
                "operation",
                "evict",
            ),
        )
    }

    @Test
    fun `decode failure deletes corrupt session and records fallback metrics`() {
        val tokenHash = "session-token-hash-corrupt"
        val key = "auth:session:$tokenHash"
        redisTemplate.opsForValue().set(key, "{")

        val session = adapter.find(tokenHash)

        assertNull(session)
        assertFalse(redisTemplate.hasKey(key))
        assertEquals(1.0, counterValue("readmates.redis.fallbacks", "feature", "auth-session-decode"))
        assertEquals(
            1.0,
            counterValue(
                "readmates.redis.operation.errors",
                "feature",
                "auth-session",
                "operation",
                "decode",
            ),
        )
    }

    @Test
    fun `redis lookup failure returns cache miss and records operation metrics`() {
        val registry = SimpleMeterRegistry()
        val adapter = RedisAuthSessionCacheAdapter(
            redisTemplate = failingRedisTemplate(),
            codec = CacheJsonCodec(JsonMapper.builder().findAndAddModules().build()),
            metrics = metrics(registry),
        )

        val session = adapter.find("session-token-hash-fails-open")

        assertNull(session)
        assertEquals(1.0, counterValue(registry, "readmates.redis.fallbacks", "feature", "auth-session"))
        assertEquals(
            1.0,
            counterValue(
                registry,
                "readmates.redis.operation.errors",
                "feature",
                "auth-session",
                "operation",
                "find",
            ),
        )
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

    private fun counterValue(
        name: String,
        vararg tags: String,
    ) = meterRegistry.counter(name, *tags).count()

    private fun counterValue(
        meterRegistry: MeterRegistry,
        name: String,
        vararg tags: String,
    ) = meterRegistry.counter(name, *tags).count()

    private fun failingRedisTemplate() =
        object : StringRedisTemplate() {
            override fun opsForValue() = throw IllegalStateException("redis unavailable")
        }

    private fun metrics(meterRegistry: MeterRegistry) =
        RedisCacheMetrics(
            object : ObjectProvider<MeterRegistry> {
                override fun getObject() = meterRegistry

                override fun getObject(vararg args: Any?) = meterRegistry

                override fun getIfAvailable() = meterRegistry

                override fun getIfUnique() = meterRegistry
            },
        )

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun testProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}

private data class AuthSessionCacheAdapterCase(
    val redisEnabled: Boolean,
    val authSessionCacheEnabled: Boolean,
    val expectedAdapter: Class<out AuthSessionCachePort>,
)

@TestConfiguration(proxyBeanMethods = false)
@Import(
    RedisAuthSessionCacheAdapter::class,
    NoopAuthSessionCacheAdapter::class,
    RedisCacheMetrics::class,
)
private class AuthSessionCacheAdapterBeanTestConfiguration {
    @Bean
    fun redisTemplate(): StringRedisTemplate =
        Mockito.mock(StringRedisTemplate::class.java)

    @Bean
    fun cacheJsonCodec(): CacheJsonCodec =
        CacheJsonCodec(JsonMapper.builder().findAndAddModules().build())
}
