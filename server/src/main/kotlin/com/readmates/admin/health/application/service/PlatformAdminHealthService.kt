package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.concurrent.atomic.AtomicReference

@Service
class PlatformAdminHealthService(
    private val providers: List<HealthCardProvider>,
    private val clock: Clock,
) {
    private val cache = AtomicReference<PlatformHealthSnapshot>()

    fun currentSnapshot(): PlatformHealthSnapshot {
        cache.get()?.let { return it }
        return refresh()
    }

    @Scheduled(fixedDelayString = "\${readmates.admin.health.refresh-interval-ms:10000}")
    @Suppress("TooGenericExceptionCaught")
    fun scheduledRefresh() {
        try {
            refresh()
        } catch (ex: Exception) {
            log.warn("PlatformAdminHealthService scheduled refresh failed; keeping last snapshot", ex)
        }
    }

    @Suppress("TooGenericExceptionCaught")
    fun refresh(): PlatformHealthSnapshot {
        val now = clock.instant()
        val cards =
            providers.map { provider ->
                try {
                    provider.compute()
                } catch (ex: Exception) {
                    log.warn("HealthCardProvider {} threw; marking card unknown", provider.cardId, ex)
                    HealthCard(
                        id = provider.cardId,
                        title = provider.cardId,
                        status = HealthCardStatus.UNKNOWN,
                        metric = null,
                        thresholds = null,
                        lastCheckedAt = now,
                        source = HealthCardSource.IN_PROCESS,
                        drill = null,
                        reason = "provider_error",
                    )
                }
            }
        val snapshot =
            PlatformHealthSnapshot(
                schema = PlatformHealthSnapshot.SCHEMA,
                generatedAt = now,
                cards = cards,
            )
        cache.set(snapshot)
        return snapshot
    }

    private companion object {
        private val log = LoggerFactory.getLogger(PlatformAdminHealthService::class.java)
    }
}
