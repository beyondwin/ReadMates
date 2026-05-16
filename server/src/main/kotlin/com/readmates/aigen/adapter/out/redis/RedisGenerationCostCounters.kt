package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
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
 * Redis-backed enforcer for AI generation caps (host daily call count, club monthly cost).
 * Per-minute rate limits live in the shared RateLimitPort and are NOT enforced here.
 *
 * Sliding windows:
 *  - `aigen:host:{hostId}:daily` — INCR + EXPIRE 24h on first increment
 *  - `aigen:club:{clubId}:monthly_cost_usd` — INCRBYFLOAT + EXPIRE 31d on first increment
 *
 * Conditional on `readmates.redis.enabled=true` and `readmates.aigen.enabled=true`.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class RedisGenerationCostCounters(
    private val redisTemplate: StringRedisTemplate,
    private val properties: AiGenerationProperties,
    private val metrics: RedisCacheMetrics,
) : GenerationCostGuard {
    override fun checkBeforeCall(
        hostId: UUID,
        clubId: UUID,
    ): GuardDecision =
        runCatching {
            val dailyCount = redisTemplate.opsForValue().get(dailyKey(hostId))?.toLongOrNull() ?: 0L
            if (dailyCount >= properties.caps.hostDailyCalls) {
                return@runCatching GuardDecision.Deny(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
            }

            val monthlyCost = readMonthlyCost(clubId)
            if (monthlyCost >= properties.caps.clubMonthlyCostUsd) {
                return@runCatching GuardDecision.Deny(ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED)
            }

            GuardDecision.Allow
        }.onFailure { recordFailure("checkBeforeCall") }.getOrElse {
            // Fail open on Redis errors — service availability over strict enforcement.
            GuardDecision.Allow
        }

    override fun recordUsage(
        hostId: UUID,
        clubId: UUID,
        cost: BigDecimal,
    ) {
        runCatching {
            redisTemplate.execute(
                INCREMENT_WITH_TTL_SCRIPT,
                listOf(dailyKey(hostId)),
                DAILY_TTL_SECONDS.toString(),
            )
            redisTemplate.execute(
                INCREMENT_FLOAT_WITH_TTL_SCRIPT,
                listOf(monthlyKey(clubId)),
                cost.toPlainString(),
                MONTHLY_TTL_SECONDS.toString(),
            )
        }.onFailure { recordFailure("recordUsage") }
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

    private companion object {
        val DAILY_TTL_SECONDS: Long = Duration.ofHours(24).seconds
        val MONTHLY_TTL_SECONDS: Long = Duration.ofDays(31).seconds

        val INCREMENT_WITH_TTL_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                local count = redis.call('INCR', KEYS[1])
                if count == 1 then
                  redis.call('EXPIRE', KEYS[1], ARGV[1])
                end
                return count
                """.trimIndent(),
                Long::class.java,
            )

        val INCREMENT_FLOAT_WITH_TTL_SCRIPT: DefaultRedisScript<String> =
            DefaultRedisScript(
                """
                local newVal = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
                local ttl = redis.call('TTL', KEYS[1])
                if ttl < 0 then
                  redis.call('EXPIRE', KEYS[1], ARGV[2])
                end
                return newVal
                """.trimIndent(),
                String::class.java,
            )
    }
}
