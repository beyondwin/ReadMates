package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import com.readmates.admin.health.application.service.HealthCardProvider
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class DeployAttemptsStripCardProvider(
    private val deployLedgerPort: DeployLedgerPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "deploy_attempts_strip"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val attempts = deployLedgerPort.tailLatestAttempts(STRIP_LIMIT)
        if (attempts.isEmpty()) {
            return HealthCard(
                id = cardId,
                title = "최근 deploy",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = null,
                lastCheckedAt = now,
                source = HealthCardSource.FILE,
                drill = null,
                reason = "ledger_unavailable",
                deployStrip = null,
            )
        }
        val status =
            when (attempts.first().finalStatus) {
                DeployAttemptFinalStatus.FAILED -> HealthCardStatus.CRIT
                DeployAttemptFinalStatus.RUNNING -> HealthCardStatus.WARN
                DeployAttemptFinalStatus.SUCCEEDED -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "최근 deploy",
            status = status,
            metric = null,
            thresholds = null,
            lastCheckedAt = now,
            source = HealthCardSource.FILE,
            drill = null,
            reason = null,
            deployStrip = attempts,
        )
    }

    private companion object {
        private const val STRIP_LIMIT = 5
    }
}
