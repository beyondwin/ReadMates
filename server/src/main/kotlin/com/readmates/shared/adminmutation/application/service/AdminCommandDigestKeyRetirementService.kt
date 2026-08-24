package com.readmates.shared.adminmutation.application.service

import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirement
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirementOutcome
import com.readmates.shared.adminmutation.application.model.CorruptAdminCommandClaimException
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import com.readmates.shared.adminmutation.application.port.out.AdminCommandObservability
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock

@Service
class AdminCommandDigestKeyRetirementService(
    private val port: AdminCommandIdempotencyPort,
    private val properties: AdminCommandIdempotencyProperties,
    private val clock: Clock,
    private val observability: AdminCommandObservability,
) {
    @Transactional
    fun invalidateDuringOverlap(digestKeyVersion: Int) {
        require(digestKeyVersion >= 0) { "digestKeyVersion must be non-negative" }
        properties.validate()
        port.invalidateDigestKeyRetirement(digestKeyVersion, clock.instant())
    }

    @Transactional
    fun assess(digestKeyVersion: Int): AdminCommandDigestKeyRetirement {
        require(digestKeyVersion >= 0) { "digestKeyVersion must be non-negative" }
        properties.validate()
        val now = clock.instant()
        val state = port.lockDigestKeyForRetirement(digestKeyVersion, now)
        if (state.digestKeyVersion != digestKeyVersion) {
            throw CorruptAdminCommandClaimException()
        }
        val outcome =
            when {
                state.aliasCount > 0 -> AdminCommandDigestKeyRetirementOutcome.REFERENCED
                state.unreferencedSince == null -> throw CorruptAdminCommandClaimException()
                now.isBefore(state.unreferencedSince.plus(properties.previousKeyRolloutBuffer)) ->
                    AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING
                else -> AdminCommandDigestKeyRetirementOutcome.REMOVABLE
            }
        observability.retirement(outcome)
        return AdminCommandDigestKeyRetirement(
            digestKeyVersion = digestKeyVersion,
            outcome = outcome,
            unreferencedSince = state.unreferencedSince,
        )
    }
}
