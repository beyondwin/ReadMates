package com.readmates.aigen.config

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import org.springframework.boot.context.properties.ConfigurationProperties
import java.math.BigDecimal
import java.time.Duration

private const val DEFAULT_REDIS_TTL_HOURS = 6L
private const val DEFAULT_NOTIFICATION_LATENCY_SECONDS = 60L

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
    val pricing: Map<String, Pricing> = emptyMap(),
) {
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

    data class Pricing(
        val inputPerMTokenUsd: BigDecimal,
        val cacheWriteInputPerMTokenUsd: BigDecimal? = null,
        val cachedInputPerMTokenUsd: BigDecimal = BigDecimal.ZERO,
        val outputPerMTokenUsd: BigDecimal,
    )
}
