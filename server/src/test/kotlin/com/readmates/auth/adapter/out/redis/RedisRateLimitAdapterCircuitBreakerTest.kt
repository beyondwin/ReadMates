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
import org.mockito.Mockito
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import java.time.Duration
import java.util.concurrent.atomic.AtomicInteger

class RedisRateLimitAdapterCircuitBreakerTest {
    @Test
    fun `opens circuit after redis failures and short-circuits to fail-open without calling redis`() {
        val registry = SimpleMeterRegistry()
        val executeCalls = AtomicInteger(0)
        val template = Mockito.mock(StringRedisTemplate::class.java)
        Mockito
            .`when`(
                template.execute(
                    Mockito.any<RedisScript<Long>>(),
                    Mockito.anyList<String>(),
                    Mockito.any(),
                ),
            ).thenAnswer {
                executeCalls.incrementAndGet()
                error("redis down")
            }
        val adapter =
            RedisRateLimitAdapter(
                redisTemplate = template,
                properties = RateLimitProperties(enabled = true),
                metrics = RedisCacheMetrics(provider(registry)),
                circuitBreakers = breakers(registry),
            )
        val check = RateLimitCheck(key = "rl:cb", limit = 1, window = Duration.ofMinutes(1), sensitive = false)

        assertThat(adapter.check(check).allowed).isTrue()
        assertThat(adapter.check(check).allowed).isTrue()

        val afterOpen = adapter.check(check)

        assertThat(afterOpen.allowed).isTrue()
        assertThat(afterOpen.fallback).isTrue()
        assertThat(executeCalls.get()).isEqualTo(2)
        assertThat(registry.counter("readmates.resilience.short_circuited", "name", "redis-rate-limit").count())
            .isEqualTo(1.0)
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
