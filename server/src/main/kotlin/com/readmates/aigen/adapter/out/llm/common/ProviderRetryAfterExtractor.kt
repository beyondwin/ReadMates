package com.readmates.aigen.adapter.out.llm.common

import com.anthropic.errors.AnthropicServiceException
import com.google.genai.errors.ApiException
import com.openai.errors.OpenAIServiceException
import java.math.BigDecimal
import java.time.Duration

/** Extracts only numeric retry timing metadata; provider response content is never retained or logged. */
internal object ProviderRetryAfterExtractor {
    private val GEMINI_RETRY_SECONDS = Regex("(?i)\\bretry\\s+in\\s+(\\d+(?:\\.\\d+)?)\\s*s\\b")

    fun extract(error: Throwable): Duration? =
        generateSequence(error) { it.cause }
            .mapNotNull(::extractOne)
            .firstOrNull()

    private fun extractOne(error: Throwable): Duration? =
        when (error) {
            is OpenAIServiceException -> parseHeader(error.headers().values(RETRY_AFTER_HEADER))
            is AnthropicServiceException -> parseHeader(error.headers().values(RETRY_AFTER_HEADER))
            is ApiException -> parseGeminiHint(error)
            else -> null
        }

    private fun parseHeader(values: List<String>): Duration? = values.asSequence().mapNotNull(::seconds).firstOrNull()

    private fun parseGeminiHint(error: ApiException): Duration? =
        if (error.code() == HTTP_TOO_MANY_REQUESTS) {
            GEMINI_RETRY_SECONDS
                .find(error.message())
                ?.groupValues
                ?.get(1)
                ?.let(::seconds)
        } else {
            null
        }

    private fun seconds(value: String): Duration? {
        val parsed = value.trim().toBigDecimalOrNull()?.takeIf { it.signum() >= 0 } ?: return null
        val nanos = parsed.multiply(NANOS_PER_SECOND).min(MAX_DURATION_NANOS).toLong()
        return Duration.ofNanos(nanos)
    }

    private const val RETRY_AFTER_HEADER = "retry-after"
    private const val HTTP_TOO_MANY_REQUESTS = 429
    private val NANOS_PER_SECOND = BigDecimal("1000000000")
    private val MAX_DURATION_NANOS = BigDecimal.valueOf(Long.MAX_VALUE)
}
