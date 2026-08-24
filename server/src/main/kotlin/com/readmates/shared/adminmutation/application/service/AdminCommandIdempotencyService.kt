package com.readmates.shared.adminmutation.application.service

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimAttempt
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.CorruptAdminCommandClaimException
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.model.RequiredAdminCommandTransactionException
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Clock
import java.util.UUID

@Service
class AdminCommandIdempotencyService(
    private val identityService: AdminCommandIdentityService,
    private val port: AdminCommandIdempotencyPort,
    private val properties: AdminCommandIdempotencyProperties,
    private val clock: Clock,
) {
    fun claim(
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ): AdminCommandClaimResult {
        requireExistingTransaction()
        properties.validate()
        val envelope = identityService.resolve(identity, request)
        val digests = envelope.digests
        val claimedAt = clock.instant()
        val attempt =
            AdminCommandClaimAttempt(
                claimId = UUID.randomUUID(),
                claimToken = UUID.randomUUID(),
                canonicalSchemaVersion = digests.current.schemaVersion,
                claimedAt = claimedAt,
                initialExpiresAt = claimedAt.plus(properties.initialClaimTtl),
            )
        val result =
            port.claim(
                scope = envelope.scope,
                attempt = attempt,
                digests = digests,
            )
        if (result is AdminCommandClaimResult.Claimed && result.currentDigest != digests.current) {
            throw CorruptAdminCommandClaimException()
        }
        return result
    }

    fun complete(
        claimId: UUID,
        claimToken: UUID,
        receiptType: String,
        receiptId: String,
    ): Boolean {
        requireExistingTransaction()
        properties.validate()
        require(RECEIPT_TYPE.matches(receiptType)) { "invalid receiptType" }
        require(RECEIPT_ID.matches(receiptId)) { "invalid receiptId" }
        return port.complete(
            claimId = claimId,
            claimToken = claimToken,
            receiptType = receiptType,
            receiptId = receiptId,
            completedAt = clock.instant(),
            retention = properties.retention,
        )
    }

    private fun requireExistingTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw RequiredAdminCommandTransactionException()
        }
    }

    private companion object {
        val RECEIPT_TYPE = Regex("^[A-Za-z0-9._:-]{1,96}$")
        val RECEIPT_ID = Regex("^[A-Za-z0-9._:-]{1,128}$")
    }
}
