package com.readmates.shared.adminmutation.application.model

import java.time.Instant
import java.util.UUID

data class AdminCommandScope(
    val platformAdminUserId: UUID,
    val commandType: String,
    val targetType: String,
    val targetId: String,
)

data class AdminCommandClaimAttempt(
    val claimId: UUID,
    val claimToken: UUID,
    val canonicalSchemaVersion: String,
    val claimedAt: Instant,
    val initialExpiresAt: Instant,
)

sealed interface AdminCommandClaimResult {
    data class Claimed(
        val claimId: UUID,
        val claimToken: UUID,
        val currentDigest: AdminCommandDigest,
    ) : AdminCommandClaimResult

    data class Completed(
        val receiptType: String,
        val receiptId: String,
    ) : AdminCommandClaimResult

    data object InProgress : AdminCommandClaimResult

    data object Conflict : AdminCommandClaimResult
}

class RequiredAdminCommandTransactionException : RuntimeException("ADMIN_COMMAND_TRANSACTION_REQUIRED")

class CorruptAdminCommandClaimException : RuntimeException("ADMIN_COMMAND_CLAIM_CORRUPT")
