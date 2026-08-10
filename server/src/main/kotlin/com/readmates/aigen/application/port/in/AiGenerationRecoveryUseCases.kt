@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.model.AiGenerationRecoverySource
import java.util.UUID

interface RecoverExhaustedAiGenerationJobUseCase {
    fun recoverExhausted(
        jobId: UUID,
        source: AiGenerationRecoverySource,
    ): AiGenerationRecoveryResult
}

interface RecoverStalledAiGenerationJobsUseCase {
    fun recoverStalledBatch(): List<AiGenerationRecoveryResult>
}

interface RecordUnroutableAiGenerationRecordUseCase {
    fun recordUnroutableKafkaRecord()
}
