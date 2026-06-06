package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitDecision
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "rate-limit.enabled"], havingValue = "true")
class RedisRateLimitAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val properties: RateLimitProperties,
    private val metrics: RedisCacheMetrics,
    private val circuitBreakers: OutboundCircuitBreakers,
) : RateLimitPort {
    override fun check(check: RateLimitCheck): RateLimitDecision =
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = { failOpen(check) },
        ) {
            val ttlMillis = maxOf(check.window.toMillis(), 1L)
            val count = redisTemplate.execute(INCREMENT_WITH_TTL_SCRIPT, listOf(check.key), ttlMillis.toString()) ?: 1L

            if (count <= check.limit) {
                metrics.increment("readmates.rate_limit.allowed", "sensitive", check.sensitive.toString())
                RateLimitDecision.allowed()
            } else {
                metrics.increment("readmates.rate_limit.denied", "sensitive", check.sensitive.toString())
                RateLimitDecision.denied(check.window.seconds)
            }
        }

    private fun failOpen(check: RateLimitCheck): RateLimitDecision {
        metrics.increment("readmates.redis.fallbacks", "feature", "rate-limit")
        metrics.increment("readmates.redis.operation.errors", "feature", "rate-limit", "operation", "check")
        return if (check.sensitive && properties.failClosedSensitive) {
            RateLimitDecision.denied(check.window.seconds)
        } else {
            RateLimitDecision.allowed(fallback = true)
        }
    }

    private companion object {
        const val CIRCUIT_BREAKER_NAME = "redis-rate-limit"

        val INCREMENT_WITH_TTL_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                local count = redis.call('INCR', KEYS[1])
                if count == 1 then
                  redis.call('PEXPIRE', KEYS[1], ARGV[1])
                end
                return count
                """.trimIndent(),
                Long::class.java,
            )
    }
}
