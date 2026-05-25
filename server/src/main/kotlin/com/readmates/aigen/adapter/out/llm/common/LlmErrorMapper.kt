package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.Provider
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Maps provider exceptions to a domain `GenerationError` with a CODE and a
 * fixed enum-like English message.
 *
 * DO NOT pass transcript — message field must be masked enum-like.
 *
 * The signature intentionally has NO transcript parameter. The mapper never
 * has access to transcript text, and the returned `GenerationError.message`
 * MUST NOT echo `Throwable.message` because provider exceptions occasionally
 * include input snippets that could leak PII. Always use a fixed phrase per
 * `ErrorCode`.
 *
 * Mapping (per spec §9.2):
 * - IOException / SocketTimeoutException / message containing 5xx → PROVIDER_UNAVAILABLE
 * - message containing "rate_limit" (case-insensitive) or "429" → PROVIDER_RATE_LIMITED
 * - otherwise → UNKNOWN
 *
 * Pure / stateless / deterministic.
 */
object LlmErrorMapper {
    private val FIVE_XX_REGEX = Regex("\\b5\\d{2}\\b")
    private val FOUR_TWO_NINE_REGEX = Regex("\\b429\\b")

    private const val MSG_UNAVAILABLE = "provider returned 5xx or timed out"
    private const val MSG_RATE_LIMITED = "provider returned 429"
    private const val MSG_UNKNOWN = "unknown provider error"

    fun mapException(
        t: Throwable,
        provider: Provider,
    ): GenerationError {
        // Intentionally unused — provider is part of the signature for
        // future per-provider mapping refinements, but the message must
        // remain a fixed enum-like phrase regardless of provider.
        @Suppress("UNUSED_PARAMETER", "UnusedPrivateProperty")
        val ignored = provider

        val message = t.message.orEmpty()
        val mentionsRateLimit =
            message.contains("rate_limit", ignoreCase = true) ||
                FOUR_TWO_NINE_REGEX.containsMatchIn(message)
        val mentions5xx = FIVE_XX_REGEX.containsMatchIn(message)
        val isNetworkFault = t is IOException || t is SocketTimeoutException

        return when {
            mentionsRateLimit -> GenerationError(ErrorCode.PROVIDER_RATE_LIMITED, MSG_RATE_LIMITED)
            isNetworkFault || mentions5xx -> GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, MSG_UNAVAILABLE)
            else -> GenerationError(ErrorCode.UNKNOWN, MSG_UNKNOWN)
        }
    }
}
