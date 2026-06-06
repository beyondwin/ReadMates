package com.readmates.publication.adapter.out.redis

import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import com.readmates.shared.cache.CacheJsonCodec
import com.readmates.shared.cache.PublicCacheProperties
import com.readmates.shared.cache.RedisCacheMetrics
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.util.concurrent.atomic.AtomicInteger

class RedisPublicReadCacheAdapterCircuitBreakerTest {
    @Test
    fun `opens circuit after redis failures and short-circuits to cache miss without calling redis`() {
        val registry = SimpleMeterRegistry()
        val opsCalls = AtomicInteger(0)
        val template =
            object : StringRedisTemplate() {
                override fun opsForValue(): Nothing {
                    opsCalls.incrementAndGet()
                    throw IllegalStateException("redis down")
                }
            }
        val adapter =
            RedisPublicReadCacheAdapter(
                redisTemplate = template,
                codec = CacheJsonCodec(JsonMapper.builder().findAndAddModules().build()),
                properties = PublicCacheProperties(enabled = true),
                metrics = RedisCacheMetrics(provider(registry)),
                circuitBreakers = breakers(registry),
            )

        assertThat(adapter.getClub()).isNull()
        assertThat(adapter.getClub()).isNull()

        val afterOpen = adapter.getClub()

        assertThat(afterOpen).isNull()
        assertThat(opsCalls.get()).isEqualTo(2)
        assertThat(registry.counter("readmates.resilience.short_circuited", "name", "redis-public-cache").count())
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
