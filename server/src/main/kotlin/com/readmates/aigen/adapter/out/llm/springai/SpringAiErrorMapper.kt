package com.readmates.aigen.adapter.out.llm.springai

import com.readmates.aigen.adapter.out.llm.common.LlmStructuredOutputException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallException
import com.readmates.aigen.application.service.ProviderFailureClass
import org.springframework.ai.retry.NonTransientAiException
import org.springframework.ai.retry.TransientAiException
import org.springframework.http.HttpHeaders
import org.springframework.web.client.RestClientResponseException
import java.io.IOException
import java.net.SocketTimeoutException
import java.time.Clock
import java.time.Duration
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeoutException

data class SpringAiMappedFailure(
    val error: GenerationError,
    val failureClass: ProviderFailureClass,
    val retryAfter: Duration? = null,
) {
    /** Deliberately omits the provider exception/cause and its response body. */
    fun toException(): ProviderCallException = ProviderCallException(error, retryAfter = retryAfter)
}

class SpringAiErrorMapper(
    private val clock: Clock = Clock.systemUTC(),
) {
    fun map(
        failure: Throwable,
        @Suppress("UNUSED_PARAMETER") provider: Provider,
    ): SpringAiMappedFailure {
        val causes = generateSequence(failure) { it.cause }.take(MAX_CAUSE_DEPTH).toList()
        val safe = causes.filterIsInstance<ProviderCallException>().firstOrNull()
        val response = causes.filterIsInstance<RestClientResponseException>().firstOrNull()
        return when {
            safe != null ->
                SpringAiMappedFailure(
                    error = safe.error,
                    failureClass = classify(safe.error.code),
                    retryAfter = safe.retryAfter?.capped(),
                )
            causes.any { it is LlmStructuredOutputException } ->
                mapped(ErrorCode.SCHEMA_INVALID, SAFE_SCHEMA_MESSAGE, ProviderFailureClass.SCHEMA_OR_PARSE)
            response != null ->
                fromStatus(
                    response.statusCode.value(),
                    response.responseHeaders?.getFirst(HttpHeaders.RETRY_AFTER),
                )
            causes.any { it is SocketTimeoutException || it is TimeoutException || it is IOException } ->
                mapped(ErrorCode.PROVIDER_UNAVAILABLE, SAFE_UNKNOWN_MESSAGE, ProviderFailureClass.TRANSIENT)
            causes.any { it is TransientAiException } ->
                mapped(ErrorCode.PROVIDER_UNAVAILABLE, SAFE_UNKNOWN_MESSAGE, ProviderFailureClass.TRANSIENT)
            causes.any { it is NonTransientAiException } ->
                mapped(ErrorCode.UNKNOWN, SAFE_REJECTED_MESSAGE, ProviderFailureClass.TERMINAL)
            else -> mapped(ErrorCode.PROVIDER_UNAVAILABLE, SAFE_UNKNOWN_MESSAGE, ProviderFailureClass.TRANSIENT)
        }
    }

    private fun fromStatus(
        status: Int,
        retryAfter: String?,
    ): SpringAiMappedFailure =
        when {
            status == HTTP_TOO_MANY_REQUESTS ->
                mapped(
                    ErrorCode.PROVIDER_RATE_LIMITED,
                    SAFE_RATE_LIMIT_MESSAGE,
                    ProviderFailureClass.RATE_LIMITED,
                    parseRetryAfter(retryAfter),
                )
            status == HTTP_REQUEST_TIMEOUT || status >= HTTP_SERVER_ERROR_MIN ->
                mapped(ErrorCode.PROVIDER_UNAVAILABLE, SAFE_UNKNOWN_MESSAGE, ProviderFailureClass.TRANSIENT)
            else -> mapped(ErrorCode.UNKNOWN, SAFE_REJECTED_MESSAGE, ProviderFailureClass.TERMINAL)
        }

    private fun parseRetryAfter(value: String?): Duration? =
        value?.trim()?.takeIf(String::isNotEmpty)?.let { raw ->
            raw.toBigDecimalOrNull()?.takeIf { it.signum() >= 0 }?.let { seconds ->
                val nanos = seconds.multiply(NANOS_PER_SECOND).min(MAX_RETRY_AFTER_NANOS).toLong()
                Duration.ofNanos(nanos).capped()
            } ?: parseRetryAfterDate(raw)
        }

    private fun parseRetryAfterDate(raw: String): Duration? =
        runCatching {
            val retryAt = ZonedDateTime.parse(raw, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()
            Duration
                .between(clock.instant(), retryAt)
                .coerceAtLeast(Duration.ZERO)
                .capped()
        }.getOrNull()

    private fun Duration.capped(): Duration = if (this > MAX_RETRY_AFTER) MAX_RETRY_AFTER else this

    private fun mapped(
        code: ErrorCode,
        message: String,
        failureClass: ProviderFailureClass,
        retryAfter: Duration? = null,
    ) = SpringAiMappedFailure(GenerationError(code, message), failureClass, retryAfter)

    private fun classify(code: ErrorCode): ProviderFailureClass =
        when (code) {
            ErrorCode.PROVIDER_UNAVAILABLE -> ProviderFailureClass.TRANSIENT
            ErrorCode.PROVIDER_RATE_LIMITED -> ProviderFailureClass.RATE_LIMITED
            ErrorCode.SCHEMA_INVALID -> ProviderFailureClass.SCHEMA_OR_PARSE
            else -> ProviderFailureClass.TERMINAL
        }

    private companion object {
        const val MAX_CAUSE_DEPTH = 16
        const val HTTP_REQUEST_TIMEOUT = 408
        const val HTTP_TOO_MANY_REQUESTS = 429
        const val HTTP_SERVER_ERROR_MIN = 500
        const val SAFE_UNKNOWN_MESSAGE = "Provider request outcome unknown"
        const val SAFE_RATE_LIMIT_MESSAGE = "Provider rate limit exceeded"
        const val SAFE_REJECTED_MESSAGE = "Provider request rejected"
        const val SAFE_SCHEMA_MESSAGE = "Provider returned invalid structured output"
        val MAX_RETRY_AFTER: Duration = Duration.ofHours(1)
        val NANOS_PER_SECOND = java.math.BigDecimal("1000000000")
        val MAX_RETRY_AFTER_NANOS = java.math.BigDecimal.valueOf(MAX_RETRY_AFTER.toNanos())
    }
}

private fun Duration.coerceAtLeast(minimum: Duration): Duration = if (this < minimum) minimum else this
