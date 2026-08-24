@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.scheduling

import com.readmates.aigen.application.port.`in`.ProcessAiGenerationAdminCommandConvergenceUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class AiGenerationAdminCommandConvergenceScheduler(
    private val useCase: ProcessAiGenerationAdminCommandConvergenceUseCase,
) {
    @Scheduled(fixedDelayString = "\${readmates.aigen.admin-command-convergence-fixed-delay:30s}")
    fun converge() {
        useCase.processBatch()
    }
}
