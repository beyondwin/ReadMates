package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.application.service.CapDenialReason
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Duration
import java.util.UUID

/**
 * Redis-backed initial admission guard for host daily/per-minute call count.
 *
 * Sliding windows:
 *  - `aigen:host:{hostId}:daily` — admission count with a 24h sliding TTL
 *  - `aigen:host:{hostId}:minute` — endpoint-specific admission count with a 60s TTL
 *  - `aigen:club:{clubId}:provider_admission` — short lease that serializes provider admission
 *
 * Conditional on `readmates.redis.enabled=true` and `readmates.aigen.enabled=true`.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class RedisGenerationCostCounters(
    private val redisTemplate: StringRedisTemplate,
    private val properties: AiGenerationProperties,
    private val metrics: RedisCacheMetrics,
    private val aigenMetrics: AiGenerationMetrics,
) : GenerationCostGuard {
    override fun checkBeforeCall(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): GuardDecision =
        runCatching {
            when (
                redisTemplate.execute(
                    ADMIT_SCRIPT,
                    listOf(dailyKey(hostId), minuteKey(hostId), admissionKey(clubId)),
                    properties.caps.hostDailyCalls.toString(),
                    properties.caps.hostPerMinuteCalls.toString(),
                    DAILY_TTL_SECONDS.toString(),
                    MINUTE_TTL_SECONDS.toString(),
                    ADMISSION_TTL_SECONDS.toString(),
                    admissionId.toString(),
                )
            ) {
                ADMITTED -> GuardDecision.Allow
                HOST_DAILY_DENIED -> {
                    aigenMetrics.recordCapDenial(CapDenialReason.HOST_DAILY)
                    GuardDecision.Deny(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
                }
                else -> GuardDecision.Deny(ErrorCode.RATE_LIMITED)
            }
        }.onFailure { recordFailure("checkBeforeCall") }.getOrElse {
            // A hard cost/rate cap cannot be guaranteed when Redis is unavailable.
            GuardDecision.Deny(ErrorCode.RATE_LIMITED)
        }

    override fun releaseAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ) {
        runCatching {
            redisTemplate.execute(
                RELEASE_ADMISSION_SCRIPT,
                listOf(dailyKey(hostId), minuteKey(hostId), admissionKey(clubId)),
                admissionId.toString(),
            )
        }.onFailure { recordFailure("releaseAdmission") }
    }

    override fun clubMonthlyCost(clubId: UUID): BigDecimal =
        runCatching { readMonthlyCost(clubId) }
            .onFailure { recordFailure("clubMonthlyCost") }
            .getOrElse { BigDecimal.ZERO }

    private fun readMonthlyCost(clubId: UUID): BigDecimal {
        val raw = redisTemplate.opsForValue().get(monthlyKey(clubId)) ?: return BigDecimal.ZERO
        return raw.toBigDecimalOrNull() ?: BigDecimal.ZERO
    }

    private fun recordFailure(operation: String) {
        metrics.increment("readmates.redis.fallbacks", "feature", "aigen.cost-guard")
        metrics.increment(
            "readmates.redis.operation.errors",
            "feature",
            "aigen.cost-guard",
            "operation",
            operation,
        )
    }

    private fun dailyKey(hostId: UUID) = "aigen:host:$hostId:daily"

    private fun monthlyKey(clubId: UUID) = "aigen:club:$clubId:monthly_cost_usd"

    private fun minuteKey(hostId: UUID) = "aigen:host:$hostId:minute"

    private fun admissionKey(clubId: UUID) = "aigen:club:$clubId:provider_admission"

    private companion object {
        val DAILY_TTL_SECONDS: Long = Duration.ofHours(24).seconds
        val MINUTE_TTL_SECONDS: Long = Duration.ofMinutes(1).seconds
        val ADMISSION_TTL_SECONDS: Long = Duration.ofMinutes(5).seconds

        const val ADMITTED = 1L
        const val HOST_DAILY_DENIED = -1L
        val ADMIT_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                local daily = tonumber(redis.call('GET', KEYS[1]) or '0')
                if daily >= tonumber(ARGV[1]) then return -1 end
                local minute = tonumber(redis.call('GET', KEYS[2]) or '0')
                if minute >= tonumber(ARGV[2]) then return -3 end
                if redis.call('EXISTS', KEYS[3]) == 1 then return -3 end

                daily = redis.call('INCR', KEYS[1])
                if daily == 1 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
                minute = redis.call('INCR', KEYS[2])
                if minute == 1 then redis.call('EXPIRE', KEYS[2], ARGV[4]) end
                redis.call('SET', KEYS[3], ARGV[6], 'EX', ARGV[5])
                return 1
                """.trimIndent(),
                Long::class.java,
            )

        val RELEASE_ADMISSION_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                if redis.call('GET', KEYS[3]) ~= ARGV[1] then return 0 end
                redis.call('DEL', KEYS[3])
                local daily = tonumber(redis.call('GET', KEYS[1]) or '0')
                if daily > 0 then redis.call('DECR', KEYS[1]) end
                local minute = tonumber(redis.call('GET', KEYS[2]) or '0')
                if minute > 0 then redis.call('DECR', KEYS[2]) end
                return 1
                """.trimIndent(),
                Long::class.java,
            )
    }
}
