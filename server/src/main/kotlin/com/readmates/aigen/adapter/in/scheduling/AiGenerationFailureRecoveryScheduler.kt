@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.scheduling

import com.readmates.aigen.application.port.`in`.RecoverStalledAiGenerationJobsUseCase
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class AiGenerationFailureRecoveryScheduler(
    private val recoverStalledJobs: RecoverStalledAiGenerationJobsUseCase,
) {
    @Scheduled(fixedDelayString = "\${readmates.aigen.job.recovery-fixed-delay:1m}")
    fun recover() {
        try {
            recoverStalledJobs.recoverStalledBatch()
        } catch (_: RuntimeException) {
            logger.warn(RECOVERY_FAILED_MESSAGE)
        }
    }

    private companion object {
        const val RECOVERY_FAILED_MESSAGE = "Scheduled AI generation recovery failed result=failed"
        val logger = LoggerFactory.getLogger(AiGenerationFailureRecoveryScheduler::class.java)
    }
}
