@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.scheduling

import com.readmates.publication.application.port.`in`.ProcessPublicConvergenceUseCase
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class PublicConvergenceScheduler(
    private val convergenceUseCase: ProcessPublicConvergenceUseCase,
) {
    private val leaseOwner = "public-convergence-${UUID.randomUUID()}"

    @Scheduled(fixedDelayString = "\${readmates.public-convergence.scheduler-fixed-delay:15s}")
    fun process() {
        convergenceUseCase.processBatch(leaseOwner)
    }
}
