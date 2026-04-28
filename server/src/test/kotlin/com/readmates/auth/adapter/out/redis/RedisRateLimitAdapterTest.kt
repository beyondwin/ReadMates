package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.MySqlTestContainer
import com.readmates.support.RedisTestContainer
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.support.StaticApplicationContext
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import java.time.Duration

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.rate-limit.enabled=true",
    ],
)
class RedisRateLimitAdapterTest(
    @param:Autowired private val adapter: RedisRateLimitAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
) {
    private val contextRunner = ApplicationContextRunner()
        .withUserConfiguration(RateLimitAdapterBeanTestConfiguration::class.java)

    @Test
    fun `selects expected rate limit adapter for redis and rate limit flags`() {
        val cases = listOf(
            RateLimitAdapterCase(redisEnabled = true, rateLimitEnabled = true, expectedAdapter = RedisRateLimitAdapter::class.java),
            RateLimitAdapterCase(redisEnabled = true, rateLimitEnabled = false, expectedAdapter = NoopRateLimitAdapter::class.java),
            RateLimitAdapterCase(redisEnabled = false, rateLimitEnabled = true, expectedAdapter = NoopRateLimitAdapter::class.java),
            RateLimitAdapterCase(redisEnabled = false, rateLimitEnabled = false, expectedAdapter = NoopRateLimitAdapter::class.java),
        )

        cases.forEach { case ->
            contextRunner
                .withPropertyValues(
                    "readmates.redis.enabled=${case.redisEnabled}",
                    "readmates.rate-limit.enabled=${case.rateLimitEnabled}",
                ).run { context ->
                    assertThat(context)
                        .describedAs("redis=${case.redisEnabled}, rate-limit=${case.rateLimitEnabled}")
                        .hasSingleBean(RateLimitPort::class.java)
                    assertThat(context)
                        .describedAs("redis=${case.redisEnabled}, rate-limit=${case.rateLimitEnabled}")
                        .hasSingleBean(case.expectedAdapter)
                }
        }
    }

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

    @Test
    fun `sets ttl after first request`() {
        val key = "rl:test:first-ttl"
        redisTemplate.delete(key)

        val decision = adapter.check(
            RateLimitCheck(
                key = key,
                limit = 2,
                window = Duration.ofMinutes(1),
                sensitive = false,
            ),
        )

        assertTrue(decision.allowed)
        assertTrue(redisTemplate.getExpire(key) > 0)
    }

    @Test
    fun `increments counter through redis script`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        Mockito.`when`(
            redisTemplate.execute(
                Mockito.any<RedisScript<Long>>(),
                Mockito.anyList<String>(),
                Mockito.eq("30000"),
            ),
        ).thenReturn(1L)
        val adapter = RedisRateLimitAdapter(
            redisTemplate = redisTemplate,
            properties = RateLimitProperties(enabled = true),
            metrics = noOpMetrics(),
        )

        val decision = adapter.check(
            RateLimitCheck(
                key = "rl:test:script",
                limit = 2,
                window = Duration.ofSeconds(30),
                sensitive = false,
            ),
        )

        assertTrue(decision.allowed)
        assertFalse(decision.fallback)
        @Suppress("UNCHECKED_CAST")
        val scriptCaptor = ArgumentCaptor.forClass(RedisScript::class.java) as ArgumentCaptor<RedisScript<Long>>
        @Suppress("UNCHECKED_CAST")
        val keysCaptor = ArgumentCaptor.forClass(List::class.java) as ArgumentCaptor<List<String>>
        Mockito.verify(redisTemplate).execute(scriptCaptor.capture(), keysCaptor.capture(), Mockito.eq("30000"))
        Mockito.verify(redisTemplate, Mockito.never()).opsForValue()
        assertTrue(scriptCaptor.value.scriptAsString.contains("PEXPIRE"))
        assertEquals(listOf("rl:test:script"), keysCaptor.value)
    }

    @Test
    fun `fails open when redis check fails for non-sensitive request`() {
        val meterRegistry = SimpleMeterRegistry()
        val adapter = RedisRateLimitAdapter(
            redisTemplate = failingRedisTemplate(),
            properties = RateLimitProperties(enabled = true, failClosedSensitive = true),
            metrics = metrics(meterRegistry),
        )

        val decision = adapter.check(
            RateLimitCheck(
                key = "rl:test:fallback",
                limit = 1,
                window = Duration.ofMinutes(1),
                sensitive = false,
            ),
        )

        assertTrue(decision.allowed)
        assertTrue(decision.fallback)
        assertEquals(1.0, counterValue(meterRegistry, "readmates.redis.fallbacks", "feature", "rate-limit"))
        assertEquals(
            1.0,
            counterValue(
                meterRegistry,
                "readmates.redis.operation.errors",
                "feature",
                "rate-limit",
                "operation",
                "check",
            ),
        )
    }

    @Test
    fun `fails closed when redis check fails for sensitive request and fail closed is enabled`() {
        val adapter = RedisRateLimitAdapter(
            redisTemplate = failingRedisTemplate(),
            properties = RateLimitProperties(enabled = true, failClosedSensitive = true),
            metrics = noOpMetrics(),
        )

        val decision = adapter.check(
            RateLimitCheck(
                key = "rl:test:sensitive-fallback",
                limit = 1,
                window = Duration.ofMinutes(1),
                sensitive = true,
            ),
        )

        assertFalse(decision.allowed)
    }

    private fun failingRedisTemplate() =
        object : StringRedisTemplate() {
            override fun opsForValue() = throw IllegalStateException("redis unavailable")
        }

    private fun noOpMetrics() =
        RedisCacheMetrics(StaticApplicationContext().getBeanProvider(MeterRegistry::class.java))

    private fun metrics(meterRegistry: MeterRegistry) =
        RedisCacheMetrics(
            object : ObjectProvider<MeterRegistry> {
                override fun getObject() = meterRegistry

                override fun getObject(vararg args: Any?) = meterRegistry

                override fun getIfAvailable() = meterRegistry

                override fun getIfUnique() = meterRegistry
            },
        )

    private fun counterValue(
        meterRegistry: MeterRegistry,
        name: String,
        vararg tags: String,
    ) = meterRegistry.counter(name, *tags).count()

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun testProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}

private data class RateLimitAdapterCase(
    val redisEnabled: Boolean,
    val rateLimitEnabled: Boolean,
    val expectedAdapter: Class<out RateLimitPort>,
)

@TestConfiguration(proxyBeanMethods = false)
@EnableConfigurationProperties(RateLimitProperties::class)
@Import(
    RedisRateLimitAdapter::class,
    NoopRateLimitAdapter::class,
    RedisCacheMetrics::class,
)
private class RateLimitAdapterBeanTestConfiguration {
    @Bean
    fun redisTemplate(): StringRedisTemplate =
        Mockito.mock(StringRedisTemplate::class.java)
}
