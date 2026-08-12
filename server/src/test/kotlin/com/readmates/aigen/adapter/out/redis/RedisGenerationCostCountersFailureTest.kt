package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.CapDenialReason
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCircuitState
import com.readmates.aigen.application.port.out.AiGenerationAdapterMetricsPort
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.ProviderCircuitOutcome
import com.readmates.aigen.application.port.out.ProviderGateRejection
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.data.redis.RedisConnectionFailureException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import java.math.BigDecimal
import java.util.UUID

class RedisGenerationCostCountersFailureTest {
    @Test
    fun `host daily denial records the fixed application reason once`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        stubAdmissionResult(redisTemplate, -1L)
        val metrics = FakeAiGenerationAdapterMetricsPort()
        val guard = guard(redisTemplate, metrics)

        assertThat(guard.checkBeforeCall(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()))
            .isEqualTo(GuardDecision.Deny(ErrorCode.HOST_DAILY_CAP_EXCEEDED))
        assertThat(metrics.capDenials).containsExactly(CapDenialReason.HOST_DAILY)
    }

    @Test
    fun `unavailable Redis denies admission as rate limited`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        stubAdmissionFailure(redisTemplate)
        val redisMetrics = Mockito.mock(RedisCacheMetrics::class.java)
        val guard =
            RedisGenerationCostCounters(
                redisTemplate,
                AiGenerationProperties(),
                redisMetrics,
                FakeAiGenerationAdapterMetricsPort(),
            )

        assertThat(guard.checkBeforeCall(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()))
            .isEqualTo(GuardDecision.Deny(ErrorCode.RATE_LIMITED))
        Mockito.verify(redisMetrics).increment("readmates.redis.fallbacks", "feature", "aigen.cost-guard")
        Mockito.verify(redisMetrics).increment(
            "readmates.redis.operation.errors",
            "feature",
            "aigen.cost-guard",
            "operation",
            "checkBeforeCall",
        )
    }

    @Test
    fun `release failure remains non throwing after Redis failure metrics`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        stubCleanupFailure(redisTemplate)
        val redisMetrics = Mockito.mock(RedisCacheMetrics::class.java)
        val guard =
            RedisGenerationCostCounters(
                redisTemplate,
                AiGenerationProperties(),
                redisMetrics,
                FakeAiGenerationAdapterMetricsPort(),
            )

        assertThatCode { guard.releaseAdmission(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()) }
            .doesNotThrowAnyException()
        Mockito.verify(redisMetrics).increment(
            "readmates.redis.operation.errors",
            "feature",
            "aigen.cost-guard",
            "operation",
            "releaseAdmission",
        )
    }

    @Test
    fun `complete failure remains non throwing after Redis failure metrics`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        stubCleanupFailure(redisTemplate)
        val redisMetrics = Mockito.mock(RedisCacheMetrics::class.java)
        val guard =
            RedisGenerationCostCounters(
                redisTemplate,
                AiGenerationProperties(),
                redisMetrics,
                FakeAiGenerationAdapterMetricsPort(),
            )

        assertThatCode { guard.completeAdmission(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()) }
            .doesNotThrowAnyException()
        Mockito.verify(redisMetrics).increment(
            "readmates.redis.operation.errors",
            "feature",
            "aigen.cost-guard",
            "operation",
            "completeAdmission",
        )
    }

    @Test
    fun `unavailable monthly cost retains the zero fallback`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        Mockito.`when`(redisTemplate.opsForValue()).thenThrow(RedisConnectionFailureException("test-unavailable"))
        val redisMetrics = Mockito.mock(RedisCacheMetrics::class.java)
        val guard =
            RedisGenerationCostCounters(
                redisTemplate,
                AiGenerationProperties(),
                redisMetrics,
                FakeAiGenerationAdapterMetricsPort(),
            )

        assertThat(guard.clubMonthlyCost(UUID.randomUUID())).isEqualByComparingTo(BigDecimal.ZERO)
        Mockito.verify(redisMetrics).increment(
            "readmates.redis.operation.errors",
            "feature",
            "aigen.cost-guard",
            "operation",
            "clubMonthlyCost",
        )
    }

    private fun guard(
        redisTemplate: StringRedisTemplate,
        metrics: AiGenerationAdapterMetricsPort,
    ): RedisGenerationCostCounters =
        RedisGenerationCostCounters(
            redisTemplate,
            AiGenerationProperties(),
            Mockito.mock(RedisCacheMetrics::class.java),
            metrics,
        )

    private fun stubAdmissionResult(
        redisTemplate: StringRedisTemplate,
        result: Long,
    ) {
        Mockito
            .`when`(
                redisTemplate.execute(
                    Mockito.any<DefaultRedisScript<Long>>(),
                    Mockito.anyList<String>(),
                    *admissionArguments(),
                ),
            ).thenReturn(result)
    }

    private fun stubAdmissionFailure(redisTemplate: StringRedisTemplate) {
        Mockito
            .`when`(
                redisTemplate.execute(
                    Mockito.any<DefaultRedisScript<Long>>(),
                    Mockito.anyList<String>(),
                    *admissionArguments(),
                ),
            ).thenThrow(RedisConnectionFailureException("test-unavailable"))
    }

    private fun stubCleanupFailure(redisTemplate: StringRedisTemplate) {
        Mockito
            .`when`(
                redisTemplate.execute(
                    Mockito.any<DefaultRedisScript<Long>>(),
                    Mockito.anyList<String>(),
                    Mockito.anyString(),
                ),
            ).thenThrow(RedisConnectionFailureException("test-unavailable"))
    }

    private fun admissionArguments(): Array<String> = Array(9) { Mockito.anyString() }

    private class FakeAiGenerationAdapterMetricsPort : AiGenerationAdapterMetricsPort {
        val capDenials = mutableListOf<CapDenialReason>()

        override fun recordProviderCall(
            provider: Provider,
            outcome: ProviderCircuitOutcome,
            duration: java.time.Duration,
        ) = Unit

        override fun recordProviderGateRejection(
            provider: Provider,
            reason: ProviderGateRejection,
        ) = Unit

        override fun recordProviderCircuitTransition(
            provider: Provider,
            state: ProviderCircuitState,
        ) = Unit

        override fun recordCapDenial(reason: CapDenialReason) {
            capDenials += reason
        }
    }
}
