package com.readmates.aigen.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.math.BigDecimal
import java.time.Duration

private const val DEFAULT_REDIS_TTL_HOURS = 6L
private const val DEFAULT_NOTIFICATION_LATENCY_SECONDS = 60L
private const val DEFAULT_PROCESSING_DEADLINE_MINUTES = 20L
private const val DEFAULT_RECOVERY_FIXED_DELAY_MINUTES = 1L
private const val DEFAULT_RECOVERY_BATCH_SIZE = 50
private const val DEFAULT_RECOVERY_INDEX_REPAIR_BATCH_SIZE = 500
private const val DEFAULT_RECOVERY_INDEX_REPAIR_MAX_MEMBERS = 5_000
private const val DEFAULT_QUEUE_PROBE_FIXED_DELAY_SECONDS = 30L
private const val MAX_REDIS_TTL_HOURS = 24L
private const val MAX_PROCESSING_DEADLINE_HOURS = 2L
private const val MAX_RECOVERY_DELAY_MINUTES = 10L
private const val NANOSECONDS_PER_MILLISECOND = 1_000_000
private const val MIN_RECOVERY_BATCH_SIZE = 1
private const val MAX_RECOVERY_BATCH_SIZE = 500
private const val MIN_RECOVERY_INDEX_REPAIR_BATCH_SIZE = 1
private const val MAX_RECOVERY_INDEX_REPAIR_BATCH_SIZE = 5_000
private const val MAX_RECOVERY_INDEX_REPAIR_MEMBERS = 50_000
private const val MIN_LLM_CALLS_PER_JOB = 1
private const val MAX_LLM_CALLS_PER_JOB = 3
private const val PROVIDER_REQUEST_TIMEOUT_MINUTES = 4L
private const val DEFAULT_MAX_CONCURRENT_PER_PROVIDER = 2
private const val MIN_CONCURRENT_PER_PROVIDER = 1
private const val MAX_CONCURRENT_PER_PROVIDER = 16
private const val DEFAULT_TRANSIENT_BACKOFF_BASE_SECONDS = 1L
private const val DEFAULT_TRANSIENT_BACKOFF_MAX_SECONDS = 30L
private val MAX_PROVIDER_REQUEST_TIMEOUT: Duration = Duration.ofMinutes(PROVIDER_REQUEST_TIMEOUT_MINUTES)
private val MIN_REDIS_TTL: Duration = Duration.ofHours(1)
private val MAX_REDIS_TTL: Duration = Duration.ofHours(MAX_REDIS_TTL_HOURS)
private val MIN_PROCESSING_DEADLINE: Duration = Duration.ofMinutes(1)
private val MAX_PROCESSING_DEADLINE: Duration = Duration.ofHours(MAX_PROCESSING_DEADLINE_HOURS)
private val MIN_RECOVERY_DELAY: Duration = Duration.ofSeconds(1)
private val MAX_RECOVERY_DELAY: Duration = Duration.ofMinutes(MAX_RECOVERY_DELAY_MINUTES)

