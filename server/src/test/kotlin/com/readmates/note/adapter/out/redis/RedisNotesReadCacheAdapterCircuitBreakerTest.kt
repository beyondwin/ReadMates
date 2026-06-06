package com.readmates.note.adapter.out.redis

import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import com.readmates.shared.cache.NotesCacheProperties
import com.readmates.shared.cache.RedisCacheMetrics
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

class RedisNotesReadCacheAdapterCircuitBreakerTest {
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
            RedisNotesReadCacheAdapter(
                redisTemplate = template,
                objectMapper = JsonMapper.builder().findAndAddModules().build(),
                properties = NotesCacheProperties(enabled = true),
                metrics = RedisCacheMetrics(provider(registry)),
                circuitBreakers = breakers(registry),
            )
        val clubId = UUID.fromString("00000000-0000-0000-0000-0000000000C1")

        assertThat(adapter.getFeed(clubId)).isNull()
        assertThat(adapter.getFeed(clubId)).isNull()

        val afterOpen = adapter.getFeed(clubId)

        assertThat(afterOpen).isNull()
        assertThat(opsCalls.get()).isEqualTo(2)
        assertThat(registry.counter("readmates.resilience.short_circuited", "name", "redis-notes-cache").count())
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
