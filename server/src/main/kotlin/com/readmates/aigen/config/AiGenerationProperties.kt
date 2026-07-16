package com.readmates.aigen.config

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import org.springframework.boot.context.properties.ConfigurationProperties
import java.math.BigDecimal
import java.time.Duration

private const val DEFAULT_REDIS_TTL_HOURS = 6L
private const val DEFAULT_NOTIFICATION_LATENCY_SECONDS = 60L
private const val PROVIDER_REQUEST_TIMEOUT_MINUTES = 4L
private const val DEFAULT_MAX_CONCURRENT_PER_PROVIDER = 2
private const val MIN_CONCURRENT_PER_PROVIDER = 1
private const val MAX_CONCURRENT_PER_PROVIDER = 16
private const val DEFAULT_TRANSIENT_BACKOFF_BASE_SECONDS = 1L
private const val DEFAULT_TRANSIENT_BACKOFF_MAX_SECONDS = 30L
private val MAX_PROVIDER_REQUEST_TIMEOUT: Duration = Duration.ofMinutes(PROVIDER_REQUEST_TIMEOUT_MINUTES)

@ConfigurationProperties("readmates.aigen")
data class AiGenerationProperties(
    val enabled: Boolean = false,
    val mock: Boolean = false,
    val enabledProviders: Set<String> = emptySet(), // "CLAUDE","OPENAI","GEMINI"
    val fallbackDefaultModel: String = "gpt-5.4-mini",
    // Ordered model aliases tried for cross-provider failover on availability
    // failures. Empty = feature off (same-provider retry only).
    val fallbackChain: List<String> = emptyList(),
    val pipelineMode: AiGenerationPipelineMode = AiGenerationPipelineMode.LEGACY,
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
        // Explicit mode-specific allowlist: legacy pricing entries do not become grounded-capable implicitly.
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
        val maxLlmCallsPerJob: Int = 3,
    )

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
