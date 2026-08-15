package com.readmates.aigen.application.model

import com.readmates.aigen.application.port.out.JobRecord

enum class AiGenerationJobListOperation {
    RECENT_FOR_SESSION,
    ACTIVE,
    COMMIT_RECOVERY,
}

enum class AiGenerationJobListUnavailableReason {
    STORE_READ_FAILED,
}

sealed interface AiGenerationJobListResult {
    data class Available(
        val records: List<JobRecord>,
    ) : AiGenerationJobListResult

    data class Unavailable(
        val operation: AiGenerationJobListOperation,
        val reason: AiGenerationJobListUnavailableReason,
    ) : AiGenerationJobListResult
}

class AiGenerationJobListUnavailableException(
    val operation: AiGenerationJobListOperation,
) : RuntimeException("AI generation job list unavailable")
