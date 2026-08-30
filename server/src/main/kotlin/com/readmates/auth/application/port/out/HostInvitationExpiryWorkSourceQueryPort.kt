package com.readmates.auth.application.port.out

import java.time.OffsetDateTime
import java.util.UUID

data class HostInvitationExpiryWorkSourceQuery(
    val clubId: UUID,
    val evaluatedAt: OffsetDateTime,
    val completedSince: OffsetDateTime,
)

data class HostInvitationExpiryWorkSourceRow(
    val linkId: UUID,
    val linkRevision: Long,
    val linkStatus: String,
    val usedCount: Int,
    val maxUses: Int,
    val expiresAt: OffsetDateTime,
    val auditAt: OffsetDateTime?,
    val receiptAction: String?,
)

sealed interface HostInvitationExpiryWorkSourceQueryResult {
    data class Available(
        val rows: List<HostInvitationExpiryWorkSourceRow>,
    ) : HostInvitationExpiryWorkSourceQueryResult

    data object Unavailable : HostInvitationExpiryWorkSourceQueryResult
}

fun interface HostInvitationExpiryWorkSourceQueryPort {
    fun load(query: HostInvitationExpiryWorkSourceQuery): HostInvitationExpiryWorkSourceQueryResult
}
