@file:Suppress("ktlint:standard:package-name")

package com.readmates.shared.mutation.adapter.`in`.scheduling

import com.readmates.shared.mutation.application.port.`in`.PurgeExpiredMutationIdempotencyUseCase
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class MutationIdempotencyPurgeScheduler(
    private val purgeExpiredMutationIdempotency: PurgeExpiredMutationIdempotencyUseCase,
    private val properties: MutationIdempotencyProperties,
) {
    @Scheduled(fixedDelayString = "\${readmates.mutation.idempotency.purge-fixed-delay:1h}")
    @Suppress("TooGenericExceptionCaught")
    fun purgeExpired() {
        try {
            purgeExpiredMutationIdempotency.purgeExpired(properties.boundedPurgeBatchSize())
        } catch (ex: RuntimeException) {
            logger.warn(PURGE_FAILED_MESSAGE, ex)
        }
    }

    private companion object {
        const val PURGE_FAILED_MESSAGE = "Scheduled mutation idempotency purge failed result=failed"
        val logger = LoggerFactory.getLogger(MutationIdempotencyPurgeScheduler::class.java)
    }
}
