package com.readmates.shared.adminmutation.adapter.out.persistence

import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.model.AdminCommandScope
import com.readmates.shared.security.RequestIdentityHmac
import java.util.UUID

internal data class AdminCommandAliasRow(
    val claimId: UUID,
    val digestKeyVersion: Int,
    val idempotencyKeyHmac: ByteArray,
    val requestHmac: ByteArray,
)

internal fun AdminCommandAliasRow.matches(digest: AdminCommandDigest): Boolean {
    val idempotencyKeyMatches =
        RequestIdentityHmac.equal(idempotencyKeyHmac, digest.idempotencyKeyHmac)
    val requestMatches = RequestIdentityHmac.equal(requestHmac, digest.requestHmac)
    return idempotencyKeyMatches and requestMatches
}

internal data class AdminCommandStoredClaim(
    val id: UUID,
    val scope: AdminCommandScope,
    val canonicalSchemaVersion: String,
    val state: AdminCommandStoredState,
    val receiptType: String?,
    val receiptId: String?,
)

internal enum class AdminCommandStoredState {
    IN_PROGRESS,
    COMPLETED,
}
