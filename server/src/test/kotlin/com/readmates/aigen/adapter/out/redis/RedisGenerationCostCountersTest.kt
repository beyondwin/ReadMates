package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
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
import org.springframework.test.context.bean.override.mockito.MockitoBean
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
    // The aigen Kafka adapter is gated on readmates.aigen.kafka.enabled; this integration
    // test only exercises the Redis cost-counter adapter, so satisfy the orchestrator's
    // queue dependency with a mock so the context can load.
    @Suppress("UnusedPrivateProperty")
    @MockitoBean
    private lateinit var jobQueue: AiGenerationJobQueue

    @Test
    fun `allow when daily and monthly under caps`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        val decision = guard.checkBeforeCall(hostId, clubId, UUID.randomUUID())

        assertThat(decision).isEqualTo(GuardDecision.Allow)
    }

    @Test
    fun `deny when host daily cap reached`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        repeat(10) {
            assertThat(guard.checkBeforeCall(hostId, clubId, UUID.randomUUID())).isEqualTo(GuardDecision.Allow)
            redisTemplate.delete("aigen:club:$clubId:provider_admission")
            redisTemplate.delete("aigen:host:$hostId:minute")
        }

        val decision = guard.checkBeforeCall(hostId, clubId, UUID.randomUUID())

        assertThat(decision).isInstanceOf(GuardDecision.Deny::class.java)
        assertThat((decision as GuardDecision.Deny).code).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
    }

    @Test
    fun `deny when club monthly cost cap reached`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        // Push monthly cost to cap with 1 daily call
        guard.recordUsage(hostId, clubId, UUID.randomUUID(), BigDecimal("20.00"))

        val decision = guard.checkBeforeCall(hostId, clubId, UUID.randomUUID())

        assertThat(decision).isInstanceOf(GuardDecision.Deny::class.java)
        assertThat((decision as GuardDecision.Deny).code).isEqualTo(ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED)
    }

    @Test
    fun `admission atomically increments daily count with 24h TTL`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        assertThat(guard.checkBeforeCall(hostId, clubId, UUID.randomUUID())).isEqualTo(GuardDecision.Allow)

        val ttl = redisTemplate.getExpire("aigen:host:$hostId:daily", TimeUnit.SECONDS)
        assertThat(ttl).isBetween(23 * 3600L, 24 * 3600L + 30)
        val count = redisTemplate.opsForValue().get("aigen:host:$hostId:daily")
        assertThat(count).isEqualTo("1")
    }

    @Test
    fun `concurrent club admission is denied until the provider lease expires`() {
        val clubId = UUID.randomUUID()
        val firstHost = UUID.randomUUID()
        val secondHost = UUID.randomUUID()
        deleteCounters(firstHost, clubId)
        deleteCounters(secondHost, clubId)

        assertThat(guard.checkBeforeCall(firstHost, clubId, UUID.randomUUID())).isEqualTo(GuardDecision.Allow)

        val second = guard.checkBeforeCall(secondHost, clubId, UUID.randomUUID())
        assertThat(second).isEqualTo(GuardDecision.Deny(ErrorCode.RATE_LIMITED))
        assertThat(redisTemplate.opsForValue().get("aigen:host:$secondHost:daily")).isNull()
    }

    @Test
    fun `endpoint-specific per-minute cap is enforced atomically`() {
        val hostId = UUID.randomUUID()
        redisTemplate.delete("aigen:host:$hostId:daily")
        redisTemplate.delete("aigen:host:$hostId:minute")
        repeat(5) {
            val clubId = UUID.randomUUID()
            redisTemplate.delete("aigen:club:$clubId:monthly_cost_usd")
            redisTemplate.delete("aigen:club:$clubId:provider_admission")
            assertThat(guard.checkBeforeCall(hostId, clubId, UUID.randomUUID())).isEqualTo(GuardDecision.Allow)
        }

        val denied = guard.checkBeforeCall(hostId, UUID.randomUUID(), UUID.randomUUID())

        assertThat(denied).isEqualTo(GuardDecision.Deny(ErrorCode.RATE_LIMITED))
    }

    @Test
    fun `recordUsage accumulates monthly cost with 31d TTL`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)

        guard.recordUsage(hostId, clubId, UUID.randomUUID(), BigDecimal("0.50"))
        guard.recordUsage(hostId, clubId, UUID.randomUUID(), BigDecimal("1.25"))

        val accumulated = guard.clubMonthlyCost(clubId)
        assertThat(accumulated).isEqualByComparingTo(BigDecimal("1.75"))

        val ttl = redisTemplate.getExpire("aigen:club:$clubId:monthly_cost_usd", TimeUnit.SECONDS)
        assertThat(ttl).isBetween(30 * 24 * 3600L, 31 * 24 * 3600L + 30)
    }

    @Test
    fun `recorded usage releases the club provider admission lease`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        deleteCounters(hostId, clubId)
        val admissionId = UUID.randomUUID()
        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)

        guard.recordUsage(hostId, clubId, admissionId, BigDecimal("0.01"))

        assertThat(redisTemplate.hasKey("aigen:club:$clubId:provider_admission")).isFalse()
        assertThat(guard.checkBeforeCall(UUID.randomUUID(), clubId, UUID.randomUUID())).isEqualTo(GuardDecision.Allow)
    }

    @Test
    fun `renew extends only the owning provider admission lease`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val admissionId = UUID.randomUUID()
        deleteCounters(hostId, clubId)
        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)
        redisTemplate.expire("aigen:club:$clubId:provider_admission", 2, TimeUnit.SECONDS)

        assertThat(guard.renewAdmission(hostId, clubId, UUID.randomUUID())).isFalse()
        assertThat(guard.renewAdmission(hostId, clubId, admissionId)).isTrue()
        assertThat(redisTemplate.getExpire("aigen:club:$clubId:provider_admission", TimeUnit.SECONDS))
            .isBetween(4 * 60L, 5 * 60L + 5)
    }

    @Test
    fun `late usage cannot delete a replacement admission owned by another request`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val staleAdmission = UUID.randomUUID()
        val replacementAdmission = UUID.randomUUID()
        deleteCounters(hostId, clubId)
        assertThat(guard.checkBeforeCall(hostId, clubId, staleAdmission)).isEqualTo(GuardDecision.Allow)
        redisTemplate.delete("aigen:club:$clubId:provider_admission")
        assertThat(guard.checkBeforeCall(UUID.randomUUID(), clubId, replacementAdmission))
            .isEqualTo(GuardDecision.Allow)

        guard.recordUsage(hostId, clubId, staleAdmission, BigDecimal("0.01"))

        assertThat(redisTemplate.opsForValue().get("aigen:club:$clubId:provider_admission"))
            .isEqualTo(replacementAdmission.toString())
    }

    @Test
    fun `no-provider rollback releases only the owning admission and restores counters`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val admissionId = UUID.randomUUID()
        deleteCounters(hostId, clubId)
        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)

        guard.releaseAdmission(hostId, clubId, admissionId)

        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:daily")).isEqualTo("0")
        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:minute")).isEqualTo("0")
        assertThat(redisTemplate.hasKey("aigen:club:$clubId:provider_admission")).isFalse()
    }

    @Test
    fun `clubMonthlyCost returns zero when no recorded usage`() {
        val clubId = UUID.randomUUID()
        redisTemplate.delete("aigen:club:$clubId:monthly_cost_usd")

        assertThat(guard.clubMonthlyCost(clubId)).isEqualByComparingTo(BigDecimal.ZERO)
    }

    @Test
    fun `fails closed when redis check fails`() {
        val meterRegistry = SimpleMeterRegistry()
        val failingTemplate =
            object : StringRedisTemplate() {
                override fun opsForValue() = error("redis unavailable")
            }
        val guard =
            RedisGenerationCostCounters(
                redisTemplate = failingTemplate,
                properties = AiGenerationProperties(),
                metrics = metrics(meterRegistry),
                aigenMetrics = AiGenerationMetrics(meterRegistry),
            )

        val decision = guard.checkBeforeCall(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())

        assertThat(decision).isEqualTo(GuardDecision.Deny(ErrorCode.RATE_LIMITED))
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

    private fun deleteCounters(
        hostId: UUID,
        clubId: UUID,
    ) {
        redisTemplate.delete("aigen:host:$hostId:daily")
        redisTemplate.delete("aigen:host:$hostId:minute")
        redisTemplate.delete("aigen:club:$clubId:monthly_cost_usd")
        redisTemplate.delete("aigen:club:$clubId:provider_admission")
    }
}
