package com.readmates.shared.adapter.out.redis

import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import com.readmates.shared.cache.RedisCacheMetrics
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.RedisCallback
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

class RedisReadCacheInvalidationAdapterCircuitBreakerTest {
    @Test
    fun `opens circuit after redis failures and short-circuits eviction to no-op without calling redis`() {
        val registry = SimpleMeterRegistry()
        val executeCalls = AtomicInteger(0)
        val template =
            object : StringRedisTemplate() {
                @Suppress("ktlint:standard:function-expression-body")
                override fun <T : Any?> execute(action: RedisCallback<T>): T? {
                    executeCalls.incrementAndGet()
                    error("redis unavailable")
                }
            }
        val adapter =
            RedisReadCacheInvalidationAdapter(
                redisTemplate = template,
                metrics = RedisCacheMetrics(provider(registry)),
                circuitBreakers = breakers(registry),
            )
        val clubId = UUID.fromString("00000000-0000-0000-0000-0000000000E1")

        // First call drives two failing evict operations (public + notes) → opens the breaker.
        adapter.evictClubContent(clubId)
        val callsAfterOpen = executeCalls.get()

        // Second call must be short-circuited: redis is not touched again.
        adapter.evictClubContent(clubId)

        assertThat(executeCalls.get()).isEqualTo(callsAfterOpen)
        assertThat(registry.counter("readmates.resilience.short_circuited", "name", "redis-cache-invalidation").count())
            .isGreaterThanOrEqualTo(1.0)
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
