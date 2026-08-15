package com.readmates.aigen.application.model

class AiGenerationQueueUnavailableException(
    cause: Throwable,
) : RuntimeException("AI generation queue unavailable", cause)

enum class ProviderFailureClass {
    PRE_TRANSPORT,
    TRANSIENT,
    RATE_LIMITED,
    SCHEMA_OR_PARSE,
    TERMINAL,
}
