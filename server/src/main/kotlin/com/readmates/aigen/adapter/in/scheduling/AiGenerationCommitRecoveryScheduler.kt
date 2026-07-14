@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.scheduling

import com.readmates.aigen.application.service.AiGenerationCommitRecoveryService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationCommitRecoveryScheduler(
    private val recoveryService: AiGenerationCommitRecoveryService,
) {
    @Scheduled(fixedDelayString = "\${readmates.aigen.commit-recovery-fixed-delay-ms:60000}")
    fun recover() {
        recoveryService.recoverBatch(RECOVERY_BATCH_SIZE)
    }

    private companion object {
        const val RECOVERY_BATCH_SIZE = 50
    }
}
