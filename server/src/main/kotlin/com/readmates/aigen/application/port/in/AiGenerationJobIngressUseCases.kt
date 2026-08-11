@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.JobStatus
import java.util.UUID

fun interface ProcessAiGenerationJobUseCase {
    fun process(jobId: UUID)
}

interface RecoverAiGenerationCommitsUseCase {
    fun recoverBatch(limit: Int): List<AiGenerationCommitRecoveryResult>
}

data class AiGenerationCommitRecoveryResult(
    val jobId: UUID,
    val status: JobStatus,
    val recovered: Boolean,
)
