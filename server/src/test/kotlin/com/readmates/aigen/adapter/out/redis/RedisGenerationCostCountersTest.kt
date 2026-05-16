package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import java.math.BigDecimal
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
class RedisGenerationCostCountersTest(
    @param:Autowired private val guard: GenerationCostGuard,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
) : ReadmatesRedisIntegrationTestSupport() {
    @Test
    fun `allow when daily and monthly under caps`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        val decision = guard.checkBeforeCall(hostId, clubId)

        assertThat(decision).isEqualTo(GuardDecision.Allow)
    }

    @Test
    fun `deny when host daily cap reached`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        repeat(10) { guard.recordUsage(hostId, clubId, BigDecimal("0.001")) }

        val decision = guard.checkBeforeCall(hostId, clubId)

        assertThat(decision).isInstanceOf(GuardDecision.Deny::class.java)
        assertThat((decision as GuardDecision.Deny).code).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
    }

    @Test
    fun `deny when club monthly cost cap reached`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        // Push monthly cost to cap with 1 daily call
        guard.recordUsage(hostId, clubId, BigDecimal("20.00"))

        val decision = guard.checkBeforeCall(hostId, clubId)

        assertThat(decision).isInstanceOf(GuardDecision.Deny::class.java)
        assertThat((decision as GuardDecision.Deny).code).isEqualTo(ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED)
    }

    @Test
    fun `recordUsage increments daily count with 24h TTL on first increment`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        guard.recordUsage(hostId, clubId, BigDecimal("0.01"))

        val ttl = redisTemplate.getExpire("aigen:host:$hostId:daily", TimeUnit.SECONDS)
        assertThat(ttl).isBetween(23 * 3600L, 24 * 3600L + 30)
        val count = redisTemplate.opsForValue().get("aigen:host:$hostId:daily")
        assertThat(count).isEqualTo("1")
    }

    @Test
    fun `recordUsage accumulates monthly cost with 31d TTL`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        guard.recordUsage(hostId, clubId, BigDecimal("0.50"))
        guard.recordUsage(hostId, clubId, BigDecimal("1.25"))

        val accumulated = guard.clubMonthlyCost(clubId)
        assertThat(accumulated).isEqualByComparingTo(BigDecimal("1.75"))

        val ttl = redisTemplate.getExpire("aigen:club:$clubId:monthly_cost_usd", TimeUnit.SECONDS)
        assertThat(ttl).isBetween(30 * 24 * 3600L, 31 * 24 * 3600L + 30)
    }

    @Test
    fun `clubMonthlyCost returns zero when no recorded usage`() {
        val clubId = UUID.randomUUID()
        redisTemplate.delete("aigen:club:$clubId:monthly_cost_usd")

        assertThat(guard.clubMonthlyCost(clubId)).isEqualByComparingTo(BigDecimal.ZERO)
    }

    @Test
    fun `fails open as Allow when redis check fails`() {
        val meterRegistry = SimpleMeterRegistry()
        val failingTemplate =
            object : StringRedisTemplate() {
                override fun opsForValue() = throw IllegalStateException("redis unavailable")
            }
        val guard =
            RedisGenerationCostCounters(
                redisTemplate = failingTemplate,
                properties = AiGenerationProperties(),
                metrics = metrics(meterRegistry),
                aigenMetrics = AiGenerationMetrics(meterRegistry),
            )

        val decision = guard.checkBeforeCall(UUID.randomUUID(), UUID.randomUUID())

        assertThat(decision).isEqualTo(GuardDecision.Allow)
        assertThat(meterRegistry.counter("readmates.redis.fallbacks", "feature", "aigen.cost-guard").count())
            .isEqualTo(1.0)
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

    private fun deleteCounters(hostId: UUID, clubId: UUID) {
        redisTemplate.delete("aigen:host:$hostId:daily")
        redisTemplate.delete("aigen:club:$clubId:monthly_cost_usd")
    }
}
