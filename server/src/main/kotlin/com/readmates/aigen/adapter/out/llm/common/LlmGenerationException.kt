package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.GenerationError

/**
 * Wraps a provider-side failure that has already been mapped to a
 * domain [GenerationError] via [LlmErrorMapper]. The exception's
 * `message` is the MASKED enum-like phrase from the mapper — it MUST
 * NOT echo any raw `Throwable.message` text that could carry transcript
 * snippets (PII).
 *
 * Thrown by provider adapters (e.g. Claude generator/regenerator) so
 * the orchestrator can surface a stable error code/message to the user.
 */
class LlmGenerationException(
    val error: GenerationError,
    cause: Throwable? = null,
) : RuntimeException(error.message, cause)
