package com.readmates.shared.adminmutation.application.model

import java.time.Instant

data class AdminCommandDigestKeyReferenceState(
    val digestKeyVersion: Int,
    val aliasCount: Long,
    val lastReferencedAt: Instant?,
    val unreferencedSince: Instant?,
    val pendingHostInvitationCount: Long = 0,
) {
    val referenceCount: Long
        get() = aliasCount + pendingHostInvitationCount
}

enum class AdminCommandDigestKeyRetirementOutcome {
    REFERENCED,
    BUFFER_PENDING,
    REMOVABLE,
}

data class AdminCommandDigestKeyRetirement(
    val digestKeyVersion: Int,
    val outcome: AdminCommandDigestKeyRetirementOutcome,
    val unreferencedSince: Instant?,
)