@ConfigurationProperties("readmates.aigen")
data class AiGenerationProperties(
    val enabled: Boolean = false,
    val mock: Boolean = false,
    val enabledProviders: Set<String> = emptySet(), // "CLAUDE","OPENAI","GEMINI"
    val fallbackDefaultModel: String = "gpt-5.4-mini",
    // Ordered model aliases tried for cross-provider failover on availability
    // failures. Empty = feature off (same-provider retry only).
    val fallbackChain: List<String> = emptyList(),
    val grounded: Grounded = Grounded(),
    val caps: Caps = Caps(),
    val job: Job = Job(),
    val providerCalls: ProviderCalls = ProviderCalls(),
    val providers: Providers = Providers(),
    val pricing: Map<String, Pricing> = emptyMap(),
) {
    data class Providers(
        val google: GoogleProvider = GoogleProvider(),
    )

    data class GoogleProvider(
        val paidTierRetentionConfirmed: Boolean = false,
    )

    data class Grounded(
        val reservedOutputTokens: Long = 16_384,
        val safetyMarginTokens: Long = 8_192,
        // Explicit allowlist: pricing entries do not become grounded-capable implicitly.
        val capabilities: Map<String, Capability> = emptyMap(),
    )

    data class Capability(
        val contextWindowTokens: Long,
        val maxOutputTokens: Long,
        val structuredOutputSupported: Boolean = false,
    )

    data class Caps(
        val hostDailyCalls: Int = 10,
        val clubMonthlyCostUsd: BigDecimal = BigDecimal("20.00"),
        val hostPerMinuteCalls: Int = 5,
        val softWarningRatio: BigDecimal = BigDecimal("0.80"),
    )

    data class Job(
        val redisTtl: Duration = Duration.ofHours(DEFAULT_REDIS_TTL_HOURS),
        val notificationLatencyThreshold: Duration = Duration.ofSeconds(DEFAULT_NOTIFICATION_LATENCY_SECONDS),
        val maxLlmCallsPerJob: Int = MAX_LLM_CALLS_PER_JOB,
        val processingDeadline: Duration = Duration.ofMinutes(DEFAULT_PROCESSING_DEADLINE_MINUTES),
        val recoveryFixedDelay: Duration = Duration.ofMinutes(DEFAULT_RECOVERY_FIXED_DELAY_MINUTES),
        val recoveryBatchSize: Int = DEFAULT_RECOVERY_BATCH_SIZE,
        val recoveryIndexRepairBatchSize: Int = DEFAULT_RECOVERY_INDEX_REPAIR_BATCH_SIZE,
        val recoveryIndexRepairMaxMembers: Int = DEFAULT_RECOVERY_INDEX_REPAIR_MAX_MEMBERS,
        val queueProbeFixedDelay: Duration = Duration.ofSeconds(DEFAULT_QUEUE_PROBE_FIXED_DELAY_SECONDS),
    ) {
        init {
            require(redisTtl in MIN_REDIS_TTL..MAX_REDIS_TTL && redisTtl.nano == 0) {
                "readmates.aigen.job.redis-ttl must be between 1 hour and 24 hours and use whole-second increments"
            }
            require(processingDeadline in MIN_PROCESSING_DEADLINE..MAX_PROCESSING_DEADLINE) {
                "readmates.aigen.job.processing-deadline must be between 1 minute and 2 hours"
            }
            requireExactRecoveryMilliseconds("recovery-fixed-delay", recoveryFixedDelay)
            require(recoveryBatchSize in MIN_RECOVERY_BATCH_SIZE..MAX_RECOVERY_BATCH_SIZE) {
                "readmates.aigen.job.recovery-batch-size must be between 1 and 500"
            }
            require(
                recoveryIndexRepairBatchSize in
                    MIN_RECOVERY_INDEX_REPAIR_BATCH_SIZE..MAX_RECOVERY_INDEX_REPAIR_BATCH_SIZE,
            ) {
                "readmates.aigen.job.recovery-index-repair-batch-size must be between 1 and 5000"
            }
            require(recoveryIndexRepairMaxMembers in recoveryIndexRepairBatchSize..MAX_RECOVERY_INDEX_REPAIR_MEMBERS) {
                "readmates.aigen.job.recovery-index-repair-max-members must be between " +
                    "recovery-index-repair-batch-size and 50000"
            }
            requireExactRecoveryMilliseconds("queue-probe-fixed-delay", queueProbeFixedDelay)
            require(maxLlmCallsPerJob in MIN_LLM_CALLS_PER_JOB..MAX_LLM_CALLS_PER_JOB) {
                "readmates.aigen.job.max-llm-calls-per-job must be between 1 and 3"
            }
        }

        private companion object {
            fun requireExactRecoveryMilliseconds(
                property: String,
                value: Duration,
            ) {
                require(
                    value in MIN_RECOVERY_DELAY..MAX_RECOVERY_DELAY &&
                        value.nano % NANOSECONDS_PER_MILLISECOND == 0,
                ) {
                    "readmates.aigen.job.$property must be between 1 second and 10 minutes " +
                        "and use whole-millisecond increments"
                }
            }
        }
    }

    data class ProviderCalls(
        val requestTimeout: Duration = Duration.ofMinutes(PROVIDER_REQUEST_TIMEOUT_MINUTES),
        val maxConcurrentPerProvider: Int = DEFAULT_MAX_CONCURRENT_PER_PROVIDER,
        val transientBackoffBase: Duration = Duration.ofSeconds(DEFAULT_TRANSIENT_BACKOFF_BASE_SECONDS),
        val transientBackoffMax: Duration = Duration.ofSeconds(DEFAULT_TRANSIENT_BACKOFF_MAX_SECONDS),
    ) {
        init {
            val requestTimeoutIsValid =
                !requestTimeout.isZero && !requestTimeout.isNegative && requestTimeout <= MAX_PROVIDER_REQUEST_TIMEOUT
            require(requestTimeoutIsValid) {
                "readmates.aigen.provider-calls.request-timeout must be positive and at most 4 minutes"
            }
            require(maxConcurrentPerProvider in MIN_CONCURRENT_PER_PROVIDER..MAX_CONCURRENT_PER_PROVIDER) {
                "readmates.aigen.provider-calls.max-concurrent-per-provider must be between 1 and 16"
            }
            require(!transientBackoffBase.isZero && !transientBackoffBase.isNegative) {
                "readmates.aigen.provider-calls.transient-backoff-base must be positive"
            }
            require(!transientBackoffMax.isZero && !transientBackoffMax.isNegative) {
                "readmates.aigen.provider-calls.transient-backoff-max must be positive"
            }
            require(transientBackoffBase <= transientBackoffMax) {
                "readmates.aigen.provider-calls.transient-backoff-base must not exceed transient-backoff-max"
            }
        }
    }

    data class Pricing(
        val inputPerMTokenUsd: BigDecimal,
        val cacheWriteInputPerMTokenUsd: BigDecimal? = null,
        val cachedInputPerMTokenUsd: BigDecimal = BigDecimal.ZERO,
        val outputPerMTokenUsd: BigDecimal,
    )
}
