package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.CapDenialReason
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.out.AiGenerationAdapterMetricsPort
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
    private val aigenMetrics: AiGenerationAdapterMetricsPort,
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
                    listOf(
                        dailyKey(hostId),
                        minuteKey(hostId),
                        admissionKey(clubId),
                        dailyTokenKey(hostId),
                        minuteTokenKey(hostId),
                        admissionReceiptKey(admissionId),
                    ),
                    properties.caps.hostDailyCalls.toString(),
                    properties.caps.hostPerMinuteCalls.toString(),
                    DAILY_TTL_SECONDS.toString(),
                    MINUTE_TTL_SECONDS.toString(),
                    ADMISSION_TTL_SECONDS.toString(),
                    admissionId.toString(),
                    UUID.randomUUID().toString(),
                    UUID.randomUUID().toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
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
                listOf(
                    dailyKey(hostId),
                    minuteKey(hostId),
                    admissionKey(clubId),
                    dailyTokenKey(hostId),
                    minuteTokenKey(hostId),
                    admissionReceiptKey(admissionId),
                ),
                admissionId.toString(),
            )
        }.onFailure { recordFailure("releaseAdmission") }
    }

    override fun completeAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ) {
        runCatching {
            redisTemplate.execute(
                COMPLETE_ADMISSION_SCRIPT,
                listOf(admissionKey(clubId), admissionReceiptKey(admissionId)),
                admissionId.toString(),
            )
        }.onFailure { recordFailure("completeAdmission") }
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

    private companion object {
        val DAILY_TTL_SECONDS: Long = Duration.ofHours(24).seconds
        val MINUTE_TTL_SECONDS: Long = Duration.ofMinutes(1).seconds
        val ADMISSION_TTL_SECONDS: Long = Duration.ofMinutes(5).seconds

        const val ADMITTED = 1L
        const val HOST_DAILY_DENIED = -1L
        val ADMIT_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                local function validToken(value)
                  return value ~= false and string.match(
                    value,
                    '^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$'
                  ) ~= nil
                end
                local function ensureWindow(counterKey, tokenKey, fullTtlSeconds, newToken)
                  if redis.call('EXISTS', counterKey) == 0 then
                    redis.call('SET', counterKey, '0', 'EX', fullTtlSeconds)
                    redis.call('SET', tokenKey, newToken, 'EX', fullTtlSeconds)
                    return newToken
                  end
                  local remaining = redis.call('PTTL', counterKey)
                  if remaining <= 0 then return false end
                  local token = redis.call('GET', tokenKey)
                  if not validToken(token) then
                    token = newToken
                    redis.call('SET', tokenKey, token, 'PX', remaining)
                  else
                    redis.call('PEXPIRE', tokenKey, remaining)
                  end
                  return token
                end

                local daily = tonumber(redis.call('GET', KEYS[1]) or '0')
                if daily >= tonumber(ARGV[1]) then return -1 end
                local minute = tonumber(redis.call('GET', KEYS[2]) or '0')
                if minute >= tonumber(ARGV[2]) then return -3 end
                if redis.call('EXISTS', KEYS[3]) == 1 then return -3 end

                local dailyToken = ensureWindow(KEYS[1], KEYS[4], ARGV[3], ARGV[7])
                if not dailyToken then return -3 end
                local minuteToken = ensureWindow(KEYS[2], KEYS[5], ARGV[4], ARGV[8])
                if not minuteToken then return -3 end
                redis.call('INCR', KEYS[1])
                redis.call('INCR', KEYS[2])
                redis.call('SET', KEYS[3], ARGV[6], 'EX', ARGV[5])
                redis.call('HSET', KEYS[6],
                  'dailyToken', dailyToken,
                  'minuteToken', minuteToken,
                  'dailyCharged', '1',
                  'minuteCharged', '1')
                redis.call('EXPIRE', KEYS[6], ARGV[9])
                return 1
                """.trimIndent(),
                Long::class.java,
            )

        val RELEASE_ADMISSION_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                local receiptExists = redis.call('EXISTS', KEYS[6]) == 1
                if receiptExists then
                  local function validToken(value)
                    return value ~= false and string.match(
                      value,
                      '^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$'
                    ) ~= nil
                  end
                  local function validKeyType(key, expected)
                    local reply = redis.call('TYPE', key)
                    local actual = type(reply) == 'table' and reply.ok or reply
                    return actual == 'none' or actual == expected
                  end
                  local function validCounter(value)
                    if value == false or value == '0' then return true end
                    if string.match(value, '^[1-9]%d*$') == nil then return false end
                    if string.len(value) > 19 then return false end
                    return string.len(value) < 19 or value <= '9223372036854775807'
                  end
                  if redis.call('HLEN', KEYS[6]) ~= 4 then
                    return redis.error_reply('corrupt admission accounting')
                  end
                  if not validKeyType(KEYS[3], 'string') then
                    return redis.error_reply('corrupt admission accounting')
                  end
                  local dailyToken = redis.call('HGET', KEYS[6], 'dailyToken')
                  local minuteToken = redis.call('HGET', KEYS[6], 'minuteToken')
                  local dailyCharged = redis.call('HGET', KEYS[6], 'dailyCharged')
                  local minuteCharged = redis.call('HGET', KEYS[6], 'minuteCharged')
                  local daily = redis.call('GET', KEYS[1])
                  local minute = redis.call('GET', KEYS[2])
                  local currentDailyToken = redis.call('GET', KEYS[4])
                  local currentMinuteToken = redis.call('GET', KEYS[5])
                  if not validToken(dailyToken) or not validToken(minuteToken) or
                    dailyCharged ~= '1' or minuteCharged ~= '1' or
                    not validCounter(daily) or not validCounter(minute) or
                    (currentDailyToken ~= false and not validToken(currentDailyToken)) or
                    (currentMinuteToken ~= false and not validToken(currentMinuteToken)) then
                    return redis.error_reply('corrupt admission accounting')
                  end
                  local refundDaily = daily ~= false and daily ~= '0' and currentDailyToken == dailyToken
                  local refundMinute = minute ~= false and minute ~= '0' and currentMinuteToken == minuteToken

                  if refundDaily then
                    redis.call('DECR', KEYS[1])
                  end
                  if refundMinute then
                    redis.call('DECR', KEYS[2])
                  end
                  redis.call('DEL', KEYS[6])
                end
                if redis.call('GET', KEYS[3]) == ARGV[1] then redis.call('DEL', KEYS[3]) end
                return receiptExists and 1 or 0
                """.trimIndent(),
                Long::class.java,
            )

        val COMPLETE_ADMISSION_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                local changed = 0
                if redis.call('GET', KEYS[1]) == ARGV[1] then
                  changed = redis.call('DEL', KEYS[1])
                end
                redis.call('DEL', KEYS[2])
                return changed
                """.trimIndent(),
                Long::class.java,
            )
    }
}

private fun dailyKey(hostId: UUID) = "aigen:host:$hostId:daily"

private fun dailyTokenKey(hostId: UUID) = "aigen:host:$hostId:daily:window-token"

private fun monthlyKey(clubId: UUID) = "aigen:club:$clubId:monthly_cost_usd"

private fun minuteKey(hostId: UUID) = "aigen:host:$hostId:minute"

private fun minuteTokenKey(hostId: UUID) = "aigen:host:$hostId:minute:window-token"

private fun admissionKey(clubId: UUID) = "aigen:club:$clubId:provider_admission"

private fun admissionReceiptKey(admissionId: UUID) = "aigen:job:$admissionId:admission-receipt"
