@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.scheduling

import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
import com.readmates.session.config.HostSessionTrashProperties
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class HostSessionTrashScheduler(
    private val purgeExpiredHostSessionTrash: PurgeExpiredHostSessionTrashUseCase,
    private val properties: HostSessionTrashProperties,
) {
    @Scheduled(fixedDelayString = "\${readmates.session.trash.purge-fixed-delay:1h}")
    fun purgeExpired() {
        try {
            purgeExpiredHostSessionTrash.purgeExpired(properties.boundedPurgeBatchSize())
        } catch (ex: RuntimeException) {
            logger.warn(PURGE_FAILED_MESSAGE, ex)
        }
    }

    private companion object {
        const val PURGE_FAILED_MESSAGE = "Scheduled host session trash purge failed result=failed"
        val logger = LoggerFactory.getLogger(HostSessionTrashScheduler::class.java)
    }
}
