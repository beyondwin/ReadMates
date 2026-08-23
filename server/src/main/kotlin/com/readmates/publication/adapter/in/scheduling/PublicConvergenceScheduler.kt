@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.scheduling

import com.readmates.publication.application.model.PublicConvergenceProcessResult
import com.readmates.publication.application.port.`in`.ProcessPublicConvergenceUseCase
import com.readmates.publication.config.PublicConvergenceProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.public-convergence", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.public-convergence.scheduler", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.public-convergence.provider", name = ["http-enabled"], havingValue = "true")
class PublicConvergenceScheduler(
    private val processor: ProcessPublicConvergenceUseCase,
    private val properties: PublicConvergenceProperties,
) {
    @Scheduled(fixedDelayString = "\${readmates.public-convergence.scheduler.fixed-delay:30s}")
    fun processBatch() {
        repeat(properties.scheduler.batchSize) {
            if (processor.processOne(properties.scheduler.workerId) == PublicConvergenceProcessResult.NO_WORK) {
                return
            }
        }
    }
}
