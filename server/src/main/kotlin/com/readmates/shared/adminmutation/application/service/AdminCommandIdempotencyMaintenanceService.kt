package com.readmates.shared.adminmutation.application.service

import com.readmates.shared.adminmutation.application.port.`in`.PurgeExpiredAdminCommandClaimsUseCase
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import com.readmates.shared.adminmutation.application.port.out.AdminCommandObservability
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock

@Service
class AdminCommandIdempotencyMaintenanceService(
    private val port: AdminCommandIdempotencyPort,
    private val properties: AdminCommandIdempotencyProperties,
    private val clock: Clock,
    private val observability: AdminCommandObservability,
    private val identityProperties: AdminCommandIdentityProperties,
    private val retirementService: AdminCommandDigestKeyRetirementService,
) : PurgeExpiredAdminCommandClaimsUseCase {
    @Transactional
    override fun purgeExpired(limit: Int): Int {
        properties.validate()
        val bounded = limit.coerceIn(0, properties.boundedPurgeBatchSize())
        if (bounded == 0) {
            observability.purge(0)
            return 0
        }
        port.lockDigestKeyStatesForMaintenance()
        val purged = port.purgeExpiredCompleted(clock.instant(), bounded)
        observability.purge(purged)
        if (identityProperties.previousKey.isNotBlank()) {
            if (identityProperties.writePreviousAlias) {
                retirementService.invalidateDuringOverlap(identityProperties.previousKeyVersion)
            } else {
                retirementService.assess(identityProperties.previousKeyVersion)
            }
        }
        return purged
    }
}
