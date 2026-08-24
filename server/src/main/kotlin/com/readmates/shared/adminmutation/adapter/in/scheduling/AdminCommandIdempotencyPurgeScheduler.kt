@file:Suppress("ktlint:standard:package-name")

package com.readmates.shared.adminmutation.adapter.`in`.scheduling

import com.readmates.shared.adminmutation.application.port.`in`.PurgeExpiredAdminCommandClaimsUseCase
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class AdminCommandIdempotencyPurgeScheduler(
    private val purgeExpiredAdminCommandClaims: PurgeExpiredAdminCommandClaimsUseCase,
    private val properties: AdminCommandIdempotencyProperties,
) {
    @Scheduled(fixedDelayString = "\${readmates.admin.command-idempotency.purge-interval:1h}")
    @Suppress("TooGenericExceptionCaught")
    fun purgeExpired() {
        try {
            purgeExpiredAdminCommandClaims.purgeExpired(properties.boundedPurgeBatchSize())
        } catch (failure: RuntimeException) {
            logger.warn(PURGE_FAILED_MESSAGE, failure)
        }
    }

    private companion object {
        const val PURGE_FAILED_MESSAGE = "Scheduled admin command claim purge failed result=failed"
        val logger = LoggerFactory.getLogger(AdminCommandIdempotencyPurgeScheduler::class.java)
    }
}
