package com.readmates.aigen.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.math.BigDecimal
import java.time.Duration

@ConfigurationProperties("readmates.aigen")
data class AiGenerationProperties(
    val enabled: Boolean = false,
    val mock: Boolean = false,
    val enabledProviders: Set<String> = emptySet(),     // "CLAUDE","OPENAI","GEMINI"
    val fallbackDefaultModel: String = "claude-sonnet-4-6",
    val caps: Caps = Caps(),
    val job: Job = Job(),
    val pricing: Map<String, Pricing> = emptyMap(),
) {
    data class Caps(
        val hostDailyCalls: Int = 10,
        val clubMonthlyCostUsd: BigDecimal = BigDecimal("20.00"),
        val hostPerMinuteCalls: Int = 5,
        val softWarningRatio: BigDecimal = BigDecimal("0.80"),
    )
    data class Job(
        val redisTtl: Duration = Duration.ofHours(6),
        val notificationLatencyThreshold: Duration = Duration.ofSeconds(60),
        val maxLlmCallsPerJob: Int = 3,
    )
    data class Pricing(
        val inputPerMTokenUsd: BigDecimal,
        val cachedInputPerMTokenUsd: BigDecimal = BigDecimal.ZERO,
        val outputPerMTokenUsd: BigDecimal,
    )
}
