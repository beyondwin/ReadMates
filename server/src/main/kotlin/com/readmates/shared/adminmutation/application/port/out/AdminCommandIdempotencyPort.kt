package com.readmates.shared.adminmutation.application.port.out

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimAttempt
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyReferenceState
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestSet
import com.readmates.shared.adminmutation.application.model.AdminCommandScope
import java.time.Duration
import java.time.Instant
import java.util.UUID

interface AdminCommandIdempotencyPort {
    fun claim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult

    fun complete(
        claimId: UUID,
        claimToken: UUID,
        receiptType: String,
        receiptId: String,
        completedAt: Instant,
        retention: Duration,
    ): Boolean

    fun purgeExpiredCompleted(
        now: Instant,
        limit: Int,
    ): Int

    fun lockDigestKeyStatesForMaintenance()

    fun invalidateDigestKeyRetirement(
        digestKeyVersion: Int,
        now: Instant,
    )

    fun lockDigestKeyForRetirement(
        digestKeyVersion: Int,
        now: Instant,
    ): AdminCommandDigestKeyReferenceState

    fun lockDigestKeySnapshot(): List<AdminCommandDigestKeyReferenceState>
}
